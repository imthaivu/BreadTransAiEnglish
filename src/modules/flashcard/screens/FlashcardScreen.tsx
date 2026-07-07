"use client";

import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { StaggerContainer, StaggerItem } from "@/components/ui/PageMotion";
import { playSound } from "@/lib/audio/soundManager";
import {
  CompletionScreen,
  Confetti,
  ConfirmExit,
  Guide,
  LearningView,
  LearningViewLayout,
  QuizStageFlow,
  ReviewWordsModal,
  StatusDisplay,
  useDuobookSentences,
  useFlashcard,
  WordListPreview,
} from "@/modules/flashcard";
import { useLearnSelection } from "@/components/layout/LearnSelectionProvider";
import FlashcardCard from "@/modules/flashcard/components/FlashcardCard";
import type { QuizFinishPayload } from "@/modules/flashcard/components/QuizStageFlow";
import { useImagePreloader } from "@/modules/flashcard/utils/useImagePreloader";
import { Word } from "@/modules/flashcard/types";
import "@/modules/flashcard/components/flashcard.css";
import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useHomeUiStore } from "@/lib/homeUiStore";
import { learnActivityStore } from "@/modules/presence";
import { cn } from "@/utils";

const FLASHCARD_LIST_SHOW_IMAGES_KEY = "flashcard_list_show_images";

