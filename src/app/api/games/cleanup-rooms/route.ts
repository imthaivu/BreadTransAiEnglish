import { NextRequest, NextResponse } from "next/server";
import { cleanupStaleGameRooms } from "@/modules/games/realtime/serverCleanup";

function isCleanupAuthorized(request: NextRequest): boolean {
  const secret =
    process.env.CRON_SECRET ?? process.env.GAME_ROOMS_CRON_SECRET ?? "";
  if (!secret) return false;

  const authHeader = request.headers.get("authorization");
  if (authHeader === `Bearer ${secret}`) return true;

  const customHeader = request.headers.get("x-game-rooms-cron-secret");
  return customHeader === secret;
}

export async function GET(request: NextRequest) {
  try {
    if (!isCleanupAuthorized(request)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const result = await cleanupStaleGameRooms();
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Unknown cleanup error",
      },
      { status: 500 }
    );
  }
}
