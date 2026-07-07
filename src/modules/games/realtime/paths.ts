import { ref, type DatabaseReference } from "firebase/database";
import { getRtdb } from "@/lib/firebase/client";

/** All pending invitations for a given invitee. */
export const invitationsRef = (inviteeId: string): DatabaseReference =>
  ref(getRtdb(), `invitations/${inviteeId}`);

/** A single invitation. */
export const invitationRef = (
  inviteeId: string,
  inviteId: string
): DatabaseReference => ref(getRtdb(), `invitations/${inviteeId}/${inviteId}`);

/**
 * Hộp tín hiệu phản hồi lời mời gửi về cho NGƯỜI MỜI (host). Dùng để báo cho
 * host biết vì sao lời mời bị huỷ (vd. người nhận không đủ bánh) — vì host
 * không có quyền đọc node `invitations/{inviteeId}`.
 */
export const inviteSignalsRef = (hostId: string): DatabaseReference =>
  ref(getRtdb(), `inviteSignals/${hostId}`);

export const inviteSignalRef = (
  hostId: string,
  signalId: string
): DatabaseReference => ref(getRtdb(), `inviteSignals/${hostId}/${signalId}`);

/** The whole room node (meta + state). */
export const roomRef = (roomId: string): DatabaseReference =>
  ref(getRtdb(), `rooms/${roomId}`);

/** Room metadata (players, status, seed, countdown). */
export const roomMetaRef = (roomId: string): DatabaseReference =>
  ref(getRtdb(), `rooms/${roomId}/meta`);

/** Root of the per-game live state. */
export const roomStateRef = (roomId: string): DatabaseReference =>
  ref(getRtdb(), `rooms/${roomId}/state`);

/** An arbitrary path inside the room state, e.g. ("p1","y") or ("board"). */
export const roomStatePath = (
  roomId: string,
  ...segments: (string | number)[]
): DatabaseReference =>
  ref(getRtdb(), `rooms/${roomId}/state/${segments.join("/")}`);

/** Presence node của một role trong phòng (online/lastSeen). */
export const roomPresenceRef = (
  roomId: string,
  role: "p1" | "p2"
): DatabaseReference =>
  ref(getRtdb(), `rooms/${roomId}/meta/presence/${role}`);

/**
 * Index trỏ tới phòng đang chơi của user. Dùng để tự rejoin sau reload.
 * Lưu ý: KHÔNG đăng ký onDisconnect xoá node này — chúng ta muốn nó tồn tại
 * qua các lần ngắt kết nối.
 */
export const userActiveRoomRef = (uid: string): DatabaseReference =>
  ref(getRtdb(), `userActiveRooms/${uid}`);

/** Trạng thái .info/connected (true khi socket Firebase đang kết nối). */
export const connectedInfoRef = (): DatabaseReference =>
  ref(getRtdb(), ".info/connected");

/** Firebase server time offset node. */
export const serverTimeOffsetRef = (): DatabaseReference =>
  ref(getRtdb(), ".info/serverTimeOffset");
