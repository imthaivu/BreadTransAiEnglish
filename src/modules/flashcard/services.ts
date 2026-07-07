import { db } from "@/lib/firebase/client";
import {
  Book,
  FlashcardBook,
  FlashcardIndex,
  FlashcardLesson,
  FlashcardWord,
  Word,
  QuizResult,
  LessonStatus,
  BookProgress,
  LessonProgress,
  DuobookSentence,
  DuobookTitle,
} from "./types";
import {
  collection,
  doc,
  getDoc,
  runTransaction,
  serverTimestamp,
  FieldValue,
  Timestamp,
  increment,
} from "firebase/firestore";

export async function getBooks(): Promise<Book[]> {
  const res = await fetch("/data/books/books.json");
  if (!res.ok) throw new Error("Failed to fetch books");
  return res.json();
}

export async function getBook(bookId: string): Promise<Book> {
  const res = await fetch(`/data/books/book_${bookId}.json`);
  if (!res.ok) throw new Error("Failed to fetch book");
  return res.json();
}

export async function getLessonWords(
  bookId: string,
  lessonId: number[]
): Promise<Word[]> {
  const res = await fetch(`/data/books/book_${bookId}.json`);
  if (!res.ok) throw new Error("Failed to fetch lesson words");

  const data: Book = await res.json();
  if (!data.lessons) throw new Error("Failed to fetch lesson words");

  const lessons = data.lessons.filter((lesson) => lessonId.includes(lesson.id));
  if (lessons.length === 0) throw new Error("No lessons found");

  const lessonWords = lessons.map((lesson) => lesson.words).flat();
  if (!lessonWords) throw new Error("Failed to fetch lesson words");

  return lessonWords;
}

/**
 * Lấy các câu (script + mean) của các lesson đã chọn từ duobook.
 * Quy ước: title thứ N (theo thứ tự mảng) ứng với lesson N => data[lessonId - 1].
 * Trả về mảng rỗng nếu sách không có file duobook (vd Book 1-4).
 */
/** Một bài (title) trong duobook theo lessonId (1-based index vào mảng JSON). */
export async function getDuobookLesson(
  bookId: string,
  lessonId: number
): Promise<DuobookTitle | null> {
  if (!bookId || !Number.isFinite(lessonId) || lessonId <= 0) return null;

  try {
    const res = await fetch(`/data/duobooks/book_${bookId}.json`);
    if (!res.ok) return null;
    const data = (await res.json()) as DuobookTitle[];
    if (!Array.isArray(data)) return null;
    const title = data[lessonId - 1];
    if (!title || !Array.isArray(title.script) || !Array.isArray(title.mean)) {
      return null;
    }
    return title;
  } catch {
    return null;
  }
}

export async function getDuobookSentences(
  bookId: string,
  lessonIds: number[]
): Promise<DuobookSentence[]> {
  if (!bookId || lessonIds.length === 0) return [];

  let data: DuobookTitle[];
  try {
    const res = await fetch(`/data/duobooks/book_${bookId}.json`);
    if (!res.ok) return [];
    data = await res.json();
  } catch {
    return [];
  }

  if (!Array.isArray(data)) return [];

  const sentences: DuobookSentence[] = [];
  for (const lessonId of lessonIds) {
    const title = data[lessonId - 1];
    if (!title || !Array.isArray(title.script) || !Array.isArray(title.mean)) {
      continue;
    }
    const count = Math.min(title.script.length, title.mean.length);
    for (let i = 0; i < count; i++) {
      const script = (title.script[i] ?? "").trim();
      const mean = (title.mean[i] ?? "").trim();
      if (script && mean) {
        sentences.push({ script, mean, lesson: lessonId });
      }
    }
  }

  return sentences;
}

