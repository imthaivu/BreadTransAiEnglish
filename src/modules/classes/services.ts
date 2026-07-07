import { db } from "@/lib/firebase/client";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  where,
  Timestamp,
  limit,
  addDoc,
  serverTimestamp,
  updateDoc,
  getDocFromServer,
  runTransaction,
  setDoc,
  increment,
  arrayUnion,
  type DocumentSnapshot,
  type DocumentData,
  QueryConstraint,
} from "firebase/firestore";
import { BookProgress } from "@/modules/flashcard/types";

import { IClassMember } from "@/types";
import { IClass } from "../admin";
import { ILessonStudentProgress, IStudentActivity } from "./types";
import { parseClassRankFromData } from "./utils/class-rank";
import type { IPendingSpeakingEvaluationEntry } from "../admin/type";
export * from "./api/quiz";

const CLASSES_COLLECTION = "classes";
const USERS_COLLECTION = "users";

function parsePendingEvaluations(
  raw: DocumentData["pendingEvaluations"]
): Record<string, IPendingSpeakingEvaluationEntry> | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const result: Record<string, IPendingSpeakingEvaluationEntry> = {};
  for (const [key, entry] of Object.entries(raw)) {
    if (!entry || typeof entry !== "object") continue;
    const e = entry as IPendingSpeakingEvaluationEntry;
    const submittedAt =
      e.submittedAt && typeof (e.submittedAt as Timestamp).toDate === "function"
        ? (e.submittedAt as Timestamp).toDate()
        : e.submittedAt instanceof Date
          ? e.submittedAt
          : e.submittedAt;
    result[key] = { ...e, submittedAt: submittedAt as IPendingSpeakingEvaluationEntry["submittedAt"] };
  }
  return Object.keys(result).length > 0 ? result : undefined;
}

function mapFirestoreClassDoc(id: string, data: DocumentData): IClass {
  const rank = parseClassRankFromData(data as Record<string, unknown>);
  return {
    id,
    ...data,
    rank,
    pendingEvaluations: parsePendingEvaluations(data.pendingEvaluations),
    createdAt:
      data?.createdAt && typeof (data.createdAt as Timestamp).toDate === "function"
        ? (data.createdAt as Timestamp).toDate()
        : data?.createdAt instanceof Date
          ? data.createdAt
          : undefined,
    updatedAt:
      data?.updatedAt && typeof (data.updatedAt as Timestamp).toDate === "function"
        ? (data.updatedAt as Timestamp).toDate()
        : data?.updatedAt instanceof Date
          ? data.updatedAt
          : undefined,
  } as IClass;
}

// Get all classes for a specific teacher
export const getTeacherClasses = async (
  teacherId: string
): Promise<IClass[]> => {
  if (!teacherId) return [];

  // First, try to get classIds from teacher's user document (most efficient)
  const userRef = doc(db, USERS_COLLECTION, teacherId);
  // Dùng getDocFromServer để tránh tình trạng cache Firebase lấy sai số lượng classIds
  const userSnap = await getDocFromServer(userRef);

  if (userSnap.exists()) {
    const userData = userSnap.data();
    const classIds = userData.classIds || [];

    if (classIds.length > 0) {
      // Fetch all class documents individually in parallel
      // This avoids Firestore limits and cache inconsistencies with large "in" queries
      const validClassIds = classIds.filter(Boolean); // Ensure no empty ids
      const classDocs: DocumentSnapshot<DocumentData>[] = [];
      const chunkSize = 5;

      for (let i = 0; i < validClassIds.length; i += chunkSize) {
        const chunk = validClassIds.slice(i, i + chunkSize);
        const chunkDocs = await Promise.all(
          chunk.map((id: string) => getDocFromServer(doc(db, CLASSES_COLLECTION, id)))
        );
        classDocs.push(...chunkDocs);
      }

      // Combine all valid results
      const allClasses = classDocs
        .filter((d) => d.exists())
        .map((d) => mapFirestoreClassDoc(d.id, d.data()!));

      if (validClassIds.length > 0 && allClasses.length === 0) {
        throw new Error("Lỗi tải lớp học từ bộ nhớ tạm. Đang thử lại...");
      }

      // Sort by createdAt descending
      return allClasses.sort((a, b) => {
        const aDate = a.createdAt?.getTime() || 0;
        const bDate = b.createdAt?.getTime() || 0;
        return bDate - aDate;
      });
    }
  }

  return [];
};

