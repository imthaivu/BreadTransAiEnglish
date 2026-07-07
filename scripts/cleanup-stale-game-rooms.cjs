/**
 * Dọn phòng game và index userActiveRooms cũ trên Firebase RTDB.
 *
 * Usage:
 *   node --env-file=.env scripts/cleanup-stale-game-rooms.cjs
 */
const { cert, getApps, initializeApp } = require("firebase-admin/app");
const { getDatabase } = require("firebase-admin/database");

const STALE_ROOM_MAX_AGE_MS = 24 * 60 * 60 * 1000;

function getServiceAccount() {
  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY;
  if (!projectId || !clientEmail || !privateKey) {
    throw new Error("Missing Firebase Admin environment variables");
  }
  return {
    projectId,
    clientEmail,
    privateKey: privateKey.replace(/\\n/g, "\n"),
  };
}

function getRtdb() {
  const databaseURL =
    process.env.FIREBASE_DATABASE_URL ??
    process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL;
  if (!databaseURL) {
    throw new Error(
      "Missing FIREBASE_DATABASE_URL or NEXT_PUBLIC_FIREBASE_DATABASE_URL"
    );
  }
  if (getApps().length === 0) {
    const { projectId, clientEmail, privateKey } = getServiceAccount();
    initializeApp({
      credential: cert({ projectId, clientEmail, privateKey }),
      databaseURL,
    });
  }
  return getDatabase();
}

function roomAgeMs(meta, now) {
  const createdAt = meta?.createdAt;
  if (typeof createdAt !== "number" || createdAt <= 0) {
    return STALE_ROOM_MAX_AGE_MS + 1;
  }
  return now - createdAt;
}

function hasAnyPlayerOnline(meta) {
  for (const slot of ["p1", "p2"]) {
    if (!meta?.players?.[slot]) continue;
    const presence = meta.presence?.[slot];
    if (!presence || presence.online !== false) return true;
  }
  return false;
}

function allPresentPlayersOffline(meta) {
  let hasPlayer = false;
  for (const slot of ["p1", "p2"]) {
    if (!meta?.players?.[slot]) continue;
    hasPlayer = true;
    const presence = meta.presence?.[slot];
    if (!presence || presence.online !== false) return false;
  }
  return hasPlayer;
}

function latestPresenceLastSeen(meta) {
  const values = [meta?.presence?.p1?.lastSeen, meta?.presence?.p2?.lastSeen].filter(
    (v) => typeof v === "number" && v > 0
  );
  return values.length ? Math.max(...values) : 0;
}

function shouldDeleteRoom(meta, now) {
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

async function cleanupStaleGameRooms() {
  const rtdb = getRtdb();
  const now = Date.now();
  const result = {
    deletedRooms: 0,
    clearedActiveRoomIndexes: 0,
    scannedRooms: 0,
    scannedActiveRoomIndexes: 0,
  };

  const roomsSnap = await rtdb.ref("rooms").get();
  const roomIds = roomsSnap.exists() ? Object.keys(roomsSnap.val()) : [];
  result.scannedRooms = roomIds.length;

  for (const roomId of roomIds) {
    const metaSnap = await rtdb.ref(`rooms/${roomId}/meta`).get();
    const meta = metaSnap.exists() ? metaSnap.val() : undefined;
    if (!shouldDeleteRoom(meta, now)) continue;
    await rtdb.ref(`rooms/${roomId}`).remove();
    result.deletedRooms += 1;
  }

  const activeSnap = await rtdb.ref("userActiveRooms").get();
  if (!activeSnap.exists()) return result;

  const entries = activeSnap.val();
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

    const meta = metaSnap.val();
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

cleanupStaleGameRooms()
  .then((result) => {
    console.log("[cleanup-stale-game-rooms]", result);
  })
  .catch((error) => {
    console.error("[cleanup-stale-game-rooms] failed:", error);
    process.exitCode = 1;
  });
