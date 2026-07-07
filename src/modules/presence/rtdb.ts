import { onDisconnect, serverTimestamp, update } from "firebase/database";
import { presenceRef } from "./paths";
import type { CurrentActivity } from "./types";

const ts = () => serverTimestamp() as unknown as number;

/** Loại bỏ các field `undefined` (RTDB không chấp nhận undefined). */
function stripUndefined<T extends Record<string, unknown>>(obj: T): T {
  const out = {} as Record<string, unknown>;
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined) out[k] = v;
  }
  return out as T;
}

/**
 * Bật presence cho user: đăng ký onDisconnect lật `online: false` (giữ node,
 * giữ name + currentActivity — Cách B) rồi ghi `online: true` ngay.
 * Dùng `update` để không clobber `currentActivity` đã có.
 */
export async function attachGlobalPresence(params: {
  uid: string;
  name: string;
}): Promise<void> {
  const { uid, name } = params;
  const r = presenceRef(uid);
  try {
    await onDisconnect(r).update({ online: false, lastSeen: ts() });
  } catch {
    /* noop */
  }
  try {
    await update(r, { online: true, lastSeen: ts(), name });
  } catch {
    /* noop */
  }
}

/** Ghi heartbeat online (kèm tên, phòng khi đổi displayName). */
export async function writePresenceOnline(
  uid: string,
  name: string
): Promise<void> {
  try {
    await update(presenceRef(uid), { online: true, lastSeen: ts(), name });
  } catch {
    /* noop */
  }
}

/** Ghi offline nhưng giữ node + lastSeen + currentActivity (Cách B). */
export async function writePresenceOffline(uid: string): Promise<void> {
  try {
    await update(presenceRef(uid), { online: false, lastSeen: ts() });
  } catch {
    /* noop */
  }
}

/** Huỷ handler onDisconnect (gọi khi unmount để ghi offline sạch). */
export async function cancelPresenceOnDisconnect(uid: string): Promise<void> {
  try {
    await onDisconnect(presenceRef(uid)).cancel();
  } catch {
    /* noop */
  }
}

/** Ghi vị trí hiện tại (realtime). Thay thế node currentActivity cũ. */
export async function writeCurrentActivity(
  uid: string,
  activity: CurrentActivity
): Promise<void> {
  try {
    await update(presenceRef(uid), {
      currentActivity: stripUndefined({ ...activity, updatedAt: ts() }),
      lastSeen: ts(),
    });
  } catch {
    /* noop */
  }
}
