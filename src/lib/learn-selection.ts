export const LEARN_LAST_BOOK_KEY = "learn_lastSelectedBook";
export const LEARN_LAST_LESSON_KEY = "learn_lastSelectedLesson";

const LEGACY_FLASHCARD_BOOK_KEY = "flashcard_lastSelectedBook";
const LEGACY_SPEAKING_BOOK_KEY = "speaking_upload_lastSelectedBook";

export type LearnSelectionStorage = {
  bookId: string | null;
  lessonId: number | null;
};

function readLegacyBookId(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return (
      localStorage.getItem(LEGACY_FLASHCARD_BOOK_KEY) ??
      localStorage.getItem(LEGACY_SPEAKING_BOOK_KEY)
    );
  } catch {
    return null;
  }
}

export function readLearnSelection(): LearnSelectionStorage {
  if (typeof window === "undefined") {
    return { bookId: null, lessonId: null };
  }

  try {
    let bookId = localStorage.getItem(LEARN_LAST_BOOK_KEY);
    const lessonRaw = localStorage.getItem(LEARN_LAST_LESSON_KEY);

    if (!bookId) {
      bookId = readLegacyBookId();
      if (bookId) {
        localStorage.setItem(LEARN_LAST_BOOK_KEY, bookId);
      }
    }

    const lessonId =
      lessonRaw != null && lessonRaw !== ""
        ? Number.parseInt(lessonRaw, 10)
        : null;

    return {
      bookId,
      lessonId: Number.isFinite(lessonId) ? lessonId : null,
    };
  } catch {
    return { bookId: null, lessonId: null };
  }
}

export function writeLearnSelection({
  bookId,
  lessonId,
}: LearnSelectionStorage): void {
  if (typeof window === "undefined") return;

  try {
    if (bookId) {
      localStorage.setItem(LEARN_LAST_BOOK_KEY, bookId);
    } else {
      localStorage.removeItem(LEARN_LAST_BOOK_KEY);
    }

    if (lessonId != null) {
      localStorage.setItem(LEARN_LAST_LESSON_KEY, String(lessonId));
    } else {
      localStorage.removeItem(LEARN_LAST_LESSON_KEY);
    }
  } catch {
    // ignore localStorage errors
  }
}

export function getAdjacentLesson(
  lessons: number[],
  current: number | null,
  direction: "prev" | "next"
): number | null {
  if (lessons.length === 0) return null;

  const sorted = [...lessons].sort((a, b) => a - b);

  if (current == null) {
    return direction === "next" ? sorted[0] : sorted[sorted.length - 1];
  }

  const idx = sorted.indexOf(current);
  if (idx === -1) {
    return direction === "next" ? sorted[0] : sorted[sorted.length - 1];
  }

  if (direction === "prev") {
    return idx > 0 ? sorted[idx - 1] : null;
  }

  return idx < sorted.length - 1 ? sorted[idx + 1] : null;
}
