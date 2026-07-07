import type { GameTicket } from "./types";

/** Lọc vé còn hiệu lực, sắp xếp theo hết hạn sớm nhất trước. */
export function validTickets(tickets: GameTicket[] | undefined): GameTicket[] {
  if (!tickets?.length) return [];
  const now = Date.now();
  return tickets
    .filter((t) => new Date(t.expiresAt).getTime() > now)
    .sort(
      (a, b) =>
        new Date(a.expiresAt).getTime() - new Date(b.expiresAt).getTime()
    );
}

/** Gộp vé mảng + legacy boolean (client-side). */
export function collectValidTickets(data: {
  gameTickets?: GameTicket[];
  allowedTicket?: boolean;
  ticketExpiresAt?: string;
  ticketGrantedBy?: string;
  ticketGrantedAt?: string;
}): GameTicket[] {
  const fromArray = validTickets(data.gameTickets);
  if (fromArray.length > 0) return fromArray;

  if (
    data.allowedTicket &&
    data.ticketExpiresAt &&
    new Date(data.ticketExpiresAt).getTime() > Date.now()
  ) {
    return [
      {
        expiresAt: data.ticketExpiresAt,
        grantedBy: data.ticketGrantedBy ?? "legacy",
        grantedAt: data.ticketGrantedAt ?? data.ticketExpiresAt,
      },
    ];
  }
  return [];
}

/** Đếm vé hợp lệ từ mảng + legacy boolean (client-side). */
export function countValidTickets(data: {
  gameTickets?: GameTicket[];
  allowedTicket?: boolean;
  ticketExpiresAt?: string;
  ticketGrantedBy?: string;
  ticketGrantedAt?: string;
}): number {
  return collectValidTickets(data).length;
}
