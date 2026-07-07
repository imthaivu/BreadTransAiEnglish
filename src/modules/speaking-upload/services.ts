import { auth, db, storage } from "@/lib/firebase/client";
import {
  doc,
  getDoc,
  runTransaction,
  serverTimestamp,
} from "firebase/firestore";
import { collection } from "firebase/firestore";
import { getDownloadURL, getMetadata, ref, uploadBytesResumable } from "firebase/storage";
import { normalizeSpeakingMimeType } from "./types";
import {
  getStudentClassIds,
  upsertPendingEvaluation,
  removePendingEvaluationForStudent,
} from "@/modules/classes/api/pending-speaking-sync";
// Uploads a speaking submission file to Firebase Storage and saves to userBookProgress.
export async function uploadSpeakingSubmission(
  file: File,
  studentId: string,
  studentName: string,
  bookId: string,
  lessonId: number,
  onProgress: (progress: number) => void,
  durationSeconds?: number
): Promise<string> {
  if (!file || !studentId || !bookId || !lessonId) {
    throw new Error("Invalid arguments for submission.");
  }

  const type = normalizeSpeakingMimeType(file.type, file.name);
  let ext = "webm";
  if (type.includes("mpeg") || type.includes("mp3")) ext = "mp3";
  else if (type.includes("ogg")) ext = "ogg";
  else if (type.includes("wav")) ext = "wav";
  else if (type.includes("mp4") || type.includes("m4a") || type.includes("aac")) {
    ext = "m4a";
  }

  // 1. Create a unique path in Firebase Storage
  const date = new Date();
  const dateStr = `${date.getDate()}-${String(date.getMonth() + 1).padStart(
    2,
    "0"
  )}-${date.getFullYear()}`;

  const storagePath = `speaking_submissions/${dateStr}/book-${bookId}/lesson-${lessonId}/student-${studentId}.${ext}`;
  const storageRef = ref(storage, storagePath);

  // 2. Upload the file with progress tracking
  const uploadTask = uploadBytesResumable(storageRef, file);

  const uploadPromise = new Promise<string>((resolve, reject) => {
    uploadTask.on(
      "state_changed",
      (snapshot) => {
        const progress =
          (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
        onProgress(progress);
      },
      (error) => {
        console.error("Upload failed:", error);
        reject(error);
      },
      async () => {
        try {
          // 3. Confirm the object exists and then get download URL.
          // This prevents writing userBookProgress for a missing/broken upload.
          await getMetadata(uploadTask.snapshot.ref);
          const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);

          // 4. Save to userBookProgress only after storage validation succeeds.
          const bookProgressDocId = `${studentId}_${bookId}`;
          const bookProgressCol = collection(db, "userBookProgress");
          const bookProgressRef = doc(bookProgressCol, bookProgressDocId);

          await runTransaction(db, async (tx) => {
            const snap = await tx.get(bookProgressRef);
            const now = serverTimestamp();
            const existingData = snap.exists() ? snap.data() : null;
            const existingLessons = existingData?.lessons ?? {};
            const existingLesson = existingLessons[lessonId] ?? {};
            const currentSpeakingCount =
              typeof existingLesson?.speakingCount === "number"
                ? existingLesson.speakingCount
                : 0;
            const completedLessonsSpeaking =
              existingData?.completedLessonsSpeaking ?? [];

            const updatedLessons = {
              ...existingLessons,
              [lessonId]: {
                ...existingLesson,
                fileUrl: downloadURL,
                originalFilename: file.name,
                lastSubmitted: now,
                speakingCount: currentSpeakingCount + 1,
                ...(durationSeconds != null &&
                  durationSeconds > 0 && { duration: durationSeconds }),
              },
            };

            let newCompletedSpeaking = completedLessonsSpeaking;
            if (!completedLessonsSpeaking.includes(lessonId)) {
              newCompletedSpeaking = [...completedLessonsSpeaking, lessonId].sort(
                (a, b) => a - b
              );
            }

            tx.set(
              bookProgressRef,
              {
                userId: studentId,
                bookId,
                lessons: updatedLessons,
                completedLessons: existingData?.completedLessons ?? [],
                completedLessonsSpeaking: newCompletedSpeaking,
                lastUpdated: now,
              },
              { merge: true }
            );
          });

          try {
            const classIds = await getStudentClassIds(studentId);
            const userSnap = await getDoc(doc(db, "users", studentId));
            const avatarUrl = userSnap.exists()
              ? (userSnap.data()?.avatarUrl as string | undefined)
              : undefined;
            await upsertPendingEvaluation(classIds, {
              studentId,
              studentName: studentName || "Học sinh",
              avatarUrl,
              bookId: String(bookId),
              lessonId,
              fileUrl: downloadURL,
              ...(durationSeconds != null &&
                durationSeconds > 0 && { duration: durationSeconds }),
            });
          } catch (syncError) {
            console.error("[uploadSpeakingSubmission] pendingEvaluations sync failed:", syncError);
          }

          resolve(downloadURL);
        } catch (error) {
          console.error("Upload finished but storage/firestore sync failed:", error);
          reject(error);
        }
      }
    );
  });

  return uploadPromise;
}

