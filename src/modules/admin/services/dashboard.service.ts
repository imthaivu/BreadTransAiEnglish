import {
  collection,
  getDocs,
  query,
  where,
  Timestamp,
  getCountFromServer,
} from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { normalizeClassAttendanceDaysField } from "@/modules/classes/api/attendance";
const VN_TIMEZONE = "Asia/Ho_Chi_Minh";

/** Tháng (1–12) và năm theo lịch VN. */
export function dashboardVietnamMonthYear(d = new Date()): { month: number; year: number } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: VN_TIMEZONE,
    year: "numeric",
    month: "numeric",
  }).formatToParts(d);
  const year = Number(parts.find((p) => p.type === "year")?.value);
  const month = Number(parts.find((p) => p.type === "month")?.value);
  if (!Number.isFinite(month) || !Number.isFinite(year)) {
    const loc = new Date();
    return { month: loc.getMonth() + 1, year: loc.getFullYear() };
  }
  return { month, year };
}

function getVietnamHour(d: Date): number {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: VN_TIMEZONE,
    hour: "numeric",
    hour12: false,
  }).formatToParts(d);
  const h = parts.find((p) => p.type === "hour")?.value;
  const n = h !== undefined ? parseInt(h, 10) : NaN;
  return Number.isFinite(n) ? n : 0;
}

type RoleHourBuckets = { all: number[]; students: number[]; teachers: number[] };

function emptyRoleHourBuckets(): RoleHourBuckets {
  const z = () => Array.from({ length: 24 }, () => 0);
  return { all: z(), students: z(), teachers: z() };
}

function bumpRoleHour(
  buckets: RoleHourBuckets,
  d: Date,
  userId: string | undefined,
  roleByUserId: Map<string, string>,
  mode: "byDocUserRole" | "allOnly"
): void {
  const h = getVietnamHour(d);
  if (h < 0 || h > 23) return;
  buckets.all[h]++;
  if (mode === "allOnly") return;
  const r = userId ? roleByUserId.get(userId) : undefined;
  if (r === "student") buckets.students[h]++;
  else if (r === "teacher") buckets.teachers[h]++;
}

function peakHourFromAll(all: number[]): { hour: number; count: number } | null {
  let bestH = 0;
  let best = -1;
  for (let h = 0; h < 24; h++) {
    if (all[h] > best) {
      best = all[h];
      bestH = h;
    }
  }
  return best > 0 ? { hour: bestH, count: best } : null;
}

export interface DashboardDeepHourlySeriesRow {
  hour: number;
  label: string;
  all: number;
  students: number;
  teachers: number;
}

export interface DashboardDeepHourlySeries {
  rows: DashboardDeepHourlySeriesRow[];
  peakAll: { hour: number; count: number } | null;
}

function finalizeHourlySeries(b: RoleHourBuckets): DashboardDeepHourlySeries {
  const rows: DashboardDeepHourlySeriesRow[] = Array.from({ length: 24 }, (_, hour) => ({
    hour,
    label: `${String(hour).padStart(2, "0")}h`,
    all: b.all[hour],
    students: b.students[hour],
    teachers: b.teachers[hour],
  }));
  return { rows, peakAll: peakHourFromAll(b.all) };
}

function bucketNeedArrayLength(n: number): string {
  if (n <= 0) return "0 (trống)";
  if (n === 1) return "1";
  if (n <= 3) return "2–3";
  if (n <= 6) return "4–6";
  return "7+";
}

export interface DashboardDeepNeedArrayStats {
  docsMissingOrEmpty: number;
  docsWithItems: number;
  totalItemCount: number;
  lengthBuckets: { label: string; count: number }[];
}

/** Thống kê mô tả trên tập số (HS), dùng cho loginCount, speakingAccuracy, % XS/vocab */
export interface DashboardDeepNumericSummary {
  n: number;
  max: number;
  mean: number;
  median: number;
  mode: number;
}

export interface DashboardDeepUserFieldStats {
  lastDeviceType: { label: string; count: number }[];
  loginCountSummary: DashboardDeepNumericSummary | null;
  speakingAccuracySummary: DashboardDeepNumericSummary | null;
  /** % làm tròn (timesVocabXS/timesVocab×100), chỉ HS có timesVocab > 0 */
  vocabXsRatioPercentSummary: DashboardDeepNumericSummary | null;
  /** streakCount ≤ 7 (gồm 0) */
  streakLte7: number;
  /** streakCount > 7 */
  streakGt7: number;
  studentsSampled: number;
}

