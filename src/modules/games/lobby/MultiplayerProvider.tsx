"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { get } from "firebase/database";
import toast from "react-hot-toast";
import { useAuth } from "@/lib/auth/context";
import { PVP_STAKE } from "@/lib/games/types";
import { useUserActiveRoom } from "../realtime/hooks";
import { roomMetaRef } from "../realtime/paths";
import {
  clearUserActiveRoom,
  setUserActiveRoom,
} from "../realtime/room";
import type { MultiplayerGameId, PlayerRole } from "../realtime/types";
import { parseRoomMeta } from "../realtime/validate";
import { GameHost } from "./GameHost";
import { InviteListener } from "./InviteListener";
import { subscribeInviteSignals } from "./invitations";

interface ActiveRoom {
  roomId: string;
  role: PlayerRole;
  /** Host: đối thủ đang học/chơi — hiện popup bận thay vì toast. */
  inviteeBusy?: "learn" | "game";
}

interface EnterRoomOptions {
  inviteeBusy?: "learn" | "game";
}

interface MultiplayerContextValue {
  active: ActiveRoom | null;
  /** Enter a room overlay (host after inviting, guest after accepting). */
  enterRoom: (
    roomId: string,
    role: PlayerRole,
    gameId: MultiplayerGameId,
    options?: EnterRoomOptions
  ) => void;
  exitRoom: () => void;
}

const Ctx = createContext<MultiplayerContextValue | null>(null);

/**
 * Global multiplayer host. Bên cạnh việc mount `GameHost` khi có phòng đang
 * hoạt động, provider còn:
 * - Lưu/đọc index `userActiveRooms/{uid}` để tự rejoin trận đang dở sau khi
 *   reload, đăng nhập lại, hoặc đột ngột rớt mạng rồi quay lại.
 * - Đảm bảo index được dọn sạch khi user chủ động thoát trận đã kết thúc.
 */
export function MultiplayerProvider({ children }: { children: React.ReactNode }) {
  const { profile } = useAuth();
  const uid = profile?.uid ?? null;
  const [active, setActive] = useState<ActiveRoom | null>(null);
  const persistedActive = useUserActiveRoom(uid);
  const rejoinedRef = useRef(false);

  // Một lần đầu khi index được load xong, validate phòng trước khi tự rejoin —
  // tránh kẹt loading khi index trỏ tới phòng đã bị xoá hoặc trận đã kết thúc.
  useEffect(() => {
    if (!uid) {
      rejoinedRef.current = false;
      setActive(null);
      return;
    }
    if (persistedActive === undefined) return;
    if (rejoinedRef.current) return;
    if (!persistedActive || active) {
      rejoinedRef.current = true;
      return;
    }

    let cancelled = false;
    void (async () => {
      try {
        const snap = await get(roomMetaRef(persistedActive.roomId));
        if (cancelled) return;
        rejoinedRef.current = true;

        if (!snap.exists()) {
          await clearUserActiveRoom(uid);
          return;
        }

        const meta = parseRoomMeta(snap.val());
        if (!meta) {
          await clearUserActiveRoom(uid);
          return;
        }

        const myPlayer = meta.players?.[persistedActive.role];
        if (!myPlayer || myPlayer.id !== uid) {
          await clearUserActiveRoom(uid);
          return;
        }

        if (meta.status === "finished") {
          const canRejoinResult =
            meta.winnerReason === "forfeit" ||
            meta.winnerReason === "disconnect";
          if (!canRejoinResult) {
            await clearUserActiveRoom(uid);
            toast("Trận đấu đã kết thúc.");
            return;
          }
        }

        if (process.env.NODE_ENV !== "production") {
          console.info(
            "[multiplayer] rejoin uid=%s room=%s role=%s status=%s",
            uid,
            persistedActive.roomId,
            persistedActive.role,
            meta.status
          );
        }

        setActive({
          roomId: persistedActive.roomId,
          role: persistedActive.role,
        });
      } catch (err) {
        if (cancelled) return;
        rejoinedRef.current = true;
        console.warn("[multiplayer] rejoin validate thất bại", err);
        await clearUserActiveRoom(uid);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [uid, persistedActive, active]);

  // Người mời lắng nghe tín hiệu phản hồi lời mời (vd. người nhận không đủ bánh)
  // để hiện thông báo, vì host không có quyền đọc node invitation của người nhận.
  useEffect(() => {
    if (!uid) return;
    return subscribeInviteSignals(uid, (signal) => {
      if (signal.reason === "invitee_insufficient") {
        toast.error(
          `${signal.fromName} không đủ ${PVP_STAKE} bánh để nhận lời mời đấu solo.`
        );
      }
    });
  }, [uid]);

  const enterRoom = useCallback(
    (
      roomId: string,
      role: PlayerRole,
      gameId: MultiplayerGameId,
      options?: EnterRoomOptions
    ) => {
      setActive({ roomId, role, inviteeBusy: options?.inviteeBusy });
      if (uid) {
        void setUserActiveRoom({ uid, roomId, role, gameId });
      }
    },
    [uid]
  );

  const exitRoom = useCallback(() => {
    setActive(null);
    if (uid) void clearUserActiveRoom(uid);
  }, [uid]);

  const value = useMemo<MultiplayerContextValue>(
    () => ({ active, enterRoom, exitRoom }),
    [active, enterRoom, exitRoom]
  );

  return (
    <Ctx.Provider value={value}>
      {children}
      <InviteListener onEnterRoom={enterRoom} />
      {active && (
        <GameHost
          roomId={active.roomId}
          role={active.role}
          inviteeBusy={active.inviteeBusy}
          onExit={exitRoom}
        />
      )}
    </Ctx.Provider>
  );
}

export function useMultiplayer(): MultiplayerContextValue {
  const ctx = useContext(Ctx);
  if (!ctx) {
    throw new Error("useMultiplayer must be used within a MultiplayerProvider");
  }
  return ctx;
}
