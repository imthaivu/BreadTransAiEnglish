import { DuobookSentence, Word } from "../types";
import { shuffle } from "./sentenceChunk";

export const MAX_WORD_STAGE_ITEMS = 10;
export const MAX_SENTENCE_STAGE_ITEMS = 5;

export interface QuizSessionPlan {
  matchWords: Word[];
  tapMatchSentences: DuobookSentence[];
  quizWords: Word[];
  rapVietSentences: DuobookSentence[];
  rapAnhSentences: DuobookSentence[];
  activeStages: number[];
  sessionTotal: number;
}

export function getPlanStageLength(plan: QuizSessionPlan, stage: number): number {
  switch (stage) {
    case 1:
      return plan.matchWords.length;
    case 2:
      return plan.tapMatchSentences.length;
    case 3:
      return plan.quizWords.length;
    case 4:
      return plan.rapVietSentences.length;
    case 5:
      return plan.rapAnhSentences.length;
    default:
      return 0;
  }
}

/**
 * Chia pool từ thành 2 phần cho stage 1 (ghép cặp) và stage 3 (trắc nghiệm).
 *
 * 1. Shuffle toàn bộ pool
 * 2. Chia 2 phần (kích thước ≈ ceil(n/2) và phần còn lại)
 * 3. Mỗi phần shuffle lại và lấy min(10, part.length) từ — không trùng giữa 2 stage
 *
 * Ví dụ: 24 từ → 2×12 → lấy 10 mỗi stage; 16 từ → 2×8 → lấy 8 mỗi stage.
 */
function sampleWordStages(words: Word[]): {
  matchWords: Word[];
  quizWords: Word[];
} {
  if (words.length === 0) {
    return { matchWords: [], quizWords: [] };
  }

  const shuffled = shuffle(words);
  const half = Math.ceil(shuffled.length / 2);

  const part1 = shuffled.slice(0, half);
  const part2 = shuffled.slice(half);

  const cap = MAX_WORD_STAGE_ITEMS;
  const validPart1 = part1.filter((w) => w.word && w.mean);

  return {
    matchWords: shuffle(validPart1).slice(0, Math.min(cap, validPart1.length)),
    quizWords: shuffle(part2).slice(0, Math.min(cap, part2.length)),
  };
}

/**
 * Chia pool duobook thành 3 phần cho stage 2, 4, 5.
 *
 * 1. Shuffle toàn bộ pool
 * 2. Chia 3 phần (kích thước ≈ ceil(n/3))
 * 3. Mỗi phần shuffle lại và lấy min(5, part.length) câu
 *
 * Ví dụ: 12 câu → 3×4 → lấy 4 mỗi stage; 21 câu → 3×7 → cap 5 mỗi stage.
 */
function sampleSentenceStages(sentences: DuobookSentence[]): {
  tapMatchSentences: DuobookSentence[];
  rapVietSentences: DuobookSentence[];
  rapAnhSentences: DuobookSentence[];
} {
  if (sentences.length === 0) {
    return {
      tapMatchSentences: [],
      rapVietSentences: [],
      rapAnhSentences: [],
    };
  }

  const shuffled = shuffle(sentences);
  const third = Math.ceil(shuffled.length / 3);

  const part1 = shuffled.slice(0, third);
  const part2 = shuffled.slice(third, third * 2);
  const part3 = shuffled.slice(third * 2);

  const cap = MAX_SENTENCE_STAGE_ITEMS;

  return {
    tapMatchSentences: shuffle(part1).slice(0, Math.min(cap, part1.length)),
    rapVietSentences: shuffle(part2).slice(0, Math.min(cap, part2.length)),
    rapAnhSentences: shuffle(part3).slice(0, Math.min(cap, part3.length)),
  };
}

function collectLessonIds(
  words: Word[],
  sentences: DuobookSentence[]
): number[] {
  const ids = new Set<number>();
  words.forEach((w) => ids.add(w.lesson));
  sentences.forEach((s) => ids.add(s.lesson));
  return [...ids].sort((a, b) => a - b);
}

