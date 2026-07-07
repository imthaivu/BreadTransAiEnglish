"use client";

import { useAuth } from "@/lib/auth/context";
import { PVP_STAKE, PVP_WIN } from "@/lib/games/types";
import { useCallback, useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import type {
  Invitation,
  MultiplayerGameId,
  PlayerRole,
} from "../realtime/types";
import {
  acceptInvitation,
  declineInvitation,
  pushInviteSignal,
  subscribeInvitations,
  type SimplePlayer,
} from "./invitations";

export function usePendingInvites(): Invitation[] {
  const { profile } = useAuth();
  const [invites, setInvites] = useState<Invitation[]>([]);

  useEffect(() => {
    if (!profile?.uid) {
      setInvites([]);
      return;
    }
    return subscribeInvitations(profile.uid, setInvites);
  }, [profile?.uid]);

  return invites;
}

export function useGameInvitationActions(
  onEnterRoom: (
    roomId: string,
    role: PlayerRole,
    gameId: MultiplayerGameId
  ) => void
) {
  const { profile } = useAuth();
  const [busyId, setBusyId] = useState<string | null>(null);

  const self: SimplePlayer | null = useMemo(() => {
    if (!profile?.uid) return null;
    return {
      id: profile.uid,
      name: profile.displayName || "Học sinh",
      avatarUrl: profile.avatarUrl ?? null,
    };
  }, [profile?.uid, profile?.displayName, profile?.avatarUrl]);

  const accept = useCallback(
    async (invitation: Invitation) => {
      if (!self) return;
      if ((profile?.totalBanhRan ?? 0) < PVP_STAKE) {
        toast.error(
          `Bạn cần ít nhất ${PVP_STAKE} bánh để nhận lời mời đấu solo (thắng nhận ${PVP_WIN}).`
        );
        setBusyId(invitation.id);
        try {
          await pushInviteSignal({
            hostId: invitation.fromId,
            reason: "invitee_insufficient",
            fromName: self.name,
          });
          await declineInvitation(invitation);
        } finally {
          setBusyId(null);
        }
        return;
      }
      setBusyId(invitation.id);
      try {
        const joined = await acceptInvitation(invitation, self);
        if (joined) onEnterRoom(invitation.roomId, "p2", invitation.gameId);
      } finally {
        setBusyId(null);
      }
    },
    [self, profile?.totalBanhRan, onEnterRoom]
  );

  const decline = useCallback(async (invitation: Invitation) => {
    setBusyId(invitation.id);
    try {
      await declineInvitation(invitation);
    } finally {
      setBusyId(null);
    }
  }, []);

  return { accept, decline, busyId, self };
}
