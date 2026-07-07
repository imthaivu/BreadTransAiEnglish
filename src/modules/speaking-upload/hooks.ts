"use client";

import { useAuth } from "@/lib/auth/context";
import { useLearnSelection } from "@/components/layout/LearnSelectionProvider";
import { db } from "@/lib/firebase/client";
import { useBooks, useLessons } from "@/modules/flashcard/hooks";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { doc, getDoc } from "firebase/firestore";
import { useEffect, useState, useCallback, useRef } from "react";
import toast from "react-hot-toast";
import {
  uploadSpeakingSubmission,
  checkSpeakingSubmission,
  evaluateSpeakingSubmissionFromUrl,
  logSpeakingSubmissionAnomaly,
} from "./services";
import {
  SPEAKING_ALLOWED_MIME_TYPES,
  SPEAKING_MAX_DURATION_RATIO,
  SPEAKING_MAX_FILE_BYTES,
  SPEAKING_MIN_DURATION_RATIO,
  SPEAKING_MIN_FILE_BYTES,
  SPEAKING_MIN_LISTEN_COUNT,
  normalizeSpeakingMimeType,
} from "./types";
import { extractSpeakingScoreFromIssue } from "./extractSpeakingScoreFromIssue";
import { getAudioDurationFromFile, sanitizeDurationSeconds } from "@/utils/audio";

const MIN_LISTEN_COUNT = SPEAKING_MIN_LISTEN_COUNT;
const MIN_DURATION_RATIO = SPEAKING_MIN_DURATION_RATIO;
const MAX_DURATION_RATIO = SPEAKING_MAX_DURATION_RATIO;

function isAllowedSpeakingMime(mime: string | null | undefined): boolean {
  const normalized = normalizeSpeakingMimeType(mime);
  return SPEAKING_ALLOWED_MIME_TYPES.includes(normalized);
}
type ListeningStatus = {
  hasListenedEnough: boolean;
  listenCount: number;
};

type SpeakingLessonGridStatus = "passed" | "notPassed" | "listened" | "none";

export type SpeakingSubmitStage = "idle" | "validating" | "uploading" | "evaluating";

const extractTotalScoreFromIssue = extractSpeakingScoreFromIssue;

