// When the next autopilot run happens. The hub picks each run's random minute
// itself (up to 30 min after the time the user set, re-picked every day), so
// Windows' next run time is exact and can be shown as-is.

const clock = (d: Date): string => d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
const dayWord = (d: Date): string => {
  const today = new Date();
  const tomorrow = new Date();
  tomorrow.setDate(today.getDate() + 1);
  return d.toDateString() === today.toDateString() ? 'today' : d.toDateString() === tomorrow.toDateString() ? 'tomorrow' : d.toLocaleDateString('en-US', { weekday: 'short' });
};

/** Big countdown text: "in 5h 58m", "in 4 min", or "Starting…" once the time has come. */
export function runCountdown(nextRun?: string): string {
  if (!nextRun) return '—';
  const m = Math.ceil((Date.parse(nextRun) - Date.now()) / 60_000);
  if (m <= 0) return 'Starting…';
  return m < 60 ? `in ${m} min` : `in ${Math.floor(m / 60)}h ${m % 60}m`;
}

/** "today at 3:17 PM". */
export function runWhen(nextRun?: string): string {
  if (!nextRun) return 'not scheduled';
  const d = new Date(nextRun);
  return `${dayWord(d)} at ${clock(d)}`;
}
