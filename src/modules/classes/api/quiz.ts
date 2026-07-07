import { db } from "@/lib/firebase/client";
import {
  collection,
  doc,
  getDoc,
  Timestamp,
  runTransaction,
  serverTimestamp,
  FieldValue,
} from "firebase/firestore";
import { getClassMembers } from "../services";
import { IClassMember } from "@/types";
// Note: syncBookProgressFromQuizResults đã deprecated - không còn cần thiết
// Không còn sử dụng quizHistory
import { getLessonWords } from "@/modules/flashcard/services";
import { BookProgress } from "@/modules/flashcard/types";
import { clearQuizFieldsFromLesson } from "./quiz-delete-utils";

// --- Quiz Result Management Services ---

export interface ClassQuizResult {
  id: string; // Document ID: userId_bookId_lessonId
  userId: string;
  studentName: string;
  bookId: string;
  lessonId: number;
  score: number;
  totalWords: number;
  accuracy: number;
  lastAttempt: Date;
}

/**
 * Get BookProgress for all students in a class for a specific book
 * This is a shared function to avoid duplicate queries
 */
export const getClassBookProgressData = async (
  classId: string,
  bookId: string,
  members?: IClassMember[] // Optional: reuse cached members to avoid redundant query
): Promise<Map<string, BookProgress>> => {
  if (!classId || !bookId) return new Map();

  // 1. Get all student members of the class (reuse cached if provided)
  const classMembers = members || await getClassMembers(classId);
  const students = classMembers.filter((m) => m.role === "student");
  if (students.length === 0) return new Map();

  const studentIds = students.map((s) => s.id);
  const bookProgressMap = new Map<string, BookProgress>();

  // 2. Get BookProgress for each student
  const bookProgressCol = collection(db, "userBookProgress");
  
  // Query in batches due to Firestore "in" query limit of 10
  const batchSize = 10;
  for (let i = 0; i < studentIds.length; i += batchSize) {
    const batch = studentIds.slice(i, i + batchSize);
    
    // Get BookProgress documents for this batch
    const promises = batch.map(async (studentId) => {
      const bookProgressDocId = `${studentId}_${bookId}`;
      const bookProgressRef = doc(bookProgressCol, bookProgressDocId);
      const bookProgressDoc = await getDoc(bookProgressRef);
      
      if (bookProgressDoc.exists()) {
        const bookProgress = bookProgressDoc.data() as BookProgress;
        return { studentId, bookProgress };
      }
      return null;
    });

    const results = await Promise.all(promises);
    results.forEach((result) => {
      if (result) {
        bookProgressMap.set(result.studentId, result.bookProgress);
      }
    });
  }

  return bookProgressMap;
};

/**
 * Get all quiz results for a class in a specific book
 * Reads from userBookProgress collection (lessons object)
 * Now accepts cached bookProgressMap to avoid duplicate queries
 */
