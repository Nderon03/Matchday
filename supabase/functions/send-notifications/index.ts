// Delivers queued push notifications via the Expo Push Service and queued emails via Resend.
// Scheduled every minute via pg_cron + pg_net. In-app notifications are already persisted.
import { adminClient, handler, json, requireCronSecret } from '../_shared/http.ts';
import { buildExpoMessages, chunk, type QueuedNotification } from '../_shared/payments-core.ts';

Deno.serve(handler(async (req) => {
  requireCronSecret(req);
  const admin = adminClient();
  const result = { pushed: 0, push_failed: 0, emailed: 0, email_skipped: 0 };

  const { data: queued } = await admin.from('notifications').select('id, user_id, title, body, data, type').eq('push_status', 'queued').order('created_at').limit(500);
  if (queued?.length) {
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
  return json(result);
}));

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}
