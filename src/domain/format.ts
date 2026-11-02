export function formatPence(pence: number, currency = 'gbp'): string {
  const symbol = currency.toLowerCase() === 'gbp' ? '£' : currency.toLowerCase() === 'eur' ? '€' : '$';
  // under £1 reads naturally as pence: "50p"
  if (currency.toLowerCase() === 'gbp' && pence > 0 && pence < 100) return `${pence}p`;
  const value = pence / 100;
  return `${symbol}${Number.isInteger(value) ? value.toFixed(0) : value.toFixed(2)}`;
}

export function poundsToPence(input: string): number | null {
  const cleaned = input.replace(/[£,\s]/g, '');
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  return Math.round(parseFloat(cleaned) * 100);
}

const DAY = 86400_000;

export function formatKickoff(iso: string, now = new Date()): string {
  const d = new Date(iso);
  const time = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  const startOf = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const days = Math.round((startOf(d) - startOf(now)) / DAY);
  if (days === 0) return `Today, ${time}`;
  if (days === 1) return `Tomorrow, ${time}`;
  if (days === -1) return `Yesterday, ${time}`;
  if (days > 1 && days < 7) return `${d.toLocaleDateString('en-GB', { weekday: 'long' })}, ${time}`;
  return `${d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}, ${time}`;
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function timeAgo(iso: string, now = Date.now()): string {
  const s = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000));
  if (s < 60) return 'just now';
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.round(h / 24);
  if (d < 7) return `${d}d`;
  return formatDate(iso);
}

export function timeUntil(iso: string, now = Date.now()): string {
  const s = Math.round((new Date(iso).getTime() - now) / 1000);
  if (s <= 0) return 'closed';
  const h = Math.floor(s / 3600);
  if (h >= 24) return `${Math.floor(h / 24)}d ${h % 24}h`;
  const m = Math.floor((s % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

export function rating(value: number | string | null | undefined): string {
  if (value == null || value === '') return '–';
  return Number(value).toFixed(1);
}

export const POSITION_LABEL: Record<string, string> = { GK: 'Goalkeeper', DEF: 'Defender', MID: 'Midfielder', FWD: 'Forward', ANY: 'Anywhere' };