// API Helper cho Flashcard
export const flashcardAPI = {
  // Lấy danh sách tất cả sách
  async getBooks(): Promise<FlashcardBook[]> {
    const response = await fetch("/data/flashcard/index.json");
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const data: FlashcardIndex = await response.json();
    return data.books;
  },

  // Lấy thông tin chi tiết của một sách
  async getBook(bookId: number): Promise<FlashcardBook | undefined> {
    const books = await this.getBooks();
    return books.find((book) => book.id === bookId);
  },

  // Lấy danh sách lessons của một sách
  async getBookLessons(bookId: number): Promise<number[]> {
    const book = await this.getBook(bookId);
    return book ? book.lessons : [];
  },

  // Lấy từ vựng của một lesson cụ thể
  async getLessonWords(
    bookId: number,
    lessonId: number
  ): Promise<FlashcardWord[]> {
    const response = await fetch(
      `/data/flashcard/book_${bookId}_lesson_${lessonId}.json`
    );
    const data: FlashcardLesson = await response.json();

    return data.words;
  },

  // Lấy từ vựng của nhiều lessons
  async getMultipleLessonsWords(
    bookId: number,
    lessonIds: number[]
  ): Promise<FlashcardWord[]> {
    const promises = lessonIds.map((lessonId) =>
      this.getLessonWords(bookId, lessonId)
    );
    const results = await Promise.all(promises);
    return results.flat();
  },

  // Tìm kiếm từ vựng
  async searchWords(query: string): Promise<
    Array<{
      book: number;
      lesson: number;
      words: FlashcardWord[];
    }>
  > {
    const books = await this.getBooks();
    const results: Array<{
      book: number;
      lesson: number;
      words: FlashcardWord[];
    }> = [];

    for (const book of books) {
      for (const lessonId of book.lessons) {
        const words = await this.getLessonWords(book.id, lessonId);
        const filteredWords = words.filter(
          (word) =>
            word.word.toLowerCase().includes(query.toLowerCase()) ||
            word.mean.toLowerCase().includes(query.toLowerCase())
        );

        if (filteredWords.length > 0) {
          results.push({
            book: book.id,
            lesson: lessonId,
            words: filteredWords,
          });
        }
      }
    }

    return results;
  },

  // Lấy thống kê tổng quan
  async getStats(): Promise<FlashcardIndex> {
    const response = await fetch("/data/flashcard/index.json");
    return await response.json();
  },
};

// =================================================================
// Review Words Services - LocalStorage Implementation
// =================================================================

// Storage key pattern: reviewWords_{userId}
const getStorageKey = (userId: string) => `reviewWords_${userId}`;

/**
 * Lấy tất cả các từ cần ôn của người dùng từ localStorage
 */
export async function getReviewWords(userId: string): Promise<Word[]> {
  if (!userId || typeof window === "undefined") return [];

  try {
    const storageKey = getStorageKey(userId);
    const stored = localStorage.getItem(storageKey);
    if (!stored) return [];

    const data = JSON.parse(stored);
    // Convert từ object với key là word thành array
    if (typeof data === "object" && !Array.isArray(data)) {
      return Object.values(data) as Word[];
    }
    return Array.isArray(data) ? data : [];
  } catch (e) {
    console.error("Error reading review words from localStorage:", e);
    return [];
  }
}

/**
 * Thêm một từ vào danh sách ôn tập hoặc reset needReview nếu đã tồn tại
 * @param needReview - Số lần cần ôn (mặc định 3 cho quiz sai, 1 cho flashcard)
 */
export async function addOrUpdateReviewWord(userId: string, word: Word, needReview: number = 3) {
  if (!userId || typeof window === "undefined") return;

  try {
    const storageKey = getStorageKey(userId);
    const stored = localStorage.getItem(storageKey);
    const reviewWords: Record<string, Word & { needReview: number }> = stored
      ? JSON.parse(stored)
      : {};

    reviewWords[word.word] = { ...word, needReview };
    localStorage.setItem(storageKey, JSON.stringify(reviewWords));
  } catch (e) {
    console.error("Error adding review word to localStorage:", e);
  }
}

/**
 * Giảm số lần cần ôn của một từ. Nếu về 0 thì xóa.
 */
export async function decreaseReviewCount(userId: string, word: Word) {
  if (!userId || typeof window === "undefined") return;

  try {
    const storageKey = getStorageKey(userId);
    const stored = localStorage.getItem(storageKey);
    if (!stored) return;

    const reviewWords: Record<string, Word & { needReview: number }> = JSON.parse(stored);
    const existingWord = reviewWords[word.word];

    if (!existingWord) return;

    if (existingWord.needReview > 1) {
      reviewWords[word.word] = { ...existingWord, needReview: existingWord.needReview - 1 };
    } else {
      delete reviewWords[word.word];
    }

    localStorage.setItem(storageKey, JSON.stringify(reviewWords));
  } catch (e) {
    console.error("Error decreasing review count in localStorage:", e);
  }
}

