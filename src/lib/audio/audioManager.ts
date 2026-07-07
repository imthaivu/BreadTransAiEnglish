/**
 * Audio Manager - Quản lý tất cả audio trong ứng dụng
 *
 * File này chứa các định nghĩa, cấu trúc dữ liệu và utility functions
 * để quản lý audio files trong BreadTrans application
 */

import { STREAMLINE_BOOKS } from "@/data/StreamLineBooks";
import { AudioBook, AudioFile, AudioPlaylist } from "@/types/audio.type";

// ===== TYPES & INTERFACES =====

export function getAllAudioBooks(): AudioBook[] {
  return [...STREAMLINE_BOOKS];
}

/**
 * Lấy audio book theo ID
 */
export function getAudioBookById(id: string): AudioBook | undefined {
  return getAllAudioBooks().find((book) => book.id === id);
}

/**
 * Lấy audio books theo category
 */
export function getAudioBooksByCategory(
  category: AudioBook["category"]
): AudioBook[] {
  return getAllAudioBooks().filter((book) => book.category === category);
}

/**
 * Lấy audio books theo level
 */
export function getAudioBooksByLevel(level: AudioBook["level"]): AudioBook[] {
  return getAllAudioBooks().filter((book) => book.level === level);
}

/**
 * Tạo audio file URL (nguồn R2, subfolder giống streamline.ts / lessons1000.ts)
 */
export function generateAudioUrl(bookId: string, lessonNumber: number): string {
  const baseUrl = "https://pub-0a213457f38f40c68315aac6941084ff.r2.dev/mp3";

  if (bookId.startsWith("streamline-")) {
    const bookNum = bookId.split("-")[1];
    return `${baseUrl}/streamline/streamline${bookNum}/${String(
      lessonNumber
    ).padStart(2, "0")}.mp3`;
  }

  if (bookId.startsWith("nobita-")) {
    const bookNum = bookId.split("-")[1];
    return `${baseUrl}/bread${bookNum}/${String(lessonNumber).padStart(
      3,
      "0"
    )}.mp3`;
  }

  return `${baseUrl}/default/lesson_${lessonNumber}.mp3`;
}

/**
 * Tạo audio file object
 */
