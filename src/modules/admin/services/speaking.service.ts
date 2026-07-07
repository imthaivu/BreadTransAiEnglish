import { db, storage } from "@/lib/firebase/client";
import { collection, getDocs } from "firebase/firestore";
import { deleteObject, ref } from "firebase/storage";
import { BookProgress } from "@/modules/flashcard/types";
import { extractStoragePathFromURL } from "@/utils/firebase-storage";

const BOOK_PROGRESS_COLLECTION = "userBookProgress";

/**
 * Get total count of speaking submissions (từ userBookProgress)
 */
export const getTotalSpeakingSubmissions = async (): Promise<number> => {
  try {
    const snapshot = await getDocs(collection(db, BOOK_PROGRESS_COLLECTION));
    let count = 0;
    snapshot.docs.forEach((d) => {
      const data = d.data() as BookProgress;
      const lessons = data.lessons ?? {};
      Object.values(lessons).forEach((l) => {
        if (l.fileUrl) count++;
      });
    });
    return count;
  } catch (error) {
    console.error("Error getting total speaking submissions:", error);
    throw error;
  }
};

/**
 * Delete audio file from storage.
 * submissionId format: studentId_bookId_lessonId
 */
export const deleteSpeakingAudioFile = async (
  submissionId: string,
  fileURL: string
): Promise<void> => {
  void submissionId;
  try {
    const storagePath = extractStoragePathFromURL(fileURL);
    if (!storagePath) {
      throw new Error(`Không thể trích xuất đường dẫn từ URL: ${fileURL}`);
    }

    const storageRef = ref(storage, storagePath);
    try {
      await deleteObject(storageRef);
    } catch (deleteError: unknown) {
      const error = deleteError as { code?: string };
      if (error?.code !== "storage/object-not-found") {
        throw deleteError;
      }
    }
    // Không cập nhật Firestore - record giữ nguyên, file đã xóa khỏi storage
  } catch (error) {
    console.error("Error deleting speaking audio file:", error);
    throw error;
  }
};

/**
 * Get all speaking submissions with fileURL - scan userBookProgress
 */
export const getAllSpeakingSubmissionsWithFiles = async (): Promise<
  Array<{ id: string; fileURL: string }>
> => {
  try {
    const snapshot = await getDocs(collection(db, BOOK_PROGRESS_COLLECTION));
    const results: Array<{ id: string; fileURL: string }> = [];

    snapshot.docs.forEach((d) => {
      const data = d.data() as BookProgress;
      const docId = d.id;
      const [studentId, ...bookIdParts] = docId.split("_");
      const bookId = bookIdParts.join("_");
      const lessons = data.lessons ?? {};

      Object.entries(lessons).forEach(([lessonIdStr, l]) => {
        if (l.fileUrl && l.fileUrl !== "") {
          results.push({
            id: `${studentId}_${bookId}_${lessonIdStr}`,
            fileURL: l.fileUrl,
          });
        }
      });
    });

    return results;
  } catch (error) {
    console.error("Error getting speaking submissions with files:", error);
    throw error;
  }
};

/**
 * Delete all audio files from storage but keep metadata in userBookProgress
 */
export const deleteAllSpeakingAudioFiles = async (): Promise<number> => {
  try {
    const submissions = await getAllSpeakingSubmissionsWithFiles();
    let deletedCount = 0;
    const errors: string[] = [];

    for (const submission of submissions) {
      try {
        await deleteSpeakingAudioFile(submission.id, submission.fileURL);
        deletedCount++;
      } catch (error) {
        const errorMsg = `Error deleting submission ${submission.id}: ${error instanceof Error ? error.message : "Unknown error"}`;
        errors.push(errorMsg);
        console.error(errorMsg);
      }
    }

    if (errors.length > 0) {
      console.warn(`Some deletions failed: ${errors.join(", ")}`);
    }

    return deletedCount;
  } catch (error) {
    console.error("Error deleting all speaking audio files:", error);
    throw error;
  }
};
