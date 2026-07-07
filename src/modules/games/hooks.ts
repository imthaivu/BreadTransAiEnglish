"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth/context";
import { studentKeys } from "@/modules/admin/hooks/useStudentManagement";
import {
  fetchGameTicketStatus,
  finishRankedPlay,
  grantGameTicket,
  settleGameBattleWithRetry,
  startGameBattle,
  startRankedPlay,
  type GameDifficulty,
  type GameId,
  type SoloResultPayload,
} from "./services";

export const gameKeys = {
  ticket: (userId: string) => ["game-ticket", userId] as const,
};

export function useGameTicket(userId?: string) {
  const { session } = useAuth();
  const targetId = userId ?? session?.user?.id ?? "";

  return useQuery({
    queryKey: gameKeys.ticket(targetId),
    queryFn: () => fetchGameTicketStatus(targetId),
    enabled: !!targetId,
    staleTime: 30_000,
  });
}

export function useGrantGameTicket() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: grantGameTicket,
    onSuccess: (_, { studentId }) => {
      queryClient.invalidateQueries({ queryKey: gameKeys.ticket(studentId) });
      queryClient.invalidateQueries({ queryKey: studentKeys.detail(studentId) });
    },
  });
}

export function useRankedPlay() {
  const { refetchProfile } = useAuth();

  const start = useMutation({
    mutationFn: (params: { gameId: GameId; difficulty?: GameDifficulty }) =>
      startRankedPlay(params),
  });

  const finish = useMutation({
    mutationFn: (params: { playToken: string; result: SoloResultPayload }) =>
      finishRankedPlay(params),
    onSuccess: () => {
      refetchProfile();
    },
  });

  return { start, finish };
}

export function useGameBattle() {
  const { refetchProfile } = useAuth();

  const start = useMutation({
    mutationFn: (roomId: string) => startGameBattle(roomId),
    onSuccess: () => {
      refetchProfile();
    },
  });

  const settle = useMutation({
    mutationFn: (roomId: string) => settleGameBattleWithRetry(roomId),
    onSuccess: () => {
      refetchProfile();
    },
  });

  return { start, settle };
}
