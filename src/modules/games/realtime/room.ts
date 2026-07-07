import {
  get,
  onDisconnect,
  remove,
  runTransaction,
  serverTimestamp,
  set,
  update,
} from "firebase/database";
import {
  roomMetaRef,
  roomPresenceRef,
  roomRef,
  userActiveRoomRef,
} from "./paths";
import { getServerNow } from "./serverTime";
import type {
  MultiplayerGameId,
  PlayerRole,
  RoomMeta,
  RoomPlayer,
  UserActiveRoom,
  WinnerReason,
} from "./types";

/** Countdown shown before every match starts. */
export const COUNTDOWN_MS = 3000;

/**
 * Thời gian đợi đối thủ rớt mạng quay lại trước khi bị xử thua do mất kết nối
 * (mili-giây). Mô phỏng đồng hồ "chờ kết nối lại" trên các ứng dụng cờ online.
 */
export const DISCONNECT_GRACE_MS = 30_000;

/** Grace ngắn hơn trong giai đoạn countdown (đối thủ đóng tab sớm). */
export const DISCONNECT_GRACE_PRE_GAME_MS = 10_000;

/**
 * Sau khi trận chuyển `playing`, nếu đối thủ chưa có node presence trong khoảng
 * này thì coi là offline (tránh false-positive lúc vừa accept).
 */
export const PRESENCE_ABSENCE_GRACE_MS = 5_000;

/**
 * Nếu `online: true` nhưng không có heartbeat / lastSeen mới trong khoảng này
 * thì coi là tab treo (bfcache) hoặc mất kết nối âm thầm.
 */
export const PRESENCE_STALE_MS = 20_000;

/** Khoảng cách giữa các lần heartbeat presence khi đang trong trận. */
export const PRESENCE_HEARTBEAT_MS = 10_000;

/** Thời gian xem kết quả sau `finished` trước khi client tự dọn phòng. */
export const FINISHED_ROOM_TTL_MS = 3 * 60_000;

/** Cả hai offline trong lúc `playing` — coi là bỏ trận và xoá phòng. */
export const PLAYING_ABANDON_MS = 60_000;

/** Tuổi tối đa phòng `waiting`/`finished` trước khi server GC dọn (24h). */
export const STALE_ROOM_MAX_AGE_MS = 24 * 60 * 60_000;

/** Deterministic PRNG (mulberry32) so both clients generate identical worlds. */
export function createSeededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function generateRoomId(): string {
  return `room_${Date.now().toString(36)}_${Math.random()
    .toString(36)
    .slice(2, 8)}`;
}

export function generateSeed(): number {
  return Math.floor(Math.random() * 2_147_483_647);
}

export const otherRoleOf = (role: PlayerRole): PlayerRole =>
  role === "p1" ? "p2" : "p1";

/** True khi mọi người đã vào phòng đều offline (presence chưa ghi = vẫn coi online). */
export function areAllPresentPlayersOffline(meta: RoomMeta): boolean {
  const players = meta.players;
  if (!players) return false;
  const slots: PlayerRole[] = ["p1", "p2"];
  let hasPlayer = false;
  for (const slot of slots) {
    if (!players[slot]) continue;
    hasPlayer = true;
    const presence = meta.presence?.[slot];
    if (!presence || presence.online !== false) return false;
  }
  return hasPlayer;
}

/** True khi trận đang trong countdown trước `startAt`. */
export function isInPreGameCountdown(meta: RoomMeta): boolean {
  if (meta.status !== "playing") return false;
  const startAt = meta.startAt;
  if (startAt == null) return true;
  return getServerNow() < startAt;
}

/** Grace disconnect phụ thuộc giai đoạn trận (ngắn hơn lúc countdown). */
export function getDisconnectGraceMs(meta: RoomMeta): number {
  return isInPreGameCountdown(meta)
    ? DISCONNECT_GRACE_PRE_GAME_MS
    : DISCONNECT_GRACE_MS;
}

function isPresenceStale(presence: { lastSeen: number }): boolean {
  if (!presence.lastSeen) return false;
  return getServerNow() - presence.lastSeen > PRESENCE_STALE_MS;
}

function offlinePresencePayload(): {
  online: false;
  lastSeen: number;
  disconnectSince: number;
} {
  const ts = serverTimestamp() as unknown as number;
  return {
    online: false,
    lastSeen: ts,
    disconnectSince: ts,
  };
}

function onlinePresencePayload(): {
  online: true;
  lastSeen: number;
  disconnectSince: null;
} {
  return {
    online: true,
    lastSeen: serverTimestamp() as unknown as number,
    disconnectSince: null,
  };
}

/**
 * Đối thủ offline cho UI (banner). Chỉ tin `online: false` rõ ràng — không dùng
 * lastSeen cũ khi `online: true` vì client vừa reconnect có thể đọc cache meta lỗi
 * thời và hiện nhầm banner đối thủ.
 */