/**
 * Batch thêm/update nhiều từ vào review words cùng lúc
 * Tối ưu: Giảm số lượng writes bằng cách batch
 * @param needReview - Số lần cần ôn (mặc định 3 cho quiz sai, 1 cho flashcard)
 */
export async function batchAddOrUpdateReviewWords(userId: string, words: Word[], needReview: number = 3) {
  if (!userId || words.length === 0 || typeof window === "undefined") return;

  try {
    const storageKey = getStorageKey(userId);
    const stored = localStorage.getItem(storageKey);
    const reviewWords: Record<string, Word & { needReview: number }> = stored
      ? JSON.parse(stored)
      : {};

    words.forEach((word) => {
      reviewWords[word.word] = { ...word, needReview };
    });

    localStorage.setItem(storageKey, JSON.stringify(reviewWords));
  } catch (e) {
    console.error("Batch add review words failed: ", e);
    throw e;
  }
}

/**
 * Batch giảm số lần cần ôn của nhiều từ cùng lúc
 * Tối ưu: Sử dụng localStorage để đọc và update tất cả trong một lần
 */
export async function batchDecreaseReviewCounts(userId: string, words: Word[]) {
  if (!userId || words.length === 0 || typeof window === "undefined") return;

  try {
    const storageKey = getStorageKey(userId);
    const stored = localStorage.getItem(storageKey);
    if (!stored) return;

    const reviewWords: Record<string, Word & { needReview: number }> = JSON.parse(stored);

    words.forEach((word) => {
      const existingWord = reviewWords[word.word];
      if (existingWord) {
        if (existingWord.needReview > 1) {
          reviewWords[word.word] = { ...existingWord, needReview: existingWord.needReview - 1 };
        } else {
          delete reviewWords[word.word];
        }
      }
    });

    localStorage.setItem(storageKey, JSON.stringify(reviewWords));
  } catch (e) {
    console.error("Batch decrease review counts failed: ", e);
    throw e;
  }
}

/**
 * Xóa tất cả các từ cần ôn của người dùng
 */
export async function deleteAllReviewWords(userId: string): Promise<void> {
  if (!userId || typeof window === "undefined") return;

  try {
    const storageKey = getStorageKey(userId);
    localStorage.removeItem(storageKey);
  } catch (e) {
    console.error("Error deleting all review words: ", e);
    throw e;
  }
}

// =================================================================
// Lesson Status Services
// =================================================================

const bookProgressCol = collection(db, "userBookProgress");

const clampAccuracy = (value: number) => Math.max(0, Math.min(100, value));
const roundToThree = (value: number) => Number(value.toFixed(3));
const computeNextQuizAccuracy = (current: number, lessonAccuracy: number) =>
  (current * 20 + lessonAccuracy) / 21;

/**
 * Cập nhật trạng thái lesson với điểm mới nhất.
 * Tối ưu: Chỉ update userBookProgress, bỏ userLessonStatus để giảm writes.
 * Luôn cập nhật với điểm mới nhất, không cần điểm cao hơn mới cập nhật.
 */
export async function updateLessonStatus(
  statusData: Omit<LessonStatus, "lastAttempt">
) {
  const { userId, bookId, lessonId } = statusData;
  if (!userId || !bookId || !lessonId) return;

  const now = serverTimestamp();

  // Chỉ update aggregated book progress (tối ưu - bỏ userLessonStatus)
  await updateBookProgress(statusData, now);
}

/**
 * Cập nhật userBookProgress với quiz result và lesson status trong cùng 1 transaction
 * Tối ưu: Chỉ cần 1 transaction thay vì 2 transactions riêng biệt
 * Update lesson status vào userBookProgress.lessons[lessonId]
 */
