import { NextRequest, NextResponse } from "next/server";
import { startBattle } from "@/lib/games/battles";
import {
  enforceGameRateLimit,
  requireGameUser,
} from "@/lib/games/require-game-auth";

export async function POST(request: NextRequest) {
  try {
    const auth = await requireGameUser(request);
    if (auth instanceof NextResponse) return auth;

    const rateLimited = enforceGameRateLimit(request, auth.userId, "game-battle-start");
    if (rateLimited) return rateLimited;

    const body = (await request.json()) as { roomId?: string };
    const roomId = body.roomId?.trim();
    if (!roomId) {
      return NextResponse.json({ error: "Thiếu roomId." }, { status: 400 });
    }

    const outcome = await startBattle({ roomId, userId: auth.userId });
    if (!outcome.ok) {
      const status =
        outcome.error === "INSUFFICIENT_BALANCE" ? 402 : 400;
      const message =
        outcome.error === "INSUFFICIENT_BALANCE"
          ? "Không đủ bánh để cọc 20 bánh cho trận đấu solo."
          : outcome.error;
      return NextResponse.json({ error: message }, { status });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[game/battle/start]", err);
    return NextResponse.json({ error: "Không thể bắt đầu trận đấu." }, { status: 500 });
  }
}