/** Stage order 1→5: Ghép cặp → Tap match → Trắc nghiệm → Ráp Việt → Ráp Anh. */
export function buildQuizSessionPlan(
  words: Word[],
  sentences: DuobookSentence[]
): QuizSessionPlan {
  const lessonIds = collectLessonIds(words, sentences);

  const matchWords: Word[] = [];
  const quizWords: Word[] = [];
  const tapMatchSentences: DuobookSentence[] = [];
  const rapVietSentences: DuobookSentence[] = [];
  const rapAnhSentences: DuobookSentence[] = [];

  for (const lessonId of lessonIds) {
    const lessonWords = words.filter((w) => w.lesson === lessonId);
    const lessonSentences = sentences.filter((s) => s.lesson === lessonId);

    const wordSample = sampleWordStages(lessonWords);
    const sentenceSample = sampleSentenceStages(lessonSentences);

    matchWords.push(...wordSample.matchWords);
    quizWords.push(...wordSample.quizWords);
    tapMatchSentences.push(...sentenceSample.tapMatchSentences);
    rapVietSentences.push(...sentenceSample.rapVietSentences);
    rapAnhSentences.push(...sentenceSample.rapAnhSentences);
  }

  const shuffledMatchWords = shuffle(matchWords);
  const shuffledQuizWords = shuffle(quizWords);
  const shuffledTapMatch = shuffle(tapMatchSentences);
  const shuffledRapViet = shuffle(rapVietSentences);
  const shuffledRapAnh = shuffle(rapAnhSentences);

  const activeStages: number[] = [];
  if (shuffledMatchWords.length > 0) activeStages.push(1);
  if (shuffledTapMatch.length > 0) activeStages.push(2);
  if (shuffledQuizWords.length > 0) activeStages.push(3);
  if (shuffledRapViet.length > 0) activeStages.push(4);
  if (shuffledRapAnh.length > 0) activeStages.push(5);

  const plan: QuizSessionPlan = {
    matchWords: shuffledMatchWords,
    tapMatchSentences: shuffledTapMatch,
    quizWords: shuffledQuizWords,
    rapVietSentences: shuffledRapViet,
    rapAnhSentences: shuffledRapAnh,
    activeStages,
    sessionTotal: 0,
  };

  plan.sessionTotal = activeStages.reduce(
    (sum, stage) => sum + getPlanStageLength(plan, stage),
    0
  );

  return plan;
}

/** Số câu/hạng mục của một bài trong phiên quiz đã sample. */
export function computeLessonQuizItemCountFromPlan(
  lessonId: number,
  plan: QuizSessionPlan,
  allWords: Word[]
): number {
  if (allWords.length === 0) return 0;

  const wordsInLesson = allWords.filter((w) => w.lesson === lessonId);
  if (wordsInLesson.length === 0) return 0;

  let count = 0;
  count += plan.matchWords.filter((w) => w.lesson === lessonId).length;
  count += plan.quizWords.filter((w) => w.lesson === lessonId).length;
  count += plan.tapMatchSentences.filter((s) => s.lesson === lessonId).length;
  count += plan.rapVietSentences.filter((s) => s.lesson === lessonId).length;
  count += plan.rapAnhSentences.filter((s) => s.lesson === lessonId).length;

  return count;
}

export function allocateLessonQuizScore(
  lessonId: number,
  plan: QuizSessionPlan,
  allWords: Word[],
  sessionCorrect: number,
  sessionTotal: number
): { score: number; totalItems: number } {
  const totalItems = computeLessonQuizItemCountFromPlan(
    lessonId,
    plan,
    allWords
  );
  if (sessionTotal <= 0 || totalItems <= 0) {
    return { score: 0, totalItems: 0 };
  }

  const score = Math.round((sessionCorrect * totalItems) / sessionTotal);
  return { score, totalItems };
}