export function useSpeakingUpload() {
  const { session } = useAuth();
  const studentId = session?.user?.id || "";
  const queryClient = useQueryClient();
  const { selectedBook, selectedLesson, setSelectedLesson } = useLearnSelection();

  // State management
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [recordedDuration, setRecordedDuration] = useState<number>(0);
  const [referenceDuration, setReferenceDuration] = useState<number>(0);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [submitStage, setSubmitStage] = useState<SpeakingSubmitStage>("idle");
  const [recorderResetToken, setRecorderResetToken] = useState(0);
  const [lastSubmissionId, setLastSubmissionId] = useState<string | null>(null);
  const submitInFlightRef = useRef(false);

  const { data: books = [], isLoading: booksLoading } = useBooks();
  const { data: lessons = [], isLoading: lessonsLoading } = useLessons(
    selectedBook!
  );

  // Lấy completedLessonsSpeaking để tô màu xanh trong grid chọn bài
  const {
    data: completedLessonsSpeaking = [],
  } = useQuery({
    queryKey: ["completedLessonsSpeaking", studentId, selectedBook],
    queryFn: async () => {
      if (!studentId || !selectedBook) return [];
      const ref = doc(db, "userBookProgress", `${studentId}_${selectedBook}`);
      const snap = await getDoc(ref);
      if (!snap.exists()) return [];
      const data = snap.data();
      return (data?.completedLessonsSpeaking ?? []) as number[];
    },
    enabled: !!studentId && !!selectedBook,
    staleTime: 10000,
  });

  const {
    data: needSpeakings = [],
  } = useQuery({
    queryKey: ["needSpeakings", studentId, selectedBook],
    queryFn: async () => {
      if (!studentId || !selectedBook) return [];
      const ref = doc(db, "userBookProgress", `${studentId}_${selectedBook}`);
      const snap = await getDoc(ref);
      if (!snap.exists()) return [];
      const data = snap.data();
      return (data?.needSpeakings ?? []) as number[];
    },
    enabled: !!studentId && !!selectedBook,
    staleTime: 10000,
  });

  const { data: speakingStatusByLesson = {} } = useQuery({
    queryKey: ["speakingStatusByLesson", studentId, selectedBook],
    queryFn: async () => {
      if (!studentId || !selectedBook) return {} as Record<number, SpeakingLessonGridStatus>;
      const ref = doc(db, "userBookProgress", `${studentId}_${selectedBook}`);
      const snap = await getDoc(ref);
      if (!snap.exists()) return {} as Record<number, SpeakingLessonGridStatus>;

      const lessonsObj = snap.data()?.lessons || {};
      const result: Record<number, SpeakingLessonGridStatus> = {};

      Object.keys(lessonsObj).forEach((key) => {
        const lessonId = Number(key);
        if (!Number.isFinite(lessonId)) return;

        const lesson = lessonsObj[key] ?? {};
        const listenCount = lesson?.listenCount ?? 0;
        const issueSpeaking = typeof lesson?.issueSpeaking === "string" ? lesson.issueSpeaking : null;
        const hasIssueSpeaking = !!issueSpeaking?.trim();
        const hasSubmission = !!lesson?.fileUrl || !!lesson?.lastSubmitted;
        const rawScore = typeof lesson?.speakingScore === "string" ? lesson.speakingScore : null;
        const speakingScore = rawScore ? Number(rawScore.replace(",", ".")) : Number.NaN;

        if (Number.isFinite(speakingScore)) {
          result[lessonId] = speakingScore >= 7 ? "passed" : "notPassed";
          return;
        }

        if (hasSubmission && hasIssueSpeaking) {
          const aiScore = extractTotalScoreFromIssue(issueSpeaking);
          if (aiScore !== null) {
            result[lessonId] = aiScore >= 7 ? "passed" : "notPassed";
            return;
          }
        }

        if (hasSubmission && !hasIssueSpeaking) {
          result[lessonId] = "none";
          return;
        }

        if (listenCount >= 1) {
          result[lessonId] = "listened";
          return;
        }

        result[lessonId] = "none";
      });

      return result;
    },
    enabled: !!studentId && !!selectedBook,
    staleTime: 10000,
  });

  // Lấy danh sách các bài đã nghe đủ số lần (>= MIN_LISTEN_COUNT)
  const {
    data: listenedLessonsSpeaking = [],
  } = useQuery({
    queryKey: ["listenedLessonsSpeaking", studentId, selectedBook],
    queryFn: async () => {
      if (!studentId || !selectedBook) return [];
      const ref = doc(db, "userBookProgress", `${studentId}_${selectedBook}`);
      const snap = await getDoc(ref);
      if (!snap.exists()) return [];
      const data = snap.data();
      const lessonsObj = data.lessons || {};
      const listenedIds: number[] = [];
      Object.keys(lessonsObj).forEach((key) => {
        if ((lessonsObj[key]?.listenCount ?? 0) >= MIN_LISTEN_COUNT) {
          listenedIds.push(Number(key));
        }
      });
      return listenedIds;
    },
    enabled: !!studentId && !!selectedBook,
    staleTime: 10000,
  });

  // Lấy danh sách bài có speakingScore < 7 để tô màu cam trong UI chọn bài speaking
  const {
    data: cScoredLessonsSpeaking = [],
  } = useQuery({
    queryKey: ["cScoredLessonsSpeaking", studentId, selectedBook],
    queryFn: async () => {
      if (!studentId || !selectedBook) return [];
      const ref = doc(db, "userBookProgress", `${studentId}_${selectedBook}`);
      const snap = await getDoc(ref);
      if (!snap.exists()) return [];
      const data = snap.data();
      const lessonsObj = data.lessons || {};
      const cScoredLessonIds: number[] = [];
      Object.keys(lessonsObj).forEach((key) => {
        const rawScore = lessonsObj[key]?.speakingScore;
        if (typeof rawScore !== "string") return;
        const score = Number(rawScore.replace(",", "."));
        if (Number.isFinite(score) && score < 7) {
          cScoredLessonIds.push(Number(key));
        }
      });
      return cScoredLessonIds;
    },
    enabled: !!studentId && !!selectedBook,
    staleTime: 10000,
  });

  const { data: lastIssueSpeaking = null } = useQuery({
    queryKey: ["speakingIssue", studentId, selectedBook, selectedLesson],
    queryFn: async () => {
      if (!studentId || !selectedBook || !selectedLesson) return null;
      const ref = doc(db, "userBookProgress", `${studentId}_${selectedBook}`);
      const snap = await getDoc(ref);
      if (!snap.exists()) return null;
      const data = snap.data();
      return (data?.lessons?.[selectedLesson]?.issueSpeaking ?? null) as string | null;
    },
    enabled: !!studentId && !!selectedBook && !!selectedLesson,
    staleTime: 10000,
  });

  // Kiểm tra đã nghe đủ chưa - đọc từ userBookProgress
  const checkHasListenedEnough = async (): Promise<ListeningStatus | null> => {
    if (!studentId || !selectedBook || !selectedLesson) return null;

    const bookProgressRef = doc(
      db,
      "userBookProgress",
      `${studentId}_${selectedBook}`
    );
    const docSnap = await getDoc(bookProgressRef);
    if (!docSnap.exists()) {
      return { hasListenedEnough: false, listenCount: 0 };
    }

    const data = docSnap.data();
    const lesson = data.lessons?.[selectedLesson];
    const listenCount = lesson?.listenCount ?? 0;
    return {
      hasListenedEnough: listenCount >= MIN_LISTEN_COUNT,
      listenCount,
    };
  };

  // Query để kiểm tra listening status
  const {
    data: listeningStatus,
    isLoading: isCheckingListening,
    refetch: refetchListeningStatus,
  } = useQuery({
    queryKey: [
      "listeningStatus",
      studentId,
      selectedBook,
      selectedLesson,
    ],
    queryFn: checkHasListenedEnough,
    enabled: !!studentId && !!selectedBook && !!selectedLesson,
    staleTime: 2000, // Cache for 2 seconds (reduced for faster updates)
    refetchInterval: (query) => {
      // Auto-refetch every 3 seconds if not listened enough yet
      // Stop refetching once listened enough
      if (query.state.data?.hasListenedEnough === true) {
        return false; // Stop refetching if already listened enough
      }
      return 3000; // Refetch every 3 seconds if not enough
    },
    refetchIntervalInBackground: false, // Only refetch when tab is active
  });

  const hasListenedEnough = listeningStatus?.hasListenedEnough;
  const currentListenCount = listeningStatus?.listenCount ?? 0;

  const handleSubmit = async () => {
    if (submitInFlightRef.current) {
      throw new Error("Đang nộp bài, vui lòng chờ hoàn tất.");
    }
    submitInFlightRef.current = true;
    try {
      if (!selectedFile || !studentId || !selectedBook || !selectedLesson) {
        throw new Error("Dữ liệu nộp bài không đầy đủ.");
      }
      setSubmitStage("validating");
      const logAnomalyAndThrow = async (
        reason: string,
        message: string,
        extra?: Record<string, string | number | boolean | null | undefined>
      ): Promise<never> => {
        const classifyAnomaly = (
          code: string
        ): {
          category: "system" | "browser" | "security";
          suspicion: "low" | "medium" | "high";
          note: string;
        } => {
          if (code === "FILE_TOO_SMALL") {
            return {
              category: "browser",
              suspicion: "medium",
              note: "Rất có thể lỗi mic/browser; vẫn có thể là cố nộp file rỗng.",
            };
          }
          if (code === "FILE_TOO_LARGE") {
            return {
              category: "security",
              suspicion: "medium",
              note: "Nghi nộp file không đúng chuẩn hoặc dữ liệu bất thường.",
            };
          }
          if (code === "LISTEN_COUNT_BELOW_MIN" || code === "LISTENING_STATUS_MISSING") {
            return {
              category: "security",
              suspicion: "high",
              note: "Nghi bypass điều kiện phải nghe trước khi nộp.",
            };
          }
          if (code === "DURATION_RATIO_BELOW_MIN" || code === "DURATION_RATIO_ABOVE_MAX") {
            return {
              category: "browser",
              suspicion: "medium",
              note: "Có thể lỗi duration metadata hoặc ghi âm không đúng.",
            };
          }
          return {
            category: "system",
            suspicion: "medium",
            note: "Bất thường chưa phân loại rõ.",
          };
        };
        const classification = classifyAnomaly(reason);
        try {
          await logSpeakingSubmissionAnomaly(
            studentId,
            selectedBook,
            selectedLesson,
            reason,
            {
              fileName: selectedFile.name || null,
              fileSize: selectedFile.size,
              fileType: selectedFile.type || null,
              recordedDuration,
              referenceDuration,
              ...extra,
            },
            {
              source: "client",
              category: classification.category,
              suspicion: classification.suspicion,
              blocked: true,
              note: classification.note,
            }
          );
        } catch (error) {
          console.error("Failed to log speaking anomaly:", error);
        }
        throw new Error(message);
      };

      if (selectedFile.size > SPEAKING_MAX_FILE_BYTES) {
        await logAnomalyAndThrow(
          "FILE_TOO_LARGE",
          "File nộp vượt quá 15MB, vui lòng thử lại.",
          { maxBytes: SPEAKING_MAX_FILE_BYTES }
        );
      }
      if (selectedFile.size < SPEAKING_MIN_FILE_BYTES) {
        await logAnomalyAndThrow(
          "FILE_TOO_SMALL",
          "File ghi âm quá nhỏ hoặc không hợp lệ. Vui lòng ghi âm lại.",
          { minBytes: SPEAKING_MIN_FILE_BYTES }
        );
      }
      if (selectedFile.type && !isAllowedSpeakingMime(selectedFile.type)) {
        await logAnomalyAndThrow(
          "FILE_MIME_NOT_ALLOWED",
          "Định dạng file không được hỗ trợ. Vui lòng ghi âm lại bằng micro.",
          { fileType: selectedFile.type }
        );
      }

      const normalizedMime = normalizeSpeakingMimeType(
        selectedFile.type,
        selectedFile.name
      );

      const isListenEnough = await checkHasListenedEnough();
      if (!isListenEnough) {
        await logAnomalyAndThrow(
          "LISTENING_STATUS_MISSING",
          "Bạn cần nghe trên 3 lần trước khi nộp bài. Vui lòng nghe lại bài học trước khi nộp bài nói."
        );
      }
      if (!isListenEnough?.hasListenedEnough) {
        await logAnomalyAndThrow(
          "LISTEN_COUNT_BELOW_MIN",
          "Bạn cần nghe trên 3 lần trước khi nộp bài. Vui lòng nghe lại bài học trước khi nộp bài nói.",
          {
            listenCount: isListenEnough?.listenCount ?? 0,
            minListenCount: MIN_LISTEN_COUNT,
          }
        );
      }

      const safeRecordedDuration =
        sanitizeDurationSeconds(recordedDuration) ??
        sanitizeDurationSeconds(
          await getAudioDurationFromFile(selectedFile).catch(() => undefined)
        );
      const safeReferenceDuration = sanitizeDurationSeconds(referenceDuration);

      if (safeRecordedDuration && safeReferenceDuration) {
        const durationRatio = safeRecordedDuration / safeReferenceDuration;
        if (durationRatio < MIN_DURATION_RATIO) {
          await logAnomalyAndThrow(
            "DURATION_RATIO_BELOW_MIN",
            "Bạn đọc nhanh quá (dưới 50% thời lượng chuẩn). Vui lòng ghi âm lại.",
            {
              durationSeconds: safeRecordedDuration,
              durationRatio,
              minDurationRatio: MIN_DURATION_RATIO,
            }
          );
        }
        if (durationRatio >= MAX_DURATION_RATIO) {
          await logAnomalyAndThrow(
            "DURATION_RATIO_ABOVE_MAX",
            "Bạn đọc chậm quá (từ gấp đôi thời lượng chuẩn). Vui lòng ghi âm lại.",
            {
              durationSeconds: safeRecordedDuration,
              durationRatio,
              maxDurationRatio: MAX_DURATION_RATIO,
            }
          );
        }
      }

      setSubmitStage("uploading");
      setUploadProgress(0);
      const downloadURL = await uploadSpeakingSubmission(
        selectedFile,
        studentId,
        session?.user?.name || "Chưa đặt tên",
        selectedBook,
        selectedLesson,
        setUploadProgress,
        safeRecordedDuration
      );

      // Server tự ghi `issueSpeaking` lên Firestore bằng admin SDK trong route
      // /api/speaking/evaluate. Không gọi `updateSpeakingIssue` ở client nữa để
      // tránh trường hợp client tampered phản hồi rồi tự ghi điểm giả đè lên
      // kết quả thật mà server đã lưu.
      setSubmitStage("evaluating");
      const evaluationResult = await evaluateSpeakingSubmissionFromUrl(
        downloadURL,
        selectedBook,
        selectedLesson,
        safeRecordedDuration,
        safeReferenceDuration,
        normalizedMime
      );

      return {
        downloadURL,
        issueSpeaking: evaluationResult.issueSpeaking,
        queuedRetry: evaluationResult.queuedRetry,
        retryCount: evaluationResult.retryCount,
      };
    } finally {
      submitInFlightRef.current = false;
    }
  };

  const handleBookChange = useCallback((_bookId: string) => {
    // Book selection is managed by LearnSelectionProvider.
  }, []);

  const handleLessonChange = useCallback(
    (lessonId: number) => {
      setSelectedLesson(lessonId);
    },
    [setSelectedLesson]
  );

  const {
    mutate: submit,
    isPending: isUploading,
    isSuccess,
    isError,
    error,
  } = useMutation({
    mutationFn: handleSubmit,
    onSuccess: (result) => {
      setSelectedFile(null);
      setRecordedDuration(0);
      setUploadProgress(0);
      setRecorderResetToken((x) => x + 1);

      const docId = `${studentId}_${selectedBook}_${selectedLesson}`;
      setLastSubmissionId(docId);
      const issueSpeaking = result?.issueSpeaking ?? null;
      const queuedRetry = result?.queuedRetry === true;
      const retryCount = result?.retryCount ?? 0;
      const aiScore = extractTotalScoreFromIssue(issueSpeaking);
      const lessonId = selectedLesson;
      const bookId = selectedBook;

      if (studentId && bookId && lessonId) {
        queryClient.setQueryData(
          ["speakingIssue", studentId, bookId, lessonId],
          issueSpeaking
        );

        queryClient.setQueryData(
          ["completedLessonsSpeaking", studentId, bookId],
          (prev: number[] | undefined) => {
            const current = Array.isArray(prev) ? prev : [];
            if (current.includes(lessonId)) return current;
            return [...current, lessonId].sort((a, b) => a - b);
          }
        );

        queryClient.setQueryData(
          ["listenedLessonsSpeaking", studentId, bookId],
          (prev: number[] | undefined) => {
            const current = Array.isArray(prev) ? prev : [];
            if (current.includes(lessonId)) return current;
            return [...current, lessonId].sort((a, b) => a - b);
          }
        );

        queryClient.setQueryData(
          ["cScoredLessonsSpeaking", studentId, bookId],
          (prev: number[] | undefined) => {
            const current = Array.isArray(prev) ? prev : [];
            if (aiScore !== null && aiScore < 7) {
              if (current.includes(lessonId)) return current;
              return [...current, lessonId].sort((a, b) => a - b);
            }
            return current.filter((id) => id !== lessonId);
          }
        );

        queryClient.setQueryData(
          ["speakingStatusByLesson", studentId, bookId],
          (prev: Record<number, SpeakingLessonGridStatus> | undefined) => {
            const next: Record<number, SpeakingLessonGridStatus> = { ...(prev ?? {}) };
            if (aiScore !== null) {
              next[lessonId] = aiScore >= 7 ? "passed" : "notPassed";
            } else {
              next[lessonId] = "none";
            }
            return next;
          }
        );
      }

      if (queuedRetry) {
        toast(
          retryCount > 0
            ? `Đã nộp thành công. Server đang tự chấm lại (lần ${retryCount}/10).`
            : "Đã nộp thành công. Server đang tự chấm lại mỗi 1 phút."
        );
      }

      // Invalidate queries to refresh status and completedLessonsSpeaking
      queryClient.invalidateQueries({
        queryKey: ["speakingSubmissionStatus", studentId, selectedBook, selectedLesson],
      });
      // Keep background consistency refresh for aggregate views only.
      queryClient.invalidateQueries({
        queryKey: ["classBookProgress"],
      });
      queryClient.invalidateQueries({
        queryKey: ["classProgress"],
      });
      queryClient.invalidateQueries({
        queryKey: ["teacherClasses"],
      });
    },
    onError: (mutationError) => {
      const message =
        mutationError instanceof Error
          ? mutationError.message
          : "Đã có lỗi xảy ra khi nộp bài.";
      toast.error(message);
    },
    onSettled: () => {
      setSubmitStage("idle");
    },
  });

  // Check if can submit (has file, no need to check listening here)
  const canSubmit =
    selectedBook && selectedLesson && selectedFile && !isUploading;

  // Check submission status for selected lesson only
  // Only check when both book and lesson are selected to reduce reads
  const checkSubmissionStatus = async (): Promise<boolean> => {
    if (!studentId || !selectedBook || !selectedLesson) {
      return false;
    }

    return checkSpeakingSubmission(
      studentId,
      selectedBook,
      selectedLesson
    );
  };

  // Query to check submission status for selected lesson
  // Only enabled when both book and lesson are selected (to reduce reads)
  const {
    data: isSubmitted = false,
    isLoading: isLoadingSubmissionStatus,
  } = useQuery({
    queryKey: ["speakingSubmissionStatus", studentId, selectedBook, selectedLesson],
    queryFn: checkSubmissionStatus,
    enabled: !!studentId && !!selectedBook && !!selectedLesson,
    staleTime: 30000, // Cache for 30 seconds
  });

  // Khi selectLesson thay đổi thì reset lại file
  useEffect(() => {
    setSelectedFile(null);
    setRecordedDuration(0);
    setReferenceDuration(0);
    setRecorderResetToken((x) => x + 1);
  }, [selectedLesson]);

  const handleSetSelectedFile = useCallback((file: File | null, duration?: number) => {
    setSelectedFile(file);
    const safeDuration = sanitizeDurationSeconds(duration);
    if (safeDuration !== undefined) {
      setRecordedDuration(safeDuration);
    } else if (file === null) {
      setRecordedDuration(0);
    }
  }, []);

  const handleSetReferenceDuration = useCallback((duration: number) => {
    const safeDuration = sanitizeDurationSeconds(duration);
    if (safeDuration !== undefined) {
      setReferenceDuration(safeDuration);
    }
  }, []);

  return {
    // Data
    books,
    lessons,
    selectedBook,
    selectedLesson,
    selectedFile,

    // State
    booksLoading,
    lessonsLoading,
    isUploading,
    uploadProgress,
    submitStage,
    isSuccess,
    isError,
    error,
    recorderResetToken,
    lastSubmissionId,
    lastIssueSpeaking,
    canSubmit,
    hasListenedEnough,
    currentListenCount,
    isCheckingListening,
    refetchListeningStatus,
    isSubmitted,
    isLoadingSubmissionStatus,
    completedLessonsSpeaking,
    listenedLessonsSpeaking,
    cScoredLessonsSpeaking,
    speakingStatusByLesson,
    needSpeakings,

    // Actions
    handleBookChange,
    setSelectedLesson: handleLessonChange,
    setSelectedFile: handleSetSelectedFile,
    setReferenceDuration: handleSetReferenceDuration,
    submit,
  };
}