export async function updateBookProgressWithQuizResult(
  resultData: Omit<QuizResult, "lastAttempt">,
  statusData: Omit<LessonStatus, "lastAttempt">
) {
  void statusData;
  const { userId, bookId, lessonId, accuracy } = resultData;
  if (!userId || !bookId || !lessonId) return;

  const nowServer = serverTimestamp();
  const isCompleted = accuracy >= 90;

  // Update userBookProgress với quiz result và lesson status trong cùng 1 transaction
  const bookProgressDocId = `${userId}_${bookId}`;
  const bookProgressRef = doc(bookProgressCol, bookProgressDocId);
  const userRef = doc(db, "users", userId);

  try {
    await runTransaction(db, async (transaction) => {
      const bookProgressDoc = await transaction.get(bookProgressRef);
      const userSnap = await transaction.get(userRef);

      type LessonProgressWrite = Omit<LessonProgress, "lastAttempt"> & { lastAttempt?: Timestamp | FieldValue };
      type BookProgressWrite = Omit<BookProgress, "lastUpdated" | "lessons"> & {
        lastUpdated: Timestamp | FieldValue;
        lessons: { [lessonId: number]: LessonProgressWrite };
      };

      let bookProgress: BookProgressWrite;

      if (bookProgressDoc.exists()) {
        const existing = bookProgressDoc.data() as BookProgress;
        bookProgress = {
          ...existing,
          completedLessonsSpeaking: existing.completedLessonsSpeaking ?? [],
          lastUpdated: nowServer,
          lessons: { ...existing.lessons },
        };
      } else {
        bookProgress = {
          userId,
          bookId,
          lessons: {},
          completedLessons: [],
          completedLessonsSpeaking: [],
          lastUpdated: nowServer,
        };
      }

      // Get existing accuracy if lesson already exists
      const existingLesson = bookProgress.lessons[lessonId];
      const existingAccuracy = existingLesson?.lastAccuracy ?? 0;
      const isFirstAttempt = !existingLesson;
      const reachedXSNow = accuracy >= 95 && existingAccuracy < 95;
      const baseLesson = { ...existingLesson };

      bookProgress.lessons[lessonId] = {
        ...baseLesson,
        lastAccuracy: accuracy || 0,
        lastAttempt: nowServer,
      };

      // Update completedLessons array based on accuracy >= 90
      // If lesson was already completed, never remove it from completedLessons
      const completedIndex = bookProgress.completedLessons.indexOf(lessonId);
      if (isCompleted && completedIndex === -1) {
        // Add to completed list if accuracy >= 90 and not already there
        bookProgress.completedLessons.push(lessonId);
        bookProgress.completedLessons.sort((a, b) => a - b);
      }
      // Don't remove from completedLessons if it was already completed
      // This ensures that once a lesson is completed, it stays completed even if accuracy drops

      bookProgress.lastUpdated = nowServer;

      transaction.set(bookProgressRef, bookProgress);
      const rawQuizAccuracy = userSnap.exists() ? userSnap.data()?.quizAccuracy : undefined;
      const currentQuizAccuracy =
        typeof rawQuizAccuracy === "number" && Number.isFinite(rawQuizAccuracy)
          ? rawQuizAccuracy
          : 50;
      const nextQuizAccuracy = roundToThree(
        clampAccuracy(computeNextQuizAccuracy(currentQuizAccuracy, accuracy))
      );

      const userStatsUpdates: Record<string, unknown> = { quizAccuracy: nextQuizAccuracy };
      if (isFirstAttempt) {
        userStatsUpdates.timesVocab = increment(1);
      }
      if (reachedXSNow) {
        userStatsUpdates.timesVocabXS = increment(1);
      }
      transaction.set(userRef, userStatsUpdates, { merge: true });
    });
  } catch (error) {
    console.error("Error updating book progress with quiz result:", error);
    throw error;
  }
}

/**
 * Sync BookProgress từ quizHistory (đã có sẵn trong userBookProgress)
 * @deprecated - Function này không còn cần thiết
 */
export async function syncBookProgressFromQuizResults(
  userId: string,
  bookId: string
): Promise<void> {
  void userId;
  void bookId;
  // Deprecated - không còn sử dụng quizHistory
  return;
}

/**
 * Cập nhật BookProgress - document tổng hợp để tối ưu query
 * Chỉ cần đọc 1 document thay vì nhiều documents
 */
