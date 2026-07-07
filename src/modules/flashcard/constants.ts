// Constants cho Flashcard Module
export const FLASHCARD_CONSTANTS = {
  // Cache times (milliseconds)
  BOOKS_STALE_TIME: 5 * 60 * 1000, // 5 phút
  BOOKS_GC_TIME: 10 * 60 * 1000, // 10 phút
  LESSON_WORDS_STALE_TIME: 2 * 60 * 1000, // 2 phút
  LESSON_WORDS_GC_TIME: 5 * 60 * 1000, // 5 phút

  // Review system
  DEFAULT_REVIEW_COUNT: 3,
  MIN_REVIEW_COUNT: 0,

  // Learning modes
  LEARNING_MODES: {
    FLASHCARD: "flashcard" as const,
    QUIZ: "quiz" as const,
  },

  // Local storage keys
  STORAGE_KEYS: {
    REVIEW_WORDS: "reviewWords", // Pattern: reviewWords_{userId}
  },

  // Speech settings
  SPEECH: {
    DEFAULT_LANG: "en-US",
  },

  // Quiz settings
  QUIZ: {
    DEFAULT_TIMER: 10, // seconds
    MIN_TIMER: 5,
    MAX_TIMER: 30,
  },
} as const;
