"use client";

import { useGlobalPresenceMap } from "./GlobalPresenceContext";
import { isPresenceOnline } from "./isOnline";
import type { RtdbPresence } from "./types";

export { useGlobalPresenceMap };

/** Presence entry của một user (hoặc undefined). */
export function usePresenceEntry(
  uid: string | null | undefined
): RtdbPresence | undefined {
  const map = useGlobalPresenceMap();
  return uid ? map[uid] : undefined;
}

/** True nếu user đang online. */
export function useIsOnline(uid: string | null | undefined): boolean {
  const map = useGlobalPresenceMap();
  return uid ? isPresenceOnline(map[uid]) : false;
}