async function updateBookProgress(
  statusData: Omit<LessonStatus, "lastAttempt">,
  timestamp: FieldValue
) {
  const { userId, bookId, lessonId, lastAccuracy } = statusData;
  if (!userId || !bookId || !lessonId) return;

  const isCompleted = lastAccuracy >= 90;
  const bookProgressDocId = `${userId}_${bookId}`;
  const bookProgressRef = doc(bookProgressCol, bookProgressDocId);
  const userRef = doc(db, "users", userId);

  try {
    await runTransaction(db, async (transaction) => {
      const bookProgressDoc = await transaction.get(bookProgressRef);
      const userSnap = await transaction.get(userRef);

      type LessonProgressWrite = Omit<LessonProgress, "lastAttempt"> & { lastAttempt?: Timestamp | FieldValue };
      type BookProgressWrite = Omit<BookProgress, "lastUpdated" | "lessons"> & {
        lastUpdated: Timestamp | FieldValue;
        lessons: { [lessonId: number]: LessonProgressWrite };
      };

      let bookProgress: BookProgressWrite;

      if (bookProgressDoc.exists()) {
        const existing = bookProgressDoc.data() as BookProgress;
        bookProgress = {
          ...existing,
          completedLessonsSpeaking: existing.completedLessonsSpeaking ?? [],
          lastUpdated: timestamp,
          lessons: { ...existing.lessons },
        };
      } else {
        bookProgress = {
          userId,
          bookId,
          lessons: {},
          completedLessons: [],
          completedLessonsSpeaking: [],
          lastUpdated: timestamp,
        };
      }

      // Get existing accuracy if lesson already exists
      const existingLesson = bookProgress.lessons[lessonId];
      const existingAccuracy = existingLesson?.lastAccuracy ?? 0;
      const isFirstAttempt = !existingLesson;
      const reachedXSNow = lastAccuracy >= 95 && existingAccuracy < 95;
      const baseLesson = { ...existingLesson };

      bookProgress.lessons[lessonId] = {
        ...baseLesson,
        lastAccuracy,
        lastAttempt: timestamp,
      };

      // Update completedLessons array based on accuracy >= 90
      // If lesson was already completed, never remove it from completedLessons
      const completedIndex = bookProgress.completedLessons.indexOf(lessonId);
      if (isCompleted && completedIndex === -1) {
        // Add to completed list if accuracy >= 90 and not already there
        bookProgress.completedLessons.push(lessonId);
        bookProgress.completedLessons.sort((a, b) => a - b);
      }
      // Don't remove from completedLessons if it was already completed
      // This ensures that once a lesson is completed, it stays completed even if accuracy drops

      bookProgress.lastUpdated = timestamp;

      transaction.set(bookProgressRef, bookProgress);
      const rawQuizAccuracy = userSnap.exists() ? userSnap.data()?.quizAccuracy : undefined;
      const currentQuizAccuracy =
        typeof rawQuizAccuracy === "number" && Number.isFinite(rawQuizAccuracy)
          ? rawQuizAccuracy
          : 50;
      const nextQuizAccuracy = roundToThree(
        clampAccuracy(computeNextQuizAccuracy(currentQuizAccuracy, lastAccuracy))
      );

      const userStatsUpdates: Record<string, unknown> = { quizAccuracy: nextQuizAccuracy };
      if (isFirstAttempt) {
        userStatsUpdates.timesVocab = increment(1);
      }
      if (reachedXSNow) {
        userStatsUpdates.timesVocabXS = increment(1);
      }
      transaction.set(userRef, userStatsUpdates, { merge: true });
    });
  } catch (error) {
    console.error("Error updating book progress:", error);
    // Don't throw - individual lesson status is already updated
  }
}

/**
 * Batch update BookProgress cho nhiều lessons cùng lúc
 * Tối ưu khi cần update nhiều lessons trong cùng một book
 * @param userId - User ID
 * @param bookId - Book ID
 * @param statusUpdates - Array of lesson status updates
 */
