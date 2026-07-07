import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { AI_WEEKLY_LIMIT_STUDENT, AI_WEEKLY_LIMIT_TEACHER } from "@/modules/ai/types";

/**
 * Khóa tuần theo chuẩn ISO (tuần bắt đầu thứ Hai), tính theo UTC.
 * Ví dụ: "2026-W24". Sang tuần mới thì bộ đếm tự reset.
 */
export function getAiWeekKey(date = new Date()): string {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = d.getUTCDay() || 7; // Chủ nhật (0) -> 7
  d.setUTCDate(d.getUTCDate() + 4 - day); // dời về thứ Năm của tuần (ISO)
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, "0")}`;
}

export function getWeeklyAiLimit(role: string): number {
  return role === "student" ? AI_WEEKLY_LIMIT_STUDENT : AI_WEEKLY_LIMIT_TEACHER;
}

/** Thứ Hai 00:00 UTC của tuần ISO kế tiếp (mốc reset bộ đếm). */
export function getNextWeekResetAt(date = new Date()): string {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = d.getUTCDay() || 7;
  const addDays = (8 - day) % 7 || 7;
  d.setUTCDate(d.getUTCDate() + addDays);
  d.setUTCHours(0, 0, 0, 0);
  return d.toISOString();
}

export type WeeklyAiUsage = {
  used: number;
  limit: number;
  remaining: number;
  weekKey: string;
  resetAt: string;
};

function usageRef(userId: string) {
  return adminDb().collection("ai_usage").doc(userId);
}

export async function getWeeklyAiUsage(userId: string, role: string): Promise<WeeklyAiUsage> {
  const limit = getWeeklyAiLimit(role);
  const weekKey = getAiWeekKey();
  const snap = await usageRef(userId).get();
  const data = snap.data();
  const used = data?.weekKey === weekKey ? Number(data?.count ?? 0) : 0;
  const remaining = Math.max(0, limit - used);
  return {
    used,
    limit,
    remaining,
    weekKey,
    resetAt: getNextWeekResetAt(),
  };
}

/**
 * Kiểm tra hạn mức tuần TRƯỚC khi gọi AI. Trả về NextResponse 429 nếu đã hết lượt,
 * hoặc null nếu còn lượt. Không tăng bộ đếm ở bước này.
 */
export async function checkWeeklyAiQuota(
  userId: string,
  role: string
): Promise<NextResponse | null> {
  const usage = await getWeeklyAiUsage(userId, role);
  if (usage.remaining <= 0) {
    return NextResponse.json(
      {
        error: `Bạn đã dùng hết ${usage.limit} lượt AI trong tuần này. Vui lòng thử lại vào tuần sau.`,
      },
      { status: 429 }
    );
  }
  return null;
}

/**
 * Ghi nhận 1 lượt AI đã dùng (gọi SAU khi thao tác AI thành công).
 * Dùng transaction để tăng bộ đếm an toàn; tự reset khi sang tuần mới.
 */
export async function recordWeeklyAiUsage(userId: string): Promise<void> {
  const weekKey = getAiWeekKey();
  const ref = usageRef(userId);
  await adminDb().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const data = snap.data();
    const count = data?.weekKey === weekKey ? Number(data?.count ?? 0) : 0;
    tx.set(
      ref,
      { weekKey, count: count + 1, updatedAt: new Date().toISOString() },
      { merge: true }
    );
  });
}
