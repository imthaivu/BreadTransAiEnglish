"use client";

import { useLearnSelection } from "@/components/layout/LearnSelectionProvider";
import { useLearnTab } from "@/components/layout/LearnTabProvider";
import { useAuth } from "@/lib/auth/context";
import { db } from "@/lib/firebase/client";
import type { LearnTabId } from "@/lib/learn-tabs";
import { useQuery } from "@tanstack/react-query";
import { doc, getDoc } from "firebase/firestore";
import { useMemo } from "react";

const TABS = [
  { id: "vocabulary", label: "Từ vựng" },
  { id: "speaking", label: "Speaking" },
] as const;

export default function LearnTabs() {
  const { activeTab, setLearnTab } = useLearnTab();
  const { selectedBook } = useLearnSelection();
  const { session } = useAuth();
  const userId = session?.user?.id || "";

  const {
    data: vocabProgress,
    isLoading: isLoadingVocabProgress,
  } = useQuery<{
    needQuizs: number[];
    completedLessons: number[];
  }>({
    queryKey: [
      "completedLessons",
      userId,
      selectedBook,
      "vocabNeedRemaining",
    ],
    enabled: !!userId && !!selectedBook,
    staleTime: 10_000,
    queryFn: async () => {
      const ref = doc(db, "userBookProgress", `${userId}_${selectedBook}`);
      const snap = await getDoc(ref);
      if (!snap.exists()) return { needQuizs: [], completedLessons: [] };
      const data = snap.data() as {
        needQuizs?: number[];
        completedLessons?: number[];
      };
      return {
        needQuizs: (data.needQuizs ?? []) as number[],
        completedLessons: (data.completedLessons ?? []) as number[],
      };
    },
  });

  const remainingVocabCount = useMemo(() => {
    const needQuizs = vocabProgress?.needQuizs ?? [];
    const completedSet = new Set(vocabProgress?.completedLessons ?? []);
    return needQuizs.filter((lessonId) => !completedSet.has(lessonId)).length;
  }, [vocabProgress]);

  const {
    data: speakingProgress,
    isLoading: isLoadingSpeakingProgress,
  } = useQuery<{
    needSpeakings: number[];
    completedLessonsSpeaking: number[];
  }>({
    queryKey: [
      "completedLessonsSpeaking",
      userId,
      selectedBook,
      "speakingNeedRemaining",
    ],
    enabled: !!userId && !!selectedBook,
    staleTime: 10_000,
    queryFn: async () => {
      const ref = doc(db, "userBookProgress", `${userId}_${selectedBook}`);
      const snap = await getDoc(ref);
      if (!snap.exists())
        return { needSpeakings: [], completedLessonsSpeaking: [] };
      const data = snap.data() as {
        needSpeakings?: number[];
        completedLessonsSpeaking?: number[];
      };
      return {
        needSpeakings: (data.needSpeakings ?? []) as number[],
        completedLessonsSpeaking: (data.completedLessonsSpeaking ?? []) as number[],
      };
    },
  });

  const remainingSpeakingCount = useMemo(() => {
    const needSpeakings = speakingProgress?.needSpeakings ?? [];
    const completedSet = new Set(
      speakingProgress?.completedLessonsSpeaking ?? []
    );
    return needSpeakings.filter((lessonId) => !completedSet.has(lessonId)).length;
  }, [speakingProgress]);

  return (
    <div className="mb-1 p-1 rounded-xl bg-gray-100">
      <div className="flex gap-1">
        {TABS.map(({ id, label }) => {
          const isActive = activeTab === id;
          const isVocab = id === "vocabulary";
          const isLoadingTab = isVocab
            ? isLoadingVocabProgress
            : isLoadingSpeakingProgress;
          const remainingCount = isVocab
            ? remainingVocabCount
            : remainingSpeakingCount;

          const badgeText = isLoadingTab ? "..." : String(remainingCount);

          const badgeToneClass = isLoadingTab
            ? "bg-gray-400 text-white border-gray-500"
            : remainingCount > 0
              ? "bg-red-500 text-white border-red-600"
              : "bg-blue-500 text-white border-blue-600";

          return (
            <div key={id} className="flex-1">
              <button
                type="button"
                onClick={() => setLearnTab(id as LearnTabId)}
                className={`
                  relative w-full text-center py-2.5 px-4 rounded-lg text-sm font-medium transition-colors
                  ${isActive ? "bg-white text-primary shadow-sm" : "text-gray-600 hover:text-gray-900 hover:bg-gray-50"}
                `}
              >
                {label}
                <span
                  className={`
                    pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 inline-flex items-center justify-center px-2 py-0.5 rounded-full text-[10px] font-semibold border shadow-sm
                    ${badgeToneClass}
                  `}
                  aria-label={
                    id === "vocabulary"
                      ? `Từ vựng: ${remainingVocabCount} bài còn lại`
                      : `Speaking: ${remainingSpeakingCount} bài còn lại`
                  }
                >
                  {badgeText}
                </span>
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
