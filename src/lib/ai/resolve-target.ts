import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";

type AiActor = { userId: string; role: string };

export type AiTarget = { targetUserId: string; isSelf: boolean };

/**
 * Xác định người nhận nội dung AI.
 * - Không có targetUserId (hoặc trùng người gọi) -> tạo cho chính mình.
 * - Giáo viên/admin tạo giúp học sinh: xác thực qua document lớp
 *   (giáo viên phải thuộc teachers[] của lớp, học sinh phải thuộc students[]).
 */
export async function resolveAiTargetUser(
  actor: AiActor,
  body: { targetUserId?: string; classId?: string }
): Promise<AiTarget | NextResponse> {
  const requested = body.targetUserId?.trim();
  if (!requested || requested === actor.userId) {
    return { targetUserId: actor.userId, isSelf: true };
  }

  if (actor.role !== "teacher" && actor.role !== "admin") {
    return NextResponse.json(
      { error: "Bạn không có quyền tạo nội dung cho người dùng khác." },
      { status: 403 }
    );
  }

  if (actor.role === "admin") {
    return { targetUserId: requested, isSelf: false };
  }

  const classId = body.classId?.trim();
  if (!classId) {
    return NextResponse.json({ error: "Thiếu mã lớp để xác thực." }, { status: 400 });
  }

  const classSnap = await adminDb().collection("classes").doc(classId).get();
  if (!classSnap.exists) {
    return NextResponse.json({ error: "Không tìm thấy lớp." }, { status: 404 });
  }

  const data = classSnap.data() as {
    teachers?: Array<{ id?: string }>;
    students?: Array<{ studentId?: string }>;
  };

  const isTeacherOfClass =
    Array.isArray(data.teachers) && data.teachers.some((t) => t?.id === actor.userId);
  if (!isTeacherOfClass) {
    return NextResponse.json(
      { error: "Bạn không phải giáo viên của lớp này." },
      { status: 403 }
    );
  }

  const studentInClass =
    Array.isArray(data.students) && data.students.some((s) => s?.studentId === requested);
  if (!studentInClass) {
    return NextResponse.json(
      { error: "Học sinh không thuộc lớp này." },
      { status: 403 }
    );
  }

  return { targetUserId: requested, isSelf: false };
}
