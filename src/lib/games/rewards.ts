import type { GameDifficulty, GameId, SoloResultPayload } from "./types";
import { MAX_BREAD_PER_PLAY } from "./types";

const DIFFICULTY_BREAD: Record<GameDifficulty, number> = {
  easy: 2,
  medium: 5,
  hard: 8,
};

/** Plausibility caps per game (anti-cheat soft limits). */
export const PLAUSIBILITY_CAPS: Record<
  GameId,
  { score?: number; level?: number; suitcases?: number }
> = {
  "flappy-bird": { score: 500 },
  "shell-game": { level: 100 },
  "sky-high": { suitcases: 200 },
  "sliding-puzzle": {},
  caro: {},
};

/**
 * Các game "ăn điểm" theo số (flappy / tìm bóng / sky-high). Khi điểm vượt
 * ngưỡng SCORE_GAMBLE_THRESHOLD, áp luật sát phạt theo chẵn/lẻ: điểm chẵn được
 * cộng bánh, điểm lẻ bị TRỪ bánh — game thủ giỏi đẩy điểm cao càng dễ thua đậm.
 */
const SCORE_GAMBLE_GAMES: GameId[] = ["flappy-bird", "shell-game", "sky-high"];
export const SCORE_GAMBLE_THRESHOLD = 10;

/**
 * Quy đổi điểm sang số bánh. Giá trị có thể ÂM (bị trừ bánh) với các game ăn
 * điểm khi điểm > 8 và là số lẻ. Độ lớn luôn bị chặn ở MAX_BREAD_PER_PLAY.
 */
export function scoreToBread(
  gameId: GameId,
  result: SoloResultPayload
): number {
  if (!result.won) return 0;

  let raw = 0;
  switch (gameId) {
    case "flappy-bird":
      raw = Math.max(0, Math.floor(result.score ?? 0));
      break;
    case "shell-game":
      raw = Math.max(0, Math.floor(result.level ?? 0));
      break;
    case "sky-high":
      raw = Math.max(0, Math.floor(result.suitcases ?? 0));
      break;
    case "sliding-puzzle":
    case "caro":
      raw = DIFFICULTY_BREAD[result.difficulty ?? "easy"] ?? 0;
      break;
    default:
      raw = 0;
  }

  const magnitude = Math.min(raw, MAX_BREAD_PER_PLAY);

  if (SCORE_GAMBLE_GAMES.includes(gameId) && raw > SCORE_GAMBLE_THRESHOLD) {
    // Lẻ → phạt (âm), chẵn → thưởng (dương).
    return raw % 2 === 0 ? magnitude : -magnitude;
  }

  return magnitude;
}

export function isPlausibleResult(
  gameId: GameId,
  result: SoloResultPayload,
  playDifficulty?: GameDifficulty
): boolean {
  const caps = PLAUSIBILITY_CAPS[gameId];
  if (result.score != null && caps.score != null && result.score > caps.score) {
    return false;
  }
  if (result.level != null && caps.level != null && result.level > caps.level) {
    return false;
  }
  if (
    result.suitcases != null &&
    caps.suitcases != null &&
    result.suitcases > caps.suitcases
  ) {
    return false;
  }
  if (gameId === "sliding-puzzle" || gameId === "caro") {
    if (!playDifficulty) return false;
    if (result.difficulty && result.difficulty !== playDifficulty) {
      return false;
    }
    if (result.won && !result.difficulty) {
      return false;
    }
  }
  if (
    (gameId === "flappy-bird" || gameId === "shell-game" || gameId === "sky-high") &&
    result.won &&
    (result.score == null && result.level == null && result.suitcases == null)
  ) {
    return false;
  }
  return true;
}
