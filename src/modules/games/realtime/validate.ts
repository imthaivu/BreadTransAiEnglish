import type {
  MultiplayerGameId,
  PlayerRole,
  RoomMeta,
  RoomPlayer,
  UserActiveRoom,
} from "./types";

const VALID_GAME_IDS = new Set<MultiplayerGameId>([
  "flappy-bird",
  "shell-game",
  "caro",
  "sky-high",
  "sliding-puzzle",
]);

function isRecord(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

function parseRoomPlayer(raw: unknown): RoomPlayer | null {
  if (!isRecord(raw)) return null;
  if (typeof raw.id !== "string" || typeof raw.name !== "string") return null;
  const color =
    raw.color === "red" ? "red" : raw.color === "blue" ? "blue" : null;
  if (!color) return null;
  return {
    id: raw.id,
    name: raw.name,
    avatarUrl:
      typeof raw.avatarUrl === "string"
        ? raw.avatarUrl
        : raw.avatarUrl === null
          ? null
          : null,
    color,
  };
}

/**
 * Chuẩn hoá meta RTDB — trả về `null` khi dữ liệu thiếu/hỏng (phòng cũ, ghi
 * dở, hoặc index `userActiveRooms` trỏ tới phòng không còn hợp lệ).
 */
export function parseRoomMeta(raw: unknown): RoomMeta | null {
  if (!isRecord(raw)) return null;

  const gameId = raw.gameId;
  if (
    typeof gameId !== "string" ||
    !VALID_GAME_IDS.has(gameId as MultiplayerGameId)
  ) {
    return null;
  }

  if (typeof raw.hostId !== "string") return null;

  const status = raw.status;
  if (status !== "waiting" && status !== "playing" && status !== "finished") {
    return null;
  }

  if (!isRecord(raw.players)) return null;
  const p1 = parseRoomPlayer(raw.players.p1);
  if (!p1) return null;

  const p2Raw = raw.players.p2;
  const p2 = p2Raw == null ? null : parseRoomPlayer(p2Raw);
  if (p2Raw != null && !p2) return null;

  const inviteeRaw = raw.invitee;
  let invitee: RoomMeta["invitee"] = undefined;
  if (inviteeRaw != null) {
    if (!isRecord(inviteeRaw) || typeof inviteeRaw.name !== "string") {
      return null;
    }
    invitee = {
      name: inviteeRaw.name,
      avatarUrl:
        typeof inviteeRaw.avatarUrl === "string"
          ? inviteeRaw.avatarUrl
          : inviteeRaw.avatarUrl === null
            ? null
            : null,
    };
  }

  const presenceRaw = raw.presence;
  const presence: RoomMeta["presence"] = {};
  if (presenceRaw != null) {
    if (!isRecord(presenceRaw)) return null;
    for (const slot of ["p1", "p2"] as const) {
      const p = presenceRaw[slot];
      if (p == null) continue;
      if (!isRecord(p) || typeof p.online !== "boolean") return null;
      presence[slot] = {
        online: p.online,
        lastSeen: typeof p.lastSeen === "number" ? p.lastSeen : 0,
        disconnectSince:
          typeof p.disconnectSince === "number" ? p.disconnectSince : null,
      };
    }
  }

  const winnerRole = raw.winnerRole;
  const parsedWinnerRole =
    winnerRole === "p1" ||
    winnerRole === "p2" ||
    winnerRole === "draw" ||
    winnerRole === null
      ? winnerRole
      : null;

  const winnerReason = raw.winnerReason;
  const parsedWinnerReason =
    winnerReason === "win" ||
    winnerReason === "forfeit" ||
    winnerReason === "disconnect" ||
    winnerReason === "draw" ||
    winnerReason === null ||
    winnerReason === undefined
      ? (winnerReason ?? null)
      : null;

  const forfeitRole = raw.forfeitRole;
  const parsedForfeitRole =
    forfeitRole === "p1" || forfeitRole === "p2" || forfeitRole === null
      ? forfeitRole
      : null;

  return {
    gameId: gameId as MultiplayerGameId,
    hostId: raw.hostId,
    status,
    createdAt: typeof raw.createdAt === "number" ? raw.createdAt : 0,
    seed: typeof raw.seed === "number" ? raw.seed : 0,
    startAt:
      raw.startAt == null
        ? null
        : typeof raw.startAt === "number"
          ? raw.startAt
          : null,
    players: { p1, p2 },
    invitee,
    winnerRole: parsedWinnerRole,
    winnerReason: parsedWinnerReason,
    forfeitRole: parsedForfeitRole,
    ...(Object.keys(presence).length > 0 ? { presence } : {}),
  };
}

/** Chuẩn hoá index `userActiveRooms/{uid}` — bỏ qua payload thừa/hỏng. */
export function parseUserActiveRoom(raw: unknown): UserActiveRoom | null {
  if (!isRecord(raw)) return null;
  if (typeof raw.roomId !== "string" || !raw.roomId) return null;
  const role = raw.role;
  if (role !== "p1" && role !== "p2") return null;
  const gameId = raw.gameId;
  if (
    typeof gameId !== "string" ||
    !VALID_GAME_IDS.has(gameId as MultiplayerGameId)
  ) {
    return null;
  }
  return {
    roomId: raw.roomId,
    role: role as PlayerRole,
    gameId: gameId as MultiplayerGameId,
    enteredAt: typeof raw.enteredAt === "number" ? raw.enteredAt : 0,
  };
}