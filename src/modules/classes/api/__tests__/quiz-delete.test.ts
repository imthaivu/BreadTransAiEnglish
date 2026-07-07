import { describe, expect, it } from "vitest";
import {
  clearQuizFieldsFromLesson,
  lessonHasNonQuizData,
} from "../quiz-delete-utils";

describe("lessonHasNonQuizData", () => {
  it("returns false for quiz-only lesson data", () => {
    expect(
      lessonHasNonQuizData({ lastAccuracy: 95, lastAttempt: {} })
    ).toBe(false);
  });

  it("returns true when speaking fields exist", () => {
    expect(
      lessonHasNonQuizData({
        lastAccuracy: 90,
        fileUrl: "https://example.com/audio.mp3",
      })
    ).toBe(true);
  });

  it("returns true when listenCount is present", () => {
    expect(lessonHasNonQuizData({ listenCount: 3 })).toBe(true);
  });
});

describe("clearQuizFieldsFromLesson", () => {
  it("returns null when lesson only has quiz fields", () => {
    expect(
      clearQuizFieldsFromLesson({
        lastAccuracy: 92,
        lastAttempt: undefined,
      })
    ).toBeNull();
  });

  it("keeps speaking fields and removes quiz fields", () => {
    const result = clearQuizFieldsFromLesson({
      lastAccuracy: 92,
      lastAttempt: undefined,
      fileUrl: "https://example.com/audio.mp3",
      speakingScore: "8",
      issueSpeaking: "Good pronunciation",
    });

    expect(result).toEqual({
      fileUrl: "https://example.com/audio.mp3",
      speakingScore: "8",
      issueSpeaking: "Good pronunciation",
    });
    expect(result).not.toHaveProperty("lastAccuracy");
    expect(result).not.toHaveProperty("lastAttempt");
  });

  it("keeps listenCount when clearing quiz fields", () => {
    const result = clearQuizFieldsFromLesson({
      lastAccuracy: 80,
      listenCount: 5,
    });

    expect(result).toEqual({ listenCount: 5 });
  });

  it("preserves runtime fields like issueSpeakingAt", () => {
    const issueSpeakingAt = { seconds: 123 };
    const result = clearQuizFieldsFromLesson({
      lastAccuracy: 88,
      fileUrl: "https://example.com/audio.mp3",
      issueSpeakingAt,
    } as Parameters<typeof clearQuizFieldsFromLesson>[0] & {
      issueSpeakingAt: { seconds: number };
    });

    expect(result).toMatchObject({
      fileUrl: "https://example.com/audio.mp3",
      issueSpeakingAt,
    });
  });
});

describe("quiz delete lesson update (OverallProgressTable data source)", () => {
  it("keeps speaking submission visible after quiz fields are cleared", () => {
    const lessons: Record<
      number,
      {
        lastAccuracy?: number;
        fileUrl?: string;
        speakingScore?: string;
      }
    > = {
      5: {
        lastAccuracy: 95,
        fileUrl: "https://example.com/lesson-5.mp3",
        speakingScore: "9",
      },
    };
    const completedLessons = [5];
    const lessonId = 5;

    const cleared = clearQuizFieldsFromLesson(lessons[lessonId]);
    if (cleared) {
      lessons[lessonId] = cleared;
    } else {
      delete lessons[lessonId];
    }

    const completedIndex = completedLessons.indexOf(lessonId);
    if (completedIndex !== -1) {
      completedLessons.splice(completedIndex, 1);
    }

    expect(lessons[5]).toEqual({
      fileUrl: "https://example.com/lesson-5.mp3",
      speakingScore: "9",
    });
    expect(completedLessons).toEqual([]);
    expect(!!lessons[5]?.fileUrl).toBe(true);
  });
});