export function isOpponentOffline(
  meta: RoomMeta,
  oppRole: PlayerRole
): boolean {
  if (meta.status !== "playing") return false;
  const presence = meta.presence?.[oppRole];
  if (presence?.online === false) return true;
  if (presence?.online === true) return false;
  const matchEnteredAt = (meta.startAt ?? getServerNow()) - COUNTDOWN_MS;
  return getServerNow() >= matchEnteredAt + PRESENCE_ABSENCE_GRACE_MS;
}

/**
 * Đối thủ mất kết nối thật sự — gồm tab treo (lastSeen cũ). Dùng cho auto-claim,
 * không dùng cho banner.
 */
export function isOpponentDisconnected(
  meta: RoomMeta,
  oppRole: PlayerRole
): boolean {
  if (meta.status !== "playing") return false;
  const presence = meta.presence?.[oppRole];
  if (presence?.online === false) return true;
  if (presence?.online === true) return isPresenceStale(presence);
  const matchEnteredAt = (meta.startAt ?? getServerNow()) - COUNTDOWN_MS;
  return getServerNow() >= matchEnteredAt + PRESENCE_ABSENCE_GRACE_MS;
}

/** Thời gian (ms) đối thủ đã offline liên tục — dùng cho banner. */
export function getOpponentDisconnectElapsed(
  meta: RoomMeta,
  oppRole: PlayerRole
): number {
  if (meta.status !== "playing" || !isOpponentOffline(meta, oppRole)) return 0;
  const presence = meta.presence?.[oppRole];
  if (presence) {
    const since = presence.disconnectSince ?? presence.lastSeen;
    if (since) return Math.max(0, getServerNow() - since);
  }
  const matchEnteredAt = (meta.startAt ?? getServerNow()) - COUNTDOWN_MS;
  return Math.max(
    0,
    getServerNow() - matchEnteredAt - PRESENCE_ABSENCE_GRACE_MS
  );
}

/** Thời gian disconnect cho auto-claim (gồm tab treo). */
export function getOpponentDisconnectedElapsed(
  meta: RoomMeta,
  oppRole: PlayerRole
): number {
  if (meta.status !== "playing" || !isOpponentDisconnected(meta, oppRole))
    return 0;
  const presence = meta.presence?.[oppRole];
  if (presence) {
    const since = presence.disconnectSince ?? presence.lastSeen;
    if (since) return Math.max(0, getServerNow() - since);
  }
  const matchEnteredAt = (meta.startAt ?? getServerNow()) - COUNTDOWN_MS;
  return Math.max(
    0,
    getServerNow() - matchEnteredAt - PRESENCE_ABSENCE_GRACE_MS
  );
}

/** True nếu còn ít nhất một người chơi đang online. */
export function hasAnyPlayerOnline(meta: RoomMeta): boolean {
  const players = meta.players;
  if (!players) return false;
  const slots: PlayerRole[] = ["p1", "p2"];
  for (const slot of slots) {
    if (!players[slot]) continue;
    const presence = meta.presence?.[slot];
    if (!presence || presence.online !== false) return true;
  }
  return false;
}

/**
 * Create a room with the host (p1) only. Status starts as "waiting" until the
 * invitee accepts and joins as p2.
 *
 * Trong trạng thái "waiting", phòng vẫn dùng onDisconnect.remove() để dọn phòng
 * mồ côi nếu chủ rời trước khi có khách. Khi attachRoomPresence() được gọi (lúc
 * chính thức vào game) onDisconnect đó sẽ bị huỷ, thay bằng presence flag — nhờ
 * vậy rớt mạng/reload trong khi đang chơi KHÔNG xoá phòng nữa.
 */
export async function createRoom(params: {
  roomId: string;
  gameId: MultiplayerGameId;
  host: Omit<RoomPlayer, "color">;
  seed: number;
  invitee?: { name: string; avatarUrl: string | null } | null;
}): Promise<void> {
  const { roomId, gameId, host, seed, invitee = null } = params;
  const meta: RoomMeta = {
    gameId,
    hostId: host.id,
    status: "waiting",
    createdAt: serverTimestamp() as unknown as number,
    seed,
    startAt: null,
    players: {
      p1: { ...host, color: "blue" },
      p2: null,
    },
    invitee,
    winnerRole: null,
    winnerReason: null,
    forfeitRole: null,
  };
  await set(roomMetaRef(roomId), meta);
  try {
    await onDisconnect(roomRef(roomId)).remove();
  } catch {
    /* noop */
  }
}

/**
 * Invitee joins as p2 and kicks off the countdown. Returns false if the room is
 * gone (host left) or already full.
 */