/** speakingId lưu trong admirationsMessage: `${bookId}_${lessonId}` */
export function parseSpeakingProgressId(
  speakingId: string
): { bookId: string; lessonId: number } | null {
  const m = speakingId.match(/^(.+)_(\d+)$/);
  if (!m) return null;
  const lessonId = Number(m[2]);
  if (!Number.isFinite(lessonId)) return null;
  return { bookId: m[1], lessonId };
}

async function requireEvaluateIdToken(): Promise<string> {
  const user = auth.currentUser;
  if (!user) {
    throw new Error("Vui lòng đăng nhập để chấm speaking.");
  }
  return user.getIdToken();
}

/**
 * Tên sách + id bài từ speakingId (chỉ đọc /data/books).
 * Trong admirationsMessage / Inbox: hiển thị id bài (lessonId), không dùng title từ scripts.
 */
export async function getSpeakingBookLessonMeta(
  speakingId: string
): Promise<{ bookName: string; lessonLabel: string } | null> {
  const parsed = parseSpeakingProgressId(speakingId);
  if (!parsed) return null;
  try {
    const bookRes = await fetch(`/data/books/book_${parsed.bookId}.json`);
    if (!bookRes.ok) return null;
    const book = (await bookRes.json()) as { name?: string };
    const bookName = book.name || `Sách ${parsed.bookId}`;
    const lessonLabel = String(parsed.lessonId);

    return { bookName, lessonLabel };
  } catch {
    return null;
  }
}

export async function evaluateSpeakingSubmission(
  file: File,
  bookId: string,
  lessonId: number,
  recordedDurationSeconds?: number,
  referenceDurationSeconds?: number
): Promise<string> {
  const formData = new FormData();
  formData.append("audio", file);
  formData.append("bookId", bookId);
  formData.append("lessonId", String(lessonId));
  if (recordedDurationSeconds != null && recordedDurationSeconds > 0) {
    formData.append("recordedDurationSeconds", String(recordedDurationSeconds));
  }
  if (referenceDurationSeconds != null && referenceDurationSeconds > 0) {
    formData.append("referenceDurationSeconds", String(referenceDurationSeconds));
  }

  const idToken = await requireEvaluateIdToken();
  const response = await fetch("/api/speaking/evaluate", {
    method: "POST",
    headers: { Authorization: `Bearer ${idToken}` },
    body: formData,
  });

  if (!response.ok) {
    let message = "Không thể chấm speaking.";
    try {
      const data = (await response.json()) as { error?: string };
      if (data?.error) message = data.error;
    } catch {
      // Ignore parse error and use fallback message
    }
    throw new Error(message);
  }

  const data = (await response.json()) as { issueSpeaking?: string };
  if (!data.issueSpeaking) {
    throw new Error("Không nhận được kết quả chấm speaking.");
  }

  return data.issueSpeaking;
}