import { deleteSpeakingSubmission, updateSpeakingScore } from "./services";

export function useDeleteSpeakingSubmission() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      studentId,
      bookId,
      lessonId,
      fileUrl,
    }: {
      studentId: string;
      bookId: string;
      lessonId: number;
      fileUrl: string;
    }) => deleteSpeakingSubmission(studentId, bookId, lessonId, fileUrl),
    onSuccess: (_, { studentId, bookId, lessonId }) => {
      // Invalidate queries to refresh status, completedLessonsSpeaking, and class progress tables
      queryClient.invalidateQueries({
        queryKey: ["speakingSubmissionStatus", studentId, bookId, lessonId],
      });
      queryClient.invalidateQueries({
        queryKey: ["completedLessonsSpeaking", studentId, bookId],
      });
      queryClient.invalidateQueries({
        queryKey: ["classBookProgress"],
      });
      queryClient.invalidateQueries({
        queryKey: ["classProgress"], // the useClassProgress query
      });

      toast.success("Xóa bài nộp thành công.");
    },
    onError: (error) => {
      console.error("Error deleting speaking submission:", error);
      toast.error("Xóa bài nộp thất bại.");
    }
  });
}

export function useUpdateSpeakingScore() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      studentId,
      bookId,
      lessonId,
      score,
      rewardParams,
    }: {
      studentId: string;
      bookId: string;
      lessonId: number;
      score: string | null;
      rewardParams?: {
        teacherId: string;
        teacherName: string;
        teacherAvatarUrl?: string;
        classId: string;
        studentName: string;
      };
    }) => updateSpeakingScore(studentId, bookId, lessonId, score, rewardParams),
    onSuccess: (_, { studentId, bookId, lessonId }) => {
      queryClient.invalidateQueries({
        queryKey: ["speakingSubmissionStatus", studentId, bookId, lessonId],
      });
      queryClient.invalidateQueries({
        queryKey: ["completedLessonsSpeaking", studentId, bookId],
      });
      queryClient.invalidateQueries({
        queryKey: ["classBookProgress"],
      });
      queryClient.invalidateQueries({
        queryKey: ["classProgress"], // the useClassProgress query
      });
      queryClient.invalidateQueries({
        queryKey: ["teacherClasses"],
      });

      toast.success("Cập nhật điểm thành công.");
    },
    onError: (error) => {
      console.error("Error updating speaking score:", error);
      toast.error("Cập nhật điểm thất bại.");
    }
  });
}

