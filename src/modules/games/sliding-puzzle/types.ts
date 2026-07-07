export type GridSize = 3;

export type SlidingPuzzleStatus = "idle" | "playing" | "paused" | "won" | "lost";

export type SlidingPuzzleDifficulty = "easy" | "medium" | "hard";

export interface SlidingPuzzleTile {
  id: number;
  value: number;
  correctRow: number;
  correctCol: number;
  currentRow: number;
  currentCol: number;
  isEmpty: boolean;
}

export interface SlidingPuzzleHighScore {
  id: string;
  difficulty: SlidingPuzzleDifficulty;
  timeRemaining: number;
  timeSpent: number;
  date: string;
}

export type SlidingPuzzleLanguage = "vi" | "en";
