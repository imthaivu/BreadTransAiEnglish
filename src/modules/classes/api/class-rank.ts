import { db } from "@/lib/firebase/client";
import { doc, getDoc, serverTimestamp, updateDoc } from "firebase/firestore";
import { getClassMembers } from "../services";
import {
  type ClassRankSnapshot,
  type ClassRankStudentEntry,
  type ClassStudentRankStats,
  parseClassRankFromData,
  studentsFromClassRank,
} from "../utils/class-rank";

const USERS_COLLECTION = "users";
const CLASSES_COLLECTION = "classes";

async function fetchStudentRankStats(
  studentId: string,
  fallbackName: string,
  fallbackAvatar?: string
): Promise<ClassStudentRankStats | null> {
  const snap = await getDoc(doc(db, USERS_COLLECTION, studentId));
  if (!snap.exists()) return null;
  const d = snap.data();
  return {
    id: studentId,
    displayName: (d.displayName as string) || fallbackName || "Học sinh",
    avatarUrl: (d.avatarUrl as string) || fallbackAvatar || "",
    countHeart: typeof d.countHeart === "number" ? d.countHeart : 0,
    timesVocabXS: typeof d.timesVocabXS === "number" ? d.timesVocabXS : 0,
    quizAccuracy: typeof d.quizAccuracy === "number" ? d.quizAccuracy : 50,
    speakingAccuracy:
      typeof d.speakingAccuracy === "number" ? d.speakingAccuracy : 50,
    streakCount: typeof d.streakCount === "number" ? d.streakCount : 0,
    totalBanhRan: typeof d.totalBanhRan === "number" ? d.totalBanhRan : 0,
  };
}

export async function fetchClassStudentRankStats(
  classId: string
): Promise<ClassStudentRankStats[]> {
  const members = await getClassMembers(classId);
  const students = members.filter((m) => m.role === "student");
  if (students.length === 0) return [];

  const batchSize = 10;
  const results: ClassStudentRankStats[] = [];

  for (let i = 0; i < students.length; i += batchSize) {
    const batch = students.slice(i, i + batchSize);
    const chunk = await Promise.all(
      batch.map((member) =>
        fetchStudentRankStats(member.id, member.name, member.avatarUrl)
      )
    );
    for (const row of chunk) {
      if (row) results.push(row);
    }
  }

  return results;
}

export async function getClassRank(
  classId: string
): Promise<ClassRankSnapshot | undefined> {
  const snap = await getDoc(doc(db, CLASSES_COLLECTION, classId));
  if (!snap.exists()) return undefined;
  return parseClassRankFromData(snap.data() as Record<string, unknown>);
}

/** Tải stats HS, ghi snapshot vào `classes/{classId}.rank`. */
export async function syncClassRank(
  classId: string
): Promise<ClassRankSnapshot> {
  const stats = await fetchClassStudentRankStats(classId);
  const students: Record<string, ClassRankStudentEntry> = {};
  for (const row of stats) {
    students[row.id] = { ...row };
  }

  const rankPayload = {
    updatedAt: serverTimestamp(),
    students,
  };

  await updateDoc(doc(db, CLASSES_COLLECTION, classId), { rank: rankPayload });

  return {
    updatedAt: new Date(),
    students,
  };
}

export { parseClassRankFromData, studentsFromClassRank };
