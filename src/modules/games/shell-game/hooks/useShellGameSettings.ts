import { db } from "@/lib/firebase/client";
import { useQuery } from "@tanstack/react-query";
import { doc, getDoc } from "firebase/firestore";
import { SHELL_GAME_SETTINGS, ShellGameSettings } from "../types";

const COLLECTION = "gameSettings";
const GAME_ID = "shell-game";

const SETTINGS_FIELDS: Array<keyof ShellGameSettings> = [
  "initialLives",
  "revealDurationMs",
  "coverDurationMs",
  "baseShufflesCount",
  "baseSpeedMs",
  "shufflesPerLevel",
  "speedDecreasePerLevel",
  "maxShuffles",
  "minSpeedMs",
];

const sanitize = (raw: Record<string, unknown>): ShellGameSettings => {
  const next: ShellGameSettings = { ...SHELL_GAME_SETTINGS };
  for (const key of SETTINGS_FIELDS) {
    const value = raw[key];
    if (typeof value === "number" && Number.isFinite(value)) {
      next[key] = value;
    }
  }
  return next;
};

export const shellGameSettingsQueryKey = ["gameSettings", GAME_ID] as const;

const fetchShellGameSettings = async (): Promise<ShellGameSettings> => {
  try {
    const snap = await getDoc(doc(db, COLLECTION, GAME_ID));
    if (!snap.exists()) return SHELL_GAME_SETTINGS;
    return sanitize(snap.data() as Record<string, unknown>);
  } catch {
    // Nếu Firestore lỗi (rules / offline), fallback defaults để game vẫn chạy.
    return SHELL_GAME_SETTINGS;
  }
};

export const useShellGameSettings = () => {
  return useQuery<ShellGameSettings>({
    queryKey: shellGameSettingsQueryKey,
    queryFn: fetchShellGameSettings,
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    placeholderData: SHELL_GAME_SETTINGS,
  });
};
