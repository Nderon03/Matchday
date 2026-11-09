// Delivers queued push notifications via the Expo Push Service and queued emails via Resend.
// Scheduled every minute via pg_cron + pg_net. In-app notifications are already persisted.
import { adminClient, handler, json, requireCronSecret } from '../_shared/http.ts';
import { buildExpoMessages, chunk, type QueuedNotification } from '../_shared/payments-core.ts';
import { getSessionWeather } from '../_shared/session-weather.ts';
import { reminderLine } from '../_shared/weather.ts';
import { REPORT_INBOX_DEFAULT, reportEmail } from '../_shared/reports.ts';

Deno.serve(handler(async (req) => {
  requireCronSecret(req);
  const admin = adminClient();
  const result = { pushed: 0, push_failed: 0, emailed: 0, email_skipped: 0, reports_emailed: 0 };

  const { data: queued } = await admin.from('notifications').select('id, user_id, title, body, data, type').eq('push_status', 'queued').order('created_at').limit(500);
  if (queued?.length) {
    // kick-off reminders get the forecast added (one lookup per session, cached for an hour)
    const forecasts = new Map<string, string | null>();
    const icons = new Map<string, string>();
    for (const n of queued.filter((x) => x.type === 'session_reminder' && x.data?.session_id && !x.data?.weather)) {
      const sid = n.data.session_id as string;
      if (!forecasts.has(sid)) {
        const w = await getSessionWeather(admin, sid).catch(() => null);
        forecasts.set(sid, w ? reminderLine(w) : null);
        if (w) icons.set(sid, w.icon);
      }
      const line = forecasts.get(sid);
      if (line) {
        n.body = `${n.body} ${line}`;
        n.data = { ...n.data, weather: true, weather_icon: icons.get(sid) };
        await admin.from('notifications').update({ body: n.body, data: n.data }).eq('id', n.id);
      }
    }
    const userIds = [...new Set(queued.map((n) => n.user_id))];
    const { data: tokens } = await admin.from('push_tokens').select('user_id, token').in('user_id', userIds);
    const byUser: Record<string, string[]> = {};
    for (const t of tokens ?? []) (byUser[t.user_id] ??= []).push(t.token);
    const messages = buildExpoMessages(queued as QueuedNotification[], byUser);
    const failed = new Set<string>();
    const headers: Record<string, string> = { 'Content-Type': 'application/json', Accept: 'application/json' };
    const accessToken = Deno.env.get('EXPO_ACCESS_TOKEN');
    if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
    for (const batch of chunk(messages, 100)) {
      const res = await fetch('https://exp.host/--/api/v2/push/send', {
        method: 'POST', headers, body: JSON.stringify(batch.map(({ notificationId: _n, ...m }) => m)),
      });
      const body = await res.json().catch(() => ({}));
      const tickets: { status: string; details?: { error?: string } }[] = body.data ?? [];
      batch.forEach((m, i) => {
        const t = tickets[i];
        if (!res.ok || t?.status !== 'ok') failed.add(m.notificationId);
        if (t?.details?.error === 'DeviceNotRegistered') admin.from('push_tokens').delete().eq('token', m.to).then(() => undefined);
      });
    }
    const ids = queued.map((n) => n.id);
    const ok = ids.filter((id) => !failed.has(id));
    if (ok.length) await admin.from('notifications').update({ push_status: 'sent' }).in('id', ok);
    if (failed.size) await admin.from('notifications').update({ push_status: 'failed' }).in('id', [...failed]);
    result.pushed = ok.length;
    result.push_failed = failed.size;
  }

  const resendKey = Deno.env.get('RESEND_API_KEY');
  const { data: emails } = await admin.from('notifications').select('id, user_id, title, body').eq('email_status', 'queued').order('created_at').limit(100);
  for (const n of emails ?? []) {
    if (!resendKey) {
      await admin.from('notifications').update({ email_status: 'skipped' }).eq('id', n.id);
      result.email_skipped++;
      continue;
    }
    const { data: u } = await admin.auth.admin.getUserById(n.user_id);
    if (!u?.user?.email) continue;
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: Deno.env.get('EMAIL_FROM') ?? 'MATCHDAY <noreply@matchday.app>',
        to: u.user.email,
        subject: n.title,
        html: `<div style="font-family:system-ui;background:#0B0D10;color:#F5F7FA;padding:24px;border-radius:12px"><h2 style="color:#22C55E;margin:0 0 8px">MATCHDAY</h2><p style="font-size:16px;font-weight:600">${escapeHtml(n.title)}</p><p>${escapeHtml(n.body)}</p><p style="color:#8A94A6;font-size:12px">Manage email preferences in Settings → Notifications.</p></div>`,
      }),
    });
    await admin.from('notifications').update({ email_status: res.ok ? 'sent' : 'failed' }).eq('id', n.id);
    if (res.ok) result.emailed++;
  }
  // every new report goes to the operator's inbox
  const { data: reports } = await admin.from('reports').select('id, created_at, target_type, target_id, reason, reporter_id, group_id').is('alerted_at', null).order('created_at').limit(20);
  for (const r of reports ?? []) {
    if (!resendKey) break;
    const who = async (id: string | null) => {
      if (!id) return 'unknown';
      const { data: p } = await admin.from('profiles').select('username, display_name').eq('id', id).maybeSingle();
      return p ? `@${p.username} (${p.display_name})` : 'deleted account';
    };
    let target = r.target_id as string;
    if (r.target_type === 'user') target = await who(r.target_id);
    else if (r.target_type === 'comment') {
      const { data: c } = await admin.from('comments').select('body, author_id').eq('id', r.target_id).maybeSingle();
      target = c ? `“${c.body}” by ${await who(c.author_id)}` : 'comment (already deleted)';
    } else if (r.target_type === 'group') {
      const { data: g } = await admin.from('groups').select('name').eq('id', r.target_id).maybeSingle();
      target = g?.name ?? 'group (deleted)';
    }
    const { data: g } = r.group_id ? await admin.from('groups').select('name').eq('id', r.group_id).maybeSingle() : { data: null };
    const mail = reportEmail({ id: r.id, created_at: r.created_at, target_type: r.target_type, reason: r.reason, reporter: await who(r.reporter_id), target: `${target} [${r.target_id}]`, group: g?.name ?? null });
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: Deno.env.get('EMAIL_FROM') ?? 'MATCHDAY <noreply@matchday.app>', to: Deno.env.get('REPORTS_EMAIL') ?? REPORT_INBOX_DEFAULT, subject: mail.subject, html: mail.html }),
    });
    if (res.ok) {
      await admin.from('reports').update({ alerted_at: new Date().toISOString() }).eq('id', r.id);
      result.reports_emailed++;
    } else {
      console.error('Report email failed', res.status);
      break;
    }
  }
  return json(result);
}));

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}
