import {
  off,
  onDisconnect,
  onValue,
  push,
  remove,
  serverTimestamp,
  set,
  update,
} from "firebase/database";
import {
  createRoom,
  destroyOrphanWaitingRoom,
  generateRoomId,
  generateSeed,
  joinRoomAsGuest,
} from "../realtime/room";
import {
  invitationRef,
  invitationsRef,
  inviteSignalRef,
  inviteSignalsRef,
} from "../realtime/paths";
import type {
  Invitation,
  MultiplayerGameId,
  RoomPlayer,
} from "../realtime/types";

export interface SimplePlayer {
  id: string;
  name: string;
  avatarUrl: string | null;
}

/** Thời gian sống mặc định của một lời mời (mili-giây). Hết hạn → tự ẩn/huỷ. */
export const INVITE_TTL_MS = 6_000;

/**
 * Create a room (host = `from`) and push an invitation to `to`. Returns the
 * roomId so the inviter can enter the waiting screen immediately.
 */
export async function createInvitation(params: {
  from: SimplePlayer;
  to: SimplePlayer;
  gameId: MultiplayerGameId;
}): Promise<{ roomId: string; inviteId: string }> {
  const { from, to, gameId } = params;
  const roomId = generateRoomId();
  const seed = generateSeed();

  await createRoom({
    roomId,
    gameId,
    host: from,
    seed,
    invitee: { name: to.name, avatarUrl: to.avatarUrl },
  });

  const listRef = invitationsRef(to.id);
  const ref = push(listRef);
  const inviteId = ref.key as string;

  const invitation: Omit<Invitation, "createdAt"> & { createdAt: number } = {
    id: inviteId,
    fromId: from.id,
    fromName: from.name,
    fromAvatarUrl: from.avatarUrl,
    toId: to.id,
    gameId,
    roomId,
    status: "pending",
    createdAt: serverTimestamp() as unknown as number,
  };

  await set(ref, invitation);
  // Auto-clear the invitation if the inviter disconnects before it is answered.
  try {
    onDisconnect(ref).remove();
  } catch {
    /* noop */
  }

  return { roomId, inviteId };
}

/** Invitee accepts: join the room as p2, then remove the invitation. */
export async function acceptInvitation(
  invitation: Invitation,
  self: SimplePlayer
): Promise<boolean> {
  const joined = await joinRoomAsGuest({
    roomId: invitation.roomId,
    guest: self,
  });
  await remove(invitationRef(invitation.toId, invitation.id));
  return joined;
}

export async function declineInvitation(invitation: Invitation): Promise<void> {
  await update(invitationRef(invitation.toId, invitation.id), {
    status: "declined",
  });
  await remove(invitationRef(invitation.toId, invitation.id));
  try {
    await destroyOrphanWaitingRoom(invitation.roomId);
  } catch {
    /* host có thể tự dọn khi huỷ lời mời */
  }
}

/**
 * Xoá lời mời khỏi hộp thư người được mời mà không đánh dấu "declined".
 * Dùng khi host thu hồi (phòng đã biến mất) hoặc lời mời hết hạn — chỉ cần
 * ẩn popup, không phải hành động từ chối chủ động của người được mời.
 */
export async function dismissInvitation(invitation: Invitation): Promise<void> {
  try {
    await remove(invitationRef(invitation.toId, invitation.id));
  } catch {
    /* noop */
  }
}

/** Lý do một lời mời bị huỷ, gửi về cho người mời. */
export type InviteSignalReason = "invitee_insufficient" | "declined";

export interface InviteSignal {
  reason: InviteSignalReason;
  fromName: string;
}

/** Gửi tín hiệu phản hồi lời mời về cho host (vd. người nhận không đủ bánh). */
export async function pushInviteSignal(params: {
  hostId: string;
  reason: InviteSignalReason;
  fromName: string;
}): Promise<void> {
  try {
    const ref = push(inviteSignalsRef(params.hostId));
    await set(ref, {
      reason: params.reason,
      fromName: params.fromName,
      at: serverTimestamp(),
    });
  } catch {
    /* noop — tín hiệu chỉ là thông báo phụ */
  }
}

/**
 * Host lắng nghe các tín hiệu phản hồi lời mời gửi cho mình. Mỗi tín hiệu được
 * gọi callback đúng một lần rồi tự xoá khỏi hộp.
 */
export function subscribeInviteSignals(
  hostId: string,
  callback: (signal: InviteSignal) => void
): () => void {
  const r = inviteSignalsRef(hostId);
  const cb = onValue(r, (snap) => {
    if (!snap.exists()) return;
    const val = snap.val() as Record<string, InviteSignal>;
    for (const [id, sig] of Object.entries(val)) {
      callback(sig);
      void remove(inviteSignalRef(hostId, id));
    }
  });
  return () => off(r, "value", cb);
}

/** Subscribe to all pending invitations for the current user. */
export function subscribeInvitations(
  inviteeId: string,
  callback: (invites: Invitation[]) => void
): () => void {
  const r = invitationsRef(inviteeId);
  const cb = onValue(r, (snap) => {
    if (!snap.exists()) {
      callback([]);
      return;
    }
    const val = snap.val() as Record<string, Invitation>;
    const list = Object.values(val).filter((i) => i.status === "pending");
    callback(list);
  });
  return () => off(r, "value", cb);
}

export type { RoomPlayer };
