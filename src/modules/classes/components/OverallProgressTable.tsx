"use client";

import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { useBooks, useLessons } from "@/modules/flashcard";
import { cn } from "@/utils";
import { SafeImage as Image } from "@/components/ui/SafeImage";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  FiCheckCircle,
  FiUser,
  FiRefreshCw,
  FiBarChart2,
  FiList,
  FiPlay,
  FiHeart,
  FiUsers,
  FiChevronUp,
  FiChevronDown,
} from "react-icons/fi";
import { useClassBookProgress } from "../hooks";
import { StudentSpeakingChart } from "./StudentSpeakingChart";
import { StudentProgressDetailData, StudentProgressDetailModal } from "./StudentProgressDetailModal";
import toast from "react-hot-toast";
import { extractSpeakingScoreFromIssue } from "@/modules/speaking-upload/extractSpeakingScoreFromIssue";
import { AudioPlayerWithDuration } from "./AudioPlayerWithDuration";
import {
  evaluateSpeakingSubmissionFromUrl,
  updateSpeakingIssue,
} from "@/modules/speaking-upload/services";
import { useCreateCurrencyTransaction } from "@/modules/admin/hooks/useCurrencyManagement";
import { appendAdmirationToUser } from "../api/admiration";
import { useAuth } from "@/lib/auth/context";
import { collection, doc, serverTimestamp, writeBatch } from "firebase/firestore";
import { db } from "@/lib/firebase/client";

import { useClassContext } from "../context/ClassContext";
import { ProfileAvatarLink } from "@/components/ui/ProfileAvatarLink";
import { SpeakingScoreControl } from "./SpeakingScoreControl";

type PlayableSubmissionItem = {
  studentId: string;
  studentName: string;
  avatarUrl?: string;
  lessonId: string;
  url: string;
  duration: number;
  speakingScore: string | null;
  issueSpeaking: string | null;
  submittedAt: Date;
  /** Điểm dùng để sort cột "Điểm" (AI gợi ý vì playable luôn chưa có điểm thủ công). */
  sortScore: number | null;
};

type PlayableSortKey = "lesson" | "student" | "date" | "score";
type PlayableSortDir = "asc" | "desc";