export async function batchUpdateBookProgress(
  userId: string,
  bookId: string,
  statusUpdates: Array<{
    lessonId: number;
    lastAccuracy: number;
  }>
): Promise<void> {
  if (!userId || !bookId || statusUpdates.length === 0) return;

  const bookProgressDocId = `${userId}_${bookId}`;
  const bookProgressRef = doc(bookProgressCol, bookProgressDocId);
  const timestamp = serverTimestamp();

  try {
    await runTransaction(db, async (transaction) => {
      const bookProgressDoc = await transaction.get(bookProgressRef);

      type LessonProgressWrite = Omit<LessonProgress, "lastAttempt"> & { lastAttempt?: Timestamp | FieldValue };
      type BookProgressWrite = Omit<BookProgress, "lastUpdated" | "lessons"> & {
        lastUpdated: Timestamp | FieldValue;
        lessons: { [lessonId: number]: LessonProgressWrite };
      };

      let bookProgress: BookProgressWrite;

      if (bookProgressDoc.exists()) {
        const existing = bookProgressDoc.data() as BookProgress;
        bookProgress = {
          ...existing,
          completedLessonsSpeaking: existing.completedLessonsSpeaking ?? [],
          lastUpdated: timestamp,
          lessons: { ...existing.lessons },
        };
      } else {
        bookProgress = {
          userId,
          bookId,
          lessons: {},
          completedLessons: [],
          completedLessonsSpeaking: [],
          lastUpdated: timestamp,
        };
      }
      if (!bookProgress.completedLessonsSpeaking) {
        bookProgress.completedLessonsSpeaking = [];
      }

      // Update all lessons in batch
      statusUpdates.forEach(({ lessonId, lastAccuracy }) => {
        const isCompleted = lastAccuracy >= 90;
        const existingLesson = bookProgress.lessons[lessonId];
        const baseLesson = { ...existingLesson };

        bookProgress.lessons[lessonId] = {
          ...baseLesson,
          lastAccuracy,
          lastAttempt: timestamp,
        };

        // Update completedLessons array based on accuracy >= 90
        // If lesson was already completed, never remove it from completedLessons
        const completedIndex = bookProgress.completedLessons.indexOf(lessonId);
        if (isCompleted && completedIndex === -1) {
          // Add to completed list if accuracy >= 90 and not already there
          bookProgress.completedLessons.push(lessonId);
        }
        // Don't remove from completedLessons if it was already completed
        // This ensures that once a lesson is completed, it stays completed even if accuracy drops
      });

      // Sort completedLessons array
      bookProgress.completedLessons.sort((a, b) => a - b);
      bookProgress.lastUpdated = timestamp;

      transaction.set(bookProgressRef, bookProgress);
    });
  } catch (error) {
    console.error("Error batch updating book progress:", error);
    throw error;
  }
}

/**
 * Lấy danh sách ID của các lesson đã hoàn thành trong một sách
 * Tối ưu: Sử dụng BookProgress để chỉ đọc 1 document thay vì query nhiều documents
 * Nếu BookProgress chưa có, tính từ quizResults
 */
export async function getCompletedLessons(
  userId: string,
  bookId: string
): Promise<number[]> {
  if (!userId || !bookId) return [];

  // Try to get from aggregated BookProgress first (optimized)
  const bookProgressDocId = `${userId}_${bookId}`;
  const bookProgressRef = doc(bookProgressCol, bookProgressDocId);
  const bookProgressDoc = await getDoc(bookProgressRef);

  if (bookProgressDoc.exists()) {
    const bookProgress = bookProgressDoc.data() as BookProgress;
    return bookProgress.completedLessons || [];
  }

  // Fallback: If BookProgress doesn't exist, return empty array
  // QuizHistory đã được lưu trực tiếp trong userBookProgress khi saveQuizResult
  // Nếu BookProgress chưa có, nghĩa là chưa có quiz nào được làm
  return [];
}

export async function getNeedQuizLessons(
  userId: string,
  bookId: string
): Promise<number[]> {
  if (!userId || !bookId) return [];

  const bookProgressDocId = `${userId}_${bookId}`;
  const bookProgressRef = doc(bookProgressCol, bookProgressDocId);
  const bookProgressDoc = await getDoc(bookProgressRef);

  if (!bookProgressDoc.exists()) return [];

  const bookProgress = bookProgressDoc.data() as BookProgress;
  return (bookProgress.needQuizs ?? []).sort((a, b) => a - b);
}

/**
 * Lấy trạng thái của tất cả lessons trong một sách với độ chính xác
 * Tối ưu: Sử dụng BookProgress để chỉ đọc 1 document thay vì query nhiều documents
 * Nếu BookProgress chưa có, tính từ quizResults
 */
export async function getLessonStatuses(
  userId: string,
  bookId: string
): Promise<Map<number, LessonStatus>> {
  if (!userId || !bookId) return new Map();

  // Try to get from aggregated BookProgress first (optimized)
  const bookProgressDocId = `${userId}_${bookId}`;
  const bookProgressRef = doc(bookProgressCol, bookProgressDocId);
  const bookProgressDoc = await getDoc(bookProgressRef);

  if (bookProgressDoc.exists()) {
    const bookProgress = bookProgressDoc.data() as BookProgress;
    const statusMap = new Map<number, LessonStatus>();

    // Convert BookProgress to Map<number, LessonStatus>
    Object.entries(bookProgress.lessons).forEach(([lessonIdStr, lessonData]) => {
      const lessonId = parseInt(lessonIdStr, 10);
      const accuracy = lessonData.lastAccuracy ?? 0;
      const attempt = lessonData.lastAttempt;
      if (attempt == null) return; // Skip lessons without attempt data
      statusMap.set(lessonId, {
        userId,
        bookId,
        lessonId,
        lastAccuracy: accuracy,
        lastAttempt: attempt,
      });
    });

    return statusMap;
  }

  // Fallback: If BookProgress doesn't exist, return empty map
  // QuizHistory đã được lưu trực tiếp trong userBookProgress khi saveQuizResult
  // Nếu BookProgress chưa có, nghĩa là chưa có quiz nào được làm
  return new Map();
}