// Get details for a single class, ensuring the teacher has access
export const getClassDetails = async (
  classId: string,
  teacherId: string
): Promise<IClass | null> => {
  if (!classId || !teacherId) return null;

  const classRef = doc(db, CLASSES_COLLECTION, classId);
  const classSnap = await getDoc(classRef);

  if (classSnap.exists()) {
    const data = classSnap.data();

    // Security check: Make sure the requesting teacher is one of the class teachers
    const teachers = data.teachers || [];
    const isAuthorized = teachers.some((t: { id: string }) => t.id === teacherId);

    if (!isAuthorized) {
      console.warn("Unauthorized access attempt for class details.");
      return null;
    }

    return mapFirestoreClassDoc(classSnap.id, data);
  }
  return null;
};

// Get members of a class
// Students: reads from students[] array in class document
// Teachers: reads from teachers[] array in class document
export const getClassMembers = async (
  classId: string
): Promise<IClassMember[]> => {
  const classRef = doc(db, CLASSES_COLLECTION, classId);
  const classSnap = await getDoc(classRef);

  if (!classSnap.exists()) {
    return [];
  }

  const classData = classSnap.data();

  // Get students from students[] array - format: Array<{studentId: string, name: string, avatarUrl?: string}>
  const studentsData = Array.isArray(classData.students) ? (classData.students as Array<{ studentId: string; name: string; avatarUrl?: string }>) : [];

  const allStudentMembers: IClassMember[] = [];

  if (studentsData.length > 0) {
    // Use avatarUrl from students array when available; otherwise fetch from users
    const studentIdsNeedingFetch = studentsData.filter(s => !s.avatarUrl).map(s => s.studentId);
    const batchSize = 10;

    const avatarUrlMap = new Map<string, string>();
    for (let i = 0; i < studentIdsNeedingFetch.length; i += batchSize) {
      const batch = studentIdsNeedingFetch.slice(i, i + batchSize);
      const userPromises = batch.map(async (studentId) => {
        const userRef = doc(db, USERS_COLLECTION, studentId);
        const userSnap = await getDoc(userRef);
        const d = userSnap.data();
        return (d?.avatarUrl as string | undefined) ?? "";
      });
      const urls = await Promise.all(userPromises);
      batch.forEach((id, idx) => {
        if (urls[idx]) avatarUrlMap.set(id, urls[idx]);
      });
    }

    for (const studentObj of studentsData) {
      const avatarUrl = studentObj.avatarUrl || avatarUrlMap.get(studentObj.studentId) || "";
      allStudentMembers.push({
        id: studentObj.studentId,
        name: studentObj.name || "Học sinh",
        avatarUrl,
        role: "student" as const,
        status: "active" as const,
        joinedAt: new Date(),
      } as IClassMember);
    }
  }

  // Get teachers from teachers[] array (phone đã được xóa trong migration)
  const teachersArray = Array.isArray(classData.teachers) ? (classData.teachers as Array<{ id: string; name: string; avatarUrl?: string }>) : [];
  const teachers: IClassMember[] = teachersArray.map((teacher) => ({
    id: teacher.id,
    name: teacher.name || "N/A",
    avatarUrl: teacher.avatarUrl || "",
    role: "teacher" as const,
    status: "active" as const,
    joinedAt: new Date(),
  }));

  // Combine teachers and students
  return [...teachers, ...allStudentMembers];
};

// --- Progress Tracking Services ---

/**
 * Derive speaking activities from cached BookProgress map (no Firestore fetch)
 */
function deriveSpeakingActivitiesFromBookProgress(
  bookProgressMap: Map<string, BookProgress>,
  bookId: string,
  lessonId: string,
  lessonIdNum: number,
  studentMap: Map<string, IClassMember>
): IStudentActivity[] {
  const speakingActivities: IStudentActivity[] = [];
  bookProgressMap.forEach((data, studentId) => {
    const student = studentMap.get(studentId);
    const lesson = data.lessons?.[lessonIdNum];
    const hasSubmitted =
      (data.completedLessonsSpeaking ?? []).includes(lessonIdNum) ||
      !!(lesson?.fileUrl ?? lesson?.lastSubmitted);

    const hasListened = (lesson?.listenCount ?? 0) > 0;

    if (!hasSubmitted && !hasListened) return;

    let timestamp: Date;
    if (hasSubmitted) {
      if (lesson?.lastSubmitted) {
        const ts = lesson.lastSubmitted;
        timestamp = ts?.toDate ? ts.toDate() : new Date();
      } else {
        timestamp = new Date();
      }
    } else if (lesson?.lastAttempt) {
      const ts = lesson.lastAttempt;
      timestamp = ts?.toDate ? ts.toDate() : new Date();
    } else {
      timestamp = new Date(0);
    }

    speakingActivities.push({
      id: `${studentId}_${bookId}_${lessonId}`,
      student: {
        id: student?.id || "",
        name: student?.name || "N/A",
        ...(student?.avatarUrl && { avatarUrl: student.avatarUrl }),
      },
      type: "speaking" as const,
      details: { book: bookId, lesson: lessonId },
      timestamp,
      sourceUrl: lesson?.fileUrl,
      ...(lesson?.duration != null && lesson.duration > 0 && { duration: lesson.duration }),
      listenCount: lesson?.listenCount ?? 0,
      isCompleted: hasSubmitted,
      speakingScore: lesson?.speakingScore,
    });
  });
  speakingActivities.sort(
    (a, b) => b.timestamp.getTime() - a.timestamp.getTime()
  );
  return speakingActivities;
}

