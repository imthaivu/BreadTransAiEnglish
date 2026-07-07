import { getAdminRtdb } from "@/lib/firebase/admin";
import { STALE_ROOM_MAX_AGE_MS } from "./room";
import type { RoomMeta } from "./types";
import { parseRoomMeta } from "./validate";

type UserActiveRoom = {
  roomId?: string;
  enteredAt?: number;
};

export interface GameRoomsCleanupResult {
  deletedRooms: number;
  clearedActiveRoomIndexes: number;
  scannedRooms: number;
  scannedActiveRoomIndexes: number;
}

function roomAgeMs(meta: RoomMeta, now: number): number {
  const createdAt = meta.createdAt;
  if (typeof createdAt !== "number" || createdAt <= 0) {
    return STALE_ROOM_MAX_AGE_MS + 1;
  }
  return now - createdAt;
}

function hasAnyPlayerOnline(meta: RoomMeta): boolean {
  const players = meta.players;
  if (!players) return false;
  const slots = ["p1", "p2"] as const;
  for (const slot of slots) {
    if (!players[slot]) continue;
    const presence = meta.presence?.[slot];
    if (!presence || presence.online !== false) return true;
  }
  return false;
}

function allPresentPlayersOffline(meta: RoomMeta): boolean {
  const players = meta.players;
  if (!players) return false;
  const slots = ["p1", "p2"] as const;
  let hasPlayer = false;
  for (const slot of slots) {
    if (!players[slot]) continue;
    hasPlayer = true;
    const presence = meta.presence?.[slot];
    if (!presence || presence.online !== false) return false;
  }
  return hasPlayer;
}

function latestPresenceLastSeen(meta: RoomMeta): number {
  const values = [meta.presence?.p1?.lastSeen, meta.presence?.p2?.lastSeen].filter(
    (v): v is number => typeof v === "number" && v > 0
  );
  return values.length ? Math.max(...values) : 0;
}

/**
 * Quyết định có xoá phòng hay không. KHÔNG BAO GIỜ xoá khi còn người online.
 */
function shouldDeleteRoom(meta: RoomMeta | null | undefined, now: number): boolean {
  if (!meta?.status) return true;

  if (hasAnyPlayerOnline(meta)) return false;

  const age = roomAgeMs(meta, now);

  if (meta.status === "waiting" || meta.status === "finished") {
    return age >= STALE_ROOM_MAX_AGE_MS;
  }

  if (meta.status === "playing") {
    if (!allPresentPlayersOffline(meta)) return false;
    const lastSeen = latestPresenceLastSeen(meta);
    if (!lastSeen) return age >= STALE_ROOM_MAX_AGE_MS;
    return now - lastSeen >= STALE_ROOM_MAX_AGE_MS;
  }

  return false;
}

/** Server-side GC — gọi từ Vercel Cron hoặc script vận hành. */
export async function cleanupStaleGameRooms(): Promise<GameRoomsCleanupResult> {
  const rtdb = getAdminRtdb();
  const now = Date.now();
  const result: GameRoomsCleanupResult = {
    deletedRooms: 0,
    clearedActiveRoomIndexes: 0,
    scannedRooms: 0,
    scannedActiveRoomIndexes: 0,
  };

  const roomsSnap = await rtdb.ref("rooms").get();
  const roomIds = roomsSnap.exists()
    ? Object.keys(roomsSnap.val() as Record<string, unknown>)
    : [];

  result.scannedRooms = roomIds.length;

  for (const roomId of roomIds) {
    const metaSnap = await rtdb.ref(`rooms/${roomId}/meta`).get();
    const meta = metaSnap.exists()
      ? parseRoomMeta(metaSnap.val())
      : undefined;
    if (!shouldDeleteRoom(meta, now)) continue;
    await rtdb.ref(`rooms/${roomId}`).remove();
    result.deletedRooms += 1;
  }

  const activeSnap = await rtdb.ref("userActiveRooms").get();
  if (!activeSnap.exists()) return result;

  const entries = activeSnap.val() as Record<string, UserActiveRoom>;
  result.scannedActiveRoomIndexes = Object.keys(entries).length;

  for (const [uid, active] of Object.entries(entries)) {
    if (!active?.roomId) {
      await rtdb.ref(`userActiveRooms/${uid}`).remove();
      result.clearedActiveRoomIndexes += 1;
      continue;
    }

    const enteredAt = active.enteredAt;
    const indexAge =
      typeof enteredAt === "number" && enteredAt > 0
        ? now - enteredAt
        : STALE_ROOM_MAX_AGE_MS + 1;

    const metaSnap = await rtdb.ref(`rooms/${active.roomId}/meta`).get();
    if (!metaSnap.exists()) {
      await rtdb.ref(`userActiveRooms/${uid}`).remove();
      result.clearedActiveRoomIndexes += 1;
      continue;
    }

    const meta = parseRoomMeta(metaSnap.val());
    if (!meta) {
      await rtdb.ref(`userActiveRooms/${uid}`).remove();
      result.clearedActiveRoomIndexes += 1;
      continue;
    }
    if (hasAnyPlayerOnline(meta)) continue;

    const staleIndex = indexAge >= STALE_ROOM_MAX_AGE_MS;
    const staleRoom =
      meta.status === "finished" ||
      meta.status === "waiting" ||
      shouldDeleteRoom(meta, now);

    if (staleIndex && staleRoom) {
      await rtdb.ref(`userActiveRooms/${uid}`).remove();
      result.clearedActiveRoomIndexes += 1;
    }
  }

  return result;
}
