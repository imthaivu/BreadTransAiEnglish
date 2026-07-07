"use client";

import { useEffect, useState } from "react";
import { FiCheck, FiX } from "react-icons/fi";
import { GAME_TITLES, type Invitation } from "../realtime/types";
import { INVITE_TTL_MS } from "../lobby/invitations";

export function useInviteCountdown(inviteId: string | null): number {
  const [secondsLeft, setSecondsLeft] = useState(INVITE_TTL_MS / 1000);

  useEffect(() => {
    if (!inviteId) {
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
  }, [inviteId]);

  return secondsLeft;
}

interface GameInviteCardProps {
  invitation: Invitation;
  busy: boolean;
  onAccept: () => void;
  onDecline: () => void;
}

export function GameInviteCard({
  invitation,
  busy,
  onAccept,
  onDecline,
}: GameInviteCardProps) {
  const secondsLeft = useInviteCountdown(invitation.id);
  const expired = secondsLeft <= 0;

  return (
    <div className="flex flex-col gap-2 py-3 px-1 sm:px-0">
      <div className="flex items-start gap-3">
        {invitation.fromAvatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={invitation.fromAvatarUrl}
            alt={invitation.fromName}
            className="h-10 w-10 shrink-0 rounded-full object-cover ring-2 ring-amber-200"
          />
        ) : (
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-sky-500 text-sm font-bold text-white ring-2 ring-amber-200">
            {invitation.fromName.charAt(0).toUpperCase()}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-gray-900">
            <span className="font-bold">{invitation.fromName}</span> mời đấu
            solo
          </p>
          <p className="text-xs text-gray-600">
            Trò chơi:{" "}
            <span className="font-semibold text-amber-700">
              {GAME_TITLES[invitation.gameId]}
            </span>
          </p>
          {expired ? (
            <p className="mt-0.5 text-[11px] font-medium text-rose-500">
              Lời mời đã hết hạn
            </p>
          ) : (
            <p className="mt-0.5 text-[11px] text-gray-400">
              Hết hạn sau{" "}
              <span className="font-bold tabular-nums text-gray-600">
                {secondsLeft}s
              </span>
            </p>
          )}
        </div>
      </div>
      {!expired && (
        <div className="flex gap-2 pl-[52px]">
          <button
            type="button"
            onClick={onDecline}
            disabled={busy}
            className="inline-flex flex-1 items-center justify-center gap-1 rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-xs font-semibold text-gray-600 hover:bg-gray-50 disabled:opacity-50"
          >
            <FiX className="h-3.5 w-3.5" /> Từ chối
          </button>
          <button
            type="button"
            onClick={onAccept}
            disabled={busy}
            className="inline-flex flex-1 items-center justify-center gap-1 rounded-lg bg-amber-500 px-2 py-1.5 text-xs font-semibold text-white hover:bg-amber-600 disabled:opacity-50"
          >
            <FiCheck className="h-3.5 w-3.5" /> Chấp nhận
          </button>
        </div>
      )}
    </div>
  );
}