export const getClassProgressActivities = async (
  classId: string,
  bookId: string,
  lessonId: string,
  members?: IClassMember[], // Optional: reuse cached members to avoid redundant query
  cachedBookProgressMap?: Map<string, BookProgress> // Optional: reuse from classBookProgress (Quiz tab) to avoid duplicate fetch
): Promise<IStudentActivity[]> => {
  try {
    if (!classId || !bookId || !lessonId) return [];

    // 1. Get all student members of the class (reuse cached if provided)
    const classMembers = members || await getClassMembers(classId);
    const students = classMembers.filter((m) => m.role === "student");
    if (students.length === 0) return [];

    const studentIds = students.map((s) => s.id).filter((id) => id);
    if (studentIds.length === 0) return [];

    const studentMap = new Map(students.map((s) => [s.id, s]));
    const lessonIdNum = parseInt(lessonId, 10);

    // 2. Reuse cached classBookProgress when same book (from Quiz tab) - tránh fetch lại
    if (cachedBookProgressMap && cachedBookProgressMap.size > 0) {
      return deriveSpeakingActivitiesFromBookProgress(
        cachedBookProgressMap,
        bookId,
        lessonId,
        lessonIdNum,
        studentMap
      );
    }

    // 3. Đọc speaking từ userBookProgress (khi không có cache)
    const bookProgressRefs = studentIds.map((sid) =>
      doc(db, "userBookProgress", `${sid}_${bookId}`)
    );
    const bookProgressSnaps = await Promise.all(
      bookProgressRefs.map((ref) => getDoc(ref))
    );

    const bookProgressMap = new Map<string, BookProgress>();
    bookProgressSnaps.forEach((snap, idx) => {
      if (snap.exists()) {
        bookProgressMap.set(studentIds[idx], snap.data() as BookProgress);
      }
    });
    return deriveSpeakingActivitiesFromBookProgress(
      bookProgressMap,
      bookId,
      lessonId,
      lessonIdNum,
      studentMap
    );
  } catch (error) {
    console.error("Error in getClassProgressActivities:", error);
    return [];
  }
};

export const getStudentClasses = async (
  studentId: string
): Promise<IClass[]> => {
  const userRef = doc(db, "users", studentId);
  // Dùng getDocFromServer để luôn lấy mảng classIds mới nhất
  const userSnap = await getDocFromServer(userRef);

  if (!userSnap.exists()) {
    console.error("No such user!");
    return [];
  }

  const userData = userSnap.data();
  const classIds = userData.classIds || [];

  if (classIds.length === 0) {
    return [];
  }

  const validClassIds = classIds.filter(Boolean);
  const classDocs: DocumentSnapshot<DocumentData>[] = [];
  const chunkSize = 5;

  for (let i = 0; i < validClassIds.length; i += chunkSize) {
    const chunk = validClassIds.slice(i, i + chunkSize);
    const chunkDocs = await Promise.all(
      chunk.map((id: string) => getDocFromServer(doc(db, "classes", id)))
    );
    classDocs.push(...chunkDocs);
  }

  const classes = classDocs
    .filter((d) => d.exists())
    .map((d) => mapFirestoreClassDoc(d.id, d.data()!));

  if (validClassIds.length > 0 && classes.length === 0) {
    throw new Error("Lỗi tải lớp học từ bộ nhớ tạm. Đang thử lại...");
  }

  return classes;
};

/**
 * Tất cả lớp trong Firestore (cùng ý tưởng tab "Lớp khác" / full stories).
 * Dùng inbox presence để thấy HS/GV trên mọi lớp, không chỉ classIds trên user.
 */
export const getAllClasses = async (): Promise<IClass[]> => {
  try {
    const snaps = await getDocs(collection(db, CLASSES_COLLECTION));
    const list = snaps.docs.map((d) => mapFirestoreClassDoc(d.id, d.data()));
    return list.sort(
      (a, b) => (b.createdAt?.getTime() ?? 0) - (a.createdAt?.getTime() ?? 0)
    );
  } catch (e) {
    console.error("getAllClasses:", e);
    return [];
  }
};