export interface DashboardDeepBehaviorInsights {
  timezone: string;
  speakingSubmitByHour: DashboardDeepHourlySeries;
  quizAttemptByHour: DashboardDeepHourlySeries;
  speakingGradedByHour: DashboardDeepHourlySeries;
  needQuizs: DashboardDeepNeedArrayStats;
  needSpeakings: DashboardDeepNeedArrayStats;
  userFields: DashboardDeepUserFieldStats;
}

function sortLabelCounts(entries: Map<string, number>): { label: string; count: number }[] {
  return [...entries.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, "vi"));
}

function bumpBucket(map: Map<string, number>, label: string): void {
  map.set(label, (map.get(label) ?? 0) + 1);
}

function asFiniteNumber(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function summarizeNumeric(values: number[]): DashboardDeepNumericSummary | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const n = sorted.length;
  const max = sorted[n - 1]!;
  const sum = sorted.reduce((s, x) => s + x, 0);
  const mean = sum / n;
  const median =
    n % 2 === 1 ? sorted[(n - 1) / 2]! : (sorted[n / 2 - 1]! + sorted[n / 2]!) / 2;
  const freq = new Map<number, number>();
  for (const x of sorted) {
    freq.set(x, (freq.get(x) ?? 0) + 1);
  }
  let modeFreq = -1;
  let mode = sorted[0]!;
  for (const [x, c] of freq) {
    if (c > modeFreq || (c === modeFreq && x < mode)) {
      modeFreq = c;
      mode = x;
    }
  }
  return { n, max, mean, median, mode };
}

function aggregateUserFieldDistributions(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  docs: any[]
): DashboardDeepUserFieldStats {
  const lastDevice = new Map<string, number>();
  const loginValues: number[] = [];
  const accValues: number[] = [];
  const ratioPercents: number[] = [];
  let studentsSampled = 0;
  let streakLte7 = 0;
  let streakGt7 = 0;

  for (const d of docs) {
    const data = d.data() as Record<string, unknown>;
    if (data.role !== "student") continue;
    studentsSampled++;

    const dev = data.lastDeviceType;
    bumpBucket(
      lastDevice,
      typeof dev === "string" && dev ? dev : "(không có)"
    );

    const lc = asFiniteNumber(data.loginCount) ?? 0;
    loginValues.push(lc);

    const acc = asFiniteNumber(data.speakingAccuracy);
    if (acc !== null) {
      accValues.push(acc);
    }

    const st = asFiniteNumber(data.streakCount) ?? 0;
    if (st > 7) {
      streakGt7++;
    } else {
      streakLte7++;
    }

    const tv = asFiniteNumber(data.timesVocab) ?? 0;
    const tx = asFiniteNumber(data.timesVocabXS) ?? 0;
    if (tv > 0) {
      ratioPercents.push(Math.round((tx / tv) * 100));
    }
  }

  return {
    lastDeviceType: sortLabelCounts(lastDevice),
    loginCountSummary: summarizeNumeric(loginValues),
    speakingAccuracySummary: summarizeNumeric(accValues),
    vocabXsRatioPercentSummary: summarizeNumeric(ratioPercents),
    streakLte7,
    streakGt7,
    studentsSampled,
  };
}

const USERS_COLLECTION = "users";
const CLASSES_COLLECTION = "classes";
const BOOK_PROGRESS_COLLECTION = "userBookProgress";
const CLASS_ATTENDANCE_COLLECTION = "classAttendance";

export interface DailyDataPoint {
  date: string;
  count: number;
}

export interface DashboardStats {
  newUsersThisMonth: number;
  totalClasses: number;
  totalTeachers: number;
  totalStudents: number;
}

/** Chỉ dữ liệu từ users + userBookProgress (không đọc currency). */
export interface DashboardActivitySnapshot {
  speakingSubmissionsToday: number;
  bookProgressDocsUpdatedToday: number;
  totalUserBookProgress: number;
  newUsersLast7Days: DailyDataPoint[];
  speakingSubmissionsLast7Days: DailyDataPoint[];
}

const processLast7DaysData = (
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  docs: any[],
  dateField: string
): DailyDataPoint[] => {
  const today = new Date();
  const last7Days: { [key: string]: number } = {};

  for (let i = 6; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const dateString = d.toISOString().split("T")[0];
    last7Days[dateString] = 0;
  }

  docs.forEach((doc) => {
    const data = doc.data();
    if (data[dateField]?.toDate) {
      const dateString = data[dateField].toDate().toISOString().split("T")[0];
      if (last7Days[dateString] !== undefined) {
        last7Days[dateString]++;
      }
    }
  });

  return Object.entries(last7Days).map(([date, count]) => ({
    date: new Date(date).toLocaleDateString("vi-VN", {
      day: "2-digit",
      month: "2-digit",
    }),
    count,
  }));
};

