import { LessonProgress } from "@/modules/flashcard/types";

const QUIZ_ONLY_LESSON_FIELDS = new Set(["lastAccuracy", "lastAttempt"]);

export function lessonHasNonQuizData(lesson: Record<string, unknown>): boolean {
  return Object.entries(lesson).some(([key, value]) => {
    if (QUIZ_ONLY_LESSON_FIELDS.has(key)) return false;
    if (value === undefined || value === null || value === "") return false;
    return true;
  });
}

export function clearQuizFieldsFromLesson(lesson: LessonProgress): LessonProgress | null {
  const next = { ...lesson } as Record<string, unknown>;
  delete next.lastAccuracy;
  delete next.lastAttempt;
  return lessonHasNonQuizData(next) ? (next as LessonProgress) : null;
}
