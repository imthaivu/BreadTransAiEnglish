import { db } from "@/lib/firebase/client";
import {
  doc,
  getDoc,
  updateDoc,
  serverTimestamp,
  deleteField,
  type FieldValue,
} from "firebase/firestore";
import type { IPendingSpeakingEvaluationEntry } from "@/modules/admin/type";
import { pendingSpeakingKey } from "../utils/pending-speaking";

const CLASSES_COLLECTION = "classes";
const USERS_COLLECTION = "users";

export async function getStudentClassIds(studentId: string): Promise<string[]> {
  if (!studentId) return [];
  const snap = await getDoc(doc(db, USERS_COLLECTION, studentId));
  if (!snap.exists()) return [];
  const classIds = snap.data()?.classIds;
  return Array.isArray(classIds) ? classIds.filter(Boolean) : [];
}

export type PendingEvaluationUpsert = Omit<
  IPendingSpeakingEvaluationEntry,
  "submittedAt"
> & {
  submittedAt?: IPendingSpeakingEvaluationEntry["submittedAt"];
};

export async function upsertPendingEvaluation(
  classIds: string[],
  entry: PendingEvaluationUpsert
): Promise<void> {
  const key = pendingSpeakingKey(entry.studentId, entry.bookId, entry.lessonId);
  const payload: IPendingSpeakingEvaluationEntry = {
    ...entry,
    submittedAt: entry.submittedAt ?? (serverTimestamp() as IPendingSpeakingEvaluationEntry["submittedAt"]),
  };

  const uniqueClassIds = Array.from(new Set(classIds.filter(Boolean)));
  if (uniqueClassIds.length === 0) return;

  await Promise.all(
    uniqueClassIds.map((classId) =>
      updateDoc(doc(db, CLASSES_COLLECTION, classId), {
        [`pendingEvaluations.${key}`]: payload,
        updatedAt: serverTimestamp(),
      })
    )
  );
}

export async function updatePendingEvaluationIssue(
  classIds: string[],
  studentId: string,
  bookId: string,
  lessonId: number,
  issueSpeaking: string
): Promise<void> {
  const key = pendingSpeakingKey(studentId, bookId, lessonId);
  const uniqueClassIds = Array.from(new Set(classIds.filter(Boolean)));
  if (uniqueClassIds.length === 0) return;

  await Promise.all(
    uniqueClassIds.map((classId) =>
      updateDoc(doc(db, CLASSES_COLLECTION, classId), {
        [`pendingEvaluations.${key}.issueSpeaking`]: issueSpeaking,
        updatedAt: serverTimestamp(),
      })
    )
  );
}

export async function removePendingEvaluation(
  classIds: string[],
  studentId: string,
  bookId: string,
  lessonId: number
): Promise<void> {
  const key = pendingSpeakingKey(studentId, bookId, lessonId);
  const uniqueClassIds = Array.from(new Set(classIds.filter(Boolean)));
  if (uniqueClassIds.length === 0) return;

  const deletePayload: Record<string, FieldValue> = {
    [`pendingEvaluations.${key}`]: deleteField(),
    updatedAt: serverTimestamp(),
  };

  await Promise.all(
    uniqueClassIds.map((classId) =>
      updateDoc(doc(db, CLASSES_COLLECTION, classId), deletePayload)
    )
  );
}

export async function removePendingEvaluationForStudent(
  studentId: string,
  bookId: string,
  lessonId: number
): Promise<void> {
  const classIds = await getStudentClassIds(studentId);
  await removePendingEvaluation(classIds, studentId, bookId, lessonId);
}