export async function evaluateSpeakingSubmissionFromUrl(
  audioUrl: string,
  bookId: string,
  lessonId: number,
  recordedDurationSeconds?: number,
  referenceDurationSeconds?: number,
  audioMimeType?: string,
  studentId?: string
): Promise<{ issueSpeaking: string | null; queuedRetry: boolean; retryCount?: number }> {
  const formData = new FormData();
  formData.append("audioUrl", audioUrl);
  formData.append("bookId", bookId);
  formData.append("lessonId", String(lessonId));
  if (studentId) {
    formData.append("studentId", studentId);
  }
  if (audioMimeType) {
    formData.append("audioMimeType", audioMimeType);
  }
  if (recordedDurationSeconds != null && recordedDurationSeconds > 0) {
    formData.append("recordedDurationSeconds", String(recordedDurationSeconds));
  }
  if (referenceDurationSeconds != null && referenceDurationSeconds > 0) {
    formData.append("referenceDurationSeconds", String(referenceDurationSeconds));
  }

  const idToken = await requireEvaluateIdToken();
  const response = await fetch("/api/speaking/evaluate", {
    method: "POST",
    headers: { Authorization: `Bearer ${idToken}` },
    body: formData,
  });

  if (!response.ok) {
    let message = "Không thể chấm speaking.";
    try {
      const data = (await response.json()) as { error?: string };
      if (data?.error) message = data.error;
    } catch {
      // Ignore parse error and use fallback message
    }
    throw new Error(message);
  }

  const data = (await response.json()) as {
    issueSpeaking?: string;
    queuedRetry?: boolean;
    retryCount?: number;
  };
  if (data.queuedRetry) {
    return {
      issueSpeaking: data.issueSpeaking ?? null,
      queuedRetry: true,
      retryCount: data.retryCount,
    };
  }
  if (!data.issueSpeaking) {
    throw new Error("Không nhận được kết quả chấm speaking.");
  }

  return { issueSpeaking: data.issueSpeaking, queuedRetry: false };
}

export async function updateSpeakingIssue(
  studentId: string,
  bookId: string,
  lessonId: number,
  issueSpeaking: string | null
): Promise<void> {
  const bookProgressDocId = `${studentId}_${bookId}`;
  const bookProgressRef = doc(db, "userBookProgress", bookProgressDocId);

  await runTransaction(db, async (tx) => {
    const snap = await tx.get(bookProgressRef);
    if (!snap.exists()) return;

    const existingData = snap.data();
    const existingLessons = existingData.lessons ?? {};
    const existingLesson = existingLessons[lessonId] ?? {};
    const updatedLesson = { ...existingLesson };

    if (issueSpeaking === null) {
      updatedLesson.issueSpeaking = deleteField();
      updatedLesson.issueSpeakingAt = deleteField();
    } else {
      updatedLesson.issueSpeaking = issueSpeaking;
      updatedLesson.issueSpeakingAt = serverTimestamp();
    }

    tx.set(
      bookProgressRef,
      {
        lessons: {
          ...existingLessons,
          [lessonId]: updatedLesson,
        },
      },
      { merge: true }
    );
  });
}

export async function logSpeakingSubmissionAnomaly(
  studentId: string,
  bookId: string,
  lessonId: number,
  reason: string,
  details?: Record<string, string | number | boolean | null | undefined>,
  metadata?: {
    source?: "client" | "server";
    category?: "system" | "browser" | "security";
    suspicion?: "low" | "medium" | "high";
    blocked?: boolean;
    note?: string;
  }
): Promise<void> {
  const source = metadata?.source ?? "client";
  const category = metadata?.category ?? "system";
  const suspicion = metadata?.suspicion ?? "medium";
  const blocked = metadata?.blocked ?? true;
  const note = metadata?.note?.trim();
  const extras = details
    ? Object.entries(details)
        .filter(([, value]) => value !== undefined)
        .map(([key, value]) => `${key}=${String(value)}`)
        .join(" | ")
    : "";
  const prefix = [
    "[ABNORMAL_SUBMISSION]",
    `source=${source}`,
    `category=${category}`,
    `suspicion=${suspicion}`,
    `blocked=${blocked ? "true" : "false"}`,
  ].join(" ");
  const issueParts = [`${prefix} reason=${reason}`];
  if (note) issueParts.push(`note=${note}`);
  if (extras) issueParts.push(extras);
  const issue = issueParts.join(" | ");
  await updateSpeakingIssue(studentId, bookId, lessonId, issue);
}