export const updateClassLinks = async ({
  classId,
  links,
  noteProcess,
}: {
  classId: string;
  links: { zalo?: string; meet?: string };
  noteProcess?: string;
}) => {
  const classRef = doc(db, CLASSES_COLLECTION, classId);
  const updateData: {
    links: { zalo?: string; meet?: string };
    updatedAt: ReturnType<typeof serverTimestamp>;
    noteProcess?: string;
  } = {
    links: links,
    updatedAt: serverTimestamp(),
  };
  if (noteProcess !== undefined) {
    updateData.noteProcess = noteProcess;
  }
  await updateDoc(classRef, updateData);
};

export type CreateCurrencyRequestData = {
  studentId: string;
  studentName: string;
  teacherId: string;
  teacherName: string;
  classId: string;
  className: string;
  amount: number;
  reason: string;
};

export const createCurrencyRequest = async (
  requestData: CreateCurrencyRequestData
): Promise<void> => {
  try {
    const requestsCol = collection(db, "currencyRequests");
    await addDoc(requestsCol, {
      ...requestData,
      status: "pending",
      createdAt: serverTimestamp(),
    });
  } catch (error: unknown) {
    console.error("Error creating currency request:", error);
    const errorMessage =
      error instanceof Error ? error.message : "Không thể tạo yêu cầu. Vui lòng thử lại.";
    throw new Error(errorMessage);
  }
};

export const getLessonStudentProgress = async (
  classId: string,
  bookId: string,
  lessonId: string,
  members?: IClassMember[] // Optional: reuse cached members to avoid redundant query
): Promise<ILessonStudentProgress[]> => {
  const classMembers = members || await getClassMembers(classId);
  const students = classMembers.filter((m) => m.role === "student");
  if (students.length === 0) return [];

  const lessonIdNum = parseInt(lessonId, 10);

  // Đọc từ userBookProgress (gộp listening + speaking)
  const bookProgressRefs = students.map((s) =>
    doc(db, "userBookProgress", `${s.id}_${bookId}`)
  );
  const bookProgressSnaps = await Promise.all(
    bookProgressRefs.map((ref) => getDoc(ref))
  );

  return students.map((student, idx) => {
    const snap = bookProgressSnaps[idx];
    const lesson = snap?.exists()
      ? (snap.data() as BookProgress).lessons?.[lessonIdNum]
      : null;
    const data = snap?.exists() ? (snap.data() as BookProgress) : null;
    const hasSpeaking =
      (data?.completedLessonsSpeaking ?? []).includes(lessonIdNum) ||
      !!(lesson?.fileUrl ?? lesson?.lastSubmitted);

    return {
      studentId: student.id,
      studentName: student.name,
      studentAvatarUrl: student.avatarUrl,
      listenCount: lesson?.listenCount ?? 0,
      accuracy: 0,
      speakingSubmissionStatus: hasSpeaking ? "submitted" : "not-submitted",
      speakingSubmissionUrl: lesson?.fileUrl,
      speakingScore: lesson?.speakingScore,
    };
  });
};

export const getClassProgress = async (
  classId: string,
  members?: IClassMember[] // Optional: reuse cached members to avoid redundant query
): Promise<ILessonStudentProgress[]> => {
  if (!classId) return [];

  const classMembers = members || await getClassMembers(classId);
  const students = classMembers.filter((m) => m.role === "student");
  if (students.length === 0) return [];
  const studentIds = students.map((s) => s.id);

  // Đọc userBookProgress cho từng student (batch "in" query, max 10)
  const progressMap = new Map<
    string,
    { listenCount: number; accuracy: number; hasSpeaking: boolean; fileUrl?: string; speakingScore?: string | null }
  >();
  studentIds.forEach((id) =>
    progressMap.set(id, {
      listenCount: 0,
      accuracy: 0,
      hasSpeaking: false,
    })
  );

  for (let i = 0; i < studentIds.length; i += 10) {
    const batch = studentIds.slice(i, i + 10);
    const snap = await getDocs(
      query(
        collection(db, "userBookProgress"),
        where("userId", "in", batch)
      )
    );
    snap.docs.forEach((d) => {
      const data = d.data() as BookProgress;
      const uid = data.userId;
      const current = progressMap.get(uid);
      if (!current) return;

      let maxAcc = current.accuracy;
      let totalListen = current.listenCount;
      const lessons = data.lessons ?? {};
      Object.values(lessons).forEach((l) => {
        totalListen += l.listenCount ?? 0;
        const acc = 0;
        if (acc > maxAcc) maxAcc = acc;
      });

      const hasSpeaking =
        (data.completedLessonsSpeaking?.length ?? 0) > 0 ||
        Object.values(lessons).some((l) => l.fileUrl ?? l.lastSubmitted);

      const firstWithUrl = Object.values(lessons).find((l) => l.fileUrl);

      progressMap.set(uid, {
        listenCount: totalListen,
        accuracy: maxAcc,
        hasSpeaking: current.hasSpeaking || hasSpeaking,
        fileUrl: current.fileUrl ?? firstWithUrl?.fileUrl,
        speakingScore: firstWithUrl?.speakingScore ?? current.speakingScore,
      });
    });
  }

  return students.map((student) => {
    const p = progressMap.get(student.id) ?? {
      listenCount: 0,
      accuracy: 0,
      hasSpeaking: false,
    };
    return {
      studentId: student.id,
      studentName: student.name,
      studentAvatarUrl: student.avatarUrl,
      listenCount: p.listenCount,
      accuracy: p.accuracy,
      speakingSubmissionStatus: p.hasSpeaking ? "submitted" : "not-submitted",
      speakingSubmissionUrl: p.fileUrl,
      speakingScore: p.speakingScore,
    };
  });
};

