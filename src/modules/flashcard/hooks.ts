import { useAuth } from "@/lib/auth/context";
import { useLearnSelection } from "@/components/layout/LearnSelectionProvider";
import {
  addOrUpdateReviewWord,
  decreaseReviewCount,
  deleteAllReviewWords,
  getBook,
  getBooks,
  getCompletedLessons,
  getNeedQuizLessons,
  getLessonStatuses,
  getLessonWords,
  getReviewWords,
  getDuobookLesson,
  getDuobookSentences,
  batchAddOrUpdateReviewWords,
  updateBookProgressWithQuizResult,
} from "@/modules/flashcard/services";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Book,
  DuobookSentence,
  DuobookTitle,
  LessonStatus,
  QuizResult,
  QuizSessionSummary,
  ReviewWord,
  SessionAnswer,
  Word,
} from "./types";
import { testSpeechSynthesisWorking } from "./utils";
import { allocateLessonQuizScore, QuizSessionPlan } from "./utils/quizSessionTotals";

export function useBooks() {
  return useQuery<Book[]>({
    queryKey: ["books"],
    queryFn: getBooks,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}

export function useLessons(bookId: string) {
  return useQuery<number[]>({
    queryKey: ["lessons", bookId],
    queryFn: async () => {
      const book = await getBook(bookId);
      if (!book || !book.lessons) return [];
      // Sửa ở đây để trả về mảng số
      const lessons = book.lessons.map((lesson) => lesson.id);
      return lessons;
    },
    enabled: !!bookId,
    staleTime: 5 * 60 * 1000,
  });
}

export function useLessonWords(bookId: string, lessonIds: number[]) {
  return useQuery<Word[]>({
    queryKey: ["lessonWords", bookId, lessonIds],
    queryFn: () => getLessonWords(bookId, lessonIds),
    enabled: !!bookId && lessonIds.length > 0, // Sửa ở đây
    staleTime: 5 * 60 * 1000,
  });
}

export function useDuobookSentences(
  bookId: string | null,
  lessonIds: number[],
  enabled: boolean = true
) {
  return useQuery<DuobookSentence[]>({
    queryKey: ["duobookSentences", bookId, lessonIds],
    queryFn: () => getDuobookSentences(bookId!, lessonIds),
    enabled: enabled && !!bookId && lessonIds.length > 0,
    staleTime: 5 * 60 * 1000,
  });
}

export function useDuobookLesson(
  bookId: string | null,
  lessonId: number | null,
  enabled: boolean = true
) {
  return useQuery<DuobookTitle | null>({
    queryKey: ["duobookLesson", bookId, lessonId],
    queryFn: () => getDuobookLesson(bookId!, lessonId!),
    enabled: enabled && !!bookId && !!lessonId,
    staleTime: 5 * 60 * 1000,
  });
}

export function useReviewWords(userId: string) {
  return useQuery<ReviewWord[]>({
    queryKey: ["reviewWords", userId],
    queryFn: () => getReviewWords(userId) as Promise<ReviewWord[]>,
    enabled: !!userId,
  });
}

export function useCompletedLessons(userId: string, bookId: string | null) {
  return useQuery<number[]>({
    queryKey: ["completedLessons", userId, bookId],
    queryFn: () => getCompletedLessons(userId, bookId!),
    enabled: !!userId && !!bookId,
  });
}

export function useLessonStatuses(userId: string, bookId: string | null) {
  return useQuery({
    queryKey: ["lessonStatuses", userId, bookId],
    queryFn: () => getLessonStatuses(userId, bookId!),
    enabled: !!userId && !!bookId,
  });
}

export function useNeedQuizLessons(userId: string, bookId: string | null) {
  return useQuery<number[]>({
    queryKey: ["needQuizLessons", userId, bookId],
    queryFn: () => getNeedQuizLessons(userId, bookId!),
    enabled: !!userId && !!bookId,
    staleTime: 10000,
  });
}

export function useFlashcard() {
  const { session } = useAuth();
  const userId = session?.user?.id || "";
  const isGuest = !session?.user;
  const queryClient = useQueryClient();
  const { selectedBook, selectedLesson } = useLearnSelection();
  const selectedLessons = selectedLesson != null ? [selectedLesson] : [];

  const [selectedMode, setSelectedMode] = useState<"flashcard" | "quiz" | "list" | "">(
    ""
  );
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [score, setScore] = useState(0);
  const [wrongWords, setWrongWords] = useState<Word[]>([]);
  const [deck, setDeck] = useState<Word[]>([]);
  const [quizTimer, setQuizTimer] = useState<NodeJS.Timeout | null>(null);
  const [sessionAnswers, setSessionAnswers] = useState<SessionAnswer[]>([]);
  const [isReviewOnlyMode, setIsReviewOnlyMode] = useState(false); // Track if only doing review words
  // Kết quả tổng hợp của luồng quiz nhiều giai đoạn (đúng/tổng lượt)
  const [quizSessionSummary, setQuizSessionSummary] =
    useState<QuizSessionSummary | null>(null);
  const [quizSessionKey, setQuizSessionKey] = useState(0);
  const englishVoiceRef = useRef<SpeechSynthesisVoice | null>(null);
  // Track xem speech synthesis có thực sự hoạt động không
  const [isSpeechSynthesisWorking, setIsSpeechSynthesisWorking] = useState<boolean | null>(null);
  const flashcardMountedRef = useRef(true);
  const speakTimeoutsRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const speakVoicesPendingHandlerRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    return () => {
      flashcardMountedRef.current = false;
      speakTimeoutsRef.current.forEach(clearTimeout);
      speakTimeoutsRef.current = [];
      const h = speakVoicesPendingHandlerRef.current;
      if (
        typeof window !== "undefined" &&
        "speechSynthesis" in window &&
        h &&
        speechSynthesis.onvoiceschanged === h
      ) {
        speechSynthesis.onvoiceschanged = null;
      }
      speakVoicesPendingHandlerRef.current = null;
    };
  }, []);

  // Batch review word updates để giảm số lượng writes (chỉ cho add, decrease xử lý ngay)
  // Sử dụng ref để track pending words vì state updates có thể bị delay
  const pendingAddReviewWordsRef = useRef<Word[]>([]);

  const {
    data: books = [],
    isLoading: booksLoading,
    error: booksError,
  } = useBooks();

  const {
    data: lessonsForBook = [],
    isLoading: lessonsLoading,
    error: lessonsError,
  } = useLessons(selectedBook!);

  const {
    data: lessonWords = [],
    isLoading: lessonWordsLoading,
    error: lessonWordsError,
  } = useLessonWords(selectedBook!, selectedLessons);

  const { data: reviewWords = [] } = useReviewWords(userId);

  const { data: completedLessons = [] } = useCompletedLessons(
    userId,
    selectedBook
  );

  const { data: lessonStatuses = new Map() } = useLessonStatuses(
    userId,
    selectedBook
  );

  const { data: needQuizLessons = [] } = useNeedQuizLessons(userId, selectedBook);

  // Mutations for review words - batch operations
  // Quiz mode: khi trả lời sai, cần ôn 2 lần
  const batchAddReviewWordsMutation = useMutation({
    mutationFn: (words: Word[]) => batchAddOrUpdateReviewWords(userId, words, 2),
    onSuccess: () => {
      // Chỉ invalidate một lần sau khi batch complete
      queryClient.invalidateQueries({ queryKey: ["reviewWords", userId] });
    },
  });

  // Mutation để giảm review count ngay lập tức khi trả lời đúng
  const decreaseReviewWordMutation = useMutation({
    mutationFn: (word: Word) => decreaseReviewCount(userId, word),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["reviewWords", userId] });
    },
  });

  // Combined mutation để update userBookProgress với quiz result và lesson status trong 1 transaction
  const updateBookProgressWithQuizResultMutation = useMutation({
    mutationFn: ({
      resultData,
      statusData,
    }: {
      resultData: Omit<QuizResult, "lastAttempt">;
      statusData: Omit<LessonStatus, "lastAttempt">;
    }) => updateBookProgressWithQuizResult(resultData, statusData),
    onSuccess: (_, variables) => {
      // Invalidate queries sau khi save
      queryClient.invalidateQueries({
        queryKey: ["completedLessons", userId, variables.statusData.bookId],
      });
      queryClient.invalidateQueries({
        queryKey: ["lessonStatuses", userId, variables.statusData.bookId],
      });
    },
  });

  // Cập nhật chế độ
  const handleSetSelectedMode = useCallback((mode: "flashcard" | "quiz" | "list" | "") => {
    setSelectedMode(mode);
    setIsPlaying(false);
  }, []);

  // Set to track which words should hide text in quiz mode (20% random)
  const [hiddenWordIndices, setHiddenWordIndices] = useState<Set<number>>(new Set());

  // Bắt đầu học
  const startLearning = useCallback(
    (modeOverride?: "flashcard" | "quiz") => {
      const mode = modeOverride ?? selectedMode;
      if (mode !== "flashcard" && mode !== "quiz") {
        return false;
      }
      if (modeOverride) {
        setSelectedMode(modeOverride);
      }
      if (selectedLesson == null || lessonWords.length === 0) {
        return false;
      }

    // Nếu số từ ôn > 10, chỉ cho phép làm từ ôn, không trộn với bài mới
    let finalDeck: Word[] = [];
    let reviewOnly = false;

    if (reviewWords.length > 10) {
      // Chỉ dùng từ ôn
      finalDeck = [...reviewWords].sort(() => Math.random() - 0.5);
      reviewOnly = true;
    } else {
      // Combine và shuffle deck như bình thường
      const newWords = lessonWords.filter(
        (lw) => !reviewWords.some((rw) => rw.word === lw.word)
      );
      const combinedDeck = [...reviewWords, ...newWords];
      const shuffledDeck = combinedDeck.sort(() => Math.random() - 0.5);
      finalDeck = isGuest ? shuffledDeck.slice(0, 10) : shuffledDeck;
      reviewOnly = false;
    }

    // Set review only mode
    setIsReviewOnlyMode(reviewOnly);

    // Bỏ cơ chế 20% listen-only: giai đoạn nghe đã tách riêng trong luồng quiz nhiều giai đoạn.
    setHiddenWordIndices(new Set());

    setDeck(finalDeck);
    setCurrentIndex(0);
    setScore(0);
    setWrongWords([]);
    setSessionAnswers([]); // Reset session answers
    setQuizSessionSummary(null); // Reset kết quả quiz nhiều giai đoạn
    if (mode === "quiz") {
      setQuizSessionKey((prev) => prev + 1);
    }
    setIsPlaying(true);
    // Reset pending review word updates khi bắt đầu quiz mới (chỉ còn add, decrease đã xử lý ngay)
    pendingAddReviewWordsRef.current = [];
    return true;
  },
    [lessonWords, selectedLesson, isGuest, reviewWords, selectedMode]
  );

  // Xử lý kết quả từ trong luồng quiz nhiều giai đoạn (không advance deck)
  const handleQuizWordResult = useCallback(
    (isCorrect: boolean, word: Word) => {
      if (selectedMode !== "quiz" || isGuest || !word?.word) return;

      const reviewWordsSet = new Set(reviewWords.map((rw) => rw.word));

      if (isCorrect) {
        if (reviewWordsSet.has(word.word)) {
          decreaseReviewWordMutation.mutate(word);
        }
      } else {
        setWrongWords((prev) =>
          prev.some((w) => w.word === word.word) ? prev : [...prev, word]
        );
        if (
          !pendingAddReviewWordsRef.current.some((w) => w.word === word.word)
        ) {
          pendingAddReviewWordsRef.current.push(word);
        }
      }
    },
    [
      selectedMode,
      isGuest,
      reviewWords,
      decreaseReviewWordMutation,
    ]
  );

  const flushPendingReviewWords = useCallback(() => {
    if (isGuest) return;
    const wordsToAdd = [...pendingAddReviewWordsRef.current];
    if (wordsToAdd.length > 0) {
      batchAddReviewWordsMutation.mutate(wordsToAdd);
      pendingAddReviewWordsRef.current = [];
    }
  }, [isGuest, batchAddReviewWordsMutation]);

  // Xử lý câu trả lời
  const handleAnswer = useCallback(
    (isCorrect: boolean, word?: Word) => {
      const currentWord = word || deck[currentIndex];
      if (!currentWord) return;

      // Record the answer for final calculation
      const newSessionAnswers = [
        ...sessionAnswers,
        { word: currentWord, isCorrect },
      ];
      setSessionAnswers(newSessionAnswers);

      // Tạo Set từ reviewWords để check nhanh hơn (O(1) thay vì O(n))
      const reviewWordsSet = new Set(reviewWords.map((rw) => rw.word));

      let newWrongCount = wrongWords.length;

      if (isCorrect) {
        setScore((prev) => prev + 1);
        // Chỉ giảm số lần cần ôn khi làm QUIZ với từ ôn và trả lời đúng
        // Flashcard chỉ để xem, không giảm số lần cần ôn
        // Giảm ngay lập tức khi trả lời đúng, không đợi đến cuối quiz
        if (selectedMode === "quiz" && reviewWordsSet.has(currentWord.word) && !isGuest) {
          // Giảm ngay lập tức
          decreaseReviewWordMutation.mutate(currentWord);
        }
      } else {
        newWrongCount++;
        setWrongWords((prev) => [...prev, currentWord]);
        // Chỉ thêm vào review words khi làm QUIZ
        // Flashcard chỉ để xem, không thay đổi trạng thái review words
        if (selectedMode === "quiz") {
          // Thay vì mutate ngay, thêm vào pending list để batch sau
          // Sử dụng ref để tránh stale closure
          if (!pendingAddReviewWordsRef.current.some((w) => w.word === currentWord.word)) {
            pendingAddReviewWordsRef.current.push(currentWord);
          }
        }
      }

      const isFailed = newWrongCount > 9 && selectedMode === "quiz";
      const nextIndex = isFailed ? deck.length : currentIndex + 1;
      setCurrentIndex(nextIndex);

      if (nextIndex >= deck.length) {
        setIsPlaying(false);

        // Batch process tất cả review word updates (chỉ còn add, decrease đã xử lý ngay)
        if (selectedMode === "quiz" && !isGuest) {
          // Batch add review words (khi trả lời sai)
          const wordsToAdd = [...pendingAddReviewWordsRef.current];
          if (wordsToAdd.length > 0) {
            batchAddReviewWordsMutation.mutate(wordsToAdd);
            pendingAddReviewWordsRef.current = []; // Clear sau khi mutate
          }
          // Không cần batch decrease nữa vì đã giảm ngay khi trả lời đúng
        }

        // Save quiz result if the mode is 'quiz' và KHÔNG phải chế độ chỉ ôn từ
        // Không lưu điểm khi chỉ làm từ ôn
        if (selectedMode === "quiz" && selectedBook && selectedLesson != null && !isReviewOnlyMode) {
          const totalCorrect = newSessionAnswers.filter((a) => a.isCorrect).length;
          const sessionAccuracy =
            deck.length > 0 ? Math.round((totalCorrect / deck.length) * 100) : 0;

          const wordsForThisLessonInDeck = deck.filter(
            (d) => d.lesson === selectedLesson
          );
          const totalWords = wordsForThisLessonInDeck.length;
          if (totalWords > 0) {
            const accuracy = sessionAccuracy;
            const score = Math.round((totalWords * accuracy) / 100);

            const resultData: Omit<QuizResult, "lastAttempt"> = {
              userId,
              bookId: selectedBook,
              lessonId: selectedLesson,
              accuracy,
              score,
              totalWords,
            };

            const statusData: Omit<LessonStatus, "lastAttempt"> = {
              userId,
              bookId: selectedBook,
              lessonId: selectedLesson,
              lastAccuracy: accuracy,
            };

            updateBookProgressWithQuizResultMutation.mutate({
              resultData,
              statusData,
            });
          }
        }
      }
    },
    [
      currentIndex,
      deck,
      selectedMode,
      reviewWords,
      sessionAnswers,
      selectedBook,
      selectedLesson,
      userId,
      isReviewOnlyMode,
      isGuest,
      batchAddReviewWordsMutation,
      decreaseReviewWordMutation,
      updateBookProgressWithQuizResultMutation,
    ]
  );

  // Kết thúc luồng quiz nhiều giai đoạn: tính accuracy tổng hợp và lưu kết quả
  const finishQuizSession = useCallback(
    (
      summary: Pick<QuizSessionSummary, "correct" | "total">,
      plan: QuizSessionPlan
    ) => {
      const safeCorrect = Math.min(summary.correct, summary.total);
      const sessionAccuracy =
        summary.total > 0
          ? Math.min(
              100,
              Math.max(0, Math.round((safeCorrect / summary.total) * 100))
            )
          : 0;

      const fullSummary: QuizSessionSummary = {
        correct: safeCorrect,
        total: summary.total,
        accuracy: sessionAccuracy,
      };

      setQuizSessionSummary(fullSummary);
      setScore(safeCorrect);
      setIsPlaying(false);

      flushPendingReviewWords();

      // Lưu kết quả cho từng lesson (không lưu khi guest hoặc chỉ ôn từ)
      if (selectedBook && selectedLesson != null && !isReviewOnlyMode && !isGuest) {
        const { score: lessonScore, totalItems } = allocateLessonQuizScore(
          selectedLesson,
          plan,
          deck,
          safeCorrect,
          summary.total
        );
        if (totalItems > 0) {
          const resultData: Omit<QuizResult, "lastAttempt"> = {
            userId,
            bookId: selectedBook,
            lessonId: selectedLesson,
            accuracy: sessionAccuracy,
            score: lessonScore,
            totalWords: totalItems,
          };

          const statusData: Omit<LessonStatus, "lastAttempt"> = {
            userId,
            bookId: selectedBook,
            lessonId: selectedLesson,
            lastAccuracy: sessionAccuracy,
          };

          updateBookProgressWithQuizResultMutation.mutate({
            resultData,
            statusData,
          });
        }
      }
    },
    [
      deck,
      selectedBook,
      selectedLesson,
      userId,
      isReviewOnlyMode,
      isGuest,
      updateBookProgressWithQuizResultMutation,
      flushPendingReviewWords,
    ]
  );

  // Load and pick an English voice (iOS-safe)
  useEffect(() => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) {
      setIsSpeechSynthesisWorking(false);
      return;
    }

    const pickEnglishVoice = (voices: SpeechSynthesisVoice[]) => {
      const preferLangs = ["en-US", "en-GB", "en_US", "en_GB"];
      const preferNames = [
        "Samantha",
        "Alex",
        "Victoria",
        "Daniel",
        "Moira",
        "Fred",
        "Serena",
      ];
      return (
        voices.find((v) => preferLangs.includes(v.lang)) ||
        voices.find((v) => v.lang?.toLowerCase().startsWith("en")) ||
        voices.find((v) => preferNames.some((n) => v.name.includes(n))) ||
        voices[0] ||
        null
      );
    };

    const loadVoices = () => {
      const voices = speechSynthesis.getVoices();
      if (voices.length) {
        englishVoiceRef.current = pickEnglishVoice(voices);
        return true;
      }
      return false;
    };

    if (!loadVoices()) {
      const iv = setInterval(() => {
        if (loadVoices()) {
          clearInterval(iv);
          testSpeechSynthesisWorking().then((r) => {
            if (flashcardMountedRef.current) setIsSpeechSynthesisWorking(r);
          });
        }
      }, 250);

      const onVoicesChanged = () => {
        if (loadVoices()) {
          clearInterval(iv);
          testSpeechSynthesisWorking().then((r) => {
            if (flashcardMountedRef.current) setIsSpeechSynthesisWorking(r);
          });
        }
      };
      speechSynthesis.onvoiceschanged = onVoicesChanged;

      return () => {
        clearInterval(iv);
        if (speechSynthesis.onvoiceschanged === onVoicesChanged) {
          speechSynthesis.onvoiceschanged = null;
        }
      };
    } else {
      testSpeechSynthesisWorking().then((r) => {
        if (flashcardMountedRef.current) setIsSpeechSynthesisWorking(r);
      });
    }
  }, []);

  // Phát âm luôn dùng giọng tiếng Anh nếu có
  const speak = useCallback((text: string) => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;

    // Nếu chưa test hoặc test thất bại, thử test lại khi user click (user interaction)
    if (isSpeechSynthesisWorking === false && englishVoiceRef.current) {
      testSpeechSynthesisWorking().then((result) => {
        if (flashcardMountedRef.current) setIsSpeechSynthesisWorking(result);
      });
    }

    const createUtterance = (): SpeechSynthesisUtterance | null => {
      try {
        const utter = new SpeechSynthesisUtterance(text);
        const chosen = englishVoiceRef.current;
        if (chosen) {
          utter.voice = chosen;
          utter.lang = chosen.lang;
        } else {
          utter.lang = "en-US";
        }
        utter.rate = 1.0;
        utter.pitch = 1.0;
        // iOS Safari yêu cầu set volume (mặc định có thể là 0)
        // Đặc biệt quan trọng trên iPhone 8 và các thiết bị iOS cũ
        utter.volume = 1.0;
        return utter;
      } catch {
        return null;
      }
    };

    try {
      // Trên iOS, đảm bảo voices đã được load trước khi speak
      const voices = speechSynthesis.getVoices();
      if (voices.length === 0 && !englishVoiceRef.current) {
        // Nếu chưa có voices, thử load lại và speak sau
        const checkAndSpeak = () => {
          const newVoices = speechSynthesis.getVoices();
          if (newVoices.length > 0) {
            const preferLangs = ["en-US", "en-GB", "en_US", "en_GB"];
            const preferNames = [
              "Samantha",
              "Alex",
              "Victoria",
              "Daniel",
              "Moira",
              "Fred",
              "Serena",
            ];
            englishVoiceRef.current =
              newVoices.find((v) => preferLangs.includes(v.lang)) ||
              newVoices.find((v) => v.lang?.toLowerCase().startsWith("en")) ||
              newVoices.find((v) => preferNames.some((n) => v.name.includes(n))) ||
              newVoices[0] ||
              null;

            // Sau khi có voices, thử speak
            if (englishVoiceRef.current) {
              const utter = createUtterance();
              if (utter) {
                try {
                  speechSynthesis.speak(utter);
                } catch (err) {
                  console.warn("Failed to speak after loading voices:", err);
                }
              }
            }
          }
        };

        // Thử load voices ngay
        checkAndSpeak();

        // Nếu vẫn chưa có, đợi event voiceschanged
        if (speechSynthesis.getVoices().length === 0) {
          const handler = () => {
            if (!flashcardMountedRef.current) return;
            checkAndSpeak();
            speechSynthesis.onvoiceschanged = null;
            speakVoicesPendingHandlerRef.current = null;
          };
          speakVoicesPendingHandlerRef.current = handler;
          speechSynthesis.onvoiceschanged = handler;

          const t = setTimeout(() => {
            const idx = speakTimeoutsRef.current.indexOf(t);
            if (idx !== -1) speakTimeoutsRef.current.splice(idx, 1);
            if (!flashcardMountedRef.current) return;
            checkAndSpeak();
            if (speechSynthesis.onvoiceschanged === handler) {
              speechSynthesis.onvoiceschanged = null;
            }
            speakVoicesPendingHandlerRef.current = null;
          }, 1000);
          speakTimeoutsRef.current.push(t);
        }
        return;
      }

      // Nếu đã có voices, tạo utterance và speak ngay
      const utter = createUtterance();
      if (!utter) return;

      // Tránh chồng tiếng: hủy nếu đang nói/pending
      if (speechSynthesis.speaking || speechSynthesis.pending) {
        try {
          speechSynthesis.cancel();
          const t = setTimeout(() => {
            const idx = speakTimeoutsRef.current.indexOf(t);
            if (idx !== -1) speakTimeoutsRef.current.splice(idx, 1);
            if (!flashcardMountedRef.current) return;
            try {
              speechSynthesis.speak(utter);
            } catch (err) {
              console.warn("Failed to speak after cancel:", err);
            }
          }, 50);
          speakTimeoutsRef.current.push(t);
        } catch {
          try {
            speechSynthesis.speak(utter);
          } catch (err) {
            console.warn("Failed to speak:", err);
          }
        }
      } else {
        try {
          speechSynthesis.speak(utter);
        } catch (err) {
          console.warn("Failed to speak:", err);
        }
      }
    } catch (error) {
      console.warn("Speech synthesis error:", error);
    }
  }, [isSpeechSynthesisWorking]);

  // Reset trạng thái
  const reset = useCallback(() => {
    if (selectedMode === "quiz") {
      flushPendingReviewWords();
    }
    setIsPlaying(false);
    setCurrentIndex(0);
    setScore(0);
    setWrongWords([]);
    setDeck([]);
    setSessionAnswers([]); // Reset session answers
    setIsReviewOnlyMode(false); // Reset review only mode
    setQuizSessionSummary(null); // Reset kết quả quiz nhiều giai đoạn
    pendingAddReviewWordsRef.current = []; // Reset pending review words
    if (quizTimer) {
      clearTimeout(quizTimer);
      setQuizTimer(null);
    }
  }, [quizTimer, selectedMode, flushPendingReviewWords]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isPlaying || currentIndex >= deck.length) return;

      if (selectedMode === "flashcard") {
        if (e.key === "ArrowRight") {
          handleAnswer(true);
        } else if (e.key === "ArrowLeft") {
          handleAnswer(false);
        }
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isPlaying, currentIndex, deck.length, selectedMode, handleAnswer]);

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (quizTimer) {
        clearTimeout(quizTimer);
      }
    };
  }, [quizTimer]);

  // Thêm từ vào review words (dùng khi lật thẻ)
  // Flashcard mode: chỉ ôn 1 lần
  const addToReviewWords = useCallback(
    (word: Word) => {
      if (!isGuest) {
        // Khi lật flashcard, chỉ cần ôn 1 lần
        addOrUpdateReviewWord(userId, word, 1);
        queryClient.invalidateQueries({ queryKey: ["reviewWords", userId] });
      }
    },
    [userId, isGuest, queryClient]
  );

  return {
    // Data
    books: books,
    lessonsForBook,
    lessonWords, // Expose lessonWords for preview
    reviewWords,
    completedLessons,
    needQuizLessons,
    lessonStatuses,
    selectedBook,
    selectedLesson,
    selectedLessons,
    selectedMode,
    deck,
    currentIndex,
    score,
    wrongWords,
    isPlaying,
    quizTimer,
    hiddenWordIndices, // Track which words should hide text in quiz mode

    // Loading states
    isLoading: booksLoading || lessonsLoading || lessonWordsLoading,

    // Error states
    booksError,
    lessonWordsError: lessonWordsError || lessonsError,

    // Actions
    setSelectedMode: handleSetSelectedMode,
    startLearning,
    handleAnswer,
    handleQuizWordResult,
    finishQuizSession, // Kết thúc luồng quiz nhiều giai đoạn
    quizSessionSummary, // Kết quả tổng hợp quiz nhiều giai đoạn
    quizSessionKey,
    speak,
    reset,
    addToReviewWords, // Thêm từ vào review words
    isReviewOnlyMode, // Expose review only mode
  };
}

/**
 * Hook để xóa tất cả từ ôn của một học sinh
 */
export function useDeleteAllReviewWords() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (userId: string) => deleteAllReviewWords(userId),
    onSuccess: (_, userId) => {
      queryClient.invalidateQueries({ queryKey: ["reviewWords", userId] });
    },
  });
}
