import { db } from "@/lib/firebase/client";
import { useQuery } from "@tanstack/react-query";
import { doc, getDoc } from "firebase/firestore";
import {
  GAME_SETTINGS,
  GameSettings,
  RAIN_FORECAST_MIN_FRAMES,
} from "../types";

const COLLECTION = "gameSettings";
const GAME_ID = "flappy-bird";

const SETTINGS_FIELDS: Array<keyof GameSettings> = [
  "gravity",
  "jumpVelocity",
  "pipeSpeed",
  "pipeSpawnInterval",
  "pipeGap",
  "pipeWidth",
  "birdWidth",
  "birdHeight",
  "rainEnabled",
  "rainStartChancePer10k",
  "rainForecastFrames",
  "rainMinDurationFrames",
  "rainMaxDurationFrames",
  "rainDropCount",
  "wetDurationFrames",
  "wetGravityMultiplier",
  "lightningChancePer10k",
];

const sanitize = (raw: Record<string, unknown>): GameSettings => {
  const next: GameSettings = { ...GAME_SETTINGS };
  for (const key of SETTINGS_FIELDS) {
    const value = raw[key];
    if (typeof value === "number" && Number.isFinite(value)) {
      next[key] = value;
    }
  }
  if (next.rainEnabled >= 1 && next.rainForecastFrames < RAIN_FORECAST_MIN_FRAMES) {
    next.rainForecastFrames = RAIN_FORECAST_MIN_FRAMES;
  }
  return next;
};

export const flappyBirdSettingsQueryKey = [
  "gameSettings",
  GAME_ID,
] as const;

const fetchFlappyBirdSettings = async (): Promise<GameSettings> => {
  try {
    const snap = await getDoc(doc(db, COLLECTION, GAME_ID));
    if (!snap.exists()) return GAME_SETTINGS;
    return sanitize(snap.data() as Record<string, unknown>);
  } catch {
    // Nếu Firestore lỗi (rules / offline), fallback defaults để game vẫn chạy
    return GAME_SETTINGS;
  }
};

export const useFlappyBirdSettings = () => {
  return useQuery<GameSettings>({
    queryKey: flappyBirdSettingsQueryKey,
    queryFn: fetchFlappyBirdSettings,
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    placeholderData: GAME_SETTINGS,
  });
};