// Get class activity data for the last 7 days
interface DailyDataPoint {
  date: string;
  count: number;
}

export interface ClassActivityData {
  speakingData: DailyDataPoint[];
  listeningData: DailyDataPoint[];
  quizData: DailyDataPoint[];
}

// Helper to process activity data from user documents
// Now reads from simple count fields: quizCount, listenCount, speakCount, grammarCount
const processActivityFromUsers = (
  users: Array<DocumentSnapshot<DocumentData>>,
  dateKeys: string[],
  fieldName: string
): DailyDataPoint[] => {
  const todayDateKey = dateKeys[dateKeys.length - 1]; // Last date key is today

  // Sum up counts from all users for today only
  let totalCount = 0;

  users.forEach((userDoc) => {
    const userData = userDoc.data();
    if (!userData) return;

    const count = typeof userData[fieldName] === "number" ? userData[fieldName] : 0;
    const lastUpdateDate = userData[`${fieldName}Date`] || "";

    // Only count if the last update was today
    if (lastUpdateDate === todayDateKey) {
      totalCount += count;
    }
  });

  // Return data for last 7 days, but only today has actual data
  return dateKeys.map((dateKey) => ({
    date: new Date(dateKey).toLocaleDateString("vi-VN", {
      day: "2-digit",
      month: "2-digit",
    }),
    count: dateKey === todayDateKey ? totalCount : 0,
  }));
};

export const getClassActivityData = async (
  classId: string,
  members?: IClassMember[] // Optional: reuse cached members to avoid redundant query
): Promise<ClassActivityData> => {
  try {
    // 1. Get all student members of the class (reuse cached if provided)
    const classMembers = members || await getClassMembers(classId);
    const students = classMembers.filter((m) => m.role === "student");

    if (students.length === 0) {
      // Return empty data if no students
      const emptyData: DailyDataPoint[] = [];
      for (let i = 6; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        emptyData.push({
          date: d.toLocaleDateString("vi-VN", {
            day: "2-digit",
            month: "2-digit",
          }),
          count: 0,
        });
      }
      return {
        speakingData: emptyData,
        listeningData: emptyData,
        quizData: emptyData,
      };
    }

    const studentIds = students.map((s) => s.id);

    // 2. Calculate date range (last 7 days) - generate date keys in YYYY-MM-DD format
    const today = new Date();
    const dateKeys: string[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const dateKey = d.toISOString().split("T")[0]; // YYYY-MM-DD
      dateKeys.push(dateKey);
    }

    // 3. Fetch user documents for all students
    // Note: Firestore "in" query limit is 10, so we need to batch if more than 10 students
    const batchSize = 10;
    const batches: string[][] = [];
    for (let i = 0; i < studentIds.length; i += batchSize) {
      batches.push(studentIds.slice(i, i + batchSize));
    }

    // Fetch all user documents in parallel batches
    const userDocsResults = await Promise.all(
      batches.map((batch) =>
        Promise.all(
          batch.map((studentId) => getDoc(doc(db, USERS_COLLECTION, studentId)))
        )
      )
    );

    // Flatten all user documents
    const allUserDocs = userDocsResults.flatMap((batch) => batch);

    // 4. Process activity data from user documents
    // Get counts from user document fields: quizCount, listenCount, speakCount, grammarCount
    const speakingData = processActivityFromUsers(
      allUserDocs.filter((doc) => doc.exists()),
      dateKeys,
      "speakCount"
    );

    const listeningData = processActivityFromUsers(
      allUserDocs.filter((doc) => doc.exists()),
      dateKeys,
      "listenCount"
    );

    const quizData = processActivityFromUsers(
      allUserDocs.filter((doc) => doc.exists()),
      dateKeys,
      "quizCount"
    );

    return {
      speakingData,
      listeningData,
      quizData,
    };
  } catch (error) {
    console.error("Error getting class activity data:", error);
    // Return empty data on error
    const emptyData: DailyDataPoint[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      emptyData.push({
        date: d.toLocaleDateString("vi-VN", {
          day: "2-digit",
          month: "2-digit",
        }),
        count: 0,
      });
    }
    return {
      speakingData: emptyData,
      listeningData: emptyData,
      quizData: emptyData,
    };
  }
};

