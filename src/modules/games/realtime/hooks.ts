"use client";

import {
  off,
  onValue,
  runTransaction,
  set,
  update,
} from "firebase/database";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  connectedInfoRef,
  roomMetaRef,
  roomStatePath,
  userActiveRoomRef,
} from "./paths";
import {
  attachRoomPresence,
  cancelRoomPresence,
  clearUserActiveRoom,
  finishRoom,
  heartbeatRoomPresence,
  markRoomPresenceOffline,
  PRESENCE_HEARTBEAT_MS,
} from "./room";
import type { PlayerRole, RoomMeta, UserActiveRoom } from "./types";
import { parseRoomMeta, parseUserActiveRoom } from "./validate";

export const otherRole = (role: PlayerRole): PlayerRole =>
  role === "p1" ? "p2" : "p1";

/**
 * Live room metadata (players, status, countdown, winner).
 * Trả về `undefined` khi chưa có snapshot đầu tiên (loading), `null` khi phòng
 * không tồn tại / đã bị xoá, hoặc đối tượng meta khi có dữ liệu.
 */
export function useRoom(roomId: string | null): RoomMeta | null | undefined {
  const [meta, setMeta] = useState<RoomMeta | null | undefined>(undefined);

  useEffect(() => {
    if (!roomId) {
      setMeta(null);
      return;
    }
    setMeta(undefined);
    const r = roomMetaRef(roomId);
    const cb = onValue(
      r,
      (snap) => {
        if (!snap.exists()) {
          setMeta(null);
          return;
        }
        const parsed = parseRoomMeta(snap.val());
        if (!parsed) {
          console.warn(
            "[multiplayer] meta phòng không hợp lệ — coi như phòng đã bị xoá",
            roomId
          );
        }
        setMeta(parsed);
      },
      () => {
        setMeta(null);
      }
    );
    return () => off(r, "value", cb);
  }, [roomId]);

  return meta;
}

/**
 * Continuous position sync (Flappy Bird). `publish` writes the local player's
 * payload to `state/{role}`; the returned ref always holds the opponent's
 * latest payload (read in the rAF loop without re-rendering every frame).
 */
export function usePositionSync<T extends object>(
  roomId: string,
  role: PlayerRole
) {
  const opponentRef = useRef<T | null>(null);

  useEffect(() => {
    if (!roomId) return;
    const r = roomStatePath(roomId, otherRole(role));
    const cb = onValue(r, (snap) => {
      opponentRef.current = snap.exists() ? (snap.val() as T) : null;
    });
    return () => off(r, "value", cb);
  }, [roomId, role]);

  const publish = useCallback(
    (payload: T) => {
      if (!roomId) return;
      void set(roomStatePath(roomId, role), payload);
    },
    [roomId, role]
  );

  return { publish, opponentRef };
}

/**
 * Generic opponent state subscription that triggers React re-renders
 * (used for score bars and puzzle mini-maps).
 */
export function useOpponentState<T>(
  roomId: string,
  role: PlayerRole,
  key?: string
): T | null {
  const [value, setValue] = useState<T | null>(null);

  useEffect(() => {
    if (!roomId) return;
    const r = key
      ? roomStatePath(roomId, otherRole(role), key)
      : roomStatePath(roomId, otherRole(role));
    const cb = onValue(r, (snap) => {
      setValue(snap.exists() ? (snap.val() as T) : null);
    });
    return () => off(r, "value", cb);
  }, [roomId, role, key]);

  return value;
}

/** Publish a single value at `state/{role}/{key}`. */
export function usePublishState(roomId: string, role: PlayerRole) {
  return useCallback(
    (key: string, value: unknown) => {
      void set(roomStatePath(roomId, role, key), value);
    },
    [roomId, role]
  );
}

/**
 * Turn-based shared state (Caro). Subscribes to the whole `state` node and
 * exposes a transactional `commit` so two simultaneous moves cannot clash.
 */
