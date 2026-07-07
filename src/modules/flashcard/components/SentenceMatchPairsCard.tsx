"use client";

import { useMemo } from "react";
import { DuobookSentence, Word } from "../types";
import MatchPairsCard from "./MatchPairsCard";

interface SentenceMatchPairsCardProps {
  sentences: DuobookSentence[];
  onSpeak: (text: string) => void;
  onComplete: (summary: { correct: number; total: number }) => void;
  onMatchProgress?: (done: number, total: number) => void;
}

/** Tap ghép cặp script (Anh) ↔ mean (Việt) cho giai đoạn 2. */
export default function SentenceMatchPairsCard({
  sentences,
  onSpeak,
  onComplete,
  onMatchProgress,
}: SentenceMatchPairsCardProps) {
  const pairWords = useMemo<Word[]>(
    () =>
      sentences.map((s, index) => ({
        word: s.script,
        mean: s.mean,
        ipa: "",
        book: "",
        lesson: index,
      })),
    [sentences]
  );

  return (
    <MatchPairsCard
      words={pairWords}
      onSpeak={onSpeak}
      onComplete={onComplete}
      onMatchProgress={onMatchProgress}
    />
  );
}