export async function joinRoomAsGuest(params: {
  roomId: string;
  guest: Omit<RoomPlayer, "color">;
}): Promise<boolean> {
  const { roomId, guest } = params;
  const startAt = getServerNow() + COUNTDOWN_MS;

  // Dùng transaction để KHÔNG bao giờ tái tạo một phòng mồ côi: nếu host vừa
  // huỷ lời mời (xoá phòng) đúng lúc khách bấm chấp nhận, transaction thấy
  // `meta === null` và bỏ qua — tránh việc `update()` ghi lại một phòng thiếu
  // p1/gameId/seed khiến khách kẹt ở màn "Đang vào trận…".
  const result = await runTransaction(
    roomMetaRef(roomId),
    (meta: RoomMeta | null): RoomMeta | null => {
      if (!meta) return meta; // phòng đã bị xoá → không tạo lại
      if (meta.status !== "waiting") return meta; // đã bắt đầu/kết thúc
      if (meta.players?.p2 && meta.players.p2.id !== guest.id) return meta; // đã đủ người
      return {
        ...meta,
        players: {
          ...meta.players,
          p2: { ...guest, color: "red" } satisfies RoomPlayer,
        },
        status: "playing",
        startAt,
      };
    }
  );

  const meta = result.snapshot.val() as RoomMeta | null;
  return (
    result.committed &&
    !!meta &&
    meta.status === "playing" &&
    meta.players?.p2?.id === guest.id
  );
}

/**
 * Huỷ handler onDisconnect trên presence — không ghi offline (dùng trước
 * reattach để tránh race ghi `online: false` nhầm).
 */
export async function cancelRoomPresence(params: {
  roomId: string;
  role: PlayerRole;
}): Promise<void> {
  const presenceRef = roomPresenceRef(params.roomId, params.role);
  try {
    await onDisconnect(presenceRef).cancel();
  } catch {
    /* noop */
  }
}

/** Ghi offline chủ động (pagehide, visibility hidden) kèm disconnectSince. */
export async function markRoomPresenceOffline(params: {
  roomId: string;
  role: PlayerRole;
}): Promise<void> {
  const presenceRef = roomPresenceRef(params.roomId, params.role);
  try {
    await set(presenceRef, offlinePresencePayload());
  } catch {
    /* noop */
  }
}

/** Rời phòng: huỷ onDisconnect rồi ghi offline sạch. */
export async function leaveRoomPresence(params: {
  roomId: string;
  role: PlayerRole;
}): Promise<void> {
  await cancelRoomPresence(params);
  await markRoomPresenceOffline(params);
}

/** Cập nhật lastSeen định kỳ khi vẫn online — giúp phát hiện tab treo. */
export async function heartbeatRoomPresence(params: {
  roomId: string;
  role: PlayerRole;
}): Promise<void> {
  const presenceRef = roomPresenceRef(params.roomId, params.role);
  try {
    await update(presenceRef, {
      online: true,
      lastSeen: serverTimestamp(),
      disconnectSince: null,
    });
  } catch {
    /* noop */
  }
}

/**
 * Bật presence cho người chơi đang vào phòng:
 * - Huỷ handler `onDisconnect(roomRef).remove()` (đăng ký bởi createRoom) để
 *   việc rớt mạng KHÔNG còn xoá nguyên phòng nữa.
 * - Ghi `online: true`, clear `disconnectSince`, đăng ký onDisconnect offline.
 */
export async function attachRoomPresence(params: {
  roomId: string;
  role: PlayerRole;
}): Promise<void> {
  const { roomId, role } = params;
  try {
    await onDisconnect(roomRef(roomId)).cancel();
  } catch {
    /* phòng có thể đã bị xoá hoặc handler chưa tồn tại — bỏ qua */
  }

  await cancelRoomPresence({ roomId, role });

  const presenceRef = roomPresenceRef(roomId, role);
  const offlinePayload = offlinePresencePayload();
  try {
    await onDisconnect(presenceRef).set(offlinePayload);
  } catch {
    /* noop */
  }
  try {
    await set(presenceRef, onlinePresencePayload());
  } catch {
    /* noop */
  }
}

/**
 * Ghi nhận user đang ở trong phòng nào (để tự rejoin sau reload). KHÔNG đăng ký
 * onDisconnect — chúng ta muốn index này tồn tại qua mất kết nối.
 */
export async function setUserActiveRoom(params: {
  uid: string;
  roomId: string;
  role: PlayerRole;
  gameId: MultiplayerGameId;
}): Promise<void> {
  const { uid, roomId, role, gameId } = params;
  const payload: UserActiveRoom = {
    roomId,
    role,
    gameId,
    enteredAt: serverTimestamp() as unknown as number,
  };
  try {
    await set(userActiveRoomRef(uid), payload);
  } catch (err) {
    // Thường là Permission denied khi `userActiveRooms` rule chưa deploy lên
    // Firebase. Log để dev biết tại sao reload không rejoin được trận.
    console.warn(
      "[multiplayer] setUserActiveRoom thất bại — đã deploy database.rules.json chưa?",
      err
    );
  }
}

