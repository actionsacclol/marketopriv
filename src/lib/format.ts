export const cls = (...parts: Array<string | false | null | undefined>): string => parts.filter(Boolean).join(' ');

export const fmtNum = (n: number | undefined | null): string => (n === undefined || n === null ? '—' : n.toLocaleString('en-US'));

export const fmtSecs = (s: number): string => `${s.toFixed(1)}s`;

export function timeAgo(iso: string | undefined): string {
  if (!iso) return '—';
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

export const fmtDate = (iso: string): string => new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

export const shortUrl = (u: string): string => u.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '');
