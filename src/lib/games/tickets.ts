import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import type {
  GameDifficulty,
  GameId,
  GamePlayDoc,
  GameTicket,
  GameTicketStatus,
} from "./types";
import { PLAY_TOKEN_TTL_MS, TICKET_TTL_MS } from "./types";
import { collectValidTickets } from "./ticket-utils";

function userRef(userId: string) {
  return adminDb().collection("users").doc(userId);
}

function playRef(playToken: string) {
  return adminDb().collection("gamePlays").doc(playToken);
}

export { playRef };

export function isTicketActive(data: {
  allowedTicket?: boolean;
  ticketExpiresAt?: string;
}): boolean {
  if (!data.allowedTicket) return false;
  if (!data.ticketExpiresAt) return false;
  return new Date(data.ticketExpiresAt).getTime() > Date.now();
}

export { collectValidTickets, validTickets } from "./ticket-utils";

function toTicketStatus(tickets: GameTicket[]): GameTicketStatus {
  const next = tickets[0] ?? null;
  return {
    allowed: tickets.length > 0,
    count: tickets.length,
    nextExpiresAt: next?.expiresAt ?? null,
    expiresAt: next?.expiresAt ?? null,
    grantedBy: next?.grantedBy ?? null,
    grantedAt: next?.grantedAt ?? null,
  };
}

export async function getTicketStatus(userId: string): Promise<GameTicketStatus> {
  const snap = await userRef(userId).get();
  const data = snap.data() ?? {};
  const tickets = collectValidTickets(data);
  return toTicketStatus(tickets);
}

export async function grantTicket(params: {
  studentId: string;
  grantedBy: string;
}): Promise<GameTicketStatus> {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + TICKET_TTL_MS).toISOString();
  const newTicket: GameTicket = {
    expiresAt,
    grantedBy: params.grantedBy,
    grantedAt: now.toISOString(),
  };

  const ref = userRef(params.studentId);

  const tickets = await adminDb().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const data = snap.data() ?? {};
    const merged = collectValidTickets(data);
    const next = [...merged, newTicket];

    tx.set(
      ref,
      {
        gameTickets: next,
        allowedTicket: FieldValue.delete(),
        ticketExpiresAt: FieldValue.delete(),
        ticketGrantedBy: FieldValue.delete(),
        ticketGrantedAt: FieldValue.delete(),
        updatedAt: now,
      },
      { merge: true }
    );
    return next;
  });

  return toTicketStatus(tickets);
}

export async function consumeTicketAndOpenPlay(params: {
  userId: string;
  gameId: GameId;
  difficulty?: GameDifficulty;
}): Promise<{ playToken: string }> {
  const ref = userRef(params.userId);
  const playToken = `play_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
  const now = new Date().toISOString();

  await adminDb().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) {
      throw new Error("USER_NOT_FOUND");
    }
    const data = snap.data()!;
    const tickets = collectValidTickets(data);

    if (tickets.length === 0) {
      throw new Error("NO_TICKET");
    }

    // Tiêu vé sắp hết hạn nhất
    const remaining = tickets.slice(1);
    const update: Record<string, unknown> = {
      updatedAt: new Date(),
      allowedTicket: FieldValue.delete(),
      ticketExpiresAt: FieldValue.delete(),
      ticketGrantedBy: FieldValue.delete(),
      ticketGrantedAt: FieldValue.delete(),
    };

    if (remaining.length > 0) {
      update.gameTickets = remaining;
    } else {
      update.gameTickets = FieldValue.delete();
    }

    tx.update(ref, update);

    const playDoc: GamePlayDoc = {
      userId: params.userId,
      gameId: params.gameId,
      status: "active",
      startedAt: now,
      ...(params.difficulty ? { difficulty: params.difficulty } : {}),
    };
    tx.set(playRef(playToken), playDoc);
  });

  return { playToken };
}

export async function getPlayDoc(playToken: string): Promise<(GamePlayDoc & { id: string }) | null> {
  const snap = await playRef(playToken).get();
  if (!snap.exists) return null;
  return { id: snap.id, ...(snap.data() as GamePlayDoc) };
}

export function isPlayExpired(play: GamePlayDoc): boolean {
  const started = new Date(play.startedAt).getTime();
  return Date.now() - started > PLAY_TOKEN_TTL_MS;
}