// =================================================================
// Quiz Result Services
// =================================================================

/**
 * Lưu kết quả quiz mới nhất của một lesson.
/**
 * Save quiz result and update lesson status in userBookProgress
 * Luôn cập nhật với điểm mới nhất, không cần điểm cao hơn mới cập nhật.
 */
export async function saveQuizResult(
  resultData: Omit<QuizResult, "lastAttempt">
) {
  const { userId, bookId, lessonId, accuracy } = resultData;
  if (!userId || !bookId || !lessonId) return;

  const nowServer = serverTimestamp();
  const isCompleted = accuracy >= 90;

  // Update userBookProgress với quiz result và thêm vào history
  const bookProgressDocId = `${userId}_${bookId}`;
  const bookProgressRef = doc(bookProgressCol, bookProgressDocId);
  const userRef = doc(db, "users", userId);

  try {
    await runTransaction(db, async (transaction) => {
      const bookProgressDoc = await transaction.get(bookProgressRef);
      const userSnap = await transaction.get(userRef);

      type LessonProgressWrite = Omit<LessonProgress, "lastAttempt"> & { lastAttempt?: Timestamp | FieldValue };
      type BookProgressWrite = Omit<BookProgress, "lastUpdated" | "lessons"> & {
        lastUpdated: Timestamp | FieldValue;
        lessons: { [lessonId: number]: LessonProgressWrite };
      };

      let bookProgress: BookProgressWrite;

      if (bookProgressDoc.exists()) {
        const existing = bookProgressDoc.data() as BookProgress;
        bookProgress = {
          ...existing,
          lastUpdated: nowServer,
          lessons: { ...existing.lessons },
        };
      } else {
        bookProgress = {
          userId,
          bookId,
          lessons: {},
          completedLessons: [],
          completedLessonsSpeaking: [],
          lastUpdated: nowServer,
        };
      }

      // Get existing accuracy if lesson already exists
      const existingLesson = bookProgress.lessons[lessonId];
      const existingAccuracy = existingLesson?.lastAccuracy ?? 0;
      const isFirstAttempt = !existingLesson;
      const reachedXSNow = accuracy >= 95 && existingAccuracy < 95;

      bookProgress.lessons[lessonId] = {
        ...(existingLesson ?? {}),
        lastAccuracy: accuracy || 0,
        lastAttempt: nowServer,
      };

      // Update completedLessons array based on accuracy >= 90
      // If lesson was already completed, never remove it from completedLessons
      const completedIndex = bookProgress.completedLessons.indexOf(lessonId);
      if (isCompleted && completedIndex === -1) {
        // Add to completed list if accuracy >= 90 and not already there
        bookProgress.completedLessons.push(lessonId);
        bookProgress.completedLessons.sort((a, b) => a - b);
      }
      // Don't remove from completedLessons if it was already completed
      // This ensures that once a lesson is completed, it stays completed even if accuracy drops

      bookProgress.lastUpdated = nowServer;

      transaction.set(bookProgressRef, bookProgress);
      const rawQuizAccuracy = userSnap.exists() ? userSnap.data()?.quizAccuracy : undefined;
      const currentQuizAccuracy =
        typeof rawQuizAccuracy === "number" && Number.isFinite(rawQuizAccuracy)
          ? rawQuizAccuracy
          : 50;
      const nextQuizAccuracy = roundToThree(
        clampAccuracy(computeNextQuizAccuracy(currentQuizAccuracy, accuracy))
      );

      const userStatsUpdates: Record<string, unknown> = { quizAccuracy: nextQuizAccuracy };
      if (isFirstAttempt) {
        userStatsUpdates.timesVocab = increment(1);
      }
      if (reachedXSNow) {
        userStatsUpdates.timesVocabXS = increment(1);
      }
      transaction.set(userRef, userStatsUpdates, { merge: true });
    });
  } catch (error) {
    console.error("Error saving quiz result:", error);
    throw error;
  }
}
