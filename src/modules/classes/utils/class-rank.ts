export type ClassRankMetric =
  | "countHeart"
  | "timesVocabXS"
  | "quizAccuracy"
  | "speakingAccuracy"
  | "streakCount"
  | "totalBanhRan";

export type ClassStudentRankStats = {
  id: string;
  displayName: string;
  avatarUrl?: string;
  countHeart: number;
  timesVocabXS: number;
  quizAccuracy: number;
  speakingAccuracy: number;
  streakCount: number;
  totalBanhRan: number;
};

/** Một học sinh trong snapshot rank trên doc class. */
export type ClassRankStudentEntry = ClassStudentRankStats;

export type ClassRankSnapshot = {
  updatedAt: Date;
  students: Record<string, ClassRankStudentEntry>;
};

export function studentsFromClassRank(
  snapshot: ClassRankSnapshot | null | undefined
): ClassStudentRankStats[] {
  if (!snapshot?.students) return [];
  return Object.values(snapshot.students);
}

export const CLASS_RANK_TABS: {
  key: ClassRankMetric;
  label: string;
  shortLabel: string;
}[] = [
  { key: "countHeart", label: "Yêu thích", shortLabel: "❤️" },
  { key: "timesVocabXS", label: "Bài XS", shortLabel: "XS" },
  { key: "quizAccuracy", label: "Quiz TB", shortLabel: "Quiz" },
  { key: "speakingAccuracy", label: "Nói TB", shortLabel: "Nói" },
  { key: "streakCount", label: "Streak", shortLabel: "🔥" },
  { key: "totalBanhRan", label: "Bánh", shortLabel: "🍞" },
];

/** Top ~40% lớp, tối thiểu 1 học sinh. */
export function computeTopCount(totalStudents: number): number {
  if (totalStudents <= 0) return 0;
  return Math.max(1, Math.ceil(totalStudents * 0.4));
}

export function getMetricValue(
  student: ClassStudentRankStats,
  metric: ClassRankMetric
): number {
  switch (metric) {
    case "countHeart":
      return student.countHeart ?? 0;
    case "timesVocabXS":
      return student.timesVocabXS ?? 0;
    case "quizAccuracy":
      return student.quizAccuracy ?? 50;
    case "speakingAccuracy":
      return student.speakingAccuracy ?? 50;
    case "streakCount":
      return student.streakCount ?? 0;
    case "totalBanhRan":
      return student.totalBanhRan ?? 0;
    default:
      return 0;
  }
}

export type RankedStudent = ClassStudentRankStats & {
  rank: number;
  metricValue: number;
};

export function rankStudentsByMetric(
  students: ClassStudentRankStats[],
  metric: ClassRankMetric
): RankedStudent[] {
  const sorted = [...students].sort((a, b) => {
    const av = getMetricValue(a, metric);
    const bv = getMetricValue(b, metric);
    if (bv !== av) return bv - av;
    return (a.displayName || "").localeCompare(b.displayName || "", "vi");
  });

  return sorted.map((student, index) => ({
    ...student,
    rank: index + 1,
    metricValue: getMetricValue(student, metric),
  }));
}

export function getTopStudents(
  students: ClassStudentRankStats[],
  metric: ClassRankMetric
): RankedStudent[] {
  const ranked = rankStudentsByMetric(students, metric);
  const topCount = computeTopCount(students.length);
  return ranked.slice(0, topCount);
}

export function formatMetricValue(metric: ClassRankMetric, value: number): string {
  if (metric === "quizAccuracy" || metric === "speakingAccuracy") {
    return (value / 10).toFixed(1);
  }
  return String(Math.round(value));
}

import type { Timestamp } from "firebase/firestore";

function parseRankStudentEntry(raw: unknown): ClassRankStudentEntry | null {
  if (!raw || typeof raw !== "object") return null;
  const d = raw as Record<string, unknown>;
  const id = typeof d.id === "string" ? d.id : "";
  if (!id) return null;
  return {
    id,
    displayName: typeof d.displayName === "string" ? d.displayName : "Học sinh",
    avatarUrl: typeof d.avatarUrl === "string" ? d.avatarUrl : "",
    countHeart: typeof d.countHeart === "number" ? d.countHeart : 0,
    timesVocabXS: typeof d.timesVocabXS === "number" ? d.timesVocabXS : 0,
    quizAccuracy: typeof d.quizAccuracy === "number" ? d.quizAccuracy : 50,
    speakingAccuracy:
      typeof d.speakingAccuracy === "number" ? d.speakingAccuracy : 50,
    streakCount: typeof d.streakCount === "number" ? d.streakCount : 0,
    totalBanhRan: typeof d.totalBanhRan === "number" ? d.totalBanhRan : 0,
  };
}

export function parseClassRankFromData(
  data: Record<string, unknown> | null | undefined
): ClassRankSnapshot | undefined {
  const rankField = data?.rank;
  if (!rankField || typeof rankField !== "object") return undefined;

  const rankObj = rankField as Record<string, unknown>;
  const studentsRaw = rankObj.students;
  if (!studentsRaw || typeof studentsRaw !== "object") return undefined;

  const students: Record<string, ClassRankStudentEntry> = {};
  for (const [studentId, entry] of Object.entries(
    studentsRaw as Record<string, unknown>
  )) {
    const parsed = parseRankStudentEntry(entry);
    if (parsed) students[studentId] = parsed;
  }

  const updatedAtField = rankObj.updatedAt as Timestamp | undefined;
  const updatedAt =
    updatedAtField && typeof updatedAtField.toDate === "function"
      ? updatedAtField.toDate()
      : new Date(0);

  return { updatedAt, students };
}

export function formatClassRankLabel(
  rank: number,
  metric: ClassRankMetric = "countHeart"
): string {
  const tab = CLASS_RANK_TABS.find((t) => t.key === metric);
  const label = tab?.shortLabel ?? "";
  return `#${rank}${label ? ` ${label}` : ""}`;
}

export function getStudentRankPosition(
  snapshot: ClassRankSnapshot | null | undefined,
  studentId: string,
  metric: ClassRankMetric = "countHeart"
): number | null {
  const students = studentsFromClassRank(snapshot);
  if (students.length === 0) return null;
  const ranked = rankStudentsByMetric(students, metric);
  const row = ranked.find((s) => s.id === studentId);
  return row?.rank ?? null;
}
