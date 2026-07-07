import { NextRequest, NextResponse } from "next/server";
import { consumeTicketAndOpenPlay } from "@/lib/games/tickets";
import type { GameDifficulty, GameId } from "@/lib/games/types";
import {
  enforceGameRateLimit,
  requireGameUser,
} from "@/lib/games/require-game-auth";

const VALID_GAMES: GameId[] = [
  "flappy-bird",
  "shell-game",
  "sky-high",
  "sliding-puzzle",
  "caro",
];

const VALID_DIFFICULTIES: GameDifficulty[] = ["easy", "medium", "hard"];

const GAMES_REQUIRING_DIFFICULTY: GameId[] = ["caro", "sliding-puzzle"];

export async function POST(request: NextRequest) {
  try {
    const auth = await requireGameUser(request);
    if (auth instanceof NextResponse) return auth;

    const rateLimited = enforceGameRateLimit(request, auth.userId, "game-play-start");
    if (rateLimited) return rateLimited;

    const body = (await request.json()) as {
      gameId?: GameId;
      difficulty?: GameDifficulty;
    };

    const gameId = body.gameId;
    if (!gameId || !VALID_GAMES.includes(gameId)) {
      return NextResponse.json({ error: "Game không hợp lệ." }, { status: 400 });
    }

    const difficulty = body.difficulty;
    if (GAMES_REQUIRING_DIFFICULTY.includes(gameId)) {
      if (!difficulty || !VALID_DIFFICULTIES.includes(difficulty)) {
        return NextResponse.json(
          { error: "Cần chọn độ khó trước khi dùng vé." },
          { status: 400 }
        );
      }
    }

    try {
      const { playToken } = await consumeTicketAndOpenPlay({
        userId: auth.userId,
        gameId,
        difficulty,
      });
      return NextResponse.json({ playToken });
    } catch (err) {
      if (err instanceof Error && err.message === "NO_TICKET") {
        return NextResponse.json(
          { error: "Bạn chưa có vé hoặc vé đã hết hạn." },
          { status: 403 }
        );
      }
      throw err;
    }
  } catch (err) {
    console.error("[game/play/start]", err);
    return NextResponse.json({ error: "Không thể bắt đầu lượt chơi." }, { status: 500 });
  }
}
