export interface Cup {
  id: string;
  originalId: string;
  index: number;
  isLifting: boolean;
}

export type GamePhase =
  | "IDLE"
  | "REVEALING"
  | "COVERING"
  | "SHUFFLING"
  | "SELECTING"
  | "RESULT"
  | "GAME_OVER";

export interface ShellGameStats {
  score: number;
  highScore: number;
  level: number;
  lives: number;
  consecutiveWins: number;
  highestLevel: number;
  totalGames: number;
  correctGuesses: number;
  totalGuesses: number;
}

export interface ShellGameLevelConfig {
  level: number;
  shufflesCount: number;
  speedMs: number;
  difficultyName: string;
  colorClass: string;
}

/**
 * Cấu hình admin có thể chỉnh được trên Firestore.
 * Mỗi field đều là số để tái sử dụng UI slider/number của AdminGames.
 */
export interface ShellGameSettings {
  initialLives: number;
  scorePerLevel: number;
  revealDurationMs: number;
  coverDurationMs: number;
  baseShufflesCount: number;
  baseSpeedMs: number;
  shufflesPerLevel: number;
  speedDecreasePerLevel: number;
  maxShuffles: number;
  minSpeedMs: number;
}

export const SHELL_GAME_SETTINGS: ShellGameSettings = {
  initialLives: 3,
  scorePerLevel: 100,
  revealDurationMs: 1600,
  coverDurationMs: 1000,
  baseShufflesCount: 3,
  baseSpeedMs: 700,
  shufflesPerLevel: 1,
  speedDecreasePerLevel: 50,
  maxShuffles: 40,
  minSpeedMs: 90,
};
