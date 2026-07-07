import { Timestamp } from "firebase/firestore";

// Types cho Flashcard Module
export interface FlashcardBook {
  id: number;
  name: string;
  totalLessons: number;
  totalWords: number;
  lessons: number[];
}

export interface FlashcardWord {
  book: number;
  lesson: number;
  word: string;
  ipa: string;
  mean: string;
}

export interface FlashcardLesson {
  book: number;
  lesson: number;
  words: FlashcardWord[];
}

export interface FlashcardIndex {
  books: FlashcardBook[];
  totalBooks: number;
  totalLessons: number;
  totalWords: number;
  lastUpdated: string;
}

export interface ReviewWord extends Word {
  needReview: number;
}

/** Một câu trong duobook: script (tiếng Anh) + mean (tiếng Việt) */
export interface DuobookSentence {
  script: string;
  mean: string;
  lesson: number;
}

/** Một title trong file duobook */
export interface DuobookTitle {
  title: string;
  script: string[];
  mean: string[];
}

export interface SessionAnswer {
  word: Word;
  isCorrect: boolean;
}

/** Kết quả tổng hợp quiz nhiều giai đoạn (ghép cặp + ráp câu + trắc nghiệm). */
export interface QuizSessionSummary {
  correct: number;
  total: number;
  accuracy: number;
}

export interface QuizResult {
  userId: string;
  bookId: string;
  lessonId: number;
  accuracy: number;
  score: number;
  totalWords: number;
  lastAttempt: Timestamp; // Firestore Server Timestamp
}

export interface LessonStatus {
  userId: string;
  bookId: string;
  lessonId: number;
  lastAccuracy: number;
  lastAttempt: Timestamp;
}

/**
 * Lesson progress data - quiz, listening, speaking
 */
export interface LessonProgress {
  lastAccuracy?: number;
  lastAttempt?: Timestamp;
  /** Số lần đã nghe bài (từ listening) */
  listenCount?: number;
  /** URL file nộp bài nói */
  fileUrl?: string;
  /** Tên file gốc khi nộp */
  originalFilename?: string;
  /** Timestamp lần nộp bài nói gần nhất */
  lastSubmitted?: Timestamp;
  /** Độ dài audio (giây) - lưu khi nộp bài nói để hiển thị chính xác */
  duration?: number;
  /** Số lần nộp speaking thành công cho bài hiện tại */
  speakingCount?: number;
  /** Điểm chấm bài nói (A, B, C) */
  speakingScore?: string | null;
  /** Nhận xét lỗi speaking từ AI */
  issueSpeaking?: string | null;
}

/**
 * Aggregated book progress - tối ưu để giảm số lần đọc Firestore
 * Thay vì đọc nhiều documents (mỗi lesson một document), chỉ cần đọc 1 document
 * Gộp cả listening và speaking từ collections riêng vào đây
 */
export interface BookProgress {
  userId: string;
  bookId: string;
  lessons: {
    [lessonId: number]: LessonProgress;
  };
  completedLessons: number[]; // Array for quick lookup (lessons with accuracy >= 90)
  /** Các bài đã nộp bài nói (lesson numbers) */
  completedLessonsSpeaking: number[];
  /** Các bài quiz cần hoàn thành (set bởi giáo viên theo current lesson) */
  needQuizs?: number[];
  /** Các bài speaking cần hoàn thành (set bởi giáo viên theo current lesson) */
  needSpeakings?: number[];
  lastUpdated: Timestamp;
}

export interface FlashcardState {
  books: FlashcardBook[];
  selectedBook: number | null;
  selectedLessons: number[];
  selectedMode: "flashcard" | "quiz";
  deck: FlashcardWord[];
  currentIndex: number;
  score: number;
  wrongWords: FlashcardWord[];
  progress: number;
  accuracy: number;
  isPlaying: boolean;
  isLoading: boolean;
}


/** User (nếu bạn quản lý user trong Firestore) */
export interface User {
  id: string; // Firestore document id
  email: string;
  displayName: string;
  createdAt: string;
}

export interface Word {
  word: string;
  ipa: string;
  mean: string;
  book: string;
  lesson: number;
}

export interface Lesson {
  id: number;
  words: Word[];
}

export interface Book {
  id: number;
  name: string;
  totalLessons: number;
  totalWords: number;
  lessons?: Lesson[]; // optional vì books.json chỉ lưu metadata
}
