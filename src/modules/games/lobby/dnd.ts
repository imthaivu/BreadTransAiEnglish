import type { SimplePlayer } from "./invitations";

/** Custom MIME type carried by the dragged avatar. */
export const INVITE_DND_TYPE = "application/x-breadtrans-invite";

export function encodeDragPayload(player: SimplePlayer): string {
  return JSON.stringify(player);
}

export function decodeDragPayload(raw: string): SimplePlayer | null {
  try {
    const parsed = JSON.parse(raw) as SimplePlayer;
    if (parsed && typeof parsed.id === "string") return parsed;
    return null;
  } catch {
    return null;
  }
}