function buildSpeakingChartDocsFromProgressSnapshot(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  docs: any[]
): { data: () => { submittedAt: { toDate: () => Date } } }[] {
  const speakingDocs: { data: () => { submittedAt: { toDate: () => Date } } }[] = [];
  docs.forEach((d) => {
    const lessons = (d.data().lessons ?? {}) as Record<
      string,
      { lastSubmitted?: { toDate?: () => Date } }
    >;
    Object.values(lessons).forEach((l) => {
      if (l.lastSubmitted?.toDate) {
        speakingDocs.push({
          data: () => ({
            submittedAt: l.lastSubmitted as { toDate: () => Date },
          }),
        });
      }
    });
  });
  return speakingDocs;
}

function countSpeakingSubmissionsInRange(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  progressDocs: any[],
  startDay: Date,
  endDay: Date
): number {
  let n = 0;
  progressDocs.forEach((d) => {
    const lessons = (d.data().lessons ?? {}) as Record<
      string,
      { lastSubmitted?: { toDate?: () => Date } }
    >;
    Object.values(lessons).forEach((l) => {
      if (l.lastSubmitted?.toDate) {
        const dt = l.lastSubmitted.toDate();
        if (dt >= startDay && dt <= endDay) n++;
      }
    });
  });
  return n;
}

/**
 * Thống kê nhanh + chuỗi 7 ngày: chỉ `users` (createdAt) và `userBookProgress`.
 */
export const getDashboardActivityOnly = async (): Promise<DashboardActivitySnapshot> => {
  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfDayTimestamp = Timestamp.fromDate(startOfDay);
  const endOfDay = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
    23,
    59,
    59,
    999
  );

  const sevenDaysAgo = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6);
  sevenDaysAgo.setHours(0, 0, 0, 0);
  const sevenDaysAgoTimestamp = Timestamp.fromDate(sevenDaysAgo);

  const bookProgressRef = collection(db, BOOK_PROGRESS_COLLECTION);
  const usersRef = collection(db, USERS_COLLECTION);

  const [totalProgressSnap, bookProgressTodaySnap, bookProgress7DaysSnap, users7DaysSnapshot] =
    await Promise.all([
      getCountFromServer(bookProgressRef),
      getDocs(
        query(bookProgressRef, where("lastUpdated", ">=", startOfDayTimestamp))
      ),
      getDocs(query(bookProgressRef, where("lastUpdated", ">=", sevenDaysAgoTimestamp))),
      getDocs(query(usersRef, where("createdAt", ">=", sevenDaysAgoTimestamp))),
    ]);

  const speakingSubmissionsToday = countSpeakingSubmissionsInRange(
    bookProgressTodaySnap.docs,
    startOfDay,
    endOfDay
  );
  const bookProgressDocsUpdatedToday = bookProgressTodaySnap.docs.length;
  const totalUserBookProgress = totalProgressSnap.data().count;

  const speakingDocs7d = buildSpeakingChartDocsFromProgressSnapshot(bookProgress7DaysSnap.docs);
  const speakingSubmissionsLast7Days = processLast7DaysData(speakingDocs7d, "submittedAt");
  const newUsersLast7Days = processLast7DaysData(users7DaysSnapshot.docs, "createdAt");

  return {
    speakingSubmissionsToday,
    bookProgressDocsUpdatedToday,
    totalUserBookProgress,
    newUsersLast7Days,
    speakingSubmissionsLast7Days,
  };
};

export const getDashboardStats = async (
  range: "week" | "month" = "week"
): Promise<DashboardStats> => {
  void range;
  try {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfMonthTimestamp = Timestamp.fromDate(startOfMonth);

    const usersRef = collection(db, USERS_COLLECTION);
    const classesRef = collection(db, CLASSES_COLLECTION);

    const newUsersQuery = query(usersRef, where("createdAt", ">=", startOfMonthTimestamp));
    const teachersQuery = query(usersRef, where("role", "==", "teacher"));
    const studentsQuery = query(usersRef, where("role", "==", "student"));

    const [newUsersSnapshot, classesSnapshot, teachersSnapshot, studentsSnapshot] =
      await Promise.all([
        getCountFromServer(newUsersQuery),
        getCountFromServer(classesRef),
        getCountFromServer(teachersQuery),
        getCountFromServer(studentsQuery),
      ]);

    return {
      newUsersThisMonth: newUsersSnapshot.data().count,
      totalClasses: classesSnapshot.data().count,
      totalTeachers: teachersSnapshot.data().count,
      totalStudents: studentsSnapshot.data().count,
    };
  } catch (error) {
    console.error("Error getting dashboard stats:", error);
    throw error;
  }
};

