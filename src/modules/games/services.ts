import { auth } from "@/lib/firebase/client";
import type {
  GameDifficulty,
  GameId,
  GameTicketStatus,
  SoloResultPayload,
} from "@/lib/games/types";

async function requireIdToken(): Promise<string> {
  const user = auth.currentUser;
  if (!user) throw new Error("Vui lòng đăng nhập.");
  return user.getIdToken();
}

async function parseApiError(response: Response, fallback: string): Promise<string> {
  try {
    const data = (await response.json()) as { error?: string };
    if (data?.error) return data.error;
  } catch {
    // ignore
  }
  return fallback;
}

async function parseApiErrorPayload(
  response: Response,
  fallback: string
): Promise<{ message: string; code?: string }> {
  try {
    const data = (await response.json()) as { error?: string; code?: string };
    if (data?.error || data?.code) {
      return {
        message: data.error ?? fallback,
        code: data.code ?? data.error,
      };
    }
  } catch {
    // ignore
  }
  return { message: fallback };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function fetchGameTicketStatus(userId?: string): Promise<GameTicketStatus> {
  const idToken = await requireIdToken();
  const qs = userId ? `?userId=${encodeURIComponent(userId)}` : "";
  const response = await fetch(`/api/games/ticket/status${qs}`, {
    headers: { Authorization: `Bearer ${idToken}` },
  });
  if (!response.ok) {
    throw new Error(await parseApiError(response, "Không tải được trạng thái vé."));
  }
  const data = (await response.json()) as { ticket: GameTicketStatus };
  return data.ticket;
}

export async function grantGameTicket(params: {
  studentId: string;
  classId: string;
}): Promise<GameTicketStatus> {
  const idToken = await requireIdToken();
  const response = await fetch("/api/games/ticket/grant", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify(params),
  });
  if (!response.ok) {
    throw new Error(await parseApiError(response, "Không thể cấp vé."));
  }
  const data = (await response.json()) as { ticket: GameTicketStatus };
  return data.ticket;
}

export async function startRankedPlay(params: {
  gameId: GameId;
  difficulty?: GameDifficulty;
}): Promise<{ playToken: string }> {
  const idToken = await requireIdToken();
  const response = await fetch("/api/games/play/start", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify(params),
  });
  if (!response.ok) {
    throw new Error(await parseApiError(response, "Không thể bắt đầu lượt chơi có vé."));
  }
  return (await response.json()) as { playToken: string };
}

export async function finishRankedPlay(params: {
  playToken: string;
  result: SoloResultPayload;
}): Promise<{ reward: number; newBalance: number }> {
  const idToken = await requireIdToken();
  const response = await fetch("/api/games/play/finish", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify(params),
  });
  if (!response.ok) {
    throw new Error(await parseApiError(response, "Không thể nhận thưởng."));
  }
  return (await response.json()) as { reward: number; newBalance: number };
}

/** Lỗi cọc bánh có kèm `code` để client phân biệt trường hợp thiếu bánh. */
export class BattleStartError extends Error {
  code?: string;
  constructor(message: string, code?: string) {
    super(message);
    this.name = "BattleStartError";
    this.code = code;
  }
}

export async function startGameBattle(roomId: string): Promise<void> {
  const idToken = await requireIdToken();
  const response = await fetch("/api/games/battle/start", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify({ roomId }),
  });
  if (!response.ok) {
    const message = await parseApiError(
      response,
      "Không thể cọc bánh cho trận đấu."
    );
    // 402 = INSUFFICIENT_BALANCE (một trong hai người không đủ 20 bánh).
    throw new BattleStartError(
      message,
      response.status === 402 ? "INSUFFICIENT_BALANCE" : undefined
    );
  }
}

/** Lỗi settle PvP có kèm `code` để client retry khi escrow chưa sẵn sàng. */
export class BattleSettleError extends Error {
  code?: string;
  constructor(message: string, code?: string) {
    super(message);
    this.name = "BattleSettleError";
    this.code = code;
  }
}

export async function settleGameBattle(
  roomId: string
): Promise<{ reward: number }> {
  const idToken = await requireIdToken();
  const response = await fetch("/api/games/battle/settle", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify({ roomId }),
  });
  if (!response.ok) {
    const { message, code } = await parseApiErrorPayload(
      response,
      "Không thể kết thúc trận đấu."
    );
    throw new BattleSettleError(message, code);
  }
  return (await response.json()) as { reward: number };
}

const SETTLE_RETRY_DELAYS_MS = [300, 600, 1000, 1500, 2000];

/** Retry settle khi escrow chưa kịp ghi (race với startBattle). */
export async function settleGameBattleWithRetry(
  roomId: string
): Promise<{ reward: number }> {
  let lastErr: BattleSettleError | null = null;
  for (let attempt = 0; attempt <= SETTLE_RETRY_DELAYS_MS.length; attempt++) {
    try {
      return await settleGameBattle(roomId);
    } catch (err) {
      if (
        err instanceof BattleSettleError &&
        err.code === "BATTLE_NOT_ESCROWED" &&
        attempt < SETTLE_RETRY_DELAYS_MS.length
      ) {
        lastErr = err;
        await sleep(SETTLE_RETRY_DELAYS_MS[attempt]);
        continue;
      }
      throw err;
    }
  }
  throw lastErr ?? new BattleSettleError("Không thể kết thúc trận đấu.");
}

export type { GameId, GameDifficulty, GameTicketStatus, SoloResultPayload };
