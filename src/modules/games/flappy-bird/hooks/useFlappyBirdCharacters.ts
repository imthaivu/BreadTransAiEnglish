"use client";

import { useAuth } from "@/lib/auth/context";
import { useMemo } from "react";

export interface FlappyBirdCharacter {
  id: string;
  name: string;
  url: string;
}

/**
 * Nhân vật Flappy Bird chỉ dùng avatar của chính người chơi (không lấy avatar
 * các bạn cùng lớp). Trả về tối đa 1 nhân vật khi user có avatar.
 */
export function useFlappyBirdCharacters(): {
  characters: FlappyBirdCharacter[];
  isLoading: boolean;
} {
  const { profile, loading } = useAuth();

  const characters = useMemo<FlappyBirdCharacter[]>(() => {
    if (!profile?.uid || !profile.avatarUrl) return [];
    return [
      {
        id: profile.uid,
        name: profile.displayName ?? "Tôi",
        url: profile.avatarUrl,
      },
    ];
  }, [profile?.uid, profile?.avatarUrl, profile?.displayName]);

  return { characters, isLoading: loading };
}