export const getNewUsersThisMonth = async (): Promise<number> => {
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const startOfMonthTimestamp = Timestamp.fromDate(startOfMonth);

  const usersRef = collection(db, USERS_COLLECTION);
  const newUsersQuery = query(usersRef, where("createdAt", ">=", startOfMonthTimestamp));
  const newUsersSnapshot = await getCountFromServer(newUsersQuery);
  return newUsersSnapshot.data().count;
};

export const getTotalClasses = async (): Promise<number> => {
  const classesRef = collection(db, CLASSES_COLLECTION);
  const classesSnapshot = await getCountFromServer(classesRef);
  return classesSnapshot.data().count;
};

export const getTotalTeachers = async (): Promise<number> => {
  const usersRef = collection(db, USERS_COLLECTION);
  const teachersQuery = query(usersRef, where("role", "==", "teacher"));
  const teachersSnapshot = await getCountFromServer(teachersQuery);
  return teachersSnapshot.data().count;
};

export const getTotalStudents = async (): Promise<number> => {
  const usersRef = collection(db, USERS_COLLECTION);
  const studentsQuery = query(usersRef, where("role", "==", "student"));
  const studentsSnapshot = await getCountFromServer(studentsQuery);
  return studentsSnapshot.data().count;
};

// ----- Deep scan: users + classes + userBookProgress (toàn bộ document) -----

export interface DashboardDeepBookProgressAgg {
  docCount: number;
  uniqueUserIds: number;
  uniqueBookIds: number;
  /** Tổng số key trong map `lessons` (mỗi cặp user×book × lesson). */
  lessonRowsTotal: number;
  /** Có fileUrl hoặc lastSubmitted (đã từng nộp / có bản ghi nộp). */
  lessonsWithSpeakingActivity: number;
  /** Đã có điểm chấm speaking (speakingScore). */
  lessonsWithSpeakingScore: number;
  /** Có listenCount &gt; 0 (đã nghe ít nhất 1 lần). */
  lessonsWithListeningTouches: number;
  /** Có lastAttempt (đã làm quiz ít nhất 1 lần). */
  lessonsWithQuizAttempts: number;
  /** lastAccuracy &gt;= 90 tại lesson. */
  lessonsQuizAccuracyGte90: number;
  /** Tổng phần tử mảng completedLessons (flashcard pass). */
  completedLessonMarksTotal: number;
  /** Tổng phần tử mảng completedLessonsSpeaking. */
  completedSpeakingMarksTotal: number;
  /** Doc có needQuizs không rỗng (GV giao việc). */
  docsWithNeedQuizs: number;
  /** Doc có needSpeakings không rỗng. */
  docsWithNeedSpeakings: number;
}

export interface DashboardDeepUsersAgg {
  docCount: number;
  /** Đồng nghĩa getDashboardStats: user có createdAt từ 00:00 ngày 1 tháng hiện tại (local). */
  newUsersThisMonth: number;
  students: number;
  teachers: number;
  admins: number;
  otherRoles: number;
  studentsWithoutClass: number;
  usersWithStreakGt0: number;
  selfClaimedStudents: number;
}

export interface DashboardDeepClassesAgg {
  docCount: number;
  active: number;
  inactive: number;
  /** Tổng chỗ ngồi theo mảng students trên class (denormalized). */
  totalStudentSeatsListed: number;
  /** Trung bình số giáo viên / lớp (teachers.length). */
  avgTeachersPerClass: number;
}

export interface DashboardDeepInsights {
  scannedAtIso: string;
  bookProgress: DashboardDeepBookProgressAgg;
  users: DashboardDeepUsersAgg;
  classes: DashboardDeepClassesAgg;
  /** Từ toàn bộ userBookProgress · lessons.*.lastAttempt */
  quizAttemptsLast7Days: DailyDataPoint[];
  /** Từ toàn bộ userBookProgress · lessons.*.lastSubmitted */
  speakingSubmissionsLast7DaysFull: DailyDataPoint[];
  /** Giờ VN + phân HS/GV + user fields (chỉ khi quét sâu) */
  behavior: DashboardDeepBehaviorInsights;
}

/** Chỉ quét `users` + `classes` (presence, field HS, KPI). */
export type DashboardDeepUsersClassesBehaviorSlice = Pick<
  DashboardDeepBehaviorInsights,
  "timezone" | "userFields"
>;

export interface DashboardDeepUsersClassesInsights {
  scannedAtIso: string;
  users: DashboardDeepUsersAgg;
  classes: DashboardDeepClassesAgg;
  behavior: DashboardDeepUsersClassesBehaviorSlice;
}

/** Quét `users` (map role) + `userBookProgress` — lessons.* nặng. */
export type DashboardDeepBookProgressBehaviorSlice = Pick<
  DashboardDeepBehaviorInsights,
  | "timezone"
  | "speakingSubmitByHour"
  | "quizAttemptByHour"
  | "speakingGradedByHour"
  | "needQuizs"
  | "needSpeakings"