export const getClassQuizResults = async (
  classId: string,
  bookId: string,
  dateFilter?: Date | null,
  members?: IClassMember[], // Optional: reuse cached members to avoid redundant query
  cachedBookProgressMap?: Map<string, BookProgress> // Optional: reuse cached bookProgress to avoid duplicate query
): Promise<ClassQuizResult[]> => {
  if (!classId || !bookId) return [];

  // 1. Get all student members of the class (reuse cached if provided)
  const classMembers = members || await getClassMembers(classId);
  const students = classMembers.filter((m) => m.role === "student");
  if (students.length === 0) return [];

  const studentMap = new Map(students.map((s) => [s.id, s]));

  // 2. Get BookProgress - reuse cached if provided, otherwise query
  let bookProgressMap: Map<string, BookProgress>;
  if (cachedBookProgressMap) {
    bookProgressMap = cachedBookProgressMap;
  } else {
    bookProgressMap = await getClassBookProgressData(classId, bookId, members);
  }

  // 3. Extract quiz results from BookProgress
  const quizResults: ClassQuizResult[] = [];
  const lessonIds = new Set<number>();

  // Collect all lesson IDs first
  bookProgressMap.forEach((bookProgress) => {
    if (bookProgress.lessons) {
      Object.keys(bookProgress.lessons).forEach((lessonIdStr) => {
        const lessonId = parseInt(lessonIdStr, 10);
        if (!isNaN(lessonId)) {
          lessonIds.add(lessonId);
        }
      });
    }
  });

  // 4. Get totalWords for all lessons (batch)
  const allLessonIds = Array.from(lessonIds);
  const wordsByLesson = new Map<number, number>();
  if (allLessonIds.length > 0) {
    try {
      const words = await getLessonWords(bookId, allLessonIds);
      // Group words by lesson
      words.forEach((word) => {
        const count = wordsByLesson.get(word.lesson) || 0;
        wordsByLesson.set(word.lesson, count + 1);
      });
    } catch (error) {
      console.error("Error getting lesson words:", error);
      // Continue without totalWords - will use 0 or estimate
    }
  }

  // 5. Convert BookProgress lessons to ClassQuizResult
  bookProgressMap.forEach((bookProgress, studentId) => {
    const student = studentMap.get(studentId);
    if (!student || !bookProgress.lessons) return;

    Object.entries(bookProgress.lessons).forEach(([lessonIdStr, lessonData]) => {
      const lessonId = parseInt(lessonIdStr, 10);
      if (isNaN(lessonId) || !lessonData.lastAttempt) return;

      // Convert Timestamp to Date
      let lastAttempt: Date;
      if (lessonData.lastAttempt instanceof Timestamp) {
        lastAttempt = lessonData.lastAttempt.toDate();
      } else if (lessonData.lastAttempt && typeof (lessonData.lastAttempt as unknown as { toDate?: () => Date }).toDate === "function") {
        lastAttempt = (lessonData.lastAttempt as Timestamp).toDate();
      } else {
        return; // Skip if invalid timestamp
      }

      // Apply date filter if provided
      if (dateFilter) {
        const filterDate = new Date(dateFilter);
        filterDate.setHours(0, 0, 0, 0);
        const resultDate = new Date(lastAttempt);
        resultDate.setHours(0, 0, 0, 0);
        if (resultDate.getTime() !== filterDate.getTime()) {
          return; // Skip if doesn't match date filter
        }
      }

      const totalWords = wordsByLesson.get(lessonId) || 0;
      const accuracy = lessonData.lastAccuracy || 0;
      // Calculate score: accuracy * totalWords / 100 (rounded)
      const score = totalWords > 0 ? Math.round((accuracy * totalWords) / 100) : 0;

      const result: ClassQuizResult = {
        id: `${studentId}_${bookId}_${lessonId}`,
        userId: studentId,
        studentName: student.name,
        bookId,
        lessonId,
        score,
        totalWords,
        accuracy: Math.round(accuracy * 10) / 10, // Round to 1 decimal
        lastAttempt,
      };

      quizResults.push(result);
    });
  });

  // 6. Sort by lastAttempt descending (newest first)
  quizResults.sort((a, b) => b.lastAttempt.getTime() - a.lastAttempt.getTime());

  return quizResults;
};

/**
 * Delete quiz results by IDs
 * Xóa quiz results từ userBookProgress collection
 * Format của quizResultId: userId_bookId_lessonId
 */
