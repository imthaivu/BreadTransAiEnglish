import { NextRequest, NextResponse } from "next/server";
import { getTicketStatus } from "@/lib/games/tickets";
import {
  enforceGameRateLimit,
  requireGameUser,
} from "@/lib/games/require-game-auth";

export async function GET(request: NextRequest) {
  try {
    const auth = await requireGameUser(request);
    if (auth instanceof NextResponse) return auth;

    const rateLimited = enforceGameRateLimit(request, auth.userId, "game-ticket-status");
    if (rateLimited) return rateLimited;

    const { searchParams } = new URL(request.url);
    const targetUserId = searchParams.get("userId")?.trim() || auth.userId;

    if (targetUserId !== auth.userId && auth.role !== "teacher" && auth.role !== "admin") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const ticket = await getTicketStatus(targetUserId);
    return NextResponse.json({ ticket });
  } catch (err) {
    console.error("[game/ticket/status]", err);
    return NextResponse.json({ error: "Không thể đọc vé." }, { status: 500 });
  }
}
