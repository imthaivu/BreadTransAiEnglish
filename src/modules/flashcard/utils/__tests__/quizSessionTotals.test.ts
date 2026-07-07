import { describe, expect, it } from "vitest";
import {
  buildQuizSessionPlan,
  computeLessonQuizItemCountFromPlan,
} from "../quizSessionTotals";
import type { DuobookSentence, Word } from "../../types";

function mockSentences(n: number, lesson = 1): DuobookSentence[] {
  return Array.from({ length: n }, (_, i) => ({
    script: `sentence-${lesson}-${i}`,
    mean: `meaning-${lesson}-${i}`,
    lesson,
  }));
}

function mockWords(n: number, lesson = 1): Word[] {
  return Array.from({ length: n }, (_, i) => ({
    word: `word-${lesson}-${i}`,
    ipa: `/w${i}/`,
    mean: `meaning-${lesson}-${i}`,
    book: "test",
    lesson,
  }));
}

describe("buildQuizSessionPlan word sampling", () => {
  it("24 words: 2 halves of 12, caps at 10 per stage", () => {
    const plan = buildQuizSessionPlan(mockWords(24), []);

    expect(plan.matchWords).toHaveLength(10);
    expect(plan.quizWords).toHaveLength(10);
  });

  it("16 words: 2 halves of 8, takes 8 per stage", () => {
    const plan = buildQuizSessionPlan(mockWords(16), []);

    expect(plan.matchWords).toHaveLength(8);
    expect(plan.quizWords).toHaveLength(8);
  });

  it("does not reuse words across word stages", () => {
    const plan = buildQuizSessionPlan(mockWords(20), []);
    const words = [...plan.matchWords, ...plan.quizWords].map((w) => w.word);

    expect(new Set(words).size).toBe(words.length);
    expect(words).toHaveLength(20);
  });
});

describe("buildQuizSessionPlan sentence sampling", () => {
  it("12 sentences: 3 parts of 4, takes 4 per stage", () => {
    const plan = buildQuizSessionPlan(mockWords(1), mockSentences(12));

    expect(plan.tapMatchSentences).toHaveLength(4);
    expect(plan.rapVietSentences).toHaveLength(4);
    expect(plan.rapAnhSentences).toHaveLength(4);
  });

  it("21 sentences: 3 parts of 7, caps at 5 per stage", () => {
    const plan = buildQuizSessionPlan(mockWords(1), mockSentences(21));

    expect(plan.tapMatchSentences).toHaveLength(5);
    expect(plan.rapVietSentences).toHaveLength(5);
    expect(plan.rapAnhSentences).toHaveLength(5);
  });

  it("8 sentences: uneven thirds take min(5, part length)", () => {
    const plan = buildQuizSessionPlan(mockWords(1), mockSentences(8));

    expect(plan.tapMatchSentences).toHaveLength(3);
    expect(plan.rapVietSentences).toHaveLength(3);
    expect(plan.rapAnhSentences).toHaveLength(2);
  });

  it("does not reuse sentences across sentence stages", () => {
    const plan = buildQuizSessionPlan(mockWords(1), mockSentences(12));
    const scripts = [
      ...plan.tapMatchSentences,
      ...plan.rapVietSentences,
      ...plan.rapAnhSentences,
    ].map((s) => s.script);

    expect(new Set(scripts).size).toBe(scripts.length);
    expect(scripts).toHaveLength(12);
  });
});

describe("buildQuizSessionPlan multi-lesson caps", () => {
  it("2 lessons with enough words: N×10 per word stage", () => {
    const words = [...mockWords(24, 1), ...mockWords(24, 2)];
    const plan = buildQuizSessionPlan(words, []);

    expect(plan.matchWords).toHaveLength(20);
    expect(plan.quizWords).toHaveLength(20);
  });

  it("2 lessons with enough sentences: N×5 per sentence stage", () => {
    const sentences = [...mockSentences(15, 1), ...mockSentences(15, 2)];
    const plan = buildQuizSessionPlan(mockWords(1, 1), sentences);

    expect(plan.tapMatchSentences).toHaveLength(10);
    expect(plan.rapVietSentences).toHaveLength(10);
    expect(plan.rapAnhSentences).toHaveLength(10);
  });

  it("2 lessons with uneven word counts: sum of per-lesson caps", () => {
    const words = [...mockWords(6, 1), ...mockWords(24, 2)];
    const plan = buildQuizSessionPlan(words, []);

    expect(plan.matchWords).toHaveLength(13);
    expect(plan.quizWords).toHaveLength(13);
  });

  it("does not cross-contaminate words between lessons", () => {
    const words = [...mockWords(20, 1), ...mockWords(20, 2)];
    const plan = buildQuizSessionPlan(words, []);

    const lesson1Words = [...plan.matchWords, ...plan.quizWords].filter(
      (w) => w.lesson === 1
    );
    const lesson2Words = [...plan.matchWords, ...plan.quizWords].filter(
      (w) => w.lesson === 2
    );

    expect(lesson1Words).toHaveLength(20);
    expect(lesson2Words).toHaveLength(20);
  });
});

describe("computeLessonQuizItemCountFromPlan", () => {
  it("counts words and sentences per lesson directly", () => {
    const words = [...mockWords(24, 1), ...mockWords(24, 2)];
    const sentences = [...mockSentences(15, 1), ...mockSentences(15, 2)];
    const plan = buildQuizSessionPlan(words, sentences);

    const lesson1Total = computeLessonQuizItemCountFromPlan(1, plan, words);
    const lesson2Total = computeLessonQuizItemCountFromPlan(2, plan, words);

    expect(lesson1Total).toBe(10 + 10 + 5 + 5 + 5);
    expect(lesson2Total).toBe(10 + 10 + 5 + 5 + 5);
    expect(lesson1Total + lesson2Total).toBe(plan.sessionTotal);
  });
});
