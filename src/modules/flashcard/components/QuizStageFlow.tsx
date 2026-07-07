"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DuobookSentence, QuizSessionSummary, Word } from "../types";
import { playSound } from "@/lib/audio/soundManager";
import {
  buildQuizSessionPlan,
  getPlanStageLength,
  QuizSessionPlan,
} from "../utils/quizSessionTotals";
import MatchPairsCard from "./MatchPairsCard";
import SentenceMatchPairsCard from "./SentenceMatchPairsCard";
import SentenceBuildCard from "./SentenceBuildCard";
import QuizCard from "./QuizCard";

export type { QuizSessionSummary, QuizSessionPlan };

export interface QuizHeaderState {
  progress: number;
  stageTitle: string;
  stageBoundaries: number[];
}

export interface QuizFinishPayload {
  summary: Pick<QuizSessionSummary, "correct" | "total">;
  plan: QuizSessionPlan;
}

interface QuizStageFlowProps {
  words: Word[];
  sentences: DuobookSentence[];
  sessionKey: number;
  onSpeak: (text: string) => void;
  onFinish: (payload: QuizFinishPayload) => void;
  onHeaderChange?: (header: QuizHeaderState) => void;
  onWordResult?: (isCorrect: boolean, word: Word) => void;
}

const STAGE_TITLES: Record<number, string> = {
  1: "Ghép cặp",
  2: "Ghép câu",
  3: "Trắc nghiệm",
  4: "Ráp câu Việt",
  5: "Ráp câu Anh",
};

function getStageProgress(
  stage: number,
  matchDone: number,
  quizIdx: number,
  sentenceIdx: number
): number {
  switch (stage) {
    case 1:
    case 2:
      return matchDone;
    case 3:
      return quizIdx;
    case 4:
    case 5:
      return sentenceIdx;
    default:
      return 0;
  }
}

