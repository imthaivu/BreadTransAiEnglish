import type { Timestamp } from "firebase/firestore";
import type { IClass, IPendingSpeakingEvaluationEntry } from "@/modules/admin/type";

export function pendingSpeakingKey(
  studentId: string,
  bookId: string,
  lessonId: number
): string {
  return `${studentId}_${bookId}_${lessonId}`;
}

export function hasManualSpeakingScore(
  score: string | number | null | undefined
): boolean {
  return (
    (typeof score === "string" && score.trim() !== "") ||
    (typeof score === "number" && Number.isFinite(score))
  );
}

export interface PendingSpeakingItem {
  id: string;
  studentId: string;
  studentName: string;
  avatarUrl?: string;
  classId: string;
  className: string;
  classNames: string[];
  bookId: string;
  lessonId: number;
  fileUrl: string;
  duration?: number;
  submittedAt: Date;
  issueSpeaking?: string | null;
}

const AUDIO_EXPIRY_DAYS = 3;

export function isAudioLikelyExpired(submittedAt: Date): boolean {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - AUDIO_EXPIRY_DAYS);
  cutoff.setHours(0, 0, 0, 0);
  return submittedAt.getTime() < cutoff.getTime();
}

function toDate(value: unknown): Date {
  if (value instanceof Date) return value;
  if (
    value &&
    typeof value === "object" &&
    "toDate" in value &&
    typeof (value as Timestamp).toDate === "function"
  ) {
    return (value as Timestamp).toDate();
  }
  return new Date(0);
}

export function parsePendingEvaluationEntry(
  key: string,
  raw: IPendingSpeakingEvaluationEntry
): PendingSpeakingItem | null {
  if (!raw?.studentId || !raw?.bookId || !raw?.fileUrl) return null;
  const lessonId = Number(raw.lessonId);
  if (!Number.isFinite(lessonId) || lessonId <= 0) return null;

  return {
    id: key,
    studentId: raw.studentId,
    studentName: raw.studentName || "N/A",
    avatarUrl: raw.avatarUrl,
    classId: "",
    className: "",
    classNames: [],
    bookId: String(raw.bookId),
    lessonId,
    fileUrl: raw.fileUrl,
    duration: raw.duration,
    submittedAt: toDate(raw.submittedAt),
    issueSpeaking: raw.issueSpeaking ?? null,
  };
}

/** Gộp pendingEvaluations từ tất cả class docs — dedupe theo key, gắn classNames. */
export function mergePendingFromClasses(classes: IClass[]): PendingSpeakingItem[] {
  const byKey = new Map<string, PendingSpeakingItem>();

  for (const cls of classes) {
    const pending = cls.pendingEvaluations;
    if (!pending || typeof pending !== "object") continue;

    for (const [key, raw] of Object.entries(pending)) {
      const base = parsePendingEvaluationEntry(key, raw);
      if (!base) continue;

      const existing = byKey.get(key);
      if (!existing) {
        byKey.set(key, {
          ...base,
          classId: cls.id,
          className: cls.name,
          classNames: [cls.name],
        });
        continue;
      }

      if (!existing.classNames.includes(cls.name)) {
        existing.classNames.push(cls.name);
      }
    }
  }

  return Array.from(byKey.values()).sort(
    (a, b) => b.submittedAt.getTime() - a.submittedAt.getTime()
  );
}

export function countPendingByClassId(classes: IClass[], classId: string): number {
  const cls = classes.find((c) => c.id === classId);
  if (!cls?.pendingEvaluations) return 0;
  return Object.keys(cls.pendingEvaluations).length;
}

export function extractTotalScoreFromIssue(
  issue: string | null | undefined
): string | null {
  if (!issue) return null;
  const match = issue.match(/Tổng điểm[^\d]*(\d+(?:[.,]\d+)?)\s*\/?\s*10/i);
  if (!match) return null;
  const n = Number(match[1].replace(",", "."));
  if (!Number.isFinite(n)) return null;
  return n.toFixed(1).replace(/\.0$/, "");
}
