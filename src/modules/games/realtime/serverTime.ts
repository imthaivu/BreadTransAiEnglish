"use client";

import { onValue } from "firebase/database";
import { useEffect, useState } from "react";
import { serverTimeOffsetRef } from "./paths";

/**
 * Cached Firebase server-time offset (serverNow - clientNow), in ms.
 * Lets both devices agree on a shared "now" so the 3s countdown and
 * race-condition timing stay fair despite local clock skew.
 */
let cachedOffset = 0;
let started = false;

function ensureOffsetListener() {
  if (started || typeof window === "undefined") return;
  started = true;
  try {
    onValue(serverTimeOffsetRef(), (snap) => {
      const value = snap.val();
      if (typeof value === "number") cachedOffset = value;
    });
  } catch {
    // RTDB not configured — fall back to local clock (offset 0).
  }
}

/** Thời gian suy nghĩ mỗi lượt (cờ caro) hoặc mỗi vòng chọn (đảo ly). */
export const TURN_THINK_MS = 15_000;

/** Best-effort server time in ms. */
export function getServerNow(): number {
  ensureOffsetListener();
  return Date.now() + cachedOffset;
}

/**
 * Countdown (in whole seconds) until `startAt` (server-ms). Returns 0 once the
 * match has started, or null while `startAt` is not yet known.
 */
export function useCountdown(startAt: number | null): number | null {
  const [remaining, setRemaining] = useState<number | null>(
    startAt == null ? null : Math.max(0, Math.ceil((startAt - getServerNow()) / 1000))
  );

  useEffect(() => {
    ensureOffsetListener();
    if (startAt == null) {
      setRemaining(null);
      return;
    }
    const tick = () => {
      const ms = startAt - getServerNow();
      setRemaining(Math.max(0, Math.ceil(ms / 1000)));
    };
    tick();
    const interval = setInterval(tick, 100);
    return () => clearInterval(interval);
  }, [startAt]);

  return remaining;
}