export function useSharedState<T>(roomId: string) {
  const [state, setState] = useState<T | null>(null);

  useEffect(() => {
    if (!roomId) return;
    const r = roomStatePath(roomId);
    const cb = onValue(r, (snap) => {
      setState(snap.exists() ? (snap.val() as T) : null);
    });
    return () => off(r, "value", cb);
  }, [roomId]);

  const patch = useCallback(
    (partial: Partial<T> & Record<string, unknown>) => {
      void update(roomStatePath(roomId), partial);
    },
    [roomId]
  );

  const init = useCallback(
    (initial: T) => {
      void set(roomStatePath(roomId), initial as object);
    },
    [roomId]
  );

  return { state, patch, init };
}

/** Giá trị đã được claim (null/undefined/"" = slot trống). */
function isClaimed(current: unknown): boolean {
  return current !== null && current !== undefined && current !== "";
}

/**
 * Atomic "first one wins" claim (Đảo Ly Tìm Bóng). Resolves to true if the
 * caller won the claim, false if someone else got there first.
 */
export function useAtomicClaim(roomId: string) {
  return useCallback(
    async (
      claimPath: string,
      claimValue: unknown
    ): Promise<boolean> => {
      const ref = roomStatePath(roomId, claimPath);
      const result = await runTransaction(ref, (current) => {
        if (isClaimed(current)) return current;
        return claimValue;
      });
      const committedVal = result.snapshot.val();
      // Order-independent comparison: Firebase returns object keys sorted, which
      // would never match an object literal under plain JSON.stringify.
      return (
        result.committed &&
        stableStringify(committedVal) === stableStringify(claimValue)
      );
    },
    [roomId]
  );
}

/** Debounce trước khi ghi offline khi tab bị ẩn (tránh flash khi chuyển tab nhanh). */
const VISIBILITY_OFFLINE_DEBOUNCE_MS = 2_000;

/**
 * Bật presence cho người chơi trong phòng. Re-attach khi `.info/connected` lật
 * lại true (sau khi mạng phục hồi) — onDisconnect trên server cần được đăng ký
 * lại sau mỗi lần kết nối Firebase mới.
 *
 * `enabled` cho phép trì hoãn việc attach presence cho tới khi phòng thực sự
 * vào trận: trong giai đoạn `waiting`, hàm createRoom đã đăng ký
 * `onDisconnect(roomRef).remove()` để dọn phòng mồ côi nếu chủ rời trước khi
 * khách vào — attach presence sớm sẽ huỷ luôn handler đó.
 */
export function useRoomPresence(
  roomId: string | null,
  role: PlayerRole | null,
  enabled: boolean = true
): void {
  useEffect(() => {
    if (!enabled) return;
    if (!roomId || !role) return;
    let cancelled = false;
    let reattachQueue: Promise<void> = Promise.resolve();
    let hiddenTimer: ReturnType<typeof setTimeout> | null = null;

    const runReattach = (): Promise<void> => {
      reattachQueue = reattachQueue.then(async () => {
        if (cancelled) return;
        await cancelRoomPresence({ roomId, role });
        if (cancelled) return;
        await attachRoomPresence({ roomId, role });
      });
      return reattachQueue;
    };

    void runReattach();

    const r = connectedInfoRef();
    const connCb = onValue(r, (snap) => {
      if (snap.val() === true) {
        void runReattach();
      }
    });

    const handlePageHide = () => {
      void markRoomPresenceOffline({ roomId, role });
    };

    const handlePageShow = () => {
      void runReattach();
    };

    const handleVisibility = () => {
      if (document.hidden) {
        if (hiddenTimer) clearTimeout(hiddenTimer);
        hiddenTimer = setTimeout(() => {
          if (document.hidden && !cancelled) {
            void markRoomPresenceOffline({ roomId, role });
          }
        }, VISIBILITY_OFFLINE_DEBOUNCE_MS);
      } else {
        if (hiddenTimer) {
          clearTimeout(hiddenTimer);
          hiddenTimer = null;
        }
        void runReattach();
      }
    };

    const heartbeatId = setInterval(() => {
      if (!document.hidden && !cancelled) {
        void heartbeatRoomPresence({ roomId, role });
      }
    }, PRESENCE_HEARTBEAT_MS);

    window.addEventListener("pagehide", handlePageHide);
    window.addEventListener("pageshow", handlePageShow);
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      cancelled = true;
      if (hiddenTimer) clearTimeout(hiddenTimer);
      clearInterval(heartbeatId);
      off(r, "value", connCb);
      window.removeEventListener("pagehide", handlePageHide);
      window.removeEventListener("pageshow", handlePageShow);
      document.removeEventListener("visibilitychange", handleVisibility);
      void cancelRoomPresence({ roomId, role });
    };
  }, [roomId, role, enabled]);
}

