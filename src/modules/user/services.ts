import { db } from "@/lib/firebase/client";
import { doc, getDoc, serverTimestamp, runTransaction } from "firebase/firestore";

/** Profile public fields - dùng cho xem profile bạn trong lớp */
export interface PublicUserProfile {
  id: string;
  displayName?: string;
  avatarUrl?: string;
  classIds?: string[];
  streakCount?: number;
  achievements?: string; // Thành tích vinh danh - text
  timesVocabXS?: number;
  timesVocab?: number;
  quizAccuracy?: number;
  speakingAccuracy?: number;
  countHeart?: number;
}

/** Đọc thành tích — ưu tiên `achievements`, fallback `noteRank` (dữ liệu cũ). */
export function readAchievementsFromUser(
  data: Record<string, unknown> | null | undefined
): string {
  if (!data) return "";
  if (typeof data.achievements === "string") return data.achievements;
  if (typeof data.noteRank === "string") return data.noteRank;
  return "";
}

export async function getPublicUserProfile(userId: string): Promise<PublicUserProfile | null> {
  try {
    const userRef = doc(db, "users", userId);
    const snap = await getDoc(userRef);
    if (!snap.exists()) return null;
    const d = snap.data();
    return {
      id: snap.id,
      displayName: d.displayName ?? "",
      avatarUrl: d.avatarUrl,
      classIds: Array.isArray(d.classIds) ? d.classIds.filter((id: unknown): id is string => typeof id === "string" && id.trim().length > 0) : [],
      streakCount: d.streakCount ?? 0,
      achievements: readAchievementsFromUser(d),
      timesVocabXS: d.timesVocabXS ?? 0,
      timesVocab: d.timesVocab ?? 0,
      quizAccuracy: typeof d.quizAccuracy === "number" ? d.quizAccuracy : 50,
      speakingAccuracy: typeof d.speakingAccuracy === "number" ? d.speakingAccuracy : 50,
      countHeart: d.countHeart ?? 0,
    };
  } catch {
    return null;
  }
}

/**
 * Gets the current date in Vietnam timezone (normalized to midnight).
 * This ensures consistent date comparison regardless of client/server timezone.
 */
function getVietnamDate(): Date {
  const now = new Date();
  // Convert to Vietnam timezone string (YYYY-MM-DD)
  const vietnamDateStr = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);

  // Parse back to Date object (this creates a date at midnight in local timezone,
  // but we'll use it only for date components comparison)
  const [year, month, day] = vietnamDateStr.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0));
}

/**
 * Normalizes a date to Vietnam timezone date (at midnight).
 * Used to compare dates correctly regardless of the original timezone.
 */
function normalizeToVietnamDate(date: Date): Date {
  const vietnamDateStr = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);

  const [year, month, day] = vietnamDateStr.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0));
}

/**
 * Checks and updates a student's daily streak.
 * Uses Vietnam timezone (Asia/Ho_Chi_Minh) for consistent date comparison.
 * 
 * Logic: Cho phép sai số ±2 ngày để tránh reset streak do timezone hoặc network delay.
 * - Nếu đã update hôm nay: không update nữa
 * - Nếu last update trong vòng 2 ngày gần đây: tăng streak
 * - Nếu last update từ 3 ngày trở lên hoặc null: reset về 1
 * 
 * @param userId - The ID of the student.
 * @returns An object indicating if the streak was updated, the new streak count, and previous streak count if reset.
 */

export const updateStudentStreak = async (
  userId: string
): Promise<{ updated: boolean; newStreakCount: number; previousStreakCount?: number; luckyBreads: number }> => {
  const userRef = doc(db, "users", userId);
  const today = getVietnamDate();
  const todayTime = today.getTime();

  return runTransaction(db, async (transaction) => {
    const userSnap = await transaction.get(userRef);
    if (!userSnap.exists()) {
      throw new Error("User not found");
    }

    const userData = userSnap.data();
    const lastUpdateDate = userData.lastStreakUpdate?.toDate();
    let lastUpdateDay: Date | null = null;
    if (lastUpdateDate) {
      lastUpdateDay = normalizeToVietnamDate(lastUpdateDate);
    }

    const lastUpdateTime = lastUpdateDay?.getTime();
    const currentStreakCount = userData.streakCount || 0;

    if (lastUpdateTime === todayTime) {
      return { updated: false, newStreakCount: currentStreakCount, luckyBreads: 0 };
    }

    let daysDifference: number | null = null;
    if (lastUpdateTime !== undefined && lastUpdateTime !== null) {
      const diffMs = todayTime - lastUpdateTime;
      daysDifference = Math.floor(diffMs / (24 * 60 * 60 * 1000));
    }

    let newStreakCount: number;

    if (daysDifference === null) {
      newStreakCount = currentStreakCount > 0 ? currentStreakCount : 1;
    } else if (daysDifference < 0) {
      return { updated: false, newStreakCount: currentStreakCount, luckyBreads: 0 };
    } else if (daysDifference >= 1 && daysDifference <= 2) {
      newStreakCount = currentStreakCount + 1;
    } else if (daysDifference > 2) {
      newStreakCount = 1;
    } else {
      return { updated: false, newStreakCount: currentStreakCount, luckyBreads: 0 };
    }


    transaction.update(userRef, {
      streakCount: newStreakCount,
      lastStreakUpdate: serverTimestamp(),
    });

    if (newStreakCount === 1 && currentStreakCount > 1) {
      return { updated: true, newStreakCount, previousStreakCount: currentStreakCount, luckyBreads: 0 };
    }
    return { updated: true, newStreakCount, luckyBreads: 0 };
  });
};
