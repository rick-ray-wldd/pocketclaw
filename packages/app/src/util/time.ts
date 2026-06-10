/** Compact relative-time formatting for session cards ("3m", "2h", "5d"). */
export function formatRelative(timestampMs: number, nowMs: number = Date.now()): string {
  const deltaSec = Math.max(0, Math.floor((nowMs - timestampMs) / 1000));
  if (deltaSec < 60) return 'now';
  const min = Math.floor(deltaSec / 60);
  if (min < 60) return `${min}m`;
  const hours = Math.floor(min / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  return `${Math.floor(days / 7)}w`;
}