>;

export interface DashboardDeepBookProgressInsights {
  scannedAtIso: string;
  bookProgress: DashboardDeepBookProgressAgg;
  quizAttemptsLast7Days: DailyDataPoint[];
  speakingSubmissionsLast7DaysFull: DailyDataPoint[];
  behavior: DashboardDeepBookProgressBehaviorSlice;
}

/** Một dòng điểm danh = 1 HS · 1 ngày · 1 lớp. */
export interface DashboardAttendanceTotals {
  present: number;
  late: number;
  absent: number;
  totalMarks: number;
}

export interface DashboardAttendanceClassRow extends DashboardAttendanceTotals {
  classId: string;
  className: string;
}

export interface DashboardAttendanceInsights {
  scannedAtIso: string;
  month: number;
  year: number;
  timezone: string;
  /** Gộp toàn bộ lớp trong tháng (cùng HS có thể đếm nhiều lớp). */
  system: DashboardAttendanceTotals;
  byClass: DashboardAttendanceClassRow[];
  docCount: number;
}

type LessonLike = {
  lastAccuracy?: unknown;
  lastAttempt?: { toDate?: () => Date };
  listenCount?: unknown;
  fileUrl?: unknown;
  lastSubmitted?: { toDate?: () => Date };
  speakingScore?: unknown;
  speakingScoreAt?: { toDate?: () => Date };
};

