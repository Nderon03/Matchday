// The operator email for a new report. Pure so it can be unit tested.
export const REPORT_INBOX_DEFAULT = 'matchdayenquiries@hotmail.com';

export interface ReportForEmail {
  id: string;
  created_at: string;
  target_type: 'user' | 'comment' | 'activity' | 'group';
  reason: string;
  reporter: string;
  /** a readable description of what was reported, e.g. "@jordan (Jordan Pike)" or the comment text */
  target: string;
  group: string | null;
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

export function reportEmail(r: ReportForEmail): { subject: string; html: string } {
  const what = { user: 'player', comment: 'comment', activity: 'post', group: 'group' }[r.target_type];
  const subject = `MATCHDAY report: ${what} reported by ${r.reporter}`;
  const rows: [string, string][] = [
    ['Reported', `${what}: ${r.target}`],
    ['Reason', r.reason],
    ['Reported by', r.reporter],
    ['Group', r.group ?? '—'],
    ['When', new Date(r.created_at).toLocaleString('en-GB', { timeZone: 'Europe/London' })],
    ['Report id', r.id],
  ];
  const html = `<div style="font-family:system-ui;background:#0B0D10;color:#F5F7FA;padding:24px;border-radius:12px">
<h2 style="color:#22C55E;margin:0 0 8px">MATCHDAY · new report</h2>
<table style="border-collapse:collapse">${rows.map(([k, v]) => `<tr><td style="color:#8A94A6;padding:4px 12px 4px 0;vertical-align:top">${esc(k)}</td><td style="padding:4px 0">${esc(v)}</td></tr>`).join('')}</table>
<p style="color:#8A94A6;font-size:12px">How to handle it: docs/MODERATION.md in the MATCHDAY repository.</p></div>`;
  return { subject, html };
}
