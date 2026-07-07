import { db } from "@/lib/firebase/client";
import {
  doc,
  runTransaction,
  serverTimestamp,
} from "firebase/firestore";
import { collection } from "firebase/firestore";

export interface SaveListeningProgressInput {
  studentId: string;
  module: string; // e.g., "streamline" | "lessons1000"
  itemKey: string; // e.g., bookId or composite key
  audioId: string; // e.g., lesson index + 1
  durationSeconds: number;
  maxProgressPercent: number; // 0..100
}

/**
 * Lưu listening progress vào userBookProgress.
 * Cập nhật lessons[lessonId].listenCount
 */
export async function saveListeningProgress(
  input: SaveListeningProgressInput
): Promise<void> {
  const { studentId, itemKey, audioId } = input;
  const lessonId = parseInt(audioId, 10);
  if (isNaN(lessonId)) return;

  const bookProgressDocId = `${studentId}_${itemKey}`;
  const bookProgressCol = collection(db, "userBookProgress");
  const bookProgressRef = doc(bookProgressCol, bookProgressDocId);

  await runTransaction(db, async (tx) => {
    const snap = await tx.get(bookProgressRef);
    const now = serverTimestamp();

    const existingData = snap.exists() ? snap.data() : null;
    const existingLessons = existingData?.lessons ?? {};
    const existingLesson = existingLessons[lessonId] ?? {};
    const prevListenCount = existingLesson.listenCount ?? 0;

    const nextListenCount = prevListenCount >= 3 ? prevListenCount : prevListenCount + 1;

    const updatedLessons = {
      ...existingLessons,
      [lessonId]: {
        ...existingLesson,
        listenCount: nextListenCount,
      },
    };

    const payload = {
      userId: studentId,
      bookId: itemKey,
      lessons: updatedLessons,
      completedLessons: existingData?.completedLessons ?? [],
      completedLessonsSpeaking: existingData?.completedLessonsSpeaking ?? [],
      lastUpdated: now,
    };

    tx.set(bookProgressRef, payload, { merge: true });
  });
}
