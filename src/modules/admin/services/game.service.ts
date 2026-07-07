import { db } from "@/lib/firebase/client";
import { doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";
import {
  CARO_SETTINGS as CARO_DEFAULTS,
  CaroSettings,
} from "@/modules/games/caro/types";
import {
  GAME_SETTINGS as FLAPPY_BIRD_DEFAULTS,
  GameSettings as FlappyBirdSettings,
} from "@/modules/games/flappy-bird/types";
import {
  SHELL_GAME_SETTINGS as SHELL_GAME_DEFAULTS,
  ShellGameSettings,
} from "@/modules/games/shell-game/types";
import {
  SKY_HIGH_SETTINGS as SKY_HIGH_DEFAULTS,
  SkyHighSettings,
} from "@/modules/games/sky-high/types";

const COLLECTION = "gameSettings";

export type GameId = "flappy-bird" | "shell-game" | "caro" | "sky-high";

export const GAME_LABEL: Record<GameId, string> = {
  "flappy-bird": "Flappy Bird",
  "shell-game": "Đảo Ly Tìm Bóng",
  caro: "Cờ Caro Giấy Tập",
  "sky-high": "Sky High",
};

/**
 * Tất cả game hiện tại đều có settings là record số -> đơn giản hóa kiểu generic
 * ở tầng admin. UI form đảm bảo các key cụ thể qua FieldSpec.
 */
export type GameSettings = Record<string, number>;

export const DEFAULT_GAME_SETTINGS: Record<GameId, GameSettings> = {
  "flappy-bird": { ...FLAPPY_BIRD_DEFAULTS },
  "shell-game": { ...SHELL_GAME_DEFAULTS },
  caro: { ...CARO_DEFAULTS },
  "sky-high": { ...SKY_HIGH_DEFAULTS },
};

const GAME_FIELD_KEYS: Record<GameId, string[]> = {
  "flappy-bird": Object.keys(FLAPPY_BIRD_DEFAULTS),
  "shell-game": Object.keys(SHELL_GAME_DEFAULTS),
  caro: Object.keys(CARO_DEFAULTS),
  "sky-high": Object.keys(SKY_HIGH_DEFAULTS),
};

const sanitize = (
  defaults: GameSettings,
  fieldKeys: string[],
  raw: Record<string, unknown>
): GameSettings => {
  const next: GameSettings = { ...defaults };
  for (const key of fieldKeys) {
    const value = raw[key];
    if (typeof value === "number" && Number.isFinite(value)) {
      next[key] = value;
    }
  }
  return next;
};

export const getGameSettings = async (
  gameId: GameId
): Promise<GameSettings> => {
  const defaults = DEFAULT_GAME_SETTINGS[gameId];
  const fieldKeys = GAME_FIELD_KEYS[gameId];
  const ref = doc(db, COLLECTION, gameId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return defaults;
  return sanitize(defaults, fieldKeys, snap.data());
};

export const updateGameSettings = async (
  gameId: GameId,
  settings: GameSettings
): Promise<void> => {
  const defaults = DEFAULT_GAME_SETTINGS[gameId];
  const fieldKeys = GAME_FIELD_KEYS[gameId];
  const payload: Record<string, unknown> = { updatedAt: serverTimestamp() };
  for (const key of fieldKeys) {
    const value = settings[key];
    if (typeof value === "number" && Number.isFinite(value)) {
      payload[key] = value;
    } else {
      payload[key] = defaults[key];
    }
  }
  const ref = doc(db, COLLECTION, gameId);
  await setDoc(ref, payload, { merge: true });
};

export type {
  CaroSettings,
  FlappyBirdSettings,
  ShellGameSettings,
  SkyHighSettings,
};