// Get today's activity for each student in a class
export interface TodayStudentActivity {
  studentId: string;
  studentName: string;
  listeningCount: number; // Number of listening exercises done today
  quizCount: number; // Number of quiz submissions today
  speakingCount: number; // Number of speaking submissions today
  grammarCount: number; // Number of grammar views completed today
}

export const getTodayStudentActivity = async (
  classId: string,
  date: Date = new Date(),
  members?: IClassMember[] // Optional: reuse cached members to avoid redundant query
): Promise<TodayStudentActivity[]> => {
  try {
    // 1. Get all student members of the class (reuse cached if provided)
    const classMembers = members || await getClassMembers(classId);
    const students = classMembers.filter((m) => m.role === "student");

    if (students.length === 0) {
      return [];
    }

    const studentIds = students.map((s) => s.id);

    // 2. Get date key for selected date (YYYY-MM-DD format, Vietnam timezone)
    const selectedDateKey = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Ho_Chi_Minh",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(date);

    // 3. Fetch user documents for all students
    // Note: Firestore "in" query limit is 10, so we need to batch if more than 10 students
    const batchSize = 10;
    const batches: string[][] = [];
    for (let i = 0; i < studentIds.length; i += batchSize) {
      batches.push(studentIds.slice(i, i + batchSize));
    }

    // Fetch all user documents in parallel batches
    const userDocsResults = await Promise.all(
      batches.map((batch) =>
        Promise.all(
          batch.map((studentId) => getDoc(doc(db, USERS_COLLECTION, studentId)))
        )
      )
    );

    // Flatten all user documents
    const allUserDocs = userDocsResults.flatMap((batch) => batch);

    // 4. Read activity counts from user documents
    // Only count if the date field matches the selected date
    return students.map((student) => {
      const userDoc = allUserDocs.find((doc) => doc.id === student.id);

      if (!userDoc || !userDoc.exists()) {
        return {
          studentId: student.id,
          studentName: student.name,
          listeningCount: 0,
          quizCount: 0,
          speakingCount: 0,
          grammarCount: 0,
        };
      }

      const userData = userDoc.data();

      // Read counts and dates from user document
      const quizCount = typeof userData.quizCount === "number" ? userData.quizCount : 0;
      const quizDate = userData.quizDate || "";

      const listenCount = typeof userData.listenCount === "number" ? userData.listenCount : 0;
      const listenDate = userData.listenDate || "";

      const speakCount = typeof userData.speakCount === "number" ? userData.speakCount : 0;
      const speakDate = userData.speakDate || "";

      const grammarCount = typeof userData.grammarCount === "number" ? userData.grammarCount : 0;
      const grammarDate = userData.grammarDate || "";

      // Only count if the date matches the selected date
      return {
        studentId: student.id,
        studentName: student.name,
        listeningCount: listenDate === selectedDateKey ? listenCount : 0,
        quizCount: quizDate === selectedDateKey ? quizCount : 0,
        speakingCount: speakDate === selectedDateKey ? speakCount : 0,
        grammarCount: grammarDate === selectedDateKey ? grammarCount : 0,
      };
    });
  } catch (error) {
    console.error("Error getting today's student activity:", error);
    return [];
  }
};

export type WatchMediaType = "music" | "grammar" | "movie";

export interface WatchTrackingViewItem {
  topicId: string;
  topicName: string;
  exerciseNo: number;
  subNo?: number;
  exerciseTitle: string;
  watchedPercent: number;
  watchedAt: Date;
  videoUrl: string;
  durationSeconds?: number;
  isDishonest?: boolean;
  isCompleted?: boolean;
  actualWatchTime?: number;
  mediaType: WatchMediaType;
}

/** Dữ liệu watch_tracking theo học sinh (một doc / user trong collection watch_tracking). */
export interface StudentWatchTrackingData {
  studentId: string;
  studentName: string;
  views: WatchTrackingViewItem[];
}

/** @deprecated Dùng StudentWatchTrackingData — giữ alias tương thích. */
export type GrammarTrackingData = StudentWatchTrackingData;

function normalizeWatchMediaType(raw: unknown): WatchMediaType {
  if (raw === "music" || raw === "movie" || raw === "grammar") return raw;
  return "grammar";
}

