import { NextRequest, NextResponse } from "next/server";
import { finishRankedPlay } from "@/lib/games/finish-play";
import type { SoloResultPayload } from "@/lib/games/types";
import {
  enforceGameRateLimit,
  requireGameUser,
} from "@/lib/games/require-game-auth";

export async function POST(request: NextRequest) {
  try {
    const auth = await requireGameUser(request);
    if (auth instanceof NextResponse) return auth;

    const rateLimited = enforceGameRateLimit(request, auth.userId, "game-play-finish");
    if (rateLimited) return rateLimited;

    const body = (await request.json()) as {
      playToken?: string;
      result?: SoloResultPayload;
    };

    const playToken = body.playToken?.trim();
    if (!playToken || !body.result) {
      return NextResponse.json(
        { error: "Thiếu playToken hoặc result." },
        { status: 400 }
      );
    }

    const outcome = await finishRankedPlay({
      userId: auth.userId,
      playToken,
      result: body.result,
      displayName: auth.displayName,
    });

    if (!outcome.ok) {
      const status =
        outcome.error === "PLAY_NOT_FOUND" || outcome.error === "NOT_OWNER"
          ? 403
          : outcome.error === "PLAY_EXPIRED" || outcome.error === "INVALID_RESULT"
            ? 400
            : 400;
      return NextResponse.json({ error: outcome.error }, { status });
    }

    return NextResponse.json({
      reward: outcome.reward,
      newBalance: outcome.newBalance,
    });
  } catch (err) {
    console.error("[game/play/finish]", err);
    return NextResponse.json({ error: "Không thể kết thúc lượt chơi." }, { status: 500 });
  }
}
