export const SUPERVISOR_MIN_MS = 5000;
export const SUPERVISOR_MAX_MS = 30000;

// Exponential, bounded backoff between bridge starts. No busy loop and no
// unbounded delay when the device is absent at login.
export function nextDelay(previous) {
  if (!Number.isFinite(previous) || previous <= 0) return SUPERVISOR_MIN_MS;
  return Math.min(SUPERVISOR_MAX_MS, Math.max(SUPERVISOR_MIN_MS, previous * 2));
}
