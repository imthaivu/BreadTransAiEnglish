export type GameId =
  | "flappy-bird"
  | "shell-game"
  | "sky-high"
  | "sliding-puzzle"
  | "caro";

export type GameDifficulty = "easy" | "medium" | "hard";

export type GamePlayMode = "practice" | "ranked" | "solo-battle";

export type GamePlayStatus = "active" | "finished" | "expired";

export type GameBattleStatus = "pending" | "escrowed" | "settled" | "cancelled";

export const MAX_BREAD_PER_PLAY = 30;
export const PVP_STAKE = 20;
export const PVP_WIN = 35;
export const TICKET_TTL_MS = 24 * 60 * 60 * 1000;
export const PLAY_TOKEN_TTL_MS = 60 * 60 * 1000;

export type SoloResultPayload = {
  won: boolean;
  score?: number;
  level?: number;
  suitcases?: number;
  difficulty?: GameDifficulty;
};

export type GameTicket = {
  expiresAt: string;
  grantedBy: string;
  grantedAt: string;
};

export type GameTicketStatus = {
  allowed: boolean;
  /** Số vé còn hiệu lực. */
  count: number;
  /** Hết hạn sớm nhất (để hiển thị). */
  nextExpiresAt: string | null;
  /** @deprecated Giữ tương thích — bằng nextExpiresAt. */
  expiresAt: string | null;
  grantedBy: string | null;
  grantedAt: string | null;
};

export type GamePlayDoc = {
  userId: string;
  gameId: GameId;
  difficulty?: GameDifficulty;
  status: GamePlayStatus;
  reward?: number;
  startedAt: string;
  finishedAt?: string;
  result?: SoloResultPayload;
};

export type GameBattleDoc = {
  roomId: string;
  gameId: GameId;
  p1: string;
  p2: string;
  stake: number;
  status: GameBattleStatus;
  winnerRole?: "p1" | "p2" | "draw" | null;
  winnerUserId?: string | null;
  /** Kết quả server xác nhận lúc settle (audit). */
  settledWinnerRole?: "p1" | "p2" | "draw" | null;
  settledAt?: string;
};