export default function QuizStageFlow({
  words,
  sentences,
  sessionKey,
  onSpeak,
  onFinish,
  onHeaderChange,
  onWordResult,
}: QuizStageFlowProps) {
  const plan = useMemo(
    () => buildQuizSessionPlan(words, sentences),
    // Plan is fixed per quiz session; sessionKey bumps on each startLearning("quiz").
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sessionKey]
  );

  const { activeStages } = plan;

  const headerRef = useRef<QuizHeaderState | null>(null);

  const [stagePtr, setStagePtr] = useState(0);
  const [sentenceIdx, setSentenceIdx] = useState(0);
  const [quizIdx, setQuizIdx] = useState(0);
  const [matchDone, setMatchDone] = useState(0);

  const resultRef = useRef<Pick<QuizSessionSummary, "correct" | "total">>({
    correct: 0,
    total: 0,
  });

  const currentStage = activeStages[stagePtr];

  const { progress, stageTitle, stageBoundaries } = useMemo(() => {
    if (currentStage === undefined) {
      return { progress: 0, stageTitle: "", stageBoundaries: [] as number[] };
    }

    const stageCount = activeStages.length;
    const segmentPct = stageCount > 0 ? 100 / stageCount : 0;

    const boundaries =
      stageCount > 1
        ? activeStages.slice(0, -1).map((_, i) =>
            Math.round(segmentPct * (i + 1))
          )
        : [];

    const stageTotal = getPlanStageLength(plan, currentStage);
    const stageDone = getStageProgress(
      currentStage,
      matchDone,
      quizIdx,
      sentenceIdx
    );
    const base = stagePtr * segmentPct;
    const inStage =
      stageTotal > 0 ? (stageDone / stageTotal) * segmentPct : 0;
    const progressValue = Math.round(Math.min(100, base + inStage));

    return {
      progress: progressValue,
      stageTitle: STAGE_TITLES[currentStage] ?? "",
      stageBoundaries: boundaries,
    };
  }, [
    activeStages,
    stagePtr,
    currentStage,
    plan,
    matchDone,
    sentenceIdx,
    quizIdx,
  ]);

  useEffect(() => {
    const next = { progress, stageTitle, stageBoundaries };
    const prev = headerRef.current;
    if (
      prev &&
      prev.progress === next.progress &&
      prev.stageTitle === next.stageTitle &&
      prev.stageBoundaries.length === next.stageBoundaries.length &&
      prev.stageBoundaries.every((v, i) => v === next.stageBoundaries[i])
    ) {
      return;
    }
    headerRef.current = next;
    onHeaderChange?.(next);
  }, [progress, stageTitle, stageBoundaries, onHeaderChange]);

  const addResult = useCallback((correct: number, total: number) => {
    resultRef.current = {
      correct: resultRef.current.correct + correct,
      total: resultRef.current.total + total,
    };
  }, []);

  const advanceStage = useCallback(() => {
    const next = stagePtr + 1;
    if (next >= activeStages.length) {
      onFinish({ summary: resultRef.current, plan });
      return;
    }
    setSentenceIdx(0);
    setQuizIdx(0);
    setMatchDone(0);
    setStagePtr(next);
  }, [stagePtr, activeStages.length, onFinish, plan]);

  const handleMatchComplete = useCallback(
    (summary: Pick<QuizSessionSummary, "correct" | "total">) => {
      addResult(summary.correct, summary.total);
      advanceStage();
    },
    [addResult, advanceStage]
  );

  const handleMatchProgress = useCallback((done: number, _total: number) => {
    setMatchDone((prev) => (prev === done ? prev : done));
  }, []);

  const handleSentenceResult = useCallback(
    (isCorrect: boolean, sentenceList: DuobookSentence[]) => {
      addResult(isCorrect ? 1 : 0, 1);
      if (sentenceIdx + 1 < sentenceList.length) {
        setSentenceIdx((prev) => prev + 1);
      } else {
        advanceStage();
      }
    },
    [addResult, advanceStage, sentenceIdx]
  );

  const handleQuizAnswer = useCallback(
    (isCorrect: boolean, word?: Word) => {
      if (word) onWordResult?.(isCorrect, word);
      addResult(isCorrect ? 1 : 0, 1);
      if (quizIdx + 1 < plan.quizWords.length) {
        setQuizIdx((prev) => prev + 1);
      } else {
        advanceStage();
      }
    },
    [addResult, advanceStage, quizIdx, plan.quizWords.length, onWordResult]
  );

  if (currentStage === undefined) return null;

  return (
    <div className="w-full flex flex-col flex-1 min-h-0">
      {currentStage === 1 && (
        <MatchPairsCard
          words={plan.matchWords}
          onSpeak={onSpeak}
          onComplete={handleMatchComplete}
          onMatchProgress={handleMatchProgress}
          onPairResult={onWordResult}
        />
      )}

      {currentStage === 2 && plan.tapMatchSentences.length > 0 && (
        <SentenceMatchPairsCard
          sentences={plan.tapMatchSentences}
          onSpeak={onSpeak}
          onComplete={handleMatchComplete}
          onMatchProgress={handleMatchProgress}
        />
      )}

      {currentStage === 3 && plan.quizWords[quizIdx] && (
        <div className="w-full max-w-2xl sm:max-w-3xl lg:max-w-4xl mx-auto">
          <QuizCard
            key={`q-${quizIdx}`}
            data={plan.quizWords[quizIdx]}
            allData={words}
            onAnswer={handleQuizAnswer}
            timer={5}
            onSpeak={onSpeak}
            playSound={playSound}
            hideWord={false}
          />
        </div>
      )}

      {currentStage === 4 && plan.rapVietSentences[sentenceIdx] && (
        <SentenceBuildCard
          key={`s4-${sentenceIdx}`}
          sentence={plan.rapVietSentences[sentenceIdx]}
          showText={true}
          onSpeak={onSpeak}
          onResult={(c) => handleSentenceResult(c, plan.rapVietSentences)}
        />
      )}

      {currentStage === 5 && plan.rapAnhSentences[sentenceIdx] && (
        <SentenceBuildCard
          key={`s5-${sentenceIdx}`}
          sentence={plan.rapAnhSentences[sentenceIdx]}
          showText={false}
          onSpeak={onSpeak}
          onResult={(c) => handleSentenceResult(c, plan.rapAnhSentences)}
        />
      )}
    </div>
  );
}