function aggregateBookProgressDeep(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  docs: any[],
  roleByUserId: Map<string, string>
): {
  agg: DashboardDeepBookProgressAgg;
  quizChartDocs: { data: () => { eventAt: { toDate: () => Date } } }[];
  speakingChartDocs: { data: () => { eventAt: { toDate: () => Date } } }[];
  quizByHour: RoleHourBuckets;
  speakingByHour: RoleHourBuckets;
  gradedByHour: RoleHourBuckets;
  needQuizsStats: DashboardDeepNeedArrayStats;
  needSpeakingsStats: DashboardDeepNeedArrayStats;
} {
  const uniqueUserIds = new Set<string>();
  const uniqueBookIds = new Set<string>();
  let lessonRowsTotal = 0;
  let lessonsWithSpeakingActivity = 0;
  let lessonsWithSpeakingScore = 0;
  let lessonsWithListeningTouches = 0;
  let lessonsWithQuizAttempts = 0;
  let lessonsQuizAccuracyGte90 = 0;
  let completedLessonMarksTotal = 0;
  let completedSpeakingMarksTotal = 0;
  let docsWithNeedQuizs = 0;
  let docsWithNeedSpeakings = 0;

  const quizChartDocs: { data: () => { eventAt: { toDate: () => Date } } }[] = [];
  const speakingChartDocs: { data: () => { eventAt: { toDate: () => Date } } }[] = [];

  const quizByHour = emptyRoleHourBuckets();
  const speakingByHour = emptyRoleHourBuckets();
  const gradedByHour = emptyRoleHourBuckets();

  let needQuizsDocsEmpty = 0;
  let needQuizsDocsWith = 0;
  let needQuizsTotalItems = 0;
  const needQuizsLenHist = new Map<string, number>();

  let needSpeakDocsEmpty = 0;
  let needSpeakDocsWith = 0;
  let needSpeakTotalItems = 0;
  const needSpeakLenHist = new Map<string, number>();

  for (const d of docs) {
    const data = d.data() as Record<string, unknown>;
    const uid = data.userId;
    const bid = data.bookId;
    if (typeof uid === "string" && uid) uniqueUserIds.add(uid);
    if (typeof bid === "string" && bid) uniqueBookIds.add(bid);
    const progressUserId = typeof uid === "string" && uid ? uid : undefined;

    const lessons = (data.lessons ?? {}) as Record<string, LessonLike>;
    lessonRowsTotal += Object.keys(lessons).length;

    for (const lesson of Object.values(lessons)) {
      const hasFile =
        typeof lesson.fileUrl === "string" && lesson.fileUrl.length > 0;
      if (hasFile || lesson.lastSubmitted?.toDate) {
        lessonsWithSpeakingActivity++;
      }
      if (typeof lesson.speakingScore === "string" && lesson.speakingScore.length > 0) {
        lessonsWithSpeakingScore++;
      }
      const lc = lesson.listenCount;
      if (typeof lc === "number" && lc > 0) {
        lessonsWithListeningTouches++;
      }
      if (lesson.lastAttempt?.toDate) {
        lessonsWithQuizAttempts++;
        quizChartDocs.push({
          data: () => ({
            eventAt: lesson.lastAttempt as { toDate: () => Date },
          }),
        });
        bumpRoleHour(
          quizByHour,
          lesson.lastAttempt.toDate(),
          progressUserId,
          roleByUserId,
          /** Chỉ tổng — lastAttempt gắn doc tiến độ (userId = HS), không có cơ sở tách GV */
          "allOnly"
        );
      }
      const acc = lesson.lastAccuracy;
      if (typeof acc === "number" && acc >= 90) {
        lessonsQuizAccuracyGte90++;
      }
      if (lesson.lastSubmitted?.toDate) {
        speakingChartDocs.push({
          data: () => ({
            eventAt: lesson.lastSubmitted as { toDate: () => Date },
          }),
        });
        bumpRoleHour(
          speakingByHour,
          lesson.lastSubmitted.toDate(),
          progressUserId,
          roleByUserId,
          /** Chỉ tổng — lastSubmitted trên doc HS, không tách role GV */
          "allOnly"
        );
      }
      if (lesson.speakingScoreAt?.toDate) {
        bumpRoleHour(
          gradedByHour,
          lesson.speakingScoreAt.toDate(),
          progressUserId,
          roleByUserId,
          "allOnly"
        );
      }
    }

    const cl = data.completedLessons;
    if (Array.isArray(cl)) {
      completedLessonMarksTotal += cl.length;
    }
    const cls = data.completedLessonsSpeaking;
    if (Array.isArray(cls)) {
      completedSpeakingMarksTotal += cls.length;
    }
    const nq = data.needQuizs;
    if (Array.isArray(nq) && nq.length > 0) {
      docsWithNeedQuizs++;
      needQuizsDocsWith++;
      needQuizsTotalItems += nq.length;
      bumpBucket(needQuizsLenHist, bucketNeedArrayLength(nq.length));
    } else {
      needQuizsDocsEmpty++;
    }
    const ns = data.needSpeakings;
    if (Array.isArray(ns) && ns.length > 0) {
      docsWithNeedSpeakings++;
      needSpeakDocsWith++;
      needSpeakTotalItems += ns.length;
      bumpBucket(needSpeakLenHist, bucketNeedArrayLength(ns.length));
    } else {
      needSpeakDocsEmpty++;
    }
  }

  const needQuizsStats: DashboardDeepNeedArrayStats = {
    docsMissingOrEmpty: needQuizsDocsEmpty,
    docsWithItems: needQuizsDocsWith,
    totalItemCount: needQuizsTotalItems,
    lengthBuckets: ["1", "2–3", "4–6", "7+"].map((label) => ({
      label,
      count: needQuizsLenHist.get(label) ?? 0,
    })),
  };
  const needSpeakingsStats: DashboardDeepNeedArrayStats = {
    docsMissingOrEmpty: needSpeakDocsEmpty,
    docsWithItems: needSpeakDocsWith,
    totalItemCount: needSpeakTotalItems,
    lengthBuckets: ["1", "2–3", "4–6", "7+"].map((label) => ({
      label,
      count: needSpeakLenHist.get(label) ?? 0,
    })),
  };

  return {
    agg: {
      docCount: docs.length,
      uniqueUserIds: uniqueUserIds.size,
      uniqueBookIds: uniqueBookIds.size,
      lessonRowsTotal,
      lessonsWithSpeakingActivity,
      lessonsWithSpeakingScore,
      lessonsWithListeningTouches,
      lessonsWithQuizAttempts,
      lessonsQuizAccuracyGte90,
      completedLessonMarksTotal,
      completedSpeakingMarksTotal,
      docsWithNeedQuizs,
      docsWithNeedSpeakings,
    },
    quizChartDocs,
    speakingChartDocs,
    quizByHour,
    speakingByHour,
    gradedByHour,
    needQuizsStats,
    needSpeakingsStats,
  };
}

function aggregateUsersDeep(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  docs: any[]
): DashboardDeepUsersAgg {
  const now = new Date();
  const startOfMonthMs = new Date(now.getFullYear(), now.getMonth(), 1).getTime();

  let students = 0;
  let teachers = 0;
  let admins = 0;
  let otherRoles = 0;
  let studentsWithoutClass = 0;
  let usersWithStreakGt0 = 0;
  let selfClaimedStudents = 0;
  let newUsersThisMonth = 0;

  for (const d of docs) {
    const data = d.data() as Record<string, unknown>;
    const createdAt = data.createdAt as { toDate?: () => Date } | undefined;
    if (createdAt?.toDate) {
      try {
        if (createdAt.toDate().getTime() >= startOfMonthMs) {
          newUsersThisMonth++;
        }
      } catch {
        /* bỏ qua createdAt lỗi */
      }
    }

    const role = data.role;
    if (role === "student") {
      students++;
      const cids = data.classIds;
      if (!Array.isArray(cids) || cids.length === 0) {
        studentsWithoutClass++;
      }
      if (data.isSelfClaimed === true) {
        selfClaimedStudents++;
      }
    } else if (role === "teacher") {
      teachers++;
    } else if (role === "admin") {
      admins++;
    } else {
      otherRoles++;
    }

    const sc = data.streakCount;
    if (typeof sc === "number" && sc > 0) {
      usersWithStreakGt0++;
    }
  }

  return {
    docCount: docs.length,
    newUsersThisMonth,
    students,
    teachers,
    admins,
    otherRoles,
    studentsWithoutClass,
    usersWithStreakGt0,
    selfClaimedStudents,
  };
}