function parseWatchTrackingItem(docData: Record<string, unknown>): WatchTrackingViewItem | null {
  if (!docData.last_heartbeat) return null;

  let watchedAt: Date;
  try {
    watchedAt = new Date(docData.last_heartbeat as string);
    if (Number.isNaN(watchedAt.getTime())) return null;
  } catch {
    return null;
  }

  const mediaType = normalizeWatchMediaType(docData.mediaType);
  const fallbackReq =
    mediaType === "music" ? 180 : mediaType === "grammar" ? 300 : 600;
  const durationSeconds =
    typeof docData.durationSeconds === "number" && docData.durationSeconds > 0
      ? docData.durationSeconds
      : fallbackReq;
  const actualWatchTime =
    typeof docData.total_watched_seconds === "number"
      ? docData.total_watched_seconds
      : 0;
  const watchedPercent = Math.min(
    100,
    (actualWatchTime / durationSeconds) * 100
  );

  return {
    topicId: (docData.topicId as string) || "",
    topicName: (docData.topicName as string) || "",
    exerciseNo: (docData.exerciseNo as number) || 1,
    subNo: docData.subNo as number | undefined,
    exerciseTitle: (docData.exerciseTitle as string) || "",
    videoUrl: (docData.video as string) || "",
    watchedPercent,
    watchedAt,
    durationSeconds,
    isDishonest: false,
    isCompleted: watchedPercent >= 70,
    actualWatchTime,
    mediaType,
  };
}

/** Lịch sử xem của một học sinh từ doc `watch_tracking/{userId}`. */
export const getStudentWatchTrackingViews = async (
  userId: string,
  options?: { mediaType?: WatchMediaType }
): Promise<WatchTrackingViewItem[]> => {
  if (!userId) return [];
  try {
    const snap = await getDoc(doc(db, "watch_tracking", userId));
    if (!snap.exists()) return [];

    const rawItems = snap.data().items as
      | Record<string, Record<string, unknown>>
      | undefined;
    if (!rawItems) return [];

    const views: WatchTrackingViewItem[] = [];
    for (const item of Object.values(rawItems)) {
      const parsed = parseWatchTrackingItem(item);
      if (!parsed) continue;
      if (options?.mediaType && parsed.mediaType !== options.mediaType) continue;
      views.push(parsed);
    }
    return views;
  } catch (error) {
    console.error("Error getting student watch tracking views:", error);
    return [];
  }
};

export interface GetClassWatchTrackingOptions {
  /** Chỉ lấy heartbeat trong ngày (VN). Bỏ qua = toàn bộ lịch sử. */
  date?: Date;
  /** Lọc theo loại nội dung phía server (tùy chọn). */
  mediaType?: WatchMediaType;
}

export const getClassWatchTrackingData = async (
  classId: string,
  options?: GetClassWatchTrackingOptions,
  members?: IClassMember[]
): Promise<StudentWatchTrackingData[]> => {
  try {
    const classMembers = members || (await getClassMembers(classId));
    const students = classMembers.filter((m) => m.role === "student");

    if (students.length === 0) {
      return [];
    }

    let selectedDateKey: string | null = null;
    if (options?.date) {
      selectedDateKey = new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Ho_Chi_Minh",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(options.date);
    }

    const studentIds = students.map((s) => s.id);
    const trackingSnaps = await Promise.all(
      studentIds.map((id) => getDoc(doc(db, "watch_tracking", id)))
    );

    const itemsByUser = new Map<string, Record<string, unknown>[]>();
    trackingSnaps.forEach((snap, idx) => {
      if (!snap.exists()) return;
      const data = snap.data();
      const items =
        data?.items && typeof data.items === "object"
          ? Object.values(data.items as Record<string, unknown>)
          : [];
      itemsByUser.set(studentIds[idx], items as Record<string, unknown>[]);
    });

    const result: StudentWatchTrackingData[] = [];

    students.forEach((student) => {
      const studentViews: WatchTrackingViewItem[] = [];
      const studentItems = itemsByUser.get(student.id) || [];

      studentItems.forEach((raw) => {
        const parsed = parseWatchTrackingItem(raw);
        if (!parsed) return;

        if (selectedDateKey) {
          const itemDateKey = new Intl.DateTimeFormat("en-CA", {
            timeZone: "Asia/Ho_Chi_Minh",
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
          }).format(parsed.watchedAt);
          if (itemDateKey !== selectedDateKey) return;
        }

        if (options?.mediaType && parsed.mediaType !== options.mediaType) {
          return;
        }

        studentViews.push(parsed);
      });

      studentViews.sort((a, b) => b.watchedAt.getTime() - a.watchedAt.getTime());

      result.push({
        studentId: student.id,
        studentName: student.name,
        views: studentViews,
      });
    });

    return result;
  } catch (error) {
    console.error("Error getting class watch tracking data:", error);
    return [];
  }
};

