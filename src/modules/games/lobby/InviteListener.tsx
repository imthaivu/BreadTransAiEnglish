"use client";

import { isOnLearnRoute } from "@/modules/presence";
import { usePathname } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { FiCheck, FiX } from "react-icons/fi";
import { useRoom } from "../realtime/hooks";
import { GAME_TITLES } from "../realtime/types";
import {
  dismissInvitation,
  INVITE_TTL_MS,
} from "./invitations";
import {
  useGameInvitationActions,
  usePendingInvites,
} from "./useGameInvitationActions";
import { useMultiplayer } from "./MultiplayerProvider";
import type { MultiplayerGameId, PlayerRole } from "../realtime/types";

interface InviteListenerProps {
  onEnterRoom: (
    roomId: string,
    role: PlayerRole,
    gameId: MultiplayerGameId
  ) => void;
}

/**
 * Globally mounted. Listens for incoming game invitations addressed to the
 * current user and shows an accept/decline popup. On accept the user joins the
 * room as p2 and is dropped into the game overlay.
 *
 * Ẩn popup khi đang học hoặc đang chơi — lời mời chờ trong Messages.
 */
export function InviteListener({ onEnterRoom }: InviteListenerProps) {
  const pathname = usePathname();
  const onLearnRoute = isOnLearnRoute(pathname);
  const { active } = useMultiplayer();

  const invites = usePendingInvites();
  const { accept, decline, busyId } = useGameInvitationActions(onEnterRoom);

  const current = invites[0];
  const busy = current != null && busyId === current.id;
  const [secondsLeft, setSecondsLeft] = useState(INVITE_TTL_MS / 1000);

  const roomMeta = useRoom(current?.roomId ?? null);
  const seenRoomRef = useRef<string | null>(null);
  useEffect(() => {
    if (current && roomMeta && roomMeta.status === "waiting") {
      seenRoomRef.current = current.roomId;
    }
  }, [current, roomMeta]);

  const roomWithdrawn =
    current != null &&
    !busy &&
    ((roomMeta === null && seenRoomRef.current === current.roomId) ||
      (roomMeta != null && roomMeta.status !== "waiting"));

  useEffect(() => {
    if (!current) {
      setSecondsLeft(INVITE_TTL_MS / 1000);
      return;
    }
    const startedAt = Date.now();
    setSecondsLeft(INVITE_TTL_MS / 1000);
    const tick = () => {
      const remaining = INVITE_TTL_MS - (Date.now() - startedAt);
      setSecondsLeft(Math.max(0, Math.ceil(remaining / 1000)));
    };
    const interval = setInterval(tick, 250);
    return () => clearInterval(interval);
  }, [current?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const expired = current != null && secondsLeft <= 0;

  useEffect(() => {
    if (current && (roomWithdrawn || expired)) {
      void dismissInvitation(current);
    }
  }, [current, roomWithdrawn, expired]);

  if (
    onLearnRoute ||
    active != null ||
    !current ||
    roomWithdrawn ||
    expired
  ) {
    return null;
  }

  return (
    <AnimatePresence>
      <motion.div
        key={current.id}
        initial={{ y: 80, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 80, opacity: 0 }}
        className="fixed bottom-4 left-1/2 z-[9999] w-[min(92vw,360px)] -translate-x-1/2"
      >
        <div className="rounded-2xl border border-amber-200 bg-white p-3 shadow-2xl">
          <div className="flex items-center gap-3">
            {current.fromAvatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={current.fromAvatarUrl}
                alt={current.fromName}
                className="h-11 w-11 rounded-full object-cover ring-2 ring-amber-300"
              />
            ) : (
              <div className="flex h-11 w-11 items-center justify-center rounded-full bg-sky-500 text-base font-bold text-white ring-2 ring-amber-300">
                {current.fromName.charAt(0).toUpperCase()}
              </div>
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-bold text-slate-800">
                {current.fromName}
              </p>
              <p className="truncate text-xs text-slate-500">
                mời bạn chơi{" "}
                <span className="font-semibold text-amber-600">
                  {GAME_TITLES[current.gameId]}
                </span>
              </p>
            </div>
            <div
              className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-black tabular-nums ${
                secondsLeft <= 10
                  ? "bg-rose-100 text-rose-600"
                  : "bg-amber-100 text-amber-700"
              }`}
              title="Lời mời sẽ tự hết hạn"
            >
              {secondsLeft}
            </div>
          </div>
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={() => void decline(current)}
              disabled={busy}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50"
            >
              <FiX className="h-4 w-4" /> Từ chối
            </button>
            <button
              type="button"
              onClick={() => void accept(current)}
              disabled={busy}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-amber-500 py-2 text-sm font-semibold text-white hover:bg-amber-600 disabled:opacity-50"
            >
              <FiCheck className="h-4 w-4" /> Chấp nhận
            </button>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