export default function FlashcardScreen() {
  const searchParams = useSearchParams();
  const classIdFromUrl = searchParams.get("classId") || undefined;
  const [showConfetti, setShowConfetti] = useState(false);
  const [showCompletion, setShowCompletion] = useState(false);
  const [showLearningModal, setShowLearningModal] = useState(false);
  const [showConfirmExit, setShowConfirmExit] = useState(false);
  const [showReviewModal, setShowReviewModal] = useState(false);
  const [showReviewWarningModal, setShowReviewWarningModal] = useState(false);
  const [pendingStartMode, setPendingStartMode] = useState<"flashcard" | "quiz" | null>(null);
  const [showImage, setShowImage] = useState<boolean>(true);
  const [completedMode, setCompletedMode] = useState<"flashcard" | "quiz">("flashcard"); // Store mode when completion happens
  const [isListAutoPlaying, setIsListAutoPlaying] = useState(false);
  const [listCurrentIndex, setListCurrentIndex] = useState(0);
  const [listAutoPlayWord, setListAutoPlayWord] = useState<Word | null>(null);
  const [showConfirmStopListAutoPlay, setShowConfirmStopListAutoPlay] = useState(false);
  const [showListImages, setShowListImages] = useState<boolean>(() => {
    if (typeof window === "undefined") {
      return true;
    }

    const savedPreference = window.localStorage.getItem(FLASHCARD_LIST_SHOW_IMAGES_KEY);
    if (savedPreference === null) {
      return true;
    }

    return savedPreference === "true";
  });
  const [quizHeader, setQuizHeader] = useState<{
    progress: number;
    stageTitle: string;
    stageBoundaries: number[];
  } | null>(null);
  const {
    books,
    lessonWords,
    reviewWords,
    completedLessons,
    selectedBook,
    selectedLesson,
    selectedLessons,
    selectedMode,
    deck,
    currentIndex,
    score,
    wrongWords,
    isPlaying,
    isLoading,
    booksError,
    lessonWordsError,
    hiddenWordIndices,
    startLearning,
    handleAnswer,
    handleQuizWordResult,
    finishQuizSession,
    quizSessionSummary,
    quizSessionKey,
    speak,
    reset,
    addToReviewWords,
    isReviewOnlyMode,
  } = useFlashcard();
  const { registerVocabActions } = useLearnSelection();

  const hasLessonSelected = selectedLesson != null;

  const {
    data: duobookSentences = [],
    isFetched: isDuobookFetched,
  } = useDuobookSentences(
    selectedBook,
    selectedLessons,
    !!selectedBook && hasLessonSelected
  );

  // Check browser support for speechSynthesis
  useEffect(() => {
    if (typeof window !== "undefined" && !("speechSynthesis" in window)) {
      alert(
        "Trình duyệt này không hỗ trợ phát âm. Vui lòng đổi trình duyệt sang Chrome, Firefox, Edge hoặc Safari để nghe phát âm mẫu."
      );
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(FLASHCARD_LIST_SHOW_IMAGES_KEY, String(showListImages));
  }, [showListImages]);

  // Handle completion
  useEffect(() => {
    if (!isPlaying && deck.length > 0 && currentIndex >= deck.length) {
      playSound("complete");
      // selectedMode is guaranteed to be "flashcard" | "quiz" when completion happens
      if (selectedMode === "flashcard" || selectedMode === "quiz") {
        setCompletedMode(selectedMode); // Save the current mode when completion happens
      }
      setShowCompletion(true);
      setShowConfetti(true);
      const t = setTimeout(() => setShowConfetti(false), 3000);
      return () => clearTimeout(t);
    }
  }, [isPlaying, deck.length, currentIndex, selectedMode]);

  // Effect to handle unsaved changes (confirm before exit)
  useEffect(() => {
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (isPlaying) {
        event.preventDefault();
        event.returnValue = ""; // Required for most browsers
      }
    };

    window.addEventListener("beforeunload", handleBeforeUnload);

    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [isPlaying]);

  // Calculate preview words list (similar to startLearning logic)
  const previewWords = useMemo(() => {
    if (isPlaying) {
      return [];
    }

    if (reviewWords.length > 0 && (!selectedBook || !hasLessonSelected)) {
      return [...reviewWords];
    }

    if (!selectedBook || !hasLessonSelected || lessonWords.length === 0) {
      return [];
    }

    if (reviewWords.length > 10) {
      return [...reviewWords];
    }

    const orderedWords: Word[] = [];
    const seen = new Set<string>();

    const appendUnique = (words: Word[]) => {
      words.forEach((word) => {
        if (!seen.has(word.word)) {
          orderedWords.push(word);
          seen.add(word.word);
        }
      });
    };

    appendUnique(lessonWords);
    appendUnique(reviewWords);

    return orderedWords;
  }, [isPlaying, selectedBook, selectedLesson, lessonWords, reviewWords, hasLessonSelected]);

  // Auto-play list mode: tự động phát từng từ mỗi 3 giây
  useEffect(() => {
    if (!isListAutoPlaying || selectedMode !== "list" || previewWords.length === 0) {
      return;
    }

    const interval = setInterval(() => {
      setListCurrentIndex((prevIndex) => {
        const nextIndex = prevIndex + 1;
        if (nextIndex >= previewWords.length) {
          // Kết thúc auto-play
          setIsListAutoPlaying(false);
          setListCurrentIndex(0);
          setListAutoPlayWord(null);
          return prevIndex;
        }
        // Phát âm từ tiếp theo
        const nextWord = previewWords[nextIndex];
        speak(nextWord.word);
        setListAutoPlayWord(nextWord);
        return nextIndex;
      });
    }, 3000); // Mỗi 3 giây

    return () => clearInterval(interval);
  }, [isListAutoPlaying, selectedMode, previewWords, speak]);

  // Preload images for the next 10 words when auto-playing in list mode
  useImagePreloader(
    isListAutoPlaying && selectedMode === "list" ? previewWords : [],
    listCurrentIndex,
    10
  );

  const beginSession = (mode: "flashcard" | "quiz", withImages = true) => {
    if (mode === "flashcard") {
      setShowImage(withImages);
    }
    if (startLearning(mode)) {
      setShowCompletion(false);
      useHomeUiStore.getState().setLearnSessionActive(true);
      setShowLearningModal(true);
    }
  };

  const handleStartQuiz = () => {
    playSound("click");
    if (reviewWords.length > 10) {
      setPendingStartMode("quiz");
      setShowReviewWarningModal(true);
      return;
    }
    beginSession("quiz");
  };

  const handleStartFlashcard = () => {
    playSound("click");
    if (reviewWords.length > 10) {
      setPendingStartMode("flashcard");
      setShowReviewWarningModal(true);
      return;
    }
    beginSession("flashcard", true);
  };

  const handleRestart = () => {
    if (completedMode === "quiz") {
      handleStartQuiz();
    } else {
      handleStartFlashcard();
    }
  };

  // Handle answer with sound effects
  const handleAnswerWithSound = (isCorrect: boolean, word?: Word) => {
    // Sounds are now only handled inside the QuizCard component.
    handleAnswer(isCorrect, word);
  };

  // Kết thúc luồng quiz nhiều giai đoạn -> hiển thị màn hoàn thành
  const handleQuizFinish = (payload: QuizFinishPayload) => {
    finishQuizSession(payload.summary, payload.plan);
    setCompletedMode("quiz");
    setShowCompletion(true);
  };

  // Handle flashcard flip - add word to review words
  const handleFlip = (word: Word) => {
    addToReviewWords(word);
  };

  const forceCloseLearningModal = () => {
    reset();
    useHomeUiStore.getState().setLearnSessionActive(false);
    setQuizHeader(null);
    setShowLearningModal(false);
    setShowCompletion(false);
    setShowConfirmExit(false);
    setShowImage(true);
    setCompletedMode("flashcard");
  };

  const handleBackFromLearning = () => {
    if (isPlaying && !showCompletion) {
      setShowConfirmExit(true);
    } else {
      forceCloseLearningModal();
    }
  };

  const handleCloseLearningView = () => {
    forceCloseLearningModal();
  };

  const canStartVocab =
    !isPlaying && !!selectedBook && hasLessonSelected && lessonWords.length > 0;

  const handleStartQuizRef = useRef(handleStartQuiz);
  const handleStartFlashcardRef = useRef(handleStartFlashcard);
  handleStartQuizRef.current = handleStartQuiz;
  handleStartFlashcardRef.current = handleStartFlashcard;

  useEffect(() => {
    registerVocabActions({
      canStart: canStartVocab,
      onStartFlashcard: () => handleStartFlashcardRef.current(),
      onStartQuiz: () => handleStartQuizRef.current(),
    });
    return () => registerVocabActions(null);
  }, [canStartVocab, registerVocabActions]);

  // Tạo danh sách books từ data
  const selectedLessonKey = selectedLesson != null ? String(selectedLesson) : "";

  useEffect(() => {
    const isActive = showLearningModal || isListAutoPlaying;
    useHomeUiStore.getState().setLearnSessionActive(isActive);
    return () => {
      useHomeUiStore.getState().setLearnSessionActive(false);
    };
  }, [showLearningModal, isListAutoPlaying]);

  useEffect(() => {
    if (!selectedBook && !hasLessonSelected) return;
    const mappedMode =
      isPlaying && selectedMode === "quiz"
        ? "quiz"
        : isPlaying && selectedMode === "flashcard"
          ? "flashcard"
          : "đáp án";
    const bookName =
      books.find((b) => String(b.id) === selectedBook)?.name ||
      (selectedBook ? `Sách ${selectedBook}` : undefined);
    const pending = showLearningModal || isListAutoPlaying;

    learnActivityStore.setState({
      miniTab: "Từ vựng",
      mode: mappedMode,
      bookName,
      lessons: selectedLesson != null ? [selectedLesson] : [],
      pending,
    });
  }, [
    books,
    isPlaying,
    isListAutoPlaying,
    showLearningModal,
    selectedBook,
    selectedLessonKey,
    selectedMode,
  ]);

  const isFlashcardSession =
    isPlaying &&
    selectedMode === "flashcard" &&
    deck.length > 0 &&
    currentIndex < deck.length;

  const flashcardProgress = isFlashcardSession
    ? ((currentIndex + 1) / deck.length) * 100
    : undefined;

  return (
    <div
      className={cn(
        "bg-white overflow-x-hidden",
        showLearningModal
          ? "flex flex-col min-h-[calc(100vh-122px)]"
          : "min-h-[calc(100vh-140px)]"
      )}
    >
      {showLearningModal ? (
        <div className="flex flex-col flex-1 min-h-0">
        <LearningViewLayout
          onBack={handleBackFromLearning}
          progress={
            isPlaying && selectedMode === "quiz"
              ? (quizHeader?.progress ?? 0)
              : flashcardProgress
          }
          stageTitle={
            isPlaying && selectedMode === "quiz"
              ? (quizHeader?.stageTitle ?? "")
              : isFlashcardSession
                ? "Flashcard"
                : undefined
          }
          stageBoundaries={
            isPlaying && selectedMode === "quiz"
              ? (quizHeader?.stageBoundaries ?? [])
              : undefined
          }
        >
          {isPlaying &&
            deck.length > 0 &&
            currentIndex < deck.length &&
            selectedMode === "flashcard" && (
              <LearningView
                mode="flashcard"
                deck={deck}
                currentIndex={currentIndex}
                score={score}
                wrongWordsCount={wrongWords.length}
                onAnswer={handleAnswerWithSound}
                onSpeak={speak}
                hiddenWordIndices={hiddenWordIndices}
                onFlip={handleFlip}
                showImage={showImage}
              />
            )}

          {isPlaying &&
            deck.length > 0 &&
            selectedMode === "quiz" &&
            !isDuobookFetched && (
              <div className="flex flex-1 min-h-0 items-center justify-center">
                <div className="flex flex-col items-center gap-3 text-gray-600">
                  <div
                    className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin"
                    aria-hidden
                  />
                  <p className="text-sm">Đang tải câu hỏi...</p>
                </div>
              </div>
            )}

          {isPlaying &&
            deck.length > 0 &&
            selectedMode === "quiz" &&
            isDuobookFetched && (
              <QuizStageFlow
                key={quizSessionKey}
                sessionKey={quizSessionKey}
                words={deck}
                sentences={duobookSentences}
                onSpeak={speak}
                onFinish={handleQuizFinish}
                onHeaderChange={setQuizHeader}
                onWordResult={handleQuizWordResult}
              />
            )}

          {showCompletion && (
            <div className="flex-1 min-h-0 flex flex-col">
            <CompletionScreen
              deckLength={
                completedMode === "quiz" && quizSessionSummary
                  ? quizSessionSummary.total
                  : deck.length
              }
              score={
                completedMode === "quiz" && quizSessionSummary
                  ? quizSessionSummary.correct
                  : score
              }
              accuracy={
                completedMode === "quiz" && quizSessionSummary
                  ? quizSessionSummary.accuracy
                  : undefined
              }
              wrongWords={wrongWords}
              onRestart={handleRestart}
              onClose={handleCloseLearningView}
              bookName={
                books.find((b) => b.id.toString() === selectedBook)?.name || ""
              }
              bookId={selectedBook || undefined}
              selectedLesson={selectedLesson ?? undefined}
              completedLessons={completedLessons}
              mode={completedMode}
              isReviewOnlyMode={isReviewOnlyMode}
              classId={classIdFromUrl}
            />
            </div>
          )}

          <Confetti show={showConfetti} duration={3000} />
        </LearningViewLayout>
        </div>
      ) : (
        <StaggerContainer>
          <StaggerItem>
            <StatusDisplay
              isLoading={isLoading}
              booksError={booksError}
              lessonWordsError={lessonWordsError}
            />
          </StaggerItem>

          {!isLoading && books.length > 0 && previewWords.length === 0 && !hasLessonSelected && (
            <StaggerItem>
              <p className="text-center text-sm text-gray-500 py-4">
                Chọn sách và bài ở phía trên để bắt đầu.
              </p>
            </StaggerItem>
          )}

          {previewWords.length > 0 && (
            <StaggerItem>
              <div className="mt-4 max-w-4xl mx-auto ">
                <WordListPreview
                  words={previewWords}
                  reviewWords={reviewWords}
                  onSpeak={speak}
                  currentIndex={isListAutoPlaying ? listCurrentIndex : -1}
                  isAutoPlaying={isListAutoPlaying}
                  showImages={showListImages}
                  onShowImagesChange={setShowListImages}
                />
              </div>
            </StaggerItem>
          )}

          {isListAutoPlaying && listAutoPlayWord && (
            <Modal
              open={isListAutoPlaying}
              onClose={() => {
                setShowConfirmStopListAutoPlay(true);
              }}
              maxWidth="md"
              showHeader={false}
              hideCloseButton={false}
              overlayClassName="bg-black/60"
              className="p-0 w-auto max-w-md flashcard-modal-fit-content"
            >
              <div className="relative flex flex-col justify-center items-center p-2 gap-2">
                <FlashcardCard
                  data={listAutoPlayWord}
                  onAnswer={() => {}}
                  onSpeak={speak || (() => {})}
                  showImage={true}
                />
                <div className="text-center px-3 py-1.5 bg-blue-50 rounded-lg border border-blue-200 w-full">
                  <p className="text-base font-semibold text-gray-800">
                    {listAutoPlayWord.mean}
                  </p>
                </div>
                <div className="text-center text-sm text-gray-600 mt-2">
                  {listCurrentIndex + 1} / {previewWords.length}
                </div>
              </div>
            </Modal>
          )}

          <Modal
            open={showConfirmStopListAutoPlay}
            onClose={() => setShowConfirmStopListAutoPlay(false)}
            maxWidth="sm"
            showHeader={true}
            title="Xác nhận kết thúc"
          >
            <div className="p-4">
              <p className="text-gray-700 mb-4">
                Bạn có chắc chắn muốn kết thúc việc tự động phát từ không?
              </p>
              <div className="flex justify-end gap-3">
                <Button
                  variant="outline"
                  onClick={() => setShowConfirmStopListAutoPlay(false)}
                >
                  Hủy
                </Button>
                <Button
                  onClick={() => {
                    setIsListAutoPlaying(false);
                    setListCurrentIndex(0);
                    setListAutoPlayWord(null);
                    setShowConfirmStopListAutoPlay(false);
                  }}
                  className="bg-red-600 text-white hover:bg-red-700"
                >
                  Kết thúc
                </Button>
              </div>
            </div>
          </Modal>

          <Guide />
        </StaggerContainer>
      )}

      <ConfirmExit
        open={showConfirmExit}
        onClose={() => setShowConfirmExit(false)}
        onConfirm={forceCloseLearningModal}
      />

      <ReviewWordsModal
        open={showReviewModal}
        onClose={() => setShowReviewModal(false)}
        reviewWords={reviewWords}
        onSpeak={speak}
      />

      <Modal
        open={showReviewWarningModal}
        onClose={() => setShowReviewWarningModal(false)}
        title="⚠️ Quá nhiều từ cần ôn"
        maxWidth="md"
      >
        <div className="p-4">
          <p className="text-gray-700 mb-4">
            Bạn đang có{" "}
            <strong className="text-orange-600">{reviewWords.length} từ</strong>{" "}
            cần ôn tập.
          </p>
          <p className="text-gray-700 mb-4">
            Để đảm bảo hiệu quả học tập, vui lòng{" "}
            <strong>giảm số từ ôn xuống dưới 10</strong> trước khi làm bài mới.
          </p>

          <div className="flex gap-3 justify-end">
            <Button
              variant="outline"
              onClick={() => setShowReviewWarningModal(false)}
              className="px-4 py-2"
            >
              Đóng
            </Button>
            <Button
              onClick={() => {
                setShowReviewWarningModal(false);
                const mode = pendingStartMode ?? "quiz";
                setPendingStartMode(null);
                beginSession(mode, mode === "flashcard");
              }}
              className="px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white"
            >
              Làm từ ôn ({reviewWords.length})
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
