import type { GameId } from "./types";

export type PvpPlayerRole = "p1" | "p2";

export type PvpRoomMeta = {
  gameId: GameId;
  status: string;
  winnerRole?: PvpPlayerRole | "draw" | null;
  winnerReason?: "win" | "forfeit" | "disconnect" | "draw" | null;
};

const SHELL_GAME_TARGET_SCORE = 3;
const SKY_HIGH_KO_SCORE_GAP = 3;

type SkyHighRoleState = { score?: number; done?: boolean };
type FlappyRoleState = { score?: number; alive?: boolean };

function resolveCaro(
  state: Record<string, unknown> | null
): PvpPlayerRole | "draw" | null {
  if (!state) return null;
  const status = state.status;
  if (status === "draw") return "draw";
  if (status !== "won") return null;
  const winner = state.winner;
  if (winner === "X") return "p1";
  if (winner === "O") return "p2";
  return null;
}

function resolveSlidingPuzzle(
  state: Record<string, unknown> | null
): PvpPlayerRole | "draw" | null {
  if (!state) return null;
  const winner = state.winner;
  if (winner === "p1" || winner === "p2") return winner;
  return null;
}

function resolveShellGame(
  state: Record<string, unknown> | null
): PvpPlayerRole | "draw" | null {
  if (!state) return null;
  const scores = state.scores as { p1?: number; p2?: number } | undefined;
  if (!scores) return null;
  const p1 = scores.p1 ?? 0;
  const p2 = scores.p2 ?? 0;
  if (p1 < SHELL_GAME_TARGET_SCORE && p2 < SHELL_GAME_TARGET_SCORE) {
    return null;
  }
  if (p1 > p2) return "p1";
  if (p2 > p1) return "p2";
  return "draw";
}

function resolveSkyHigh(
  state: Record<string, unknown> | null
): PvpPlayerRole | "draw" | null {
  if (!state) return null;
  const p1 = (state.p1 as SkyHighRoleState | undefined) ?? {};
  const p2 = (state.p2 as SkyHighRoleState | undefined) ?? {};
  const p1Score = p1.score ?? 0;
  const p2Score = p2.score ?? 0;
  const p1Done = p1.done === true;
  const p2Done = p2.done === true;

  if (p1Done && p2Done) {
    if (p1Score > p2Score) return "p1";
    if (p2Score > p1Score) return "p2";
    return "draw";
  }
  if (p1Done && !p2Done) {
    if (p1Score >= p2Score + SKY_HIGH_KO_SCORE_GAP) return "p1";
    return "p2";
  }
  if (!p1Done && p2Done) return "p1";
  if (p1Score >= p2Score + SKY_HIGH_KO_SCORE_GAP) return "p1";
  if (p2Score >= p1Score + SKY_HIGH_KO_SCORE_GAP) return "p2";
  return null;
}

function resolveFlappyBird(
  state: Record<string, unknown> | null
): PvpPlayerRole | "draw" | null {
  if (!state) return null;
  const p1 = (state.p1 as FlappyRoleState | undefined) ?? {};
  const p2 = (state.p2 as FlappyRoleState | undefined) ?? {};
  if (p1.alive !== false || p2.alive !== false) return null;
  const s1 = p1.score ?? 0;
  const s2 = p2.score ?? 0;
  if (s1 > s2) return "p1";
  if (s2 > s1) return "p2";
  return "draw";
}

function resolveFromGameState(
  gameId: GameId,
  state: unknown
): PvpPlayerRole | "draw" | null {
  const record =
    state != null && typeof state === "object"
      ? (state as Record<string, unknown>)
      : null;

  switch (gameId) {
    case "caro":
      return resolveCaro(record);
    case "sliding-puzzle":
      return resolveSlidingPuzzle(record);
    case "shell-game":
      return resolveShellGame(record);
    case "sky-high":
      return resolveSkyHigh(record);
    case "flappy-bird":
      return resolveFlappyBird(record);
    default:
      return null;
  }
}

function metaWinnerRole(
  meta: PvpRoomMeta
): PvpPlayerRole | "draw" | null {
  const wr = meta.winnerRole;
  if (wr === "p1" || wr === "p2" || wr === "draw") return wr;
  return null;
}

/**
 * Xác định người thắng PvP phía server từ RTDB meta + state.
 * Forfeit/disconnect tin meta; win/draw ưu tiên state game, fallback meta
 * khi phòng đã finished (Flappy Bird position sync dễ ghi đè alive:false).
 */
export function resolvePvpWinner(params: {
  meta: PvpRoomMeta;
  state: unknown;
}): PvpPlayerRole | "draw" | null {
  const { meta, state } = params;
  const reason = meta.winnerReason ?? "win";

  if (reason === "forfeit" || reason === "disconnect") {
    return metaWinnerRole(meta);
  }

  if (reason === "draw") {
    const fromMeta = metaWinnerRole(meta);
    if (fromMeta === "draw") return "draw";
  }

  const fromState = resolveFromGameState(meta.gameId, state);
  if (fromState != null) return fromState;

  if (meta.status === "finished") {
    return metaWinnerRole(meta);
  }

  return null;
}
