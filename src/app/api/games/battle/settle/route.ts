import { NextRequest, NextResponse } from "next/server";
import { settleBattle } from "@/lib/games/battles";
import {
  enforceGameRateLimit,
  requireGameUser,
} from "@/lib/games/require-game-auth";

const SETTLE_ERROR_STATUS: Record<string, number> = {
  ROOM_NOT_FINISHED: 400,
  WINNER_NOT_RESOLVED: 400,
  BATTLE_NOT_FOUND: 404,
  BATTLE_NOT_ESCROWED: 409,
  NOT_A_PLAYER: 403,
};

export async function POST(request: NextRequest) {
  try {
    const auth = await requireGameUser(request);
    if (auth instanceof NextResponse) return auth;

    const rateLimited = enforceGameRateLimit(request, auth.userId, "game-battle-settle");
    if (rateLimited) return rateLimited;

    const body = (await request.json()) as { roomId?: string };
    const roomId = body.roomId?.trim();
    if (!roomId) {
      return NextResponse.json(
        { error: "Thiếu roomId.", code: "MISSING_ROOM_ID" },
        { status: 400 }
      );
    }

    const outcome = await settleBattle({ roomId, userId: auth.userId });
    if (!outcome.ok) {
      const status = SETTLE_ERROR_STATUS[outcome.error] ?? 400;
      return NextResponse.json(
        { error: outcome.error, code: outcome.error },
        { status }
      );
    }

    return NextResponse.json({ reward: outcome.reward ?? 0 });
  } catch (err) {
    console.error("[game/battle/settle]", err);
    return NextResponse.json({ error: "Không thể kết thúc trận đấu." }, { status: 500 });
  }
}