export function createAudioFile(
  bookId: string,
  lessonNumber: number,
  title?: string
): AudioFile {
  const book = getAudioBookById(bookId);
  if (!book) {
    throw new Error(`Audio book with id ${bookId} not found`);
  }

  return {
    id: `${bookId}-lesson-${lessonNumber}`,
    title: title || `Bài ${lessonNumber}`,
    url: generateAudioUrl(bookId, lessonNumber),
    bookId,
    lessonNumber,
    level: book.level,
    category: book.category,
    description: `Bài học ${lessonNumber} từ ${book.title}`,
    isPremium: book.isPremium,
    tags: [book.category, book.level],
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

/**
 * Tạo danh sách audio files cho một book
 */
export function createAudioFilesForBook(bookId: string): AudioFile[] {
  const book = getAudioBookById(bookId);
  if (!book) {
    throw new Error(`Audio book with id ${bookId} not found`);
  }

  const audioFiles: AudioFile[] = [];

  for (let i = 1; i <= book.totalLessons; i++) {
    audioFiles.push(createAudioFile(bookId, i));
  }

  return audioFiles;
}

/**
 * Lấy audio files theo book ID
 */
export function getAudioFilesByBookId(bookId: string): AudioFile[] {
  return createAudioFilesForBook(bookId);
}

/**
 * Lấy audio file theo ID
 */
export function getAudioFileById(audioId: string): AudioFile | undefined {
  const [bookId, , lessonNumber] = audioId.split("-");
  if (!bookId || !lessonNumber) return undefined;

  return createAudioFile(bookId, parseInt(lessonNumber));
}

/**
 * Kiểm tra audio file có tồn tại không
 */
export function audioFileExists(audioId: string): boolean {
  return getAudioFileById(audioId) !== undefined;
}

/**
 * Lấy audio files theo category
 */
export function getAudioFilesByCategory(
  category: AudioFile["category"]
): AudioFile[] {
  const books = getAudioBooksByCategory(category);
  const audioFiles: AudioFile[] = [];

  books.forEach((book) => {
    audioFiles.push(...createAudioFilesForBook(book.id));
  });

  return audioFiles;
}

/**
 * Lấy audio files theo level
 */
export function getAudioFilesByLevel(level: AudioFile["level"]): AudioFile[] {
  const books = getAudioBooksByLevel(level);
  const audioFiles: AudioFile[] = [];

  books.forEach((book) => {
    audioFiles.push(...createAudioFilesForBook(book.id));
  });

  return audioFiles;
}

/**
 * Tìm kiếm audio files
 */
export function searchAudioFiles(query: string): AudioFile[] {
  const allBooks = getAllAudioBooks();
  const results: AudioFile[] = [];

  allBooks.forEach((book) => {
    const audioFiles = createAudioFilesForBook(book.id);
    const filtered = audioFiles.filter(
      (audio) =>
        audio.title.toLowerCase().includes(query.toLowerCase()) ||
        audio.description?.toLowerCase().includes(query.toLowerCase()) ||
        book.title.toLowerCase().includes(query.toLowerCase())
    );
    results.push(...filtered);
  });

  return results;
}

/**
 * Lấy audio files gần đây (mock data)
 */
export function getRecentAudioFiles(
  _userId: string,
  limit: number = 10
): AudioFile[] {
  // Mock data - trong thực tế sẽ lấy từ database
  const recentIds = [
    "streamline-1-lesson-1",
    "streamline-1-lesson-2",
    "nobita-1-lesson-1",
    "nobita-1-lesson-2",
    "streamline-2-lesson-1",
  ];

  return recentIds
    .slice(0, limit)
    .map((id) => getAudioFileById(id))
    .filter((audio): audio is AudioFile => audio !== undefined);
}

/**
 * Lấy audio files yêu thích (mock data)
 */
export function getFavoriteAudioFiles(_userId: string): AudioFile[] {
  // Mock data - trong thực tế sẽ lấy từ database
  const favoriteIds = [
    "streamline-1-lesson-1",
    "nobita-1-lesson-1",
    "streamline-2-lesson-1",
  ];

  return favoriteIds
    .map((id) => getAudioFileById(id))
    .filter((audio): audio is AudioFile => audio !== undefined);
}

/**
 * Tạo playlist
 */
export function createPlaylist(
  name: string,
  description: string,
  audioFileIds: string[],
  createdBy: string
): AudioPlaylist {
  const audioFiles = audioFileIds
    .map((id) => getAudioFileById(id))
    .filter((audio): audio is AudioFile => audio !== undefined);

  return {
    id: `playlist-${Date.now()}`,
    name,
    description,
    audioFiles,
    isPublic: false,
    createdBy,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

/**
 * Lấy thống kê audio
 */
export function getAudioStats(): {
  totalBooks: number;
  totalLessons: number;
  totalCategories: number;
  totalLevels: number;
} {
  const allBooks = getAllAudioBooks();
  const totalLessons = allBooks.reduce(
    (sum, book) => sum + book.totalLessons,
    0
  );
  const categories = new Set(allBooks.map((book) => book.category));
  const levels = new Set(allBooks.map((book) => book.level));

  return {
    totalBooks: allBooks.length,
    totalLessons,
    totalCategories: categories.size,
    totalLevels: levels.size,
  };
}

// ===== CONSTANTS =====

export const AUDIO_CATEGORIES = {
  STREAMLINE: "streamline" as const,
  LESSONS_1000: "1000-lessons" as const,
  GRAMMAR: "grammar" as const,
  VOCABULARY: "vocabulary" as const,
};

export const AUDIO_LEVELS = {
  BEGINNER: "beginner" as const,
  INTERMEDIATE: "intermediate" as const,
  ADVANCED: "advanced" as const,
};

export const AUDIO_FORMATS = {
  MP3: "mp3",
  WAV: "wav",
  AAC: "aac",
  OGG: "ogg",
} as const;

export const AUDIO_QUALITIES = {
  LOW: "low",
  MEDIUM: "medium",
  HIGH: "high",
  LOSSLESS: "lossless",
} as const;

// ===== DEFAULT EXPORT =====
const AudioManager = {
  // Data
  STREAMLINE_BOOKS,

  // Functions
  getAllAudioBooks,
  getAudioBookById,
  getAudioBooksByCategory,
  getAudioBooksByLevel,
  generateAudioUrl,
  createAudioFile,
  createAudioFilesForBook,
  getAudioFilesByBookId,
  getAudioFileById,
  audioFileExists,
  getAudioFilesByCategory,
  getAudioFilesByLevel,
  searchAudioFiles,
  getRecentAudioFiles,
  getFavoriteAudioFiles,
  createPlaylist,
  getAudioStats,

  // Constants
  AUDIO_CATEGORIES,
  AUDIO_LEVELS,
  AUDIO_FORMATS,
  AUDIO_QUALITIES,
};

export default AudioManager;