export const deleteQuizResults = async (
  quizResultIds: string[]
): Promise<void> => {
  if (!quizResultIds || quizResultIds.length === 0) return;

  // Parse quiz result IDs to extract userId, bookId, lessonId
  // Format: userId_bookId_lessonId
  const lessonsToDelete = new Map<string, Map<number, string>>(); // Map<"userId_bookId", Map<lessonId, quizResultId>>
  
  quizResultIds.forEach((quizResultId) => {
    const parts = quizResultId.split("_");
    if (parts.length >= 3) {
      const userId = parts[0];
      const bookId = parts[1];
      const lessonId = parseInt(parts[2], 10);
      
      if (!isNaN(lessonId)) {
        const key = `${userId}_${bookId}`;
        if (!lessonsToDelete.has(key)) {
          lessonsToDelete.set(key, new Map());
        }
        lessonsToDelete.get(key)!.set(lessonId, quizResultId);
      }
    }
  });

  if (lessonsToDelete.size === 0) return;

  const bookProgressCol = collection(db, "userBookProgress");
  const nowServer = serverTimestamp();

  // Process each (userId, bookId) combination in a transaction
  const promises = Array.from(lessonsToDelete.entries()).map(async ([docKey, lessonMap]) => {
    const bookProgressDocId = docKey; // Format: userId_bookId
    const bookProgressRef = doc(bookProgressCol, bookProgressDocId);
    const lessonIds = Array.from(lessonMap.keys());

    try {
      await runTransaction(db, async (transaction) => {
        const bookProgressDoc = await transaction.get(bookProgressRef);
        
        if (!bookProgressDoc.exists()) {
          return; // Document doesn't exist, nothing to delete
        }

        const existing = bookProgressDoc.data() as BookProgress;
        
        type BookProgressWrite = Omit<BookProgress, "lastUpdated" | "lessons"> & {
          lastUpdated: Timestamp | FieldValue;
          lessons: { [lessonId: number]: BookProgress["lessons"][number] };
        };

        const bookProgress: BookProgressWrite = {
          ...existing,
          lastUpdated: nowServer,
          lessons: { ...existing.lessons },
          completedLessons: [...existing.completedLessons],
        };

        // Clear quiz fields only; preserve speaking/listening data in the same lesson entry
        lessonIds.forEach((lessonId) => {
          const existingLesson = bookProgress.lessons[lessonId];
          if (existingLesson) {
            const cleared = clearQuizFieldsFromLesson(existingLesson);
            if (cleared) {
              bookProgress.lessons[lessonId] = cleared;
            } else {
              delete bookProgress.lessons[lessonId];
            }
          }

          const completedIndex = bookProgress.completedLessons.indexOf(lessonId);
          if (completedIndex !== -1) {
            bookProgress.completedLessons.splice(completedIndex, 1);
          }
        });

        // Sort completedLessons array
        bookProgress.completedLessons.sort((a, b) => a - b);

        transaction.set(bookProgressRef, bookProgress);
      });
    } catch (error) {
      console.error(`Error deleting quiz results for ${docKey}:`, error);
      throw error;
    }
  });

  await Promise.all(promises);
};

/**
 * Delete all quiz results for a class in a specific book
 * Also updates lessonStatus for all students and all lessons in the book
 */
export const deleteClassQuizResultsByBook = async (
  classId: string,
  bookId: string,
  members?: IClassMember[] // Optional: reuse cached members to avoid redundant query
): Promise<void> => {
  if (!classId || !bookId) return;

  // 1. Get all students in the class (reuse cached if provided)
  const classMembers = members || await getClassMembers(classId);
  const students = classMembers.filter((m) => m.role === "student");
  if (students.length === 0) return;

  // 2. Get all quiz results for this class and book BEFORE deletion
  // This gives us the list of lessons that had quiz results
  const results = await getClassQuizResults(classId, bookId, null, classMembers);
  const resultIds = results.map((r) => r.id);

  // Extract unique lessonIds from quiz results
  const uniqueLessonIds = new Set<number>();
  results.forEach((result) => {
    uniqueLessonIds.add(result.lessonId);
  });

  // 3. Delete all quiz results
  if (resultIds.length > 0) {
    await deleteQuizResults(resultIds);
  }

  // Không còn quizHistory để xóa
};

/**
 * DEPRECATED: Function này không còn cần thiết
 * Không còn sử dụng quizHistory
 */
export const syncLessonStatusForBook = async (
  classId: string,
  bookId: string
): Promise<{ updated: number }> => {
  void classId;
  void bookId;
  // userBookProgress đã được tự động cập nhật khi save/delete quiz results
  // Không cần sync thêm
  return { updated: 0 };
};

/**
 * Get quiz result counts by date for students in a class
 * @deprecated - Không còn quizHistory
 */
export const getStudentQuizCountsByDate = async (
  classId: string,
  targetDate: Date
): Promise<Map<string, number>> => {
  void classId;
  void targetDate;
  // Không còn quizHistory
  return new Map();
};

/**
 * Get BookProgress for all students in a class for a specific book
 * Now uses the shared getClassBookProgressData function
 */
export const getClassBookProgress = async (
  classId: string,
  bookId: string,
  members?: IClassMember[] // Optional: reuse cached members to avoid redundant query
): Promise<Map<string, BookProgress>> => {
  return getClassBookProgressData(classId, bookId, members);
};

