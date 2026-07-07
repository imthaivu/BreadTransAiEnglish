import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";

const CLASSES_COLLECTION = "classes";
const USERS_COLLECTION = "users";

export function pendingSpeakingKeyServer(
  studentId: string,
  bookId: string,
  lessonId: number
): string {
  return `${studentId}_${bookId}_${lessonId}`;
}

async function getStudentClassIdsServer(studentId: string): Promise<string[]> {
  if (!studentId) return [];
  const snap = await adminDb().collection(USERS_COLLECTION).doc(studentId).get();
  if (!snap.exists) return [];
  const classIds = snap.data()?.classIds;
  return Array.isArray(classIds) ? classIds.filter(Boolean) : [];
}

export async function updatePendingEvaluationIssueServer(
  studentId: string,
  bookId: string,
  lessonId: number,
  issueSpeaking: string
): Promise<void> {
  const classIds = await getStudentClassIdsServer(studentId);
  if (classIds.length === 0) return;

  const key = pendingSpeakingKeyServer(studentId, bookId, lessonId);
  await Promise.all(
    classIds.map((classId) =>
      adminDb()
        .collection(CLASSES_COLLECTION)
        .doc(classId)
        .update({
          [`pendingEvaluations.${key}.issueSpeaking`]: issueSpeaking,
          updatedAt: FieldValue.serverTimestamp(),
        })
    )
  );
}