function parseScoreValue(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const n = Number(trimmed.replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

function comparePlayableSubmissionOrder(
  a: Pick<
    PlayableSubmissionItem,
    "lessonId" | "studentName" | "submittedAt"
  > & { sortScore?: number | null },
  b: Pick<
    PlayableSubmissionItem,
    "lessonId" | "studentName" | "submittedAt"
  > & { sortScore?: number | null },
  sortKey: PlayableSortKey,
  sortDir: PlayableSortDir
): number {
  const dir = sortDir === "asc" ? 1 : -1;
  const la = Number(a.lessonId);
  const lb = Number(b.lessonId);
  const nameCmp = a.studentName.localeCompare(b.studentName, "vi", {
    sensitivity: "base",
  });
  const tA = a.submittedAt.getTime();
  const tB = b.submittedAt.getTime();

  if (sortKey === "lesson") {
    if (la !== lb) return (la - lb) * dir;
    if (nameCmp !== 0) return nameCmp;
    return tB - tA;
  }
  if (sortKey === "student") {
    if (nameCmp !== 0) return nameCmp * dir;
    if (la !== lb) return la - lb;
    return tB - tA;
  }
  if (sortKey === "score") {
    const sA = a.sortScore ?? null;
    const sB = b.sortScore ?? null;
    // Hàng không có điểm luôn đẩy xuống cuối bất kể chiều sort.
    if (sA === null && sB !== null) return 1;
    if (sA !== null && sB === null) return -1;
    if (sA !== null && sB !== null && sA !== sB) return (sA - sB) * dir;
    if (la !== lb) return la - lb;
    if (nameCmp !== 0) return nameCmp;
    return tB - tA;
  }
  if (tA !== tB) return (tA - tB) * dir;
  if (la !== lb) return la - lb;
  return nameCmp;
}

function findNeighborPlayableSubmission(
  items: PlayableSubmissionItem[],
  anchor: Pick<
    PlayableSubmissionItem,
    "lessonId" | "studentName" | "submittedAt" | "sortScore"
  >,
  delta: 1 | -1,
  sortKey: PlayableSortKey,
  sortDir: PlayableSortDir
): PlayableSubmissionItem | null {
  if (delta === 1) {
    for (const item of items) {
      if (comparePlayableSubmissionOrder(item, anchor, sortKey, sortDir) > 0) {
        return item;
      }
    }
    return null;
  }
  for (let i = items.length - 1; i >= 0; i--) {
    if (comparePlayableSubmissionOrder(items[i], anchor, sortKey, sortDir) < 0) {
      return items[i];
    }
  }
  return null;
}

function hasManualSpeakingScore(score: string | number | null | undefined): boolean {
  return (
    (typeof score === "string" && score.trim() !== "") ||
    (typeof score === "number" && Number.isFinite(score))
  );
}

function extractTotalScoreNumber(issue: string | null | undefined): number | null {
  if (!issue) return null;
  const match = issue.match(/Tổng điểm[^\d]*(\d+(?:[.,]\d+)?)\s*\/?\s*10/i);
  if (!match) return null;
  const n = Number(match[1].replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

export function OverallProgressTable() {
  const { classId, members, isOnline } = useClassContext();

  // Load từ localStorage - dùng chung key với Bảng Quiz để tối ưu cache khi cùng sách
  const getStoredBook = () => {
    if (typeof window === "undefined") return "";
    const shared = localStorage.getItem(`classDetail_${classId}_book`);
    if (shared) return shared;
    return localStorage.getItem(`overallProgress_${classId}_book`) || "";
  };

  const [selectedBook, setSelectedBook] = useState<string>(getStoredBook);
  const [viewMode, setViewMode] = useState<"chart" | "manage">("chart");
  const getTodayFilterDate = () => {
    const today = new Date();
    return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  };
  const [filterDate, setFilterDate] = useState<string>(() => getTodayFilterDate());
  const [isAllDay, setIsAllDay] = useState(false);
  type ManageSortKey = "lesson" | "student" | "date" | "score";
  type ManageSortDir = "asc" | "desc";
  const [manageSortKey, setManageSortKey] = useState<ManageSortKey>("date");
  const [manageSortDir, setManageSortDir] = useState<ManageSortDir>("desc");
  const handleManageSort = (key: ManageSortKey) => {
    if (manageSortKey === key) {
      setManageSortDir((prev) => (prev === "asc" ? "desc" : "asc"));
      return;
    }
    setManageSortKey(key);
    // mặc định: lesson/student tăng dần, date/score giảm dần (cao nhất trước)
    setManageSortDir(key === "date" || key === "score" ? "desc" : "asc");
  };
  const [chartCurrentLesson, setChartCurrentLesson] = useState<number>(() => {
    if (typeof window === "undefined") return 0;
    const stored = localStorage.getItem(`overallProgress_${classId}_chart_lesson`);
    return stored ? parseInt(stored) : 0;
  });
  const [isMarkingNeedComplete, setIsMarkingNeedComplete] = useState(false);
  const [isMarkingListenReady, setIsMarkingListenReady] = useState(false);
  const [pendingNeedPlusCount, setPendingNeedPlusCount] = useState(0);
  const [isNeedPlusRunning, setIsNeedPlusRunning] = useState(false);
  const [inlineScoreOverrides, setInlineScoreOverrides] = useState<Record<string, string | null>>({});
  const [hoveredAiIssueContent, setHoveredAiIssueContent] = useState<string | null>(null);
  const [isBulkEvaluatingMissingIssues, setIsBulkEvaluatingMissingIssues] = useState(false);
  const [bulkEvaluateProgress, setBulkEvaluateProgress] = useState<{ done: number; total: number; failed: number } | null>(null);
  const [quickDonateId, setQuickDonateId] = useState<string | null>(null);
  const [evaluatingIssueIds, setEvaluatingIssueIds] = useState<Set<string>>(new Set());
  const [selectedStudents, setSelectedStudents] = useState<Set<string>>(new Set());
  const [isAutoPlayAll, setIsAutoPlayAll] = useState(false);
  const aiIssueCloseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const needPlusTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Tránh chấm lại các bài đã thử (kể cả lỗi) trong session để không lặp vô hạn.
  // Reset khi đổi sách (xem useEffect ngay sau khối ref).
  const autoEvaluatedTargetsRef = useRef<Set<string>>(new Set());
  // Chốt một phiên auto-evaluate đang chạy để effect không trigger song song.
  const isAutoRunningRef = useRef(false);
  // Tick mỗi 60s để memo autoEvaluateTargets recompute, qua đó bài nộp 5p
  // trước (sau khi vượt mốc client-side đang chấm) được pick up mà không cần
  // chờ data classBookProgress refetch.
  const [autoEvaluateTick, setAutoEvaluateTick] = useState(0);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const id = window.setInterval(() => setAutoEvaluateTick((v) => v + 1), 60 * 1000);
    return () => window.clearInterval(id);
  }, []);
  useEffect(() => {
    return () => {
      if (aiIssueCloseTimerRef.current) {
        clearTimeout(aiIssueCloseTimerRef.current);
        aiIssueCloseTimerRef.current = null;
      }
      if (needPlusTimerRef.current) {
        clearTimeout(needPlusTimerRef.current);
        needPlusTimerRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    autoEvaluatedTargetsRef.current = new Set();
  }, [selectedBook]);

  useEffect(() => {
    if (typeof window !== "undefined") {
      localStorage.setItem(`overallProgress_${classId}_chart_lesson`, chartCurrentLesson.toString());
    }
  }, [chartCurrentLesson, classId]);

  const [selectedStudentForDetail, setSelectedStudentForDetail] = useState<{
    studentId: string;
    studentName: string;
    avatarUrl?: string;
    progressData: StudentProgressDetailData;
  } | null>(null);
  const [listeningAudio, setListeningAudio] = useState<{
    url: string;
    studentName: string;
    studentId: string;
    avatarUrl?: string;
    lessonId: string;
    speakingScore: string | null;
    issueSpeaking: string | null;
    duration?: number;
  } | null>(null);

  const { profile, session } = useAuth();
  const { mutate: createTransaction, isPending: isQuickDonating } = useCreateCurrencyTransaction();

  const currentStudentId = session?.user?.id;
  const currentStudentName = session?.user?.name || profile?.displayName || "";

  // Lưu vào localStorage - dùng chung key với Bảng Quiz
  useEffect(() => {
    if (selectedBook) {
      localStorage.setItem(`classDetail_${classId}_book`, selectedBook);
      localStorage.setItem(`overallProgress_${classId}_book`, selectedBook);
    } else {
      localStorage.removeItem(`classDetail_${classId}_book`);
      localStorage.removeItem(`overallProgress_${classId}_book`);
    }
  }, [selectedBook, classId]);

  const queryClient = useQueryClient();
  const { data: books } = useBooks();
  const {
    data: classBookProgress = new Map(),
    isLoading,
    isFetching,
    error,
    refetch: refetchProgress,
  } = useClassBookProgress(classId, selectedBook);

  const handleRefreshSpeakingQuiz = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["classBookProgress", classId] }),
      queryClient.invalidateQueries({ queryKey: ["classProgress", classId] }),
      queryClient.invalidateQueries({ queryKey: ["classQuizResults", classId] }),
    ]);
    await queryClient.refetchQueries({ queryKey: ["classBookProgress", classId] });
    refetchProgress();
  };
  const handleMarkNeedCompleteSpeaking = async () => {
    if (!selectedBook || !students) return;

    setIsMarkingNeedComplete(true);
    try {
      const targetLesson = chartCurrentLesson > 0 ? chartCurrentLesson : 0;
      const targetLessons = lessons
        .filter((lessonId) => lessonId <= targetLesson)
        .sort((a, b) => a - b);

      const batch = writeBatch(db);
      const progressCol = collection(db, "userBookProgress");

      students.forEach((student) => {
        const progress = classBookProgress.get(student.id);
        const completedSet = new Set(progress?.completedLessonsSpeaking ?? []);
        const needSpeakings = targetLessons.filter((lessonId) => !completedSet.has(lessonId));
        const progressRef = doc(progressCol, `${student.id}_${selectedBook}`);

        batch.set(
          progressRef,
          {
            userId: student.id,
            bookId: selectedBook,
            completedLessons: progress?.completedLessons ?? [],
            completedLessonsSpeaking: progress?.completedLessonsSpeaking ?? [],
            lessons: progress?.lessons ?? {},
            needSpeakings,
            lastUpdated: serverTimestamp(),
          },
          { merge: true }
        );
      });

      await batch.commit();
      toast.success("Đã đánh dấu Need Complete cho tab Speaking.");
      await queryClient.invalidateQueries({ queryKey: ["classBookProgress", classId, selectedBook] });
    } catch (error) {
      console.error("Failed to mark need complete speaking lessons:", error);
      toast.error("Không thể đánh dấu Need Complete.");
    } finally {
      setIsMarkingNeedComplete(false);
    }
  };
  const handleRunNeedPlusSpeaking = async (count: number) => {
    if (!selectedBook || !students || students.length === 0 || lessons.length === 0 || count <= 0) return;

    setIsNeedPlusRunning(true);
    try {
      const sortedLessons = [...lessons].sort((a, b) => a - b);
      const batch = writeBatch(db);
      const progressCol = collection(db, "userBookProgress");
      let affectedStudents = 0;

      students.forEach((student) => {
        const progress = classBookProgress.get(student.id);
        const completedSet = new Set<number>((progress?.completedLessonsSpeaking ?? []) as number[]);
        const pendingNeedSet = new Set<number>(
          ((progress?.needSpeakings ?? []) as number[]).filter((lessonId) => !completedSet.has(lessonId))
        );
        const maxCompletedLesson = completedSet.size > 0 ? Math.max(...completedSet) : 0;
        const assignCount = pendingNeedSet.size > 0 ? 1 : count;

        const nextLessons = sortedLessons
          .filter((lessonId) => lessonId > maxCompletedLesson && !completedSet.has(lessonId) && !pendingNeedSet.has(lessonId))
          .slice(0, assignCount);

        if (nextLessons.length === 0) return;

        const progressRef = doc(progressCol, `${student.id}_${selectedBook}`);
        batch.set(
          progressRef,
          {
            userId: student.id,
            bookId: selectedBook,
            completedLessons: progress?.completedLessons ?? [],
            completedLessonsSpeaking: progress?.completedLessonsSpeaking ?? [],
            lessons: progress?.lessons ?? {},
            needSpeakings: [...pendingNeedSet, ...nextLessons].sort((a, b) => a - b),
            lastUpdated: serverTimestamp(),
          },
          { merge: true }
        );
        affectedStudents += 1;
      });

      if (affectedStudents === 0) {
        toast("Không còn bài speaking kế tiếp để giao.");
        return;
      }

      await batch.commit();
      toast.success(`Đã giao ${count} bài speaking kế tiếp cho ${affectedStudents} học sinh.`);
      await queryClient.invalidateQueries({ queryKey: ["classBookProgress", classId, selectedBook] });
    } catch (error) {
      console.error("Failed to assign next speaking lessons:", error);
      toast.error("Không thể giao bài speaking kế tiếp.");
    } finally {
      setIsNeedPlusRunning(false);
    }
  };

  const handleMarkListenReadyForCurrentLesson = async () => {
    if (!selectedBook || !students || students.length === 0 || chartCurrentLesson <= 0) return;

    setIsMarkingListenReady(true);
    try {
      const batch = writeBatch(db);
      const progressCol = collection(db, "userBookProgress");
      let affectedStudents = 0;

      students.forEach((student) => {
        const progress = classBookProgress.get(student.id);
        const isCreatingProgressDoc = !progress;
        const lessonsData = progress?.lessons ?? {};
        const lessonData = lessonsData[chartCurrentLesson] ?? {};
        const currentListenCount = lessonData?.listenCount ?? 0;

        if (currentListenCount >= 3) return;

        const progressRef = doc(progressCol, `${student.id}_${selectedBook}`);
        batch.set(
          progressRef,
          {
            userId: student.id,
            bookId: selectedBook,
            ...(isCreatingProgressDoc
              ? {
                  completedLessons: [],
                  completedLessonsSpeaking: [],
                  needSpeakings: [],
                }
              : {}),
            lessons: {
              [chartCurrentLesson]: {
                listenCount: 3,
              },
            },
            lastUpdated: serverTimestamp(),
          },
          { merge: true }
        );
        affectedStudents += 1;
      });

      if (affectedStudents === 0) {
        toast("Tất cả học sinh đã đủ 3 lần nghe ở bài hiện tại.");
        return;
      }

      await batch.commit();
      toast.success(`Đã đánh dấu nghe đủ 3 lần cho bài ${chartCurrentLesson} (${affectedStudents} học sinh).`);
      await queryClient.invalidateQueries({ queryKey: ["classBookProgress", classId, selectedBook] });
    } catch (error) {
      console.error("Failed to mark listen count ready for current lesson:", error);
      toast.error("Không thể đánh dấu nghe đủ 3 lần.");
    } finally {
      setIsMarkingListenReady(false);
    }
  };

  const handleNeedPlusSpeakingClick = () => {
    if (!selectedBook || !students || lessons.length === 0 || isNeedPlusRunning) return;

    setPendingNeedPlusCount((prev) => {
      const next = prev + 1;
      if (needPlusTimerRef.current) {
        clearTimeout(needPlusTimerRef.current);
      }
      needPlusTimerRef.current = setTimeout(() => {
        void handleRunNeedPlusSpeaking(next);
        setPendingNeedPlusCount(0);
        needPlusTimerRef.current = null;
      }, 3000);
      return next;
    });
  };
  const { data: lessons = [] } = useLessons(selectedBook);

  const students = useMemo(
    () => members?.filter((m) => m.role === "student"),
    [members]
  );
  const studentsWithSpeakingSubmissions = useMemo(() => {
    if (!students || !selectedBook) return [];

    return students
      .filter((student) => {
        const studentProgress = classBookProgress.get(student.id);
        return lessons.some((lessonNum) => !!studentProgress?.lessons?.[lessonNum]?.fileUrl);
      })
      .sort((a, b) => a.name.localeCompare(b.name, "vi", { sensitivity: "base" }));
  }, [students, selectedBook, classBookProgress, lessons]);
  const filteredStudents = useMemo(() => {
    if (!students) return [];
    if (viewMode !== "manage") return students;
    if (selectedStudents.size === 0) return students;
    return students.filter((student) => selectedStudents.has(student.id));
  }, [students, selectedStudents, viewMode]);
  useEffect(() => {
    const validIds = new Set(studentsWithSpeakingSubmissions.map((student) => student.id));
    setSelectedStudents((prev) => {
      if (prev.size === 0) return prev;
      const next = new Set([...prev].filter((id) => validIds.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [studentsWithSpeakingSubmissions]);

  const speakingProgressDataMap = useMemo(() => {
    const progressMap = new Map<string, StudentProgressDetailData>();
    if (!students) return progressMap;

    const maxLesson = chartCurrentLesson > 0 ? chartCurrentLesson : (lessons.length > 0 ? Math.max(...lessons) : 0);
    const validLessons = Array.from({ length: lessons.length > 0 ? Math.max(...lessons) : 0 }, (_, i) => i + 1);

    students.forEach((student) => {
      const bookProgress = classBookProgress.get(student.id);
      const needSpeakingSet = new Set(bookProgress?.needSpeakings ?? []);
      const notDoneLessons: number[] = [];
      const notPassedLessons: Array<{ lessonId: number; accuracy: number }> = [];
      const listenedLessons: number[] = [];
      const needCompleteLessons: number[] = [];
      const completedSpeakingSet = new Set(
        (bookProgress?.completedLessonsSpeaking ?? []) as number[]
      );

      validLessons.forEach((lessonId) => {
        const lessonData = bookProgress?.lessons?.[lessonId];
        const hasSpeakingSubmission = !!lessonData?.lastSubmitted;
        const listenCount = lessonData?.listenCount ?? 0;
        const issueSpeaking = lessonData?.issueSpeaking;
        const hasIssueSpeaking = typeof issueSpeaking === "string" && issueSpeaking.trim().length > 0;
        const rawSpeakingScore = lessonData?.speakingScore;
        let speakingScore =
          typeof rawSpeakingScore === "string"
            ? Number(rawSpeakingScore.replace(",", "."))
            : typeof rawSpeakingScore === "number" && Number.isFinite(rawSpeakingScore)
              ? rawSpeakingScore
              : Number.NaN;
        if (!Number.isFinite(speakingScore)) {
          const fromIssue = extractSpeakingScoreFromIssue(
            typeof issueSpeaking === "string" ? issueSpeaking : undefined
          );
          speakingScore = fromIssue ?? Number.NaN;
        }
        if (completedSpeakingSet.has(lessonId)) {
          if (Number.isFinite(speakingScore) && speakingScore >= 7) {
            return;
          }
          if (Number.isFinite(speakingScore) && speakingScore < 7) {
            const normalizedScore = Math.max(
              0,
              Math.min(100, Math.round((speakingScore / 10) * 100))
            );
            notPassedLessons.push({ lessonId, accuracy: normalizedScore });
            return;
          }
          notPassedLessons.push({ lessonId, accuracy: 0 });
          return;
        }

        if (!hasSpeakingSubmission && lessonId <= maxLesson) {
          if (listenCount >= 1) {
            listenedLessons.push(lessonId);
          }
          notDoneLessons.push(lessonId);
          if (needSpeakingSet.has(lessonId)) {
            needCompleteLessons.push(lessonId);
          }
          return;
        }

        if (hasSpeakingSubmission && lessonId <= maxLesson) {
          if (!hasIssueSpeaking) {
            if (Number.isFinite(speakingScore) && speakingScore >= 7) {
              return;
            }
            notPassedLessons.push({ lessonId, accuracy: 0 });
            return;
          }

          if (!Number.isFinite(speakingScore) || speakingScore < 7) {
            const normalizedScore = Number.isFinite(speakingScore)
              ? Math.max(0, Math.min(100, Math.round((speakingScore / 10) * 100)))
              : 0;
            notPassedLessons.push({ lessonId, accuracy: normalizedScore });
          }
        }
      });

      progressMap.set(student.id, {
        studentId: student.id,
        studentName: student.name,
        notDoneLessons,
        notPassedLessons,
        listenedLessons,
        needCompleteLessons,
      });
    });

    return progressMap;
  }, [students, classBookProgress, chartCurrentLesson, lessons]);

  const studentProgressData = useMemo(() => {
    if (!students || !selectedBook) return [];
    const lessonsToProcess = lessons;

    // Cleanup ở /api/admin/storage/cleanup-speaking-submissions chỉ giữ folder
    // hôm nay, hôm qua và hôm kia → bài có lastSubmitted trước thời điểm này
    // được coi là đã bị xóa file audio trên Storage (dù URL còn lưu ở Firestore).
    const deletedAudioCutoff = new Date();
    deletedAudioCutoff.setDate(deletedAudioCutoff.getDate() - 2);
    deletedAudioCutoff.setHours(0, 0, 0, 0);

    const data: any[] = [];

    students.forEach((student) => {
      const studentProgress = classBookProgress.get(student.id);

      lessonsToProcess.forEach((lessonNum) => {
        const lessonProgress = studentProgress?.lessons?.[lessonNum];
        const hasSpeakingSubmission = !!lessonProgress?.fileUrl;

        if (viewMode === "manage" && !hasSpeakingSubmission) {
          return;
        }

        const speakingTimestamp = lessonProgress?.lastSubmitted
          ? lessonProgress.lastSubmitted.toDate()
          : null;
        const isAudioDeleted =
          !!speakingTimestamp && speakingTimestamp.getTime() < deletedAudioCutoff.getTime();

        data.push({
          student,
          lessonDetails: { book: selectedBook, lesson: lessonNum.toString() },
          hasSpeakingSubmission,
          speakingSubmissionUrl: lessonProgress?.fileUrl ?? null,
          speakingTimestamp,
          timestamp: speakingTimestamp,
          isAudioDeleted,
          issueSpeakingAt: lessonProgress?.issueSpeakingAt ? lessonProgress.issueSpeakingAt.toDate() : null,
          speakingDuration: lessonProgress?.duration ?? null,
          speakingCount: lessonProgress?.speakingCount ?? 0,
          listenCount: lessonProgress?.listenCount ?? 0,
          speakingScore: lessonProgress?.speakingScore ?? null,
          issueSpeaking: lessonProgress?.issueSpeaking ?? null,
        });
      });
    });

    const filteredData = viewMode === "manage" && filterDate
      ? data.filter((item) => {
        if (!item.speakingTimestamp) return false;
        const d = item.speakingTimestamp;
        const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
        return dateStr === filterDate;
      })
      : data;

    const dir = manageSortDir === "asc" ? 1 : -1;
    filteredData.sort((a, b) => {
      const lessonA = Number(a.lessonDetails?.lesson ?? 0);
      const lessonB = Number(b.lessonDetails?.lesson ?? 0);
      const nameCmp = (a.student?.name || "").localeCompare(
        b.student?.name || "",
        "vi",
        { sensitivity: "base" }
      );
      const tA = a.speakingTimestamp?.getTime() ?? 0;
      const tB = b.speakingTimestamp?.getTime() ?? 0;

      if (manageSortKey === "lesson") {
        if (lessonA !== lessonB) return (lessonA - lessonB) * dir;
        if (nameCmp !== 0) return nameCmp;
        return tB - tA; // tiebreaker: newest trước
      }
      if (manageSortKey === "student") {
        if (nameCmp !== 0) return nameCmp * dir;
        if (lessonA !== lessonB) return lessonA - lessonB;
        return tB - tA;
      }
      if (manageSortKey === "score") {
        const keyA = `${a.student?.id}-${a.lessonDetails?.lesson}`;
        const keyB = `${b.student?.id}-${b.lessonDetails?.lesson}`;
        const manualA = parseScoreValue(inlineScoreOverrides[keyA] ?? a.speakingScore);
        const manualB = parseScoreValue(inlineScoreOverrides[keyB] ?? b.speakingScore);
        // Fallback: nếu chưa có điểm thủ công thì dùng điểm AI gợi ý.
        const sA = manualA ?? extractTotalScoreNumber(a.issueSpeaking);
        const sB = manualB ?? extractTotalScoreNumber(b.issueSpeaking);
        // Bài hoàn toàn không có điểm (cả AI lẫn manual) luôn rớt xuống cuối.
        if (sA === null && sB !== null) return 1;
        if (sA !== null && sB === null) return -1;
        if (sA !== null && sB !== null && sA !== sB) return (sA - sB) * dir;
        // Tiebreaker: ưu tiên hàng đã có điểm thủ công lên trước (so cùng giá trị).
        if ((manualA !== null) !== (manualB !== null)) {
          return manualA !== null ? -1 : 1;
        }
        if (lessonA !== lessonB) return lessonA - lessonB;
        if (nameCmp !== 0) return nameCmp;
        return tB - tA;
      }
      // date
      if (tA !== tB) return (tA - tB) * dir;
      if (lessonA !== lessonB) return lessonA - lessonB;
      return nameCmp;
    });

    return filteredData;
  }, [
    students,
    classBookProgress,
    selectedBook,
    viewMode,
    filterDate,
    lessons,
    manageSortKey,
    manageSortDir,
    inlineScoreOverrides,
  ]);
  const filteredStudentProgressData = useMemo(() => {
    if (viewMode !== "manage") return studentProgressData;
    if (selectedStudents.size === 0) return studentProgressData;
    return studentProgressData.filter((item) => selectedStudents.has(item.student.id));
  }, [studentProgressData, selectedStudents, viewMode]);
  // Danh sách auto-evaluate KHÔNG phụ thuộc bộ lọc UI (ngày / học sinh).
  // Lấy tất cả bài nộp trong vòng ~3 ngày (vẫn còn audio trên Storage) mà
  // chưa có issueSpeaking hoặc issueSpeakingAt cũ hơn lần nộp gần nhất.
  const autoEvaluateTargets = useMemo(() => {
    if (!students || !selectedBook) return [] as Array<{
      studentId: string;
      studentName: string;
      fileUrl: string;
      duration?: number;
      lessonId: number;
    }>;

    // Cleanup ở /api/admin/storage/cleanup-speaking-submissions giữ folder
    // hôm nay / hôm qua / hôm kia → cutoff trùng đúng quy ước này.
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 2);
    cutoff.setHours(0, 0, 0, 0);
    // Bài nộp trong vòng 5 phút gần đây nhiều khả năng đang được chấm phía
    // client (SpeakingUploadScreen), nên server chưa nên auto-chấm để tránh
    // chạy trùng/đè kết quả.
    const recentSubmitGuardMs = Date.now() - 5 * 60 * 1000;

    const targets: Array<{
      studentId: string;
      studentName: string;
      fileUrl: string;
      duration?: number;
      lessonId: number;
    }> = [];

    students.forEach((student) => {
      const progress = classBookProgress.get(student.id);
      if (!progress?.lessons) return;

      lessons.forEach((lessonId) => {
        const lessonData = progress.lessons?.[lessonId];
        if (!lessonData?.fileUrl) return;
        if (!lessonData.lastSubmitted) return;
        const submittedAt = lessonData.lastSubmitted.toDate();
        if (submittedAt.getTime() < cutoff.getTime()) return;
        if (submittedAt.getTime() > recentSubmitGuardMs) return;
        if ((lessonData.duration ?? 0) <= 0) return;

        const issue = typeof lessonData.issueSpeaking === "string" ? lessonData.issueSpeaking : "";
        const issueAt = lessonData.issueSpeakingAt ? lessonData.issueSpeakingAt.toDate() : null;
        const needsEvaluation =
          !issue.trim() || (issueAt && issueAt.getTime() < submittedAt.getTime());
        if (!needsEvaluation) return;

        targets.push({
          studentId: student.id,
          studentName: student.name,
          fileUrl: lessonData.fileUrl,
          duration: lessonData.duration ?? undefined,
          lessonId,
        });
      });
    });

    return targets;
    // autoEvaluateTick chỉ để mỗi 60s tính lại recentSubmitGuardMs.
  }, [students, selectedBook, classBookProgress, lessons, autoEvaluateTick]);

  // Danh sách phát giáo viên có thể bấm Prev/Next trong modal nghe.
  // Cùng quy tắc 3 ngày như deletedAudioCutoff (hôm nay/hôm qua/hôm kia) để
  // chắc chắn file còn trên Storage. Sắp xếp theo bài → tên học sinh → giờ
  // nộp (cùng quy ước với bảng quản lý) để bấm Next là review tự nhiên theo
  // từng bài.
  const playableSubmissions = useMemo(() => {
    if (!students || !selectedBook) return [];

    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 2);
    cutoff.setHours(0, 0, 0, 0);

    const items: PlayableSubmissionItem[] = [];

    students.forEach((student) => {
      const progress = classBookProgress.get(student.id);
      if (!progress?.lessons) return;

      lessons.forEach((lessonNum) => {
        const lessonData = progress.lessons?.[lessonNum];
        if (!lessonData?.fileUrl) return;
        if (!lessonData.lastSubmitted) return;
        const submittedAt = lessonData.lastSubmitted.toDate();
        if (submittedAt.getTime() < cutoff.getTime()) return;
        if ((lessonData.duration ?? 0) <= 0) return;

        const rowKey = `${student.id}-${lessonNum}`;
        const overrideScore = inlineScoreOverrides[rowKey];
        // Chỉ giữ bài CHƯA có điểm thủ công (DB hoặc vừa accept trong session).
        if (hasManualSpeakingScore(overrideScore ?? lessonData.speakingScore)) return;

        items.push({
          studentId: student.id,
          studentName: student.name,
          avatarUrl: student.avatarUrl,
          lessonId: lessonNum.toString(),
          url: lessonData.fileUrl,
          duration: lessonData.duration ?? 0,
          speakingScore: lessonData.speakingScore ?? null,
          issueSpeaking: lessonData.issueSpeaking ?? null,
          submittedAt,
          sortScore: extractTotalScoreNumber(lessonData.issueSpeaking),
        });
      });
    });

    // Đồng bộ thứ tự với bảng quản lý để bấm Prev/Next trong modal nghe đi
    // đúng theo cột đang sort. Với cột "Điểm" lấy điểm AI gợi ý (vì bài
    // playable luôn chưa có điểm thủ công).
    items.sort((a, b) =>
      comparePlayableSubmissionOrder(a, b, manageSortKey, manageSortDir)
    );

    return items;
  }, [
    students,
    selectedBook,
    classBookProgress,
    lessons,
    manageSortKey,
    manageSortDir,
    inlineScoreOverrides,
  ]);

  const listeningAnchor = useMemo((): (Pick<
    PlayableSubmissionItem,
    "lessonId" | "studentName" | "submittedAt"
  > & { sortScore: number | null }) | null => {
    if (!listeningAudio) return null;
    const progress = classBookProgress.get(listeningAudio.studentId);
    const lessonNum = parseInt(listeningAudio.lessonId, 10);
    const lessonData = progress?.lessons?.[lessonNum];
    const submittedAt = lessonData?.lastSubmitted
      ? lessonData.lastSubmitted.toDate()
      : new Date(0);
    return {
      lessonId: listeningAudio.lessonId,
      studentName: listeningAudio.studentName,
      submittedAt,
      sortScore: extractTotalScoreNumber(listeningAudio.issueSpeaking),
    };
  }, [listeningAudio, classBookProgress]);

  const listeningNeighborPrev = useMemo(() => {
    if (!listeningAnchor) return null;
    return findNeighborPlayableSubmission(
      playableSubmissions,
      listeningAnchor,
      -1,
      manageSortKey,
      manageSortDir
    );
  }, [playableSubmissions, listeningAnchor, manageSortKey, manageSortDir]);

  const listeningNeighborNext = useMemo(() => {
    if (!listeningAnchor) return null;
    return findNeighborPlayableSubmission(
      playableSubmissions,
      listeningAnchor,
      1,
      manageSortKey,
      manageSortDir
    );
  }, [playableSubmissions, listeningAnchor, manageSortKey, manageSortDir]);

  const currentListeningIndex = useMemo(() => {
    if (!listeningAudio) return -1;
    return playableSubmissions.findIndex(
      (it) =>
        it.studentId === listeningAudio.studentId &&
        it.lessonId === listeningAudio.lessonId
    );
  }, [listeningAudio, playableSubmissions]);

  const openListeningSubmission = (item: PlayableSubmissionItem) => {
    const overrideKey = `${item.studentId}-${item.lessonId}`;
    setListeningAudio({
      url: item.url,
      studentName: item.studentName,
      studentId: item.studentId,
      avatarUrl: item.avatarUrl,
      lessonId: item.lessonId,
      speakingScore: inlineScoreOverrides[overrideKey] ?? item.speakingScore,
      issueSpeaking: item.issueSpeaking,
      duration: item.duration,
    });
  };

  const navigateListeningAudio = (delta: 1 | -1) => {
    const next = delta === 1 ? listeningNeighborNext : listeningNeighborPrev;
    if (!next) return;
    openListeningSubmission(next);
  };

  const handlePlayAllFromStart = () => {
    if (playableSubmissions.length === 0) {
      toast("Không có bài nào để phát.");
      return;
    }
    setIsAutoPlayAll(true);
    openListeningSubmission(playableSubmissions[0]);
  };

  const handleAudioEndedInModal = () => {
    if (!isAutoPlayAll) return;
    if (!listeningNeighborNext) {
      setIsAutoPlayAll(false);
      return;
    }
    openListeningSubmission(listeningNeighborNext);
  };

  const handleToggleStudent = (studentId: string) => {
    const newSelected = new Set(selectedStudents);
    if (newSelected.has(studentId)) {
      newSelected.delete(studentId);
    } else {
      newSelected.add(studentId);
    }
    setSelectedStudents(newSelected);
  };

  const handleEvaluateSingleIssue = async (progressItem: any): Promise<string | null> => {
    if (!selectedBook) return null;
    if (
      !progressItem?.speakingSubmissionUrl ||
      (progressItem.speakingDuration ?? 0) <= 0
    ) {
      return null;
    }

    const lessonId = parseInt(progressItem.lessonDetails.lesson, 10);
    if (!Number.isFinite(lessonId) || lessonId <= 0) return null;

    const rowId = `${progressItem.student.id}-${lessonId}`;
    // Chỉ chặn nếu CHÍNH bài này đang được chấm; cho phép chấm song song các bài khác.
    if (evaluatingIssueIds.has(rowId)) return null;
    setEvaluatingIssueIds((prev) => {
      const next = new Set(prev);
      next.add(rowId);
      return next;
    });

    try {
      const evaluationResult = await evaluateSpeakingSubmissionFromUrl(
        progressItem.speakingSubmissionUrl as string,
        selectedBook,
        lessonId,
        progressItem.speakingDuration ?? undefined,
        undefined,
        "audio/webm",
        progressItem.student.id
      );
      const issueSpeaking = evaluationResult.issueSpeaking;
      if (evaluationResult.queuedRetry || !issueSpeaking) {
        toast("Server đang bận, đã xếp hàng chấm lại tự động.");
        return null;
      }

      await updateSpeakingIssue(
        progressItem.student.id,
        selectedBook,
        lessonId,
        issueSpeaking
      );

      toast.success("Đã chấm AI lại cho bài này.");
      await handleRefreshSpeakingQuiz();
      return issueSpeaking;
    } catch (error) {
      console.error("Failed to re-evaluate speaking issue:", error);
      toast.error("Không thể chấm AI lại cho bài này.");
      return null;
    } finally {
      setEvaluatingIssueIds((prev) => {
        if (!prev.has(rowId)) return prev;
        const next = new Set(prev);
        next.delete(rowId);
        return next;
      });
    }
  };

  const runAutoBulkEvaluate = async (targets: typeof autoEvaluateTargets) => {
    if (!selectedBook || targets.length === 0) return;

    setIsBulkEvaluatingMissingIssues(true);
    setBulkEvaluateProgress({ done: 0, total: targets.length, failed: 0 });

    let failed = 0;
    let processed = 0;
    let currentIndex = 0;
    const maxConcurrentEvaluations = 5;

    const runEvaluateWorker = async () => {
      while (true) {
        if (currentIndex >= targets.length) return;

        const target = targets[currentIndex];
        currentIndex += 1;

        try {
          const evaluationResult = await evaluateSpeakingSubmissionFromUrl(
            target.fileUrl,
            selectedBook,
            target.lessonId,
            target.duration,
            undefined,
            "audio/webm",
            target.studentId
          );
          const issueSpeaking = evaluationResult.issueSpeaking;
          if (evaluationResult.queuedRetry || !issueSpeaking) {
            continue;
          }

          await updateSpeakingIssue(
            target.studentId,
            selectedBook,
            target.lessonId,
            issueSpeaking
          );
        } catch (error) {
          failed += 1;
          console.error("Auto evaluate speaking failed:", error);
        } finally {
          processed += 1;
          setBulkEvaluateProgress((prev) =>
            prev ? { ...prev, done: processed, failed } : prev
          );
        }
      }
    };

    const workerCount = Math.min(maxConcurrentEvaluations, targets.length);
    await Promise.all(Array.from({ length: workerCount }, () => runEvaluateWorker()));

    setIsBulkEvaluatingMissingIssues(false);
    await handleRefreshSpeakingQuiz();

    if (failed > 0) {
      toast.error(`Tự động chấm AI xong với ${failed} bài lỗi.`);
    } else if (processed > 0) {
      toast.success(`Đã tự động chấm AI ${processed} bài thiếu nhận xét.`);
    }
  };

  // Tự động chấm AI ngay khi vào tab speaking và có bài thiếu nhận xét trong
  // khoảng 3 ngày (còn audio trên Storage). Mỗi target chỉ thử 1 lần / session
  // để tránh lặp vô hạn nếu AI lỗi.
  useEffect(() => {
    if (!selectedBook || isAutoRunningRef.current) return;

    const remaining = autoEvaluateTargets.filter(
      (t) =>
        !autoEvaluatedTargetsRef.current.has(`${t.studentId}-${t.lessonId}-${t.fileUrl}`)
    );
    if (remaining.length === 0) return;

    remaining.forEach((t) =>
      autoEvaluatedTargetsRef.current.add(`${t.studentId}-${t.lessonId}-${t.fileUrl}`)
    );
    isAutoRunningRef.current = true;

    void runAutoBulkEvaluate(remaining).finally(() => {
      isAutoRunningRef.current = false;
    });
    // runAutoBulkEvaluate dùng closure ổn định cho lần chạy hiện tại; chỉ cần
    // re-run khi đổi sách hoặc danh sách target thay đổi.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedBook, autoEvaluateTargets]);

  if (isLoading) return <div>Đang tải dữ liệu tổng hợp...</div>;
  if (error) return <div>Có lỗi xảy ra khi tải dữ liệu.</div>;

  const hasSelection = selectedBook && (viewMode === "manage" ? (isAllDay || !!filterDate) : true);
  const rewardParamsBase = currentStudentId ? {
    teacherId: currentStudentId,
    teacherName: currentStudentName,
    teacherAvatarUrl: profile?.avatarUrl,
    classId,
  } : undefined;
  const cancelAiIssueClose = () => {
    if (aiIssueCloseTimerRef.current) {
      clearTimeout(aiIssueCloseTimerRef.current);
      aiIssueCloseTimerRef.current = null;
    }
  };
  const showAiIssuePreview = (issue: string | null | undefined) => {
    const content = issue?.trim();
    if (!content) return;
    cancelAiIssueClose();
    setHoveredAiIssueContent(content);
  };
  const scheduleCloseAiIssuePreview = () => {
    cancelAiIssueClose();
    aiIssueCloseTimerRef.current = setTimeout(() => {
      setHoveredAiIssueContent(null);
      aiIssueCloseTimerRef.current = null;
    }, 180);
  };
  const formatSubmittedAt = (date: Date | null | undefined) => {
    if (!date) return "—";
    const dd = String(date.getDate()).padStart(2, "0");
    const mm = String(date.getMonth() + 1).padStart(2, "0");
    const hh = String(date.getHours()).padStart(2, "0");
    const min = String(date.getMinutes()).padStart(2, "0");
    return `${hh}:${min} ${dd}/${mm}`;
  };
  const renderManageSortArrow = (key: ManageSortKey) => {
    if (manageSortKey !== key) {
      return (
        <FiChevronDown className="inline w-3 h-3 opacity-25" aria-hidden="true" />
      );
    }
    return manageSortDir === "asc" ? (
      <FiChevronUp className="inline w-3 h-3 text-blue-500" aria-hidden="true" />
    ) : (
      <FiChevronDown className="inline w-3 h-3 text-blue-500" aria-hidden="true" />
    );
  };
  const manageSortHeaderColor = (key: ManageSortKey) =>
    manageSortKey === key ? "text-blue-500" : "text-gray-500";
  const extractTotalScore = (issue: string | null | undefined) => {
    if (!issue) return null;
    const match = issue.match(/Tổng điểm[^\d]*(\d+(?:[.,]\d+)?)\s*\/?\s*10/i);
    return match?.[1] ?? null;
  };
  const normalizeScore = (score: string | null | undefined) => {
    if (!score) return null;
    const numeric = Number(score.replace(",", "."));
    if (!Number.isFinite(numeric)) return null;
    return Math.max(0, Math.min(10, numeric));
  };
  const getManualScoreClass = (score: string | null | undefined) => {
    const numeric = normalizeScore(score);
    if (numeric === null) return "text-red-600 dark:text-red-400";
    if (numeric < 7) return "text-orange-700 dark:text-orange-300";
    if (numeric >= 8) return "text-green-600 dark:text-green-400";
    return "text-blue-600 dark:text-blue-400";
  };
  const getAiScoreClass = (scoreText: string | null) => {
    const numeric = normalizeScore(scoreText);
    if (numeric === null) return "text-red-600 dark:text-red-400";
    if (numeric < 7) return "text-orange-700 dark:text-orange-300";
    if (numeric >= 8) return "text-green-600 dark:text-green-400";
    return "text-blue-600 dark:text-blue-400";
  };
  const getScoreLevel = (score: string | null | undefined) => {
    const numeric = normalizeScore(score);
    if (numeric === null) return 0;
    if (numeric >= 8) return 3;
    if (numeric >= 7) return 2;
    if (numeric >= 5) return 1;
    return 0;
  };
  const getScoreLevelFromAi = (scoreText: string | null) => {
    return getScoreLevel(scoreText);
  };
  const isAiBetterThanManual = (issue: string | null | undefined, speakingScore: string | null | undefined) => {
    const aiScore = extractTotalScore(issue);
    return getScoreLevelFromAi(aiScore) > getScoreLevel(speakingScore);
  };
  const handleQuickDonate = (studentId: string, studentName: string) => {
    if (!session?.user || !profile || !classId) return;
    setQuickDonateId(studentId);
    createTransaction(
      {
        studentId,
        studentName,
        userId: session.user.id,
        userName: session.user.name || session.user.phone || "Unknown",
        userRole: profile.role,
        amount: 1,
        reason: "Donate nhanh",
        type: "add",
        classId: classId,
      },
      {
        onSuccess: () => {
          setQuickDonateId(null);
          appendAdmirationToUser(
            studentId,
            studentName,
            {
              name: session.user.name || session.user.phone || "Giáo viên",
              value: 1,
              reactionType: "heart",
              fromStudentId: session.user.id,
              type: "admiration",
              fromStudentAvatarUrl: profile.avatarUrl || "",
              classId: classId,
            },
            { skipIncrementSenderCount: true }
          ).catch(console.error);
        },
        onError: () => setQuickDonateId(null),
      }
    );
  };

  return (
    <>
      {/* Filters */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4 mb-4">
        <div className="flex gap-2">
          <Button
            variant={viewMode === "chart" ? "primary" : "outline"}
            size="sm"
            onClick={() => setViewMode("chart")}
            className="w-full sm:w-auto justify-center"
          >
            <FiBarChart2 className="w-4 h-4 mr-2" />
            <span className="hidden sm:inline">Biểu đồ</span>
            <span className="sm:hidden">Biểu đồ</span>
          </Button>
          <Button
            variant={viewMode === "manage" ? "primary" : "outline"}
            size="sm"
            onClick={() => setViewMode("manage")}
            className="w-full sm:w-auto justify-center"
          >
            <FiList className="w-4 h-4 mr-2" />
            <span className="sm:inline">Quản lý</span>
          </Button>
        </div>

        {/* Book Selection */}
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <select
            value={selectedBook || ""}
            onChange={(e) => {
              setSelectedBook(e.target.value);
            }}
            className="flex-1 sm:flex-none sm:w-auto px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
          >
            <option value="">Chọn sách</option>
            {books &&
              books.map((book) => (
                <option key={book.id} value={book.id}>
                  {book.name}
                </option>
              ))}
          </select>
          {viewMode === "chart" && (
            <Button
              variant={pendingNeedPlusCount > 0 ? "primary" : "outline"}
              size="sm"
              onClick={handleNeedPlusSpeakingClick}
              disabled={!selectedBook || !students || lessons.length === 0 || isNeedPlusRunning}
              className="whitespace-nowrap px-2 shrink-0 h-10"
              title={pendingNeedPlusCount > 0 ? `Sẽ giao sau 3s: +${pendingNeedPlusCount} bài` : "+1 bài"}
            >
              +1 bài{pendingNeedPlusCount > 0 ? ` (${pendingNeedPlusCount})` : ""}
            </Button>
          )}
          <button
            onClick={handleRefreshSpeakingQuiz}
            disabled={isFetching || !selectedBook}
            className="h-10 w-10 flex items-center justify-center rounded-lg border border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
            title="Đồng bộ dữ liệu"
          >
            <FiRefreshCw className="w-5 h-5 text-primary" />
          </button>
        </div>

        {/* Date Selection - Only in manage mode */}
        {viewMode === "manage" && (
          <div className="flex flex-col sm:flex-row sm:items-center gap-2 w-full sm:w-auto">
            <div className="grid grid-cols-2 gap-2 w-full sm:flex sm:items-center sm:gap-4 sm:w-auto">
              <input
                type="date"
                value={filterDate}
                onChange={(e) => {
                  setFilterDate(e.target.value);
                  setIsAllDay(false);
                }}
                className="w-full h-10 px-3 py-1.5 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                title="Lọc theo ngày nộp"
                disabled={!selectedBook || isAllDay}
              />
              <button
                type="button"
                aria-pressed={isAllDay}
                disabled={!selectedBook}
                onClick={() => {
                  if (!isAllDay) {
                    setIsAllDay(true);
                    setFilterDate("");
                  } else {
                    setIsAllDay(false);
                    setFilterDate(getTodayFilterDate());
                  }
                }}
                className={cn(
                  "h-10 p-3 w-full rounded-md border flex items-center justify-center cursor-pointer text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed",
                  isAllDay
                    ? "border-blue-300 bg-blue-50 text-blue-400"
                    : "border-gray-300 hover:bg-gray-50"
                )}
              >
                All time
              </button>
              <button
                type="button"
                onClick={handlePlayAllFromStart}
                disabled={!selectedBook || playableSubmissions.length === 0}
                title={`Phát lần lượt ${playableSubmissions.length} bài chưa chấm`}
                aria-label="Phát lần lượt các bài"
                className="h-10 w-10 shrink-0 col-span-2 sm:col-span-1 rounded-md border border-blue-200 bg-blue-50 text-blue-400 hover:bg-blue-100 hover:text-blue-500 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center transition-colors"
              >
                <FiPlay className="w-4 h-4 fill-current ml-0.5" />
              </button>
            </div>
          </div>
        )}

        {/* Current Lesson Slider - Only in chart mode */}
        {selectedBook && viewMode === "chart" && (
          <div className="flex flex-col sm:flex-row sm:items-center gap-2 w-full sm:w-auto">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  if (chartCurrentLesson > 0) {
                    setChartCurrentLesson(chartCurrentLesson - 1);
                  }
                }}
                disabled={chartCurrentLesson === 0}
                className="w-8 h-8 flex items-center justify-center rounded border border-gray-300 bg-white hover:bg-gray-50 hover:border-blue-400 disabled:opacity-40 disabled:cursor-not-allowed text-gray-700 font-bold text-sm transition-colors"
                title="Giảm 1"
              >
                −
              </button>

              <input
                type="number"
                min="0"
                max={lessons.length > 0 ? Math.max(...lessons) : 0}
                value={chartCurrentLesson || ""}
                onChange={(e) => {
                  const value = e.target.value;
                  if (value === "") {
                    setChartCurrentLesson(0);
                  } else {
                    const num = parseInt(value, 10);
                    const mLesson = lessons.length > 0 ? Math.max(...lessons) : 0;
                    if (!isNaN(num) && num >= 0 && num <= mLesson) {
                      setChartCurrentLesson(num);
                    }
                  }
                }}
                onBlur={(e) => {
                  if (e.target.value === "" || parseInt(e.target.value, 10) < 0) {
                    setChartCurrentLesson(0);
                  }
                }}
                placeholder="0"
                className="w-20 px-2 py-1.5 text-center text-sm font-medium text-blue-600 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white"
              />

              <button
                type="button"
                onClick={() => {
                  const mLesson = lessons.length > 0 ? Math.max(...lessons) : 0;
                  if (chartCurrentLesson < mLesson) {
                    setChartCurrentLesson(chartCurrentLesson + 1);
                  }
                }}
                disabled={chartCurrentLesson >= (lessons.length > 0 ? Math.max(...lessons) : 0)}
                className="w-8 h-8 flex items-center justify-center rounded border border-gray-300 bg-white hover:bg-gray-50 hover:border-blue-400 disabled:opacity-40 disabled:cursor-not-allowed text-gray-700 font-bold text-sm transition-colors"
                title="Tăng 1"
              >
                +
              </button>

              <input
                type="range"
                min="0"
                max={lessons.length > 0 ? Math.max(...lessons) : 0}
                value={chartCurrentLesson}
                onChange={(e) => {
                  const lesson = parseInt(e.target.value, 10);
                  setChartCurrentLesson(lesson);
                }}
                className="flex-1 h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
                style={{
                  background: `linear-gradient(to right, #3b82f6 0%, #3b82f6 ${(chartCurrentLesson / (lessons.length > 0 ? Math.max(...lessons) : 1)) * 100}%, #e5e7eb ${(chartCurrentLesson / (lessons.length > 0 ? Math.max(...lessons) : 1)) * 100}%, #e5e7eb 100%)`
                }}
              />

              <span className="text-xs text-gray-500 whitespace-nowrap">
                / {lessons.length > 0 ? Math.max(...lessons) : 0}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={handleMarkNeedCompleteSpeaking}
                disabled={isMarkingNeedComplete || lessons.length === 0}
                className="whitespace-nowrap px-2"
                title="Đánh dấu Need Complete"
                aria-label="Đánh dấu Need Complete"
              >
                <FiCheckCircle className={cn("w-4 h-4 text-blue-300", isMarkingNeedComplete && "animate-pulse")} />
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleMarkListenReadyForCurrentLesson}
                disabled={isMarkingListenReady || lessons.length === 0 || chartCurrentLesson <= 0}
                className="whitespace-nowrap px-2"
                title="Đánh dấu đủ nghe 3 lần cho bài current"
                aria-label="Đánh dấu đủ nghe 3 lần cho bài current"
              >
                <FiCheckCircle
                  className={cn("w-4 h-4 text-yellow-500", isMarkingListenReady && "animate-pulse")}
                />
              </Button>
            </div>
          </div>
        )}

      </div>

      {selectedBook && viewMode === "manage" && (
        <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-3 sm:p-4 border border-gray-200 dark:border-gray-600 mb-4">
          <div className="flex items-center gap-2 mb-3">
            <h3 className="text-sm font-semibold">Lọc :</h3>
          </div>
          <div className="flex flex-wrap gap-2">
            {studentsWithSpeakingSubmissions.map((student) => {
              const isSelected = selectedStudents.has(student.id);
              return (
                <button
                  key={student.id}
                  onClick={() => handleToggleStudent(student.id)}
                  className={cn(
                    "px-2.5 sm:px-3 py-1.5 rounded-md text-xs sm:text-sm border transition-all flex items-center gap-1.5",
                    isSelected
                      ? "bg-blue-50 dark:bg-gray-800 border-blue-300 "
                      : "bg-white dark:bg-gray-800 border-gray-300 hover:border-blue-400"
                  )}
                >
                  <div className="relative w-4 h-4 flex-shrink-0">
                    {student.avatarUrl ? (
                      <Image
                        src={student.avatarUrl}
                        alt={student.name}
                        width={16}
                        height={16}
                        sizes="16px"
                        className="w-full h-full rounded-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full rounded-full bg-primary/10 flex items-center justify-center">
                        <FiUser className="w-2.5 h-2.5 text-primary" />
                      </div>
                    )}
                    {isOnline(student.id) && (
                      <div className="absolute -bottom-0.5 -right-0.5 w-1.5 h-1.5 bg-green-500 rounded-full border border-white dark:border-gray-800" />
                    )}
                  </div>
                  {student.name}
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div>
        {viewMode === "chart" ? (
          // Chart View
          <div className="space-y-6">
            {!selectedBook ? (
              <p className="text-muted text-center py-8">
                Vui lòng chọn sách để xem biểu đồ
              </p>
            ) : filteredStudents.length === 0 ? (
              <p className="text-muted text-center py-8">
                Không có học sinh khớp bộ lọc
              </p>
            ) : (
              <>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
                  {filteredStudents.map((student) => {
                    const _maxLesson = chartCurrentLesson > 0 ? chartCurrentLesson : (lessons.length > 0 ? Math.max(...lessons) : 0);
                    const validLessons = Array.from({ length: lessons.length > 0 ? Math.max(...lessons) : 0 }, (_, i) => i + 1);
                    const detailProgress = speakingProgressDataMap.get(student.id);

                    return (
                      <StudentSpeakingChart
                        key={student.id}
                        studentId={student.id}
                        studentName={student.name}
                        avatarUrl={student.avatarUrl}
                        bookProgress={classBookProgress.get(student.id)}
                        allLessons={validLessons}
                        maxLesson={_maxLesson}
                        isOnline={isOnline(student.id)}
                        onClick={() => {
                          if (!detailProgress) return;
                          setSelectedStudentForDetail({
                            studentId: student.id,
                            studentName: student.name,
                            avatarUrl: student.avatarUrl,
                            progressData: detailProgress,
                          });
                        }}
                      />
                    );
                  })}
                </div>
                {/* Legend */}
                <div className="mt-6 flex flex-wrap items-center justify-center gap-4 text-xs">
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-4 rounded-full bg-blue-200"></div>
                    <span>Cần làm</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-4 rounded-full bg-yellow-500"></div>
                    <span>Nghe</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-4 rounded-full bg-orange-600"></div>
                    <span>Chưa đạt (&lt;7)</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-4 rounded-full bg-blue-500"></div>
                    <span>Hôm nay</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-4 rounded-full bg-green-500"></div>
                    <span>Đạt</span>
                  </div>
                </div>
              </>
            )}
          </div>
        ) : !hasSelection ? (
          <>
            {/* Mobile Card View */}
            <div className="block md:hidden space-y-3">
              {filteredStudents.map((student) => (
                <div
                  key={student.id}
                  className="p-4 bg-gray-50 dark:bg-gray-700 rounded-lg border border-gray-200 dark:border-gray-600"
                >
                  <div className="flex items-center gap-2 font-medium">
                    <div className="relative w-6 h-6 flex-shrink-0">
                      <ProfileAvatarLink
                        userId={student.id}
                        className="block h-full w-full rounded-full overflow-hidden"
                        ariaLabel={`Hồ sơ ${student.name}`}
                      >
                        {student.avatarUrl ? (
                          <Image src={student.avatarUrl} alt={student.name} width={24} height={24} sizes="24px" className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full rounded-full bg-primary/10 flex items-center justify-center">
                            <FiUser className="w-3 h-3 text-primary" />
                          </div>
                        )}
                      </ProfileAvatarLink>
                      {isOnline(student.id) && (
                        <div className="absolute -bottom-0.5 -right-0.5 w-2 h-2 bg-green-500 border-2 border-white dark:border-gray-800 rounded-full z-20"></div>
                      )}
                    </div>
                    {student.name}
                  </div>
                </div>
              ))}
            </div>
            {/* Desktop Table View */}
            <div className="hidden md:block overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                <thead className="bg-gray-50 dark:bg-gray-700">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Học sinh
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                  {filteredStudents.map((student) => (
                    <tr key={student.id}>
                      <td className="px-4 py-3 font-medium flex items-center gap-2">
                        <div className="relative w-6 h-6 flex-shrink-0">
                          <ProfileAvatarLink
                            userId={student.id}
                            className="block h-full w-full rounded-full overflow-hidden"
                            ariaLabel={`Hồ sơ ${student.name}`}
                          >
                            {student.avatarUrl ? (
                              <Image src={student.avatarUrl} alt={student.name} width={24} height={24} sizes="24px" className="w-full h-full object-cover" />
                            ) : (
                              <div className="w-full h-full rounded-full bg-primary/10 flex items-center justify-center">
                                <FiUser className="w-3 h-3 text-primary" />
                              </div>
                            )}
                          </ProfileAvatarLink>
                          {isOnline(student.id) && (
                            <div className="absolute -bottom-0.5 -right-0.5 w-2 h-2 bg-green-500 border-2 border-white dark:border-gray-800 rounded-full z-20"></div>
                          )}
                        </div>
                        {student.name}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ) : filteredStudentProgressData.length === 0 ? (
          <p className="text-muted p-4 text-center">
            Không có dữ liệu tiến độ cho lựa chọn này.
          </p>
        ) : (
          <>
            {/* Mobile Table View */}
            <div className="block md:hidden overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700 text-sm [&_tr]:h-12 [&_td]:h-12 [&_th]:h-12">
                <thead className="bg-gray-50 dark:bg-gray-700">
                  <tr className="align-middle">
                    <th
                      onClick={() => handleManageSort("student")}
                      className={cn(
                        "px-2 py-2 text-left text-xs font-medium uppercase align-middle cursor-pointer select-none hover:bg-gray-100 dark:hover:bg-gray-600",
                        manageSortHeaderColor("student")
                      )}
                    >
                      <span className="inline-flex items-center gap-0.5">
                        Học sinh
                        {renderManageSortArrow("student")}
                      </span>
                    </th>
                    <th
                      onClick={() => handleManageSort("lesson")}
                      className={cn(
                        "px-2 py-2 text-center text-xs font-medium uppercase min-w-[60px] align-middle cursor-pointer select-none hover:bg-gray-100 dark:hover:bg-gray-600",
                        manageSortHeaderColor("lesson")
                      )}
                    >
                      <span className="inline-flex items-center gap-0.5">
                        Bài
                        {renderManageSortArrow("lesson")}
                      </span>
                    </th>
                    <th className="px-2 py-2 text-center text-xs font-medium text-gray-500 uppercase w-auto align-middle">
                      Audio
                    </th>
                    <th className="px-2 py-2 text-center text-xs font-medium text-gray-500 uppercase min-w-[56px] align-middle">
                      Nộp
                    </th>
                    <th
                      onClick={() => handleManageSort("score")}
                      className={cn(
                        "px-2 py-2 text-center text-xs font-medium uppercase w-12 align-middle cursor-pointer select-none hover:bg-gray-100 dark:hover:bg-gray-600",
                        manageSortHeaderColor("score")
                      )}
                    >
                      <span className="inline-flex items-center gap-0.5">
                        Điểm
                        {renderManageSortArrow("score")}
                      </span>
                    </th>
                    <th
                      onClick={() => handleManageSort("date")}
                      className={cn(
                        "px-2 py-2 text-center text-xs font-medium uppercase min-w-[80px] align-middle cursor-pointer select-none hover:bg-gray-100 dark:hover:bg-gray-600",
                        manageSortHeaderColor("date")
                      )}
                    >
                      <span className="inline-flex items-center gap-0.5">
                        Ngày
                        {renderManageSortArrow("date")}
                      </span>
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                  {filteredStudentProgressData.map((progress) => {
                    const aiBetterThanManual = isAiBetterThanManual(progress.issueSpeaking, progress.speakingScore);
                    const shouldShowRowGeminiButton =
                      progress.hasSpeakingSubmission &&
                      !!progress.speakingSubmissionUrl &&
                      (progress.speakingDuration ?? 0) > 0 &&
                      (
                        !progress.issueSpeaking?.trim() ||
                        (progress.issueSpeakingAt &&
                          progress.speakingTimestamp &&
                          progress.issueSpeakingAt.getTime() < progress.speakingTimestamp.getTime())
                      );
                    const rowEvaluateId = `${progress.student.id}-${progress.lessonDetails.lesson}`;
                    const isEvaluatingRow = evaluatingIssueIds.has(rowEvaluateId);
                    return (
                    <tr
                      key={`${progress.student.id}-${progress.lessonDetails.lesson}`}
                      className={cn(
                        "align-middle",
                        aiBetterThanManual && "bg-green-50/70 dark:bg-green-900/10"
                      )}
                    >
                      <td className="px-2 py-2 font-medium align-middle">
                        <div className="flex items-center gap-2 min-w-0 h-8">
                          <div className="relative w-5 h-5 flex-shrink-0">
                            <ProfileAvatarLink
                              userId={progress.student.id}
                              className="block h-full w-full rounded-full overflow-hidden"
                              ariaLabel={`Hồ sơ ${progress.student.name}`}
                            >
                              {progress.student.avatarUrl ? (
                                <Image src={progress.student.avatarUrl} alt={progress.student.name} width={20} height={20} sizes="20px" className="w-full h-full object-cover" />
                              ) : (
                                <div className="w-full h-full rounded-full bg-primary/10 flex items-center justify-center">
                                  <FiUser className="w-2.5 h-2.5 text-primary" />
                                </div>
                              )}
                            </ProfileAvatarLink>
                            {isOnline(progress.student.id) && (
                              <div className="absolute -bottom-0.5 -right-0.5 w-1.5 h-1.5 bg-green-500 border border-white dark:border-gray-800 rounded-full z-20"></div>
                            )}
                          </div>
                          {aiBetterThanManual && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleQuickDonate(progress.student.id, progress.student.name)}
                              disabled={isQuickDonating && quickDonateId === progress.student.id}
                              title="Donate nhanh 1 bánh mì"
                              className="p-1 min-w-0 h-7 w-7 hover:bg-green-100 dark:hover:bg-green-900/20"
                            >
                              <FiHeart className={cn("h-3.5 w-3.5 text-green-500", isQuickDonating && quickDonateId === progress.student.id && "animate-pulse")} />
                            </Button>
                          )}
                          <div className="flex flex-col min-w-0">
                            <span className="truncate leading-tight">{progress.student.name}</span>
                          </div>
                        </div>
                      </td>
                      <td
                        className={cn(
                          "px-2 py-2 text-center align-middle font-medium",
                          aiBetterThanManual ? "text-green-600 dark:text-green-400" : "text-blue-600 dark:text-blue-400"
                        )}
                      >
                        {progress.lessonDetails.lesson}
                      </td>
                      <td className="px-2 py-2 text-center align-middle">
                        <div className="h-8 flex items-center justify-center gap-1">
                          {progress?.speakingSubmissionUrl && (progress.speakingDuration ?? 0) > 0 ? (
                            <>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => {
                                  setIsAutoPlayAll(false);
                                  setListeningAudio({
                                    url: progress.speakingSubmissionUrl!,
                                    studentName: progress.student.name,
                                    studentId: progress.student.id,
                                    avatarUrl: progress.student.avatarUrl,
                                    lessonId: progress.lessonDetails.lesson,
                                    speakingScore: progress.speakingScore,
                                    issueSpeaking: progress.issueSpeaking,
                                    duration: progress.speakingDuration!,
                                  });
                                }}
                                aria-label={`Nghe bài nói của ${progress.student.name}`}
                                title={
                                  progress.isAudioDeleted
                                    ? "Audio đã bị xóa khỏi Storage (quá 3 ngày)"
                                    : undefined
                                }
                                className={cn(
                                  "p-1 min-w-0 h-8",
                                  progress.isAudioDeleted
                                    ? "text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300"
                                    : "text-primary hover:text-primary/90"
                                )}
                              >
                                <FiPlay className="h-4 w-4" />
                              </Button>
                              <span className="text-gray-700 dark:text-gray-300 text-xs font-medium whitespace-nowrap">
                                {`${Math.floor(progress.speakingDuration! / 60)}:${String(Math.floor(progress.speakingDuration! % 60)).padStart(2, "0")}`}
                              </span>
                            </>
                          ) : (
                            "—"
                          )}
                        </div>
                      </td>
                      <td className="px-2 py-2 text-center align-middle text-xs font-semibold text-gray-700 dark:text-gray-300">
                        {progress.speakingCount > 0 ? progress.speakingCount : "—"}
                      </td>
                      <td className="px-2 py-2 text-center align-middle">
                        <div className="h-8 flex items-center justify-center gap-1.5">
                          {progress.hasSpeakingSubmission ? (
                            progress.speakingScore ? (
                              <button
                                type="button"
                                onMouseEnter={() => progress.issueSpeaking && showAiIssuePreview(progress.issueSpeaking)}
                                onMouseLeave={() => progress.issueSpeaking && scheduleCloseAiIssuePreview()}
                                onFocus={() => progress.issueSpeaking && showAiIssuePreview(progress.issueSpeaking)}
                                onBlur={() => progress.issueSpeaking && scheduleCloseAiIssuePreview()}
                                className={cn(
                                  "text-xs font-semibold",
                                  getManualScoreClass(progress.speakingScore),
                                  progress.issueSpeaking && "cursor-help"
                                )}
                                title={progress.issueSpeaking ? "Xem nhận xét AI" : undefined}
                              >
                                {progress.speakingScore}
                              </button>
                            ) : (
                              (() => {
                                const aiScore = extractTotalScore(progress.issueSpeaking);
                                return (
                              <button
                                type="button"
                                onMouseEnter={() => showAiIssuePreview(progress.issueSpeaking)}
                                onMouseLeave={scheduleCloseAiIssuePreview}
                                onFocus={() => showAiIssuePreview(progress.issueSpeaking)}
                                onBlur={scheduleCloseAiIssuePreview}
                                className="inline-flex items-center gap-1.5 text-xs font-semibold"
                                title="Xem nhận xét AI"
                              >
                                <Image
                                  src="/assets/images/geminiAI.png"
                                  alt="AI chấm"
                                  width={14}
                                  height={14}
                                  className="rounded-sm"
                                />
                                <span className={getAiScoreClass(aiScore)}>{aiScore ?? "—"}</span>
                              </button>
                                );
                              })()
                            )
                          ) : (
                            "—"
                          )}
                          {shouldShowRowGeminiButton && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleEvaluateSingleIssue(progress)}
                              disabled={isEvaluatingRow}
                              title="Chấm lại AI cho bài này"
                              className="p-1 min-w-0 h-7 w-7 hover:bg-blue-50 dark:hover:bg-blue-900/20"
                            >
                              <Image
                                src="/assets/images/geminiAI.png"
                                alt="Chấm lại AI"
                                width={14}
                                height={14}
                                className={cn("rounded-sm", isEvaluatingRow && "animate-pulse")}
                              />
                            </Button>
                          )}
                        </div>
                      </td>
                      <td className="px-2 py-2 text-center align-middle text-xs text-gray-600 dark:text-gray-400 whitespace-nowrap">
                        {formatSubmittedAt(progress.speakingTimestamp)}
                      </td>
                    </tr>
                  );
                  })}
                </tbody>
              </table>
            </div>

            {/* Desktop Table View */}
            <div className="hidden md:block overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700 [&_tr]:h-12 [&_td]:h-12 [&_th]:h-12">
                <thead className="bg-gray-50 dark:bg-gray-700">
                  <tr className="align-middle">
                    <th
                      onClick={() => handleManageSort("student")}
                      className={cn(
                        "px-4 py-3 text-left text-xs font-medium uppercase min-w-[150px] align-middle cursor-pointer select-none hover:bg-gray-100 dark:hover:bg-gray-600",
                        manageSortHeaderColor("student")
                      )}
                    >
                      <span className="inline-flex items-center gap-1">
                        Học sinh
                        {renderManageSortArrow("student")}
                      </span>
                    </th>
                    <th
                      onClick={() => handleManageSort("lesson")}
                      className={cn(
                        "px-4 py-3 text-center text-xs font-medium uppercase min-w-[80px] align-middle cursor-pointer select-none hover:bg-gray-100 dark:hover:bg-gray-600",
                        manageSortHeaderColor("lesson")
                      )}
                    >
                      <span className="inline-flex items-center gap-1">
                        Bài
                        {renderManageSortArrow("lesson")}
                      </span>
                    </th>
                    <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase min-w-[120px] align-middle">
                      Audio
                    </th>
                    <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase min-w-[80px] align-middle">
                      Lần nộp
                    </th>
                    <th
                      onClick={() => handleManageSort("score")}
                      className={cn(
                        "px-4 py-3 text-center text-xs font-medium uppercase min-w-[80px] align-middle cursor-pointer select-none hover:bg-gray-100 dark:hover:bg-gray-600",
                        manageSortHeaderColor("score")
                      )}
                    >
                      <span className="inline-flex items-center gap-1">
                        Điểm
                        {renderManageSortArrow("score")}
                      </span>
                    </th>
                    <th
                      onClick={() => handleManageSort("date")}
                      className={cn(
                        "px-4 py-3 text-center text-xs font-medium uppercase min-w-[110px] align-middle cursor-pointer select-none hover:bg-gray-100 dark:hover:bg-gray-600",
                        manageSortHeaderColor("date")
                      )}
                    >
                      <span className="inline-flex items-center gap-1">
                        Ngày
                        {renderManageSortArrow("date")}
                      </span>
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                  {filteredStudentProgressData.map((progress) => {
                    const aiBetterThanManual = isAiBetterThanManual(progress.issueSpeaking, progress.speakingScore);
                    const shouldShowRowGeminiButton =
                      progress.hasSpeakingSubmission &&
                      !!progress.speakingSubmissionUrl &&
                      (progress.speakingDuration ?? 0) > 0 &&
                      (
                        !progress.issueSpeaking?.trim() ||
                        (progress.issueSpeakingAt &&
                          progress.speakingTimestamp &&
                          progress.issueSpeakingAt.getTime() < progress.speakingTimestamp.getTime())
                      );
                    const rowEvaluateId = `${progress.student.id}-${progress.lessonDetails.lesson}`;
                    const isEvaluatingRow = evaluatingIssueIds.has(rowEvaluateId);
                    return (
                    <tr
                      key={`${progress.student.id}-${progress.lessonDetails.lesson}`}
                      className={cn(
                        "align-middle",
                        aiBetterThanManual && "bg-green-50/70 dark:bg-green-900/10"
                      )}
                    >
                      <td className="px-4 py-3 font-medium align-middle">
                        <div className="flex items-center gap-2 h-8">
                          <div className="relative w-6 h-6 flex-shrink-0">
                            <ProfileAvatarLink
                              userId={progress.student.id}
                              className="block h-full w-full rounded-full overflow-hidden"
                              ariaLabel={`Hồ sơ ${progress.student.name}`}
                            >
                              {progress.student.avatarUrl ? (
                                <Image src={progress.student.avatarUrl} alt={progress.student.name} width={24} height={24} sizes="24px" className="w-full h-full object-cover" />
                              ) : (
                                <div className="w-full h-full rounded-full bg-primary/10 flex items-center justify-center">
                                  <FiUser className="w-3 h-3 text-primary" />
                                </div>
                              )}
                            </ProfileAvatarLink>
                            {isOnline(progress.student.id) && (
                              <div className="absolute -bottom-0.5 -right-0.5 w-2 h-2 bg-green-500 border-2 border-white dark:border-gray-800 rounded-full z-20"></div>
                            )}
                          </div>
                          {aiBetterThanManual && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleQuickDonate(progress.student.id, progress.student.name)}
                              disabled={isQuickDonating && quickDonateId === progress.student.id}
                              title="Donate nhanh 1 bánh mì"
                              className="p-1 min-w-0 h-7 w-7 hover:bg-green-100 dark:hover:bg-green-900/20"
                            >
                              <FiHeart className={cn("h-4 w-4 text-green-500", isQuickDonating && quickDonateId === progress.student.id && "animate-pulse")} />
                            </Button>
                          )}
                          <div className="flex flex-col">
                            <span>{progress.student.name}</span>
                            {/* Hide lesson number context on Mobile but allow it to render if we didn't add the new column to desktop yet */}
                          </div>
                        </div>
                      </td>
                      <td
                        className={cn(
                          "px-4 py-3 text-center align-middle font-medium",
                          aiBetterThanManual ? "text-green-600 dark:text-green-400" : "text-blue-600 dark:text-blue-400"
                        )}
                      >
                         {progress.lessonDetails.lesson}
                      </td>
                      <td className="px-4 py-3 text-center align-middle">
                        <div className="h-8 flex items-center justify-center gap-1.5">
                          {progress?.speakingSubmissionUrl && (progress.speakingDuration ?? 0) > 0 ? (
                            <>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => {
                                  setIsAutoPlayAll(false);
                                  setListeningAudio({
                                    url: progress.speakingSubmissionUrl!,
                                    studentName: progress.student.name,
                                    studentId: progress.student.id,
                                    avatarUrl: progress.student.avatarUrl,
                                    lessonId: progress.lessonDetails.lesson,
                                    speakingScore: progress.speakingScore,
                                    issueSpeaking: progress.issueSpeaking,
                                    duration: progress.speakingDuration!,
                                  });
                                }}
                                aria-label={`Nghe bài nói của ${progress.student.name}`}
                                title={
                                  progress.isAudioDeleted
                                    ? "Audio đã bị xóa khỏi Storage (quá 3 ngày)"
                                    : undefined
                                }
                                className={cn(
                                  "p-2 h-8 w-8 min-w-0",
                                  progress.isAudioDeleted
                                    ? "text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300"
                                    : "text-primary hover:text-primary/90"
                                )}
                              >
                                <FiPlay className="h-5 w-5" />
                              </Button>
                              <span className="text-gray-700 dark:text-gray-300 text-sm font-medium whitespace-nowrap">
                                {`${Math.floor(progress.speakingDuration! / 60)}:${String(Math.floor(progress.speakingDuration! % 60)).padStart(2, "0")}`}
                              </span>
                            </>
                          ) : (
                            "—"
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-center align-middle text-sm font-semibold text-gray-700 dark:text-gray-300">
                        {progress.speakingCount > 0 ? progress.speakingCount : "—"}
                      </td>
                      <td className="px-4 py-3 text-center align-middle">
                        <div className="h-8 flex items-center justify-center gap-2">
                          {progress.hasSpeakingSubmission ? (
                            progress.speakingScore ? (
                              <button
                                type="button"
                                onMouseEnter={() => progress.issueSpeaking && showAiIssuePreview(progress.issueSpeaking)}
                                onMouseLeave={() => progress.issueSpeaking && scheduleCloseAiIssuePreview()}
                                onFocus={() => progress.issueSpeaking && showAiIssuePreview(progress.issueSpeaking)}
                                onBlur={() => progress.issueSpeaking && scheduleCloseAiIssuePreview()}
                                className={cn(
                                  "text-sm font-semibold",
                                  getManualScoreClass(progress.speakingScore),
                                  progress.issueSpeaking && "cursor-help"
                                )}
                                title={progress.issueSpeaking ? "Xem nhận xét AI" : undefined}
                              >
                                {progress.speakingScore}
                              </button>
                            ) : (
                              (() => {
                                const aiScore = extractTotalScore(progress.issueSpeaking);
                                return (
                              <button
                                type="button"
                                onMouseEnter={() => showAiIssuePreview(progress.issueSpeaking)}
                                onMouseLeave={scheduleCloseAiIssuePreview}
                                onFocus={() => showAiIssuePreview(progress.issueSpeaking)}
                                onBlur={scheduleCloseAiIssuePreview}
                                className="inline-flex items-center gap-1.5 text-sm font-semibold"
                                title="Xem nhận xét AI"
                              >
                                <Image
                                  src="/assets/images/geminiAI.png"
                                  alt="AI chấm"
                                  width={16}
                                  height={16}
                                  className="rounded-sm"
                                />
                                <span className={getAiScoreClass(aiScore)}>{aiScore ?? "—"}</span>
                              </button>
                                );
                              })()
                            )
                          ) : (
                            "—"
                          )}
                          {shouldShowRowGeminiButton && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleEvaluateSingleIssue(progress)}
                              disabled={isEvaluatingRow}
                              title="Chấm lại AI cho bài này"
                              className="p-1 min-w-0 h-7 w-7 hover:bg-blue-50 dark:hover:bg-blue-900/20"
                            >
                              <Image
                                src="/assets/images/geminiAI.png"
                                alt="Chấm lại AI"
                                width={14}
                                height={14}
                                className={cn("rounded-sm", isEvaluatingRow && "animate-pulse")}
                              />
                            </Button>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-center align-middle text-sm text-gray-600 dark:text-gray-400 whitespace-nowrap">
                        {formatSubmittedAt(progress.speakingTimestamp)}
                      </td>
                    </tr>
                  );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      <Modal
        open={!!listeningAudio}
        onClose={() => {
          setListeningAudio(null);
          setIsAutoPlayAll(false);
        }}
        title={
          listeningAudio ? (
            <div className="flex items-center gap-2 min-w-0">
              <div className="relative w-7 h-7 flex-shrink-0">
                {listeningAudio.avatarUrl ? (
                  <Image
                    src={listeningAudio.avatarUrl}
                    alt={listeningAudio.studentName}
                    width={28}
                    height={28}
                    sizes="28px"
                    className="w-full h-full rounded-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full rounded-full bg-primary/10 flex items-center justify-center">
                    <FiUser className="w-3.5 h-3.5 text-primary" />
                  </div>
                )}
                {isOnline(listeningAudio.studentId) && (
                  <div className="absolute -bottom-0.5 -right-0.5 w-2 h-2 bg-green-500 border-2 border-white dark:border-gray-800 rounded-full" />
                )}
              </div>
              <span className="truncate">{listeningAudio.studentName}</span>
            </div>
          ) : (
            ""
          )
        }
        maxWidth="md"
        className="md:max-w-3xl lg:max-w-4xl"
      >
        {listeningAudio && (
          <div className="space-y-2 sm:space-y-4">
            <AudioPlayerWithDuration
              src={listeningAudio.url}
              autoPlay
              initialDuration={listeningAudio.duration ?? 0}
              className="w-full"
              title={`Bài ${listeningAudio.lessonId}${
                isAutoPlayAll
                  ? currentListeningIndex >= 0
                    ? ` · auto ${currentListeningIndex + 1}/${playableSubmissions.length}`
                    : listeningNeighborNext
                      ? ` · auto (còn ${playableSubmissions.length} bài)`
                      : ""
                  : ""
              }`}
              onPrev={listeningNeighborPrev ? () => navigateListeningAudio(-1) : undefined}
              onNext={listeningNeighborNext ? () => navigateListeningAudio(1) : undefined}
              hasPrev={!!listeningNeighborPrev}
              hasNext={!!listeningNeighborNext}
              onEnded={handleAudioEndedInModal}
            />
            <div className="rounded-lg border border-slate-200/90 bg-slate-50/90 px-2 py-2 dark:border-slate-700 dark:bg-slate-900/50 sm:rounded-xl sm:px-5 sm:py-4">
              <div className="flex w-full min-w-0 justify-center">
                <SpeakingScoreControl
                  compact
                  studentId={listeningAudio.studentId}
                  studentName={listeningAudio.studentName}
                  bookId={selectedBook}
                  lessonId={parseInt(listeningAudio.lessonId, 10)}
                  aiSuggestedScore={extractTotalScore(listeningAudio.issueSpeaking)}
                  currentScore={
                    inlineScoreOverrides[`${listeningAudio.studentId}-${listeningAudio.lessonId}`] ?? listeningAudio.speakingScore
                  }
                  rewardParams={rewardParamsBase ? {
                    ...rewardParamsBase,
                    studentName: listeningAudio.studentName,
                  } : undefined}
                  onScoreUpdate={(newScore) =>
                    setInlineScoreOverrides((prev) => ({
                      ...prev,
                      [`${listeningAudio.studentId}-${listeningAudio.lessonId}`]: newScore,
                    }))
                  }
                  isReevaluatingAi={evaluatingIssueIds.has(
                    `${listeningAudio.studentId}-${listeningAudio.lessonId}`
                  )}
                  onReevaluateAi={async () => {
                    const issue = await handleEvaluateSingleIssue({
                      student: { id: listeningAudio.studentId, name: listeningAudio.studentName },
                      lessonDetails: { lesson: listeningAudio.lessonId },
                      speakingSubmissionUrl: listeningAudio.url,
                      speakingDuration: listeningAudio.duration,
                    });
                    if (issue) {
                      setListeningAudio((prev) =>
                        prev ? { ...prev, issueSpeaking: issue } : null
                      );
                    }
                  }}
                />
              </div>
            </div>
          </div>
        )}
      </Modal>


      {hoveredAiIssueContent && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center pointer-events-none px-4">
          <div className="w-full max-w-2xl max-h-[80vh] overflow-y-auto rounded-xl border border-blue-200 bg-white dark:bg-gray-800 dark:border-gray-700 shadow-2xl p-4">
            <h4 className="mb-2">
              <Image
                src="/assets/images/geminiAI.png"
                alt="Gemini"
                width={18}
                height={18}
                className="rounded-sm"
              />
            </h4>
            <p className="text-sm leading-6 text-gray-700 dark:text-gray-200 whitespace-pre-wrap">
              {hoveredAiIssueContent.split("Tổng điểm").map((part, index, arr) => (
                <span key={index}>
                  {part}
                  {index < arr.length - 1 && (
                    <span className="text-red-500 dark:text-red-400 font-semibold">
                      Tổng điểm
                    </span>
                  )}
                </span>
              ))}
            </p>
          </div>
        </div>
      )}
      {selectedStudentForDetail && (
        <StudentProgressDetailModal
          classId={classId}
          open={!!selectedStudentForDetail}
          onClose={() => setSelectedStudentForDetail(null)}
          studentName={selectedStudentForDetail.studentName}
          studentId={selectedStudentForDetail.studentId}
          avatarUrl={selectedStudentForDetail.avatarUrl}
          bookId={selectedBook}
          progressData={selectedStudentForDetail.progressData}
          mode="speaking"
        />
      )}
    </>
  );
}
