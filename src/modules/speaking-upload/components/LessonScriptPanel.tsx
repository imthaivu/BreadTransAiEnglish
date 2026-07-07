"use client";

import { useAuth } from "@/lib/auth/context";
import { useDuobookLesson } from "@/modules/flashcard/hooks";
import type { Word } from "@/modules/flashcard/types";
import { useEffect, useMemo, useState } from "react";
import {
  getStreamlineLessonImageUrl,
  type StreamlineImageVariant,
} from "../utils/streamline-script-image";
import { ScriptInteractiveText } from "./ScriptInteractiveText";

interface LessonScriptPanelProps {
  selectedBook: string | null;
  selectedLesson: number | null;
  context?: "speaking" | "vocabulary";
  vocabulary?: Pick<Word, "word" | "mean" | "ipa">[];
}

const VARIANT_LABELS: Record<StreamlineImageVariant, string> = {
  a: "Language Study",
  b: "Vocabulary",
  c: "Script",
};

function NoScriptPlaceholder() {
  return (
    <div className="flex items-center justify-center rounded-lg border border-dashed border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-4 py-10">
      <p className="text-sm font-medium text-gray-500 dark:text-gray-400">
        No Script
      </p>
    </div>
  );
}

function StreamlineScriptImage({
  bookId,
  lessonId,
  variant,
}: {
  bookId: number;
  lessonId: number;
  variant: StreamlineImageVariant;
}) {
  const label = VARIANT_LABELS[variant];
  const src = useMemo(
    () => getStreamlineLessonImageUrl(bookId, lessonId, variant),
    [bookId, lessonId, variant]
  );
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    setMissing(false);
  }, [src]);

  if (missing) {
    return <NoScriptPlaceholder />;
  }

  return (
    <div className="overflow-hidden rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={`${label} bài ${lessonId}`}
        className="block w-full h-auto"
        onError={() => setMissing(true)}
      />
    </div>
  );
}

const SPEAKING_VARIANTS: {
  variant: StreamlineImageVariant;
  shortLabel: string;
  label: string;
}[] = [
  { variant: "a", shortLabel: "Study", label: "Language Study" },
  { variant: "b", shortLabel: "Vocab", label: "Vocabulary" },
  { variant: "c", shortLabel: "Script", label: "Script" },
];

function segmentButtonClass(active: boolean) {
  return `rounded-md px-1.5 py-1 text-[10px] font-semibold transition-colors sm:px-2.5 sm:text-sm ${
    active
      ? "bg-white text-gray-900 shadow-sm"
      : "text-gray-600 hover:text-gray-900"
  }`;
}

function StreamlineSpeakingPanel({
  bookId,
  lessonId,
}: {
  bookId: number;
  lessonId: number;
}) {
  const { role } = useAuth();
  const canAccessStudyVariants = role === "teacher" || role === "admin";
  const [activeVariant, setActiveVariant] =
    useState<StreamlineImageVariant>("c");

  useEffect(() => {
    setActiveVariant("c");
  }, [bookId, lessonId]);

  if (!canAccessStudyVariants) {
    return (
      <StreamlineScriptImage bookId={bookId} lessonId={lessonId} variant="c" />
    );
  }

  return (
    <div className="space-y-3">
      <div
        className="inline-flex rounded-lg bg-gray-100 p-0.5"
        role="group"
        aria-label="Nội dung bài học"
      >
        {SPEAKING_VARIANTS.map(({ variant, shortLabel, label }) => (
          <button
            key={variant}
            type="button"
            aria-pressed={activeVariant === variant}
            onClick={() => setActiveVariant(variant)}
            className={segmentButtonClass(activeVariant === variant)}
          >
            <span className="sm:hidden">{shortLabel}</span>
            <span className="hidden sm:inline">{label}</span>
          </button>
        ))}
      </div>
      <StreamlineScriptImage
        bookId={bookId}
        lessonId={lessonId}
        variant={activeVariant}
      />
    </div>
  );
}

function DuobookScriptPanel({
  bookId,
  lessonId,
  vocabulary = [],
}: {
  bookId: string;
  lessonId: number;
  vocabulary?: Pick<Word, "word" | "mean" | "ipa">[];
}) {
  const { data: lesson, isLoading } = useDuobookLesson(bookId, lessonId);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 px-4 py-8">
        <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!lesson) {
    return <NoScriptPlaceholder />;
  }

  const lineCount = Math.min(lesson.script.length, lesson.mean.length);
  const lines =
    lineCount > 0
      ? Array.from({ length: lineCount }, (_, i) => ({
          script: (lesson.script[i] ?? "").trim(),
          mean: (lesson.mean[i] ?? "").trim(),
        })).filter((line) => line.script || line.mean)
      : [];

  if (lines.length === 0) {
    return <NoScriptPlaceholder />;
  }

  return (
    <div className="rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 overflow-hidden">
      {lesson.title ? (
        <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50">
          <h3 className="text-lg font-semibold text-blue-600">
            {lesson.title}
          </h3>
        </div>
      ) : null}
      <ul className="divide-y divide-gray-100 dark:divide-gray-700 max-h-[min(420px,50vh)] overflow-y-auto">
        {lines.map((line, index) => (
          <li key={index} className="px-4 py-2.5 space-y-0.5">
            {line.script ? (
              <div className="font-medium text-gray-900 dark:text-gray-100 leading-snug">
                <ScriptInteractiveText
                  text={line.script}
                  vocabulary={vocabulary}
                  lineMean={line.mean}
                />
              </div>
            ) : null}
            {line.mean ? (
              <p className="text-sm text-gray-600 dark:text-gray-400 leading-snug">
                {line.mean}
              </p>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function LessonScriptPanel({
  selectedBook,
  selectedLesson,
  context = "vocabulary",
  vocabulary = [],
}: LessonScriptPanelProps) {
  if (!selectedBook || !selectedLesson) return null;

  const bookNum = parseInt(selectedBook, 10);
  if (!Number.isFinite(bookNum)) return null;

  if (bookNum >= 1 && bookNum <= 4) {
    if (context === "speaking") {
      return (
        <StreamlineSpeakingPanel bookId={bookNum} lessonId={selectedLesson} />
      );
    }
    return (
      <StreamlineScriptImage
        bookId={bookNum}
        lessonId={selectedLesson}
        variant="c"
      />
    );
  }

  if (bookNum >= 5 && bookNum <= 8) {
    return (
      <DuobookScriptPanel
        bookId={selectedBook}
        lessonId={selectedLesson}
        vocabulary={vocabulary}
      />
    );
  }

  return null;
}