export async function clearUserActiveRoom(uid: string): Promise<void> {
  try {
    await remove(userActiveRoomRef(uid));
  } catch (err) {
    console.warn("[multiplayer] clearUserActiveRoom thất bại", err);
  }
}

/**
 * Người chơi chủ động bỏ trận khi đang chơi — đối thủ được xử thắng.
 * Dùng transaction để không ghi đè nếu trận đã được kết thúc trước đó (vd. cả
 * hai cùng forfeit đúng lúc, hoặc một bên đã claim disconnect-win).
 */
export async function forfeitRoom(params: {
  roomId: string;
  role: PlayerRole;
}): Promise<void> {
  const { roomId, role } = params;
  const winnerRole = otherRoleOf(role);
  await runTransaction(
    roomMetaRef(roomId),
    (current: RoomMeta | null): RoomMeta | null => {
      if (!current) return current;
      if (current.status === "finished") return current;
      return {
        ...current,
        status: "finished",
        winnerRole,
        winnerReason: "forfeit",
        forfeitRole: role,
      };
    }
  );
}

/**
 * Người chơi còn online tuyên bố thắng do đối thủ mất kết nối quá grace
 * period. Dùng transaction để chỉ ghi nhận một lần.
 */
export async function claimDisconnectWin(params: {
  roomId: string;
  byRole: PlayerRole;
}): Promise<void> {
  const { roomId, byRole } = params;
  await runTransaction(
    roomMetaRef(roomId),
    (current: RoomMeta | null): RoomMeta | null => {
      if (!current) return current;
      if (current.status === "finished") return current;

      const loser = otherRoleOf(byRole);
      const p = current.presence?.[loser];
      if (!p) return current;

      const isOffline =
        p.online === false ||
        (p.online === true && isPresenceStale(p));
      if (!isOffline) return current;

      const since = p.disconnectSince ?? p.lastSeen;
      if (since == null) return current;
      if (getServerNow() - since < getDisconnectGraceMs(current)) return current;

      return {
        ...current,
        status: "finished",
        winnerRole: byRole,
        winnerReason: "disconnect",
        forfeitRole: loser,
      };
    }
  );
}

/** Tổng quát: ghi nhận một game đã kết thúc tại tầng meta. */
export async function finishRoom(
  roomId: string,
  winnerRole: PlayerRole | "draw" | null,
  reason: WinnerReason = "win"
): Promise<void> {
  await update(roomMetaRef(roomId), {
    status: "finished",
    winnerRole,
    winnerReason: reason,
  });
}

/**
 * Xoá phòng `waiting` mồ côi (chỉ có p1). Dùng khi invite bị từ chối hoặc host
 * gửi lời mời mới.
 */
export async function destroyOrphanWaitingRoom(roomId: string): Promise<boolean> {
  const snap = await get(roomMetaRef(roomId));
  if (!snap.exists()) return false;
  const meta = snap.val() as RoomMeta;
  if (meta.status !== "waiting" || meta.players?.p2) return false;
  await destroyRoom(roomId, meta, meta.players?.p1?.id);
  return true;
}

/** Dọn phòng `waiting` cũ của host (từ index rejoin) trước khi tạo invite mới. */
export async function destroyHostWaitingRoomIfStale(params: {
  hostUid: string;
  exceptRoomId?: string;
}): Promise<void> {
  const { hostUid, exceptRoomId } = params;
  const snap = await get(userActiveRoomRef(hostUid));
  if (!snap.exists()) return;
  const active = snap.val() as UserActiveRoom;
  if (active.roomId === exceptRoomId) return;
  await destroyOrphanWaitingRoom(active.roomId);
}

/**
 * Xoá hẳn phòng. Chỉ dọn `userActiveRooms` của `callerUid` — rule Firebase chỉ
 * cho mỗi user ghi node index của chính mình.
 */
export async function destroyRoom(
  roomId: string,
  knownMeta?: RoomMeta | null,
  callerUid?: string | null
): Promise<void> {
  try {
    await onDisconnect(roomRef(roomId)).cancel();
  } catch {
    /* noop */
  }
  try {
    await remove(roomRef(roomId));
  } catch {
    /* noop */
  }

  if (callerUid) {
    await clearUserActiveRoom(callerUid);
  }
}

/**
 * Compat alias cho các nơi cũ vẫn gọi `leaveRoom`. KHÔNG còn xoá phòng vô điều
 * kiện — hành vi đúng (forfeit/destroy/clear index) được điều phối từ
 * GameHost dựa trên status hiện tại.
 */
export async function leaveRoom(roomId: string): Promise<void> {
  await destroyRoom(roomId);
}
