"use client";

import {
  readLearnSelection,
  writeLearnSelection,
} from "@/lib/learn-selection";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

export type LearnVocabActions = {
  canStart: boolean;
  onStartFlashcard: () => void;
  onStartQuiz: () => void;
};

type LearnSelectionContextValue = {
  selectedBook: string | null;
  selectedLesson: number | null;
  setSelectedBook: (bookId: string) => void;
  setSelectedLesson: (lessonId: number | null) => void;
  isHydrated: boolean;
  canStartVocab: boolean;
  startVocabFlashcard: () => void;
  startVocabQuiz: () => void;
  registerVocabActions: (actions: LearnVocabActions | null) => void;
};

const LearnSelectionContext = createContext<LearnSelectionContextValue | null>(
  null
);

export function LearnSelectionProvider({ children }: { children: ReactNode }) {
  const [selectedBook, setSelectedBookState] = useState<string | null>(null);
  const [selectedLesson, setSelectedLessonState] = useState<number | null>(
    null
  );
  const [isHydrated, setIsHydrated] = useState(false);
  const [canStartVocab, setCanStartVocab] = useState(false);
  const vocabActionsRef = useRef<LearnVocabActions | null>(null);

  useEffect(() => {
    const stored = readLearnSelection();
    setSelectedBookState(stored.bookId);
    setSelectedLessonState(stored.lessonId);
    setIsHydrated(true);
  }, []);

  const setSelectedBook = useCallback((bookId: string) => {
    setSelectedBookState(bookId);
    setSelectedLessonState(null);
    writeLearnSelection({ bookId, lessonId: null });
  }, []);

  const setSelectedLesson = useCallback((lessonId: number | null) => {
    setSelectedLessonState(lessonId);
  }, []);

  useEffect(() => {
    if (!isHydrated) return;
    writeLearnSelection({ bookId: selectedBook, lessonId: selectedLesson });
  }, [selectedBook, selectedLesson, isHydrated]);

  const registerVocabActions = useCallback(
    (actions: LearnVocabActions | null) => {
      vocabActionsRef.current = actions;
      const nextCanStart = actions?.canStart ?? false;
      setCanStartVocab((prev) => (prev === nextCanStart ? prev : nextCanStart));
    },
    []
  );

  const startVocabFlashcard = useCallback(() => {
    vocabActionsRef.current?.onStartFlashcard();
  }, []);

  const startVocabQuiz = useCallback(() => {
    vocabActionsRef.current?.onStartQuiz();
  }, []);

  const value = useMemo(
    () => ({
      selectedBook,
      selectedLesson,
      setSelectedBook,
      setSelectedLesson,
      isHydrated,
      canStartVocab,
      startVocabFlashcard,
      startVocabQuiz,
      registerVocabActions,
    }),
    [
      selectedBook,
      selectedLesson,
      setSelectedBook,
      setSelectedLesson,
      isHydrated,
      canStartVocab,
      startVocabFlashcard,
      startVocabQuiz,
      registerVocabActions,
    ]
  );

  return (
    <LearnSelectionContext.Provider value={value}>
      {children}
    </LearnSelectionContext.Provider>
  );
}

export function useLearnSelection(): LearnSelectionContextValue {
  const context = useContext(LearnSelectionContext);
  if (!context) {
    throw new Error(
      "useLearnSelection must be used within LearnSelectionProvider"
    );
  }
  return context;
}