// Checks if a speaking submission exists - reads from userBookProgress.
export async function checkSpeakingSubmission(
  studentId: string,
  bookId: string,
  lessonId: number
): Promise<boolean> {
  if (!studentId || !bookId || !lessonId) {
    return false;
  }

  try {
    const bookProgressDocId = `${studentId}_${bookId}`;
    const bookProgressRef = doc(db, "userBookProgress", bookProgressDocId);
    const docSnap = await getDoc(bookProgressRef);

    if (!docSnap.exists()) return false;

    const data = docSnap.data();
    const completedSpeaking = data.completedLessonsSpeaking ?? [];
    if (completedSpeaking.includes(lessonId)) return true;

    const lesson = data.lessons?.[lessonId];
    return !!(lesson?.fileUrl ?? lesson?.lastSubmitted);
  } catch (error) {
    console.error("Error checking speaking submission:", error);
    return false;
  }
}

import { deleteObject } from "firebase/storage";
import { deleteField } from "firebase/firestore";

// Deletes a speaking submission file from Firebase Storage and removes it from userBookProgress.
export async function deleteSpeakingSubmission(
  studentId: string,
  bookId: string,
  lessonId: number,
  fileUrl: string
): Promise<void> {
  if (!studentId || !bookId || !lessonId || !fileUrl) {
    throw new Error("Invalid arguments for deletion.");
  }

  try {
    // 1. Delete the file from Firebase Storage
    const fileRef = ref(storage, fileUrl);
    await deleteObject(fileRef);
  } catch (error) {
    console.warn("Storage file not found or could not be deleted:", error);
    // Continue with Firestore deletion even if storage deletion fails
  }

  // 2. Remove from userBookProgress
  const bookProgressDocId = `${studentId}_${bookId}`;
  const bookProgressCol = collection(db, "userBookProgress");
  const bookProgressRef = doc(bookProgressCol, bookProgressDocId);

  await runTransaction(db, async (tx) => {
    const snap = await tx.get(bookProgressRef);
    if (!snap.exists()) return;

    const existingData = snap.data();
    const existingLessons = existingData.lessons ?? {};
    const existingLesson = existingLessons[lessonId];

    // Only update if the lesson data exists
    if (!existingLesson) return;

    // Create a new lesson object with the speaking fields removed using deleteField()
    const updatedLesson = { ...existingLesson };
    updatedLesson.fileUrl = deleteField();
    updatedLesson.originalFilename = deleteField();
    updatedLesson.lastSubmitted = deleteField();
    updatedLesson.duration = deleteField();
    updatedLesson.issueSpeaking = deleteField();
    updatedLesson.issueSpeakingAt = deleteField();

    // Create the updated lessons object
    const updatedLessons = {
      ...existingLessons,
      [lessonId]: updatedLesson,
    };

    // If the lesson becomes completely empty, we can just delete the whole lesson object
    if (Object.keys(updatedLesson).length === 0) {
      delete updatedLessons[lessonId];
    }

    const completedLessonsSpeaking = existingData.completedLessonsSpeaking ?? [];
    const newCompletedSpeaking = completedLessonsSpeaking.filter((id: number) => id !== lessonId);

    tx.set(
      bookProgressRef,
      {
        lessons: updatedLessons,
        completedLessonsSpeaking: newCompletedSpeaking,
      },
      { merge: true }
    );
  });

  try {
    await removePendingEvaluationForStudent(studentId, String(bookId), lessonId);
  } catch (syncError) {
    console.error("[deleteSpeakingSubmission] pendingEvaluations sync failed:", syncError);
  }
}

