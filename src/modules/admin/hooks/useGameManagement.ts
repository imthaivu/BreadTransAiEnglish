import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import {
  GameId,
  GameSettings,
  getGameSettings,
  updateGameSettings,
} from "../services/game.service";

export const gameKeys = {
  all: ["gameSettings"] as const,
  byId: (gameId: GameId) => [...gameKeys.all, gameId] as const,
};

export const useGameSettings = (gameId: GameId, enabled = true) => {
  return useQuery<GameSettings>({
    queryKey: gameKeys.byId(gameId),
    queryFn: () => getGameSettings(gameId),
    enabled,
    staleTime: 60 * 1000,
    gcTime: 5 * 60 * 1000,
  });
};

export const useUpdateGameSettings = (gameId: GameId) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (settings: GameSettings) =>
      updateGameSettings(gameId, settings),
    onSuccess: (_data, settings) => {
      queryClient.setQueryData<GameSettings>(gameKeys.byId(gameId), settings);
      queryClient.invalidateQueries({ queryKey: gameKeys.byId(gameId) });
      toast.success("Đã lưu cấu hình game.");
    },
    onError: (error: unknown) => {
      const msg =
        error instanceof Error ? error.message : "Lưu cấu hình thất bại.";
      toast.error(msg);
    },
  });
};
