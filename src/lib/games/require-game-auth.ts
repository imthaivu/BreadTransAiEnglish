import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth/server-auth";
import { adminDb } from "@/lib/firebase/admin";
import { checkIPRateLimit, checkUserRateLimit } from "@/lib/rate-limit";

export async function requireGameUser(
  request: NextRequest
): Promise<{ userId: string; role: string; displayName: string } | NextResponse> {
  const session = await getServerSession(request);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return {
    userId: session.user.id,
    role: session.user.role ?? "student",
    displayName: session.user.name ?? "User",
  };
}

export function enforceGameRateLimit(
  request: NextRequest,
  userId: string,
  prefix: string
): NextResponse | null {
  const ipLimit = checkIPRateLimit(request, prefix, {
    maxAttempts: 120,
    windowMs: 60 * 60 * 1000,
  });
  if (!ipLimit.allowed) {
    return NextResponse.json(
      { error: "Quá nhiều yêu cầu. Vui lòng thử lại sau." },
      { status: 429 }
    );
  }
  const userLimit = checkUserRateLimit(userId, prefix, {
    maxAttempts: 60,
    windowMs: 60 * 60 * 1000,
  });
  if (!userLimit.allowed) {
    return NextResponse.json(
      { error: "Bạn đã gửi quá nhiều yêu cầu. Vui lòng thử lại sau." },
      { status: 429 }
    );
  }
  return null;
}

export async function verifyTeacherCanGrantToStudent(params: {
  teacherId: string;
  role: string;
  studentId: string;
  classId: string;
}): Promise<NextResponse | null> {
  const { teacherId, role, studentId, classId } = params;

  if (role === "admin") return null;

  if (role !== "teacher") {
    return NextResponse.json({ error: "Không có quyền cấp vé." }, { status: 403 });
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
    Array.isArray(data.teachers) && data.teachers.some((t) => t?.id === teacherId);
  if (!isTeacherOfClass) {
    return NextResponse.json(
      { error: "Bạn không phải giáo viên của lớp này." },
      { status: 403 }
    );
  }

  const studentInClass =
    Array.isArray(data.students) &&
    data.students.some((s) => s?.studentId === studentId);
  if (!studentInClass) {
    return NextResponse.json(
      { error: "Học sinh không thuộc lớp này." },
      { status: 403 }
    );
  }

  return null;
}