function aggregateClassesDeep(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  docs: any[]
): DashboardDeepClassesAgg {
  let active = 0;
  let inactive = 0;
  let totalStudentSeatsListed = 0;
  let teacherSlotsTotal = 0;

  for (const d of docs) {
    const data = d.data() as Record<string, unknown>;
    if (data.status === "active") {
      active++;
    } else {
      inactive++;
    }

    const students = data.students;
    if (Array.isArray(students)) {
      totalStudentSeatsListed += students.length;
    }

    const teachers = data.teachers;
    if (Array.isArray(teachers)) {
      teacherSlotsTotal += teachers.length;
    }
  }

  const n = docs.length;
  return {
    docCount: n,
    active,
    inactive,
    totalStudentSeatsListed,
    avgTeachersPerClass: n > 0 ? Math.round((teacherSlotsTotal / n) * 10) / 10 : 0,
  };
}

function normalizeAttendanceMark(v: unknown): "present" | "late" | "absent" {
  if (v === "present" || v === "late" || v === "absent") return v;
  if (v === true) return "present";
  return "absent";
}

function bumpAttendanceTotals(
  t: DashboardAttendanceTotals,
  status: "present" | "late" | "absent"
): void {
  t.totalMarks += 1;
  if (status === "present") t.present += 1;
  else if (status === "late") t.late += 1;
  else t.absent += 1;
}

function emptyAttendanceTotals(): DashboardAttendanceTotals {
  return { present: 0, late: 0, absent: 0, totalMarks: 0 };
}

/** Doc id `{classId}_{month}_{year}` — classId có thể chứa `_`. */
function parseClassAttendanceDocId(
  docId: string
): { classId: string; month: number; year: number } | null {
  const parts = docId.split("_");
  if (parts.length < 3) return null;
  const year = Number(parts[parts.length - 1]);
  const month = Number(parts[parts.length - 2]);
  if (!Number.isFinite(month) || !Number.isFinite(year) || month < 1 || month > 12) return null;
  const classId = parts.slice(0, -2).join("_");
  if (!classId) return null;
  return { classId, month, year };
}

function attendanceDocMatchesVietnamMonthYear(
  docId: string,
  data: Record<string, unknown>,
  month: number,
  year: number
): boolean {
  const dm = asFiniteNumber(data.month);
  const dy = asFiniteNumber(data.year);
  if (dm === month && dy === year) return true;
  const meta = parseClassAttendanceDocId(docId);
  return meta !== null && meta.month === month && meta.year === year;
}

function resolveClassIdFromAttendanceDoc(
  docId: string,
  data: Record<string, unknown>
): string | null {
  const cid = data.classId;
  if (typeof cid === "string" && cid.trim()) return cid.trim();
  return parseClassAttendanceDocId(docId)?.classId ?? null;
}

/**
 * Đọc `classAttendance` theo tháng/năm (VN), gộp toàn hệ thống và theo từng lớp.
 * Mỗi ô (HS–ngày) trong `days` đếm một lần.
 */
