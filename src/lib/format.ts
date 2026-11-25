/** Minor units to a display amount: 50000 -> "500.00". */
export function formatMinor(minor: number): string {
  return (minor / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function formatDuration(ms: number): string {
  if (ms < 1000) return `${Math.max(0, Math.round(ms))} ms`;
  const s = ms / 1000;
  if (s < 60) return `${s.toFixed(s < 10 ? 2 : 1)} s`;
  const m = Math.floor(s / 60);
  return `${m}m ${Math.round(s % 60)}s`;
}

export function formatTime(millis: number | null | undefined): string {
  if (!millis) return '—';
  return new Date(millis).toLocaleTimeString(undefined, { hour12: false }) + '.' + String(millis % 1000).padStart(3, '0');
}

export function formatDateTime(millis: number): string {
  return new Date(millis).toLocaleString(undefined, { hour12: false });
}

export function timeAgo(millis: number, now = Date.now()): string {
  const s = Math.round((now - millis) / 1000);
  if (s < 5) return 'just now';
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

export const shortId = (id: string) => (id.length > 14 ? `${id.slice(0, 8)}…${id.slice(-4)}` : id);
