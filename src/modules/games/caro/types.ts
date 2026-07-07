export type PlayerSymbol = "X" | "O";

export type CellValue = PlayerSymbol | null;

export type BoardState = CellValue[][];

export type GameMode = "PvP" | "PvE";

export type Difficulty = "easy" | "medium" | "hard";

export type GameStatus = "idle" | "playing" | "won" | "draw";

export interface Position {
  row: number;
  col: number;
}

export interface WinningLine {
  positions: Position[];
  symbol: PlayerSymbol;
}

export interface Move {
  position: Position;
  symbol: PlayerSymbol;
  timestamp: number;
}

export interface GameHistory {
  id: string;
  winner: PlayerSymbol | "Draw" | null;
  mode: GameMode;
  difficulty?: Difficulty;
  movesCount: number;
  date: string;
}

export interface ScoreState {
  xWins: number;
  oWins: number;
  draws: number;
}

/**
 * Cấu hình cờ caro do admin quản lý qua Firestore.
 * Cùng dạng record số như các game khác để tái sử dụng UI form AdminGames.
 */
export interface CaroSettings {
  boardSize: number;
  winLength: number;
  aiThinkMinMs: number;
  aiThinkMaxMs: number;
  easyTopKMoves: number;
  easyRandomChancePct: number;
  mediumTopKMoves: number;
  mediumRandomChancePct: number;
  historyMaxRecords: number;
}

export const CARO_SETTINGS: CaroSettings = {
  boardSize: 15,
  winLength: 5,
  aiThinkMinMs: 400,
  aiThinkMaxMs: 800,
  easyTopKMoves: 5,
  easyRandomChancePct: 60,
  mediumTopKMoves: 3,
  mediumRandomChancePct: 15,
  historyMaxRecords: 10,
};