export const getDashboardAttendanceInsights = async (): Promise<DashboardAttendanceInsights> => {
  const { month, year } = dashboardVietnamMonthYear(new Date());
  const attRef = collection(db, CLASS_ATTENDANCE_COLLECTION);
  const classesRef = collection(db, CLASSES_COLLECTION);

  /** Không dùng where(month,year): cần composite index và dễ lệch nếu field thiếu / kiểu khác. */
  const [attSnap, classSnap] = await Promise.all([getDocs(attRef), getDocs(classesRef)]);

  const classNameById = new Map<string, string>();
  for (const d of classSnap.docs) {
    const nm = (d.data() as Record<string, unknown>).name;
    classNameById.set(d.id, typeof nm === "string" && nm.trim() ? nm.trim() : d.id);
  }

  const system = emptyAttendanceTotals();
  const byClassMap = new Map<string, DashboardAttendanceTotals>();

  let matchedDocCount = 0;
  for (const docSnap of attSnap.docs) {
    const data = docSnap.data() as Record<string, unknown>;
    if (!attendanceDocMatchesVietnamMonthYear(docSnap.id, data, month, year)) continue;
    matchedDocCount += 1;

    const classId = resolveClassIdFromAttendanceDoc(docSnap.id, data);
    if (!classId) continue;

    const days = normalizeClassAttendanceDaysField(data.days);
    if (!days) continue;

    let classTotals = byClassMap.get(classId);
    if (!classTotals) {
      classTotals = emptyAttendanceTotals();
      byClassMap.set(classId, classTotals);
    }

    for (const dayMap of Object.values(days)) {
      if (!dayMap || typeof dayMap !== "object") continue;
      for (const raw of Object.values(dayMap)) {
        const st = normalizeAttendanceMark(raw);
        bumpAttendanceTotals(system, st);
        bumpAttendanceTotals(classTotals, st);
      }
    }
  }

  const byClass: DashboardAttendanceClassRow[] = [...byClassMap.entries()].map(([classId, t]) => ({
    classId,
    className: classNameById.get(classId) ?? classId,
    ...t,
  }));
  byClass.sort((a, b) => b.totalMarks - a.totalMarks || a.className.localeCompare(b.className, "vi"));

  return {
    scannedAtIso: new Date().toISOString(),
    month,
    year,
    timezone: VN_TIMEZONE,
    system,
    byClass,
    docCount: matchedDocCount,
  };
};

/** Quét `users` + `classes` — không đọc userBookProgress. */
export const getDashboardDeepUsersClasses = async (): Promise<DashboardDeepUsersClassesInsights> => {
  const usersRef = collection(db, USERS_COLLECTION);
  const classesRef = collection(db, CLASSES_COLLECTION);
  const [userSnap, classSnap] = await Promise.all([getDocs(usersRef), getDocs(classesRef)]);

  const userFieldStats = aggregateUserFieldDistributions(userSnap.docs);

  return {
    scannedAtIso: new Date().toISOString(),
    users: aggregateUsersDeep(userSnap.docs),
    classes: aggregateClassesDeep(classSnap.docs),
    behavior: {
      timezone: VN_TIMEZONE,
      userFields: userFieldStats,
    },
  };
};

/** Quét `userBookProgress` + `users` (chỉ để map role). Không đọc `currency`. */
export const getDashboardDeepBookProgress = async (): Promise<DashboardDeepBookProgressInsights> => {
  const usersRef = collection(db, USERS_COLLECTION);
  const bookProgressRef = collection(db, BOOK_PROGRESS_COLLECTION);
  const [userSnap, progressSnap] = await Promise.all([getDocs(usersRef), getDocs(bookProgressRef)]);

  const roleByUserId = new Map<string, string>();
  for (const d of userSnap.docs) {
    const role = (d.data() as Record<string, unknown>).role;
    roleByUserId.set(d.id, typeof role === "string" ? role : "");
  }

  const {
    agg: bookProgress,
    quizChartDocs,
    speakingChartDocs,
    quizByHour,
    speakingByHour,
    gradedByHour,
    needQuizsStats,
    needSpeakingsStats,
  } = aggregateBookProgressDeep(progressSnap.docs, roleByUserId);

  return {
    scannedAtIso: new Date().toISOString(),
    bookProgress,
    quizAttemptsLast7Days: processLast7DaysData(quizChartDocs, "eventAt"),
    speakingSubmissionsLast7DaysFull: processLast7DaysData(speakingChartDocs, "eventAt"),
    behavior: {
      timezone: VN_TIMEZONE,
      speakingSubmitByHour: finalizeHourlySeries(speakingByHour),
      quizAttemptByHour: finalizeHourlySeries(quizByHour),
      speakingGradedByHour: finalizeHourlySeries(gradedByHour),
      needQuizs: needQuizsStats,
      needSpeakings: needSpeakingsStats,
    },
  };
};

/**
 * Gộp hai lần quét (đọc `users` hai lần). Ưu tiên dùng từng API riêng từ UI.
 */
export const getDashboardDeepInsights = async (): Promise<DashboardDeepInsights> => {
  const [uc, bp] = await Promise.all([getDashboardDeepUsersClasses(), getDashboardDeepBookProgress()]);
  return {
    scannedAtIso: uc.scannedAtIso,
    users: uc.users,
    classes: uc.classes,
    bookProgress: bp.bookProgress,
    quizAttemptsLast7Days: bp.quizAttemptsLast7Days,
    speakingSubmissionsLast7DaysFull: bp.speakingSubmissionsLast7DaysFull,
    behavior: {
      ...uc.behavior,
      ...bp.behavior,
    },
  };
};
