import { NextRequest, NextResponse } from "next/server";
import { grantTicket } from "@/lib/games/tickets";
import {
  enforceGameRateLimit,
  requireGameUser,
  verifyTeacherCanGrantToStudent,
} from "@/lib/games/require-game-auth";

export async function POST(request: NextRequest) {
  try {
    const auth = await requireGameUser(request);
    if (auth instanceof NextResponse) return auth;

    const rateLimited = enforceGameRateLimit(request, auth.userId, "game-ticket-grant");
    if (rateLimited) return rateLimited;

    const body = (await request.json()) as {
      studentId?: string;
      classId?: string;
    };

    const studentId = body.studentId?.trim();
    const classId = body.classId?.trim();
    if (!studentId || !classId) {
      return NextResponse.json(
        { error: "Thiếu studentId hoặc classId." },
        { status: 400 }
      );
    }

    const denied = await verifyTeacherCanGrantToStudent({
      teacherId: auth.userId,
      role: auth.role,
      studentId,
      classId,
    });
    if (denied) return denied;

    const ticket = await grantTicket({
      studentId,
      grantedBy: auth.userId,
    });

    return NextResponse.json({ ticket });
  } catch (err) {
    console.error("[game/ticket/grant]", err);
    return NextResponse.json({ error: "Không thể cấp vé." }, { status: 500 });
  }
}