// Save grammar view interface
export interface SaveGrammarViewData {
  studentId: string;
  topicId: string;
  topicName: string;
  exerciseNo: number;
  subNo?: number;
  exerciseTitle: string;
  videoUrl: string;
  watchedPercent?: number; // Optional, default 0 if just clicked
  durationSeconds?: number; // Optional, only if actually watched
  isDishonest?: boolean; // Optional, whether student was dishonest (didn't respond to checkpoints)
  actualWatchTime?: number; // Optional, actual watch time in seconds (excluding seek time)
  /** Loại nội dung — phải truyền đúng để mốc tính % (fallback) không sai (vd: phim = 600s, không phải 300s). */
  mediaType?: WatchMediaType;
}

// Save grammar view to Firestore
export const saveGrammarView = async (
  data: SaveGrammarViewData
): Promise<void> => {
  try {
    if (!data.studentId || !data.videoUrl) {
      console.error("Missing required fields for grammar view");
      return;
    }

    // Save a 0-second heartbeat to register the view in watch_tracking
    await saveWatchHeartbeat({
      userId: data.studentId,
      videoUrl: data.videoUrl,
      watchedSeconds: 0,
      topicId: data.topicId,
      topicName: data.topicName,
      exerciseNo: data.exerciseNo,
      subNo: data.subNo ?? undefined,
      exerciseTitle: data.exerciseTitle,
      // Dùng đúng loại nội dung; mặc định "grammar" để tương thích nơi gọi cũ.
      mediaType: data.mediaType ?? "grammar",
    });
  } catch (error) {
    console.error("Error saving grammar view to watch_tracking:", error);
  }
};

/** Lịch sử xem theo ngày (tương thích code cũ). */
export const getGrammarTrackingData = async (
  classId: string,
  date: Date = new Date(),
  members?: IClassMember[]
): Promise<GrammarTrackingData[]> => {
  return getClassWatchTrackingData(classId, { date }, members);
};

export interface WatchHeartbeatData {
  userId: string;
  videoUrl: string;
  watchedSeconds: number;
  topicId?: string;
  topicName?: string;
  exerciseNo?: number;
  subNo?: number;
  exerciseTitle?: string;
  mediaType?: "music" | "grammar" | "movie";
  durationSeconds?: number;
  completionName?: string;
}

export interface SaveWatchHeartbeatResult {
  markedCompleted: boolean;
}

export const saveWatchHeartbeat = async (
  data: WatchHeartbeatData
): Promise<SaveWatchHeartbeatResult> => {
  try {
    if (!data.userId || !data.videoUrl) return { markedCompleted: false };

    // 1 doc / user: doc id = userId. Mỗi media là 1 key trong map `items`.
    const trackingRef = doc(db, "watch_tracking", data.userId);
    const itemKey = encodeURIComponent(data.videoUrl).replace(/\./g, "%2E");

    const baseItem: Record<string, unknown> = {
      last_heartbeat: new Date().toISOString(),
      video: data.videoUrl,
    };
    if (data.topicId !== undefined) baseItem.topicId = data.topicId;
    if (data.topicName !== undefined) baseItem.topicName = data.topicName;
    if (data.exerciseNo !== undefined) baseItem.exerciseNo = data.exerciseNo;
    if (data.subNo !== undefined) baseItem.subNo = data.subNo;
    if (data.exerciseTitle !== undefined) baseItem.exerciseTitle = data.exerciseTitle;
    if (data.mediaType !== undefined) baseItem.mediaType = data.mediaType;
    if (data.durationSeconds !== undefined) baseItem.durationSeconds = data.durationSeconds;

    if (data.watchedSeconds <= 0) {
      await setDoc(
        trackingRef,
        {
          userId: data.userId,
          items: { [itemKey]: { ...baseItem, total_watched_seconds: increment(0) } },
        },
        { merge: true }
      );
      return { markedCompleted: false };
    }

    let markedCompleted = false;

    await runTransaction(db, async (transaction) => {
      const trackingSnap = await transaction.get(trackingRef);
      const prevItem = trackingSnap.exists()
        ? ((trackingSnap.data().items as Record<string, { total_watched_seconds?: number }> | undefined)?.[itemKey])
        : undefined;
      const prevTotal = prevItem?.total_watched_seconds || 0;
      const newTotal = prevTotal + data.watchedSeconds;

      transaction.set(
        trackingRef,
        {
          userId: data.userId,
          items: { [itemKey]: { ...baseItem, total_watched_seconds: newTotal } },
        },
        { merge: true }
      );

      if (
        data.completionName &&
        data.durationSeconds &&
        data.durationSeconds > 0 &&
        newTotal > data.durationSeconds
      ) {
        const userRef = doc(db, USERS_COLLECTION, data.userId);
        transaction.update(userRef, {
          movies: arrayUnion(data.completionName),
        });
        markedCompleted = true;
      }
    });

    return { markedCompleted };
  } catch (error) {
    console.error("Error saving watch heartbeat to Firestore:", error);
    return { markedCompleted: false };
  }
};