// Update speaking score from teacher confirmation (numeric score string, 0-10)
export async function updateSpeakingScore(
  studentId: string,
  bookId: string,
  lessonId: number,
  speakingScore: string | null,
  rewardParams?: {
    teacherId: string;
    teacherName: string;
    teacherAvatarUrl?: string;
    classId: string;
    studentName: string;
  }
): Promise<void> {
  const bookProgressDocId = `${studentId}_${bookId}`;
  const bookProgressRef = doc(db, "userBookProgress", bookProgressDocId);
  const userRef = doc(db, "users", studentId);
  let shouldReward = false;
  const clampAccuracy = (value: number) => Math.max(0, Math.min(100, value));
  const roundToThree = (value: number) => Number(value.toFixed(3));
  const parseScore = (score: string | null): number | null => {
    if (!score) return null;
    const numeric = Number(score.replace(",", "."));
    if (!Number.isFinite(numeric)) return null;
    return Math.max(0, Math.min(10, numeric));
  };
  const computeSpeakingAccuracy = (current: number, score: number) => {
    if (score >= 9) return current + 0.05 * (100 - current);
    if (score >= 7) return current + 0.03 * (100 - current);
    if (score >= 5) return current;
    if (score >= 3) return current - 0.05 * current;
    return current - 0.1 * current;
  };

  await runTransaction(db, async (tx) => {
    const snap = await tx.get(bookProgressRef);
    if (!snap.exists()) return;

    const existingData = snap.data();
    const existingLessons = existingData.lessons ?? {};
    const existingLesson = existingLessons[lessonId] ?? {};
    const previousScore = existingLesson?.speakingScore ?? null;
    const userSnap = await tx.get(userRef);
    const rawAccuracy = userSnap.exists() ? userSnap.data()?.speakingAccuracy : undefined;
    const currentSpeakingAccuracy =
      typeof rawAccuracy === "number" && Number.isFinite(rawAccuracy) ? rawAccuracy : 50;

    const updatedLesson = { ...existingLesson };
    if (speakingScore === null) {
      updatedLesson.speakingScore = deleteField();
      updatedLesson.speakingScoreAt = deleteField();
    } else {
      updatedLesson.speakingScore = speakingScore;
      updatedLesson.speakingScoreAt = serverTimestamp();
    }
    const isFirstScoring = !!speakingScore && !previousScore;
    shouldReward = isFirstScoring;

    const updatedLessons = {
      ...existingLessons,
      [lessonId]: updatedLesson,
    };

    tx.set(
      bookProgressRef,
      {
        lessons: updatedLessons,
      },
      { merge: true }
    );

    const parsedScore = parseScore(speakingScore);
    if (parsedScore !== null && speakingScore !== previousScore) {
      const nextAccuracy = roundToThree(
        clampAccuracy(computeSpeakingAccuracy(currentSpeakingAccuracy, parsedScore))
      );
      tx.set(
        userRef,
        { speakingAccuracy: nextAccuracy },
        { merge: true }
      );
    }
  });

  // Handle reward logic outside transaction
  if (shouldReward && speakingScore && rewardParams) {
    const numericScore = Number(speakingScore.replace(",", "."));
    let rewardValue = 0;
    if (Number.isFinite(numericScore)) {
      if (numericScore >= 9) rewardValue = 5;
      else if (numericScore >= 7) rewardValue = 2;
      else if (numericScore >= 0) rewardValue = 1;
    }

    if (rewardValue > 0) {
      try {
        const speakingId = `${bookId}_${lessonId}`;
        const { appendAdmirationToUser } = await import("@/modules/classes/api/admiration");
        await appendAdmirationToUser(
          studentId,
          rewardParams.studentName,
          {
            fromStudentId: rewardParams.teacherId,
            name: rewardParams.teacherName,
            fromStudentAvatarUrl: rewardParams.teacherAvatarUrl,
            reactionType: "wow",
            value: 0,
            type: "speakingGrade",
            classId: rewardParams.classId,
            speakingId,
          }
        );
      } catch (error) {
        console.error("Error sending speaking grade admiration:", error);
      }
    }
  }

  if (speakingScore) {
    try {
      await removePendingEvaluationForStudent(studentId, String(bookId), lessonId);
    } catch (syncError) {
      console.error("[updateSpeakingScore] pendingEvaluations sync failed:", syncError);
    }
  }
}