/**
 * Khi game tự xác định kết quả (thắng/thua/hoà từ logic riêng), host gọi hook
 * này với `winnerRole` đã tính được — meta của phòng sẽ được đánh dấu
 * `finished` để khoá luồng forfeit/disconnect-claim. Idempotent qua ref nội bộ.
 */
export function useFinalizeRoom(params: {
  roomId: string;
  isHost: boolean;
  winnerRole: PlayerRole | "draw" | null;
}) {
  const calledRef = useRef(false);
  const { roomId, isHost, winnerRole } = params;
  useEffect(() => {
    // Reset cờ khi chưa có kết quả (winnerRole == null) để lượt kết thúc sau
    // có thể finalize bình thường.
    if (winnerRole == null) {
      calledRef.current = false;
      return;
    }
    if (!isHost) return;
    if (calledRef.current) return;
    calledRef.current = true;
    void finishRoom(
      roomId,
      winnerRole,
      winnerRole === "draw" ? "draw" : "win"
    );
  }, [roomId, isHost, winnerRole]);
}

/**
 * Đọc index `userActiveRooms/{uid}` để biết user có đang ở trong phòng nào
 * không (dùng cho tự rejoin sau reload). Trả về `undefined` khi đang load.
 */
export function useUserActiveRoom(
  uid: string | null | undefined
): UserActiveRoom | null | undefined {
  // Lưu kèm `forUid` để mọi consumer luôn thấy "loading" (undefined) khi uid
  // hiện tại chưa khớp với uid mà hook đang subscribe — chống race lúc auth
  // resolve (uid null → user123): nếu chỉ lưu mỗi `value`, render đầu sẽ trả
  // về `null` (giá trị cũ ứng với uid=null) khiến caller tưởng "không có
  // phòng" rồi khoá luôn luồng rejoin.
  const [state, setState] = useState<{
    forUid: string | null;
    value: UserActiveRoom | null | undefined;
  }>({ forUid: null, value: undefined });

  useEffect(() => {
    if (!uid) {
      setState({ forUid: null, value: null });
      return;
    }
    setState({ forUid: uid, value: undefined });
    const r = userActiveRoomRef(uid);
    const cb = onValue(
      r,
      (snap) => {
        if (!snap.exists()) {
          setState({ forUid: uid, value: null });
          return;
        }
        const parsed = parseUserActiveRoom(snap.val());
        if (!parsed) {
          console.warn(
            "[multiplayer] userActiveRooms không hợp lệ — bỏ qua rejoin",
            uid
          );
          void clearUserActiveRoom(uid);
        }
        setState({
          forUid: uid,
          value: parsed,
        });
      },
      (err) => {
        console.warn(
          "[multiplayer] không đọc được userActiveRooms — đã deploy database.rules.json chưa?",
          err
        );
        setState({ forUid: uid, value: null });
      }
    );
    return () => off(r, "value", cb);
  }, [uid]);

  if (uid && state.forUid !== uid) return undefined;
  if (!uid) return null;
  return state.value;
}

/** Deterministic JSON serialization with recursively sorted object keys. */
function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }
  const obj = value as Record<string, unknown>;
  return `{${Object.keys(obj)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`)
    .join(",")}}`;
}
