import type { RtdbPresence } from "./types";

/**
 * Safety net khi client crash/đóng máy đột ngột mà onDisconnect chưa kịp ghi
 * `online: false`. Nếu `lastSeen` quá cũ so với mốc này thì coi như offline dù
 * cờ `online` vẫn còn true.
 */
export const STALE_MS = 10 * 60_000;

/** Idle quá mốc này (không có activity) → client tự ghi offline. */
export const ACTIVITY_TIMEOUT = 3 * 60_000;

/** Throttle ghi heartbeat online/lastSeen lên RTDB. */
export const WRITE_THROTTLE_MS = 60_000;

/** Throttle ghi currentActivity lên RTDB (cảm giác realtime nhưng không spam). */
export const ACTIVITY_WRITE_THROTTLE_MS = 3_000;

/** True nếu presence được coi là đang online. */
export function isPresenceOnline(
  presence: RtdbPresence | null | undefined
): boolean {
  if (!presence) return false;
  if (presence.online !== true) return false;
  if (typeof presence.lastSeen !== "number") return true;
  return Date.now() - presence.lastSeen < STALE_MS;
}
