"use client";

import { Button } from "@/components/ui/Button";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import { SafeImage as Image } from "@/components/ui/SafeImage";
import { useBooks, useLessons } from "@/modules/flashcard/hooks";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  FiTrash2,
  FiCheckSquare,
  FiSquare,
  FiUsers,
  FiBarChart2,
  FiList,
  FiRefreshCw,
  FiCheckCircle,
  FiUser,
  FiChevronUp,
  FiChevronDown,
} from "react-icons/fi";
import { collection, doc, serverTimestamp, writeBatch } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import toast from "react-hot-toast";
import {
  useClassQuizResults,
  useDeleteQuizResults,
  useClassBookProgress,
} from "../hooks";
import { ClassQuizResult } from "../api/quiz";
import { StudentProgressChart, StudentProgressData } from "./StudentProgressChart";
import { StudentProgressDetailModal } from "./StudentProgressDetailModal";

import { useClassContext } from "../context/ClassContext";

// Format short: HH:mm dd/MM (dùng chung quy ước với OverallProgressTable)
function formatShortSubmittedAt(date: Date | null | undefined): string {
  if (!date) return "—";
  const dd = String(date.getDate()).padStart(2, "0");
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const hh = String(date.getHours()).padStart(2, "0");
  const min = String(date.getMinutes()).padStart(2, "0");
  return `${hh}:${min} ${dd}/${mm}`;
}

export function QuizResultManager() {
  const { classId, members, isOnline } = useClassContext();
  const [dateFilterMode, setDateFilterMode] = useState<"all" | "today" | "custom">("custom");
  const [customDate, setCustomDate] = useState<string>(() => {
    if (typeof window !== "undefined") {
      return new Date().toISOString().split("T")[0];
    }
    return "";
  });
  const [selectedResults, setSelectedResults] = useState<Set<string>>(new Set());
  const [selectedStudents, setSelectedStudents] = useState<Set<string>>(new Set());
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [viewMode, setViewMode] = useState<"chart" | "manage">("chart"); // Default to chart view
  const [isMarkingNeedComplete, setIsMarkingNeedComplete] = useState(false);
  const [pendingNeedPlusCount, setPendingNeedPlusCount] = useState(0);
  const [isNeedPlusRunning, setIsNeedPlusRunning] = useState(false);
  const needPlusTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  type ManageSortKey = "lesson" | "student" | "date";
  type ManageSortDir = "asc" | "desc";
  const [manageSortKey, setManageSortKey] = useState<ManageSortKey>("date");
  const [manageSortDir, setManageSortDir] = useState<ManageSortDir>("desc");
  const handleManageSort = (key: ManageSortKey) => {
    if (manageSortKey === key) {
      setManageSortDir((prev) => (prev === "asc" ? "desc" : "asc"));
      return;
    }
    setManageSortKey(key);
    setManageSortDir(key === "date" ? "desc" : "asc");
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

  // Load settings - dùng chung book key với Bảng Speaking để tối ưu cache
  const getStoredSettings = useCallback((): { bookId: string; lesson: number } | null => {
    if (typeof window === "undefined") return null;
    try {
      const sharedBook = localStorage.getItem(`classDetail_${classId}_book`);
      const stored = localStorage.getItem(`quizSettings_${classId}`);
      const parsed = stored ? JSON.parse(stored) : {};
      return {
        bookId: sharedBook || parsed.bookId || "",
        lesson: parsed.lesson || 0,
      };
    } catch (error) {
      console.error("Failed to load settings from localStorage:", error);
    }
    return null;
  }, [classId]);

  const [selectedBook, setSelectedBook] = useState<string>(() => {
    const settings = getStoredSettings();
    return settings?.bookId || "";
  });

  const [currentLesson, setCurrentLesson] = useState<number>(() => {
    const settings = getStoredSettings();
    return settings?.lesson || 0;
  });

  // Load settings when classId changes
  useEffect(() => {
    const settings = getStoredSettings();
    if (settings) {
      if (settings.bookId) {
        setSelectedBook(settings.bookId);
      }
      setCurrentLesson(settings.lesson || 0);
    } else {
      setSelectedBook("");
      setCurrentLesson(0);
    }
  }, [classId, getStoredSettings]);

  // Save settings - đồng bộ book key với Bảng Speaking
  useEffect(() => {
    if (typeof window !== "undefined") {
      try {
        if (selectedBook) {
          localStorage.setItem(`classDetail_${classId}_book`, selectedBook);
        } else {
          localStorage.removeItem(`classDetail_${classId}_book`);
        }
        const settings = {
          bookId: selectedBook,
          lesson: currentLesson,
          classId: classId,
        };
        localStorage.setItem(`quizSettings_${classId}`, JSON.stringify(settings));
      } catch (error) {
        console.error("Failed to save settings to localStorage:", error);
      }
    }
  }, [selectedBook, currentLesson, classId]);

  const [selectedStudentForDetail, setSelectedStudentForDetail] = useState<{
    studentId: string;
    studentName: string;
    avatarUrl?: string;
    progressData: StudentProgressData;
  } | null>(null);

  const { data: books } = useBooks();
  const students = useMemo(
    () => members?.filter((m) => m.role === "student") || [],
    [members]
  );
  const { data: lessons = [] } = useLessons(selectedBook);
  const { data: classBookProgress = new Map() } = useClassBookProgress(
    classId,
    selectedBook
  );

  // Calculate date filter
  const dateFilter = useMemo(() => {
    if (dateFilterMode === "all") {
      return null;
    } else if (dateFilterMode === "today") {
      const today = new Date();
      // Reset to local midnight to ensure consistent filtering
      today.setHours(0, 0, 0, 0);
      return today;
    } else if (dateFilterMode === "custom" && customDate) {
      // Parse date string and create date in local timezone
      const [year, month, day] = customDate.split("-").map(Number);
      const date = new Date(year, month - 1, day);
      date.setHours(0, 0, 0, 0);
      return date;
    }
    // Default to today
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return today;
  }, [dateFilterMode, customDate]);

  const queryClient = useQueryClient();
  const {
    data: quizResults = [],
    isLoading,
    error,
    refetch: refetchQuizResults,
  } = useClassQuizResults(classId, selectedBook, dateFilter);

  const handleRefreshSpeakingQuiz = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["classBookProgress", classId] }),
      queryClient.invalidateQueries({ queryKey: ["classProgress", classId] }),
      queryClient.invalidateQueries({ queryKey: ["classQuizResults", classId] }),
    ]);
    await queryClient.refetchQueries({ queryKey: ["classBookProgress", classId] });
    refetchQuizResults();
  };

  const handleMarkNeedCompleteQuiz = async () => {
    if (!selectedBook) return;

    setIsMarkingNeedComplete(true);
    try {
      const targetLesson = currentLesson > 0 ? currentLesson : 0;
      const targetLessons = lessons
        .filter((lessonId) => lessonId <= targetLesson)
        .sort((a, b) => a - b);

      const batch = writeBatch(db);
      const progressCol = collection(db, "userBookProgress");

      students.forEach((student) => {
        const progress = classBookProgress.get(student.id);
        const completedSet = new Set(progress?.completedLessons ?? []);
        const needQuizs = targetLessons.filter((lessonId) => !completedSet.has(lessonId));
        const progressRef = doc(progressCol, `${student.id}_${selectedBook}`);

        batch.set(
          progressRef,
          {
            userId: student.id,
            bookId: selectedBook,
            completedLessons: progress?.completedLessons ?? [],
            completedLessonsSpeaking: progress?.completedLessonsSpeaking ?? [],
            lessons: progress?.lessons ?? {},
            needQuizs,
            lastUpdated: serverTimestamp(),
          },
          { merge: true }
        );
      });

      await batch.commit();
      toast.success("Đã đánh dấu Need Complete cho tab Từ vựng.");
      await queryClient.invalidateQueries({ queryKey: ["classBookProgress", classId, selectedBook] });
    } catch (error) {
      console.error("Failed to mark need complete quiz lessons:", error);
      toast.error("Không thể đánh dấu Need Complete.");
    } finally {
      setIsMarkingNeedComplete(false);
    }
  };
  const handleRunNeedPlusQuiz = useCallback(async (count: number) => {
    if (!selectedBook || count <= 0 || lessons.length === 0 || students.length === 0) return;

    setIsNeedPlusRunning(true);
    try {
      const sortedLessons = [...lessons].sort((a, b) => a - b);

      const batch = writeBatch(db);
      const progressCol = collection(db, "userBookProgress");
      let affectedStudents = 0;

      students.forEach((student) => {
        const progress = classBookProgress.get(student.id);
        const completedSet = new Set<number>((progress?.completedLessons ?? []) as number[]);
        const pendingNeedSet = new Set<number>(
          ((progress?.needQuizs ?? []) as number[]).filter((lessonId) => !completedSet.has(lessonId))
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
            needQuizs: [...pendingNeedSet, ...nextLessons].sort((a, b) => a - b),
            lastUpdated: serverTimestamp(),
          },
          { merge: true }
        );
        affectedStudents += 1;
      });

      if (affectedStudents === 0) {
        toast("Không còn bài kế tiếp để giao cho các học sinh.");
        return;
      }

      await batch.commit();
      toast.success(`Đã giao ${count} bài kế tiếp cho ${affectedStudents} học sinh (Quiz).`);
      await queryClient.invalidateQueries({ queryKey: ["classBookProgress", classId, selectedBook] });
    } catch (error) {
      console.error("Failed to assign next quiz lessons:", error);
      toast.error("Không thể giao bài kế tiếp.");
    } finally {
      setIsNeedPlusRunning(false);
    }
  }, [classBookProgress, classId, lessons, queryClient, selectedBook, students]);

  const handleNeedPlusQuizClick = useCallback(() => {
    if (!selectedBook || lessons.length === 0 || isNeedPlusRunning) return;

    setPendingNeedPlusCount((prev) => {
      const next = prev + 1;
      if (needPlusTimerRef.current) {
        clearTimeout(needPlusTimerRef.current);
      }
      needPlusTimerRef.current = setTimeout(() => {
        void handleRunNeedPlusQuiz(next);
        setPendingNeedPlusCount(0);
        needPlusTimerRef.current = null;
      }, 3000);
      return next;
    });
  }, [handleRunNeedPlusQuiz, isNeedPlusRunning, lessons.length, selectedBook]);

  useEffect(() => {
    return () => {
      if (needPlusTimerRef.current) {
        clearTimeout(needPlusTimerRef.current);
        needPlusTimerRef.current = null;
      }
    };
  }, []);
  const { mutate: deleteSelected } = useDeleteQuizResults();

  // Group results by student (mỗi nhóm: bài tăng dần)
  const resultsByStudent = useMemo(() => {
    const grouped = new Map<string, ClassQuizResult[]>();
    quizResults.forEach((result) => {
      if (!grouped.has(result.userId)) {
        grouped.set(result.userId, []);
      }
      grouped.get(result.userId)!.push(result);
    });
    grouped.forEach((arr) => {
      arr.sort((a, b) => a.lessonId - b.lessonId);
    });
    return grouped;
  }, [quizResults]);

  // Get students with results (theo tên A→Z)
  const studentsWithResults = useMemo(() => {
    const studentIds = new Set(quizResults.map((r) => r.userId));
    return [...students]
      .filter((s) => studentIds.has(s.id))
      .sort((a, b) => a.name.localeCompare(b.name, "vi", { sensitivity: "base" }));
  }, [students, quizResults]);

  // Filter quizResults by selectedStudents; sort theo cột người dùng đang chọn
  // (mặc định: newest first). Tiebreaker thống nhất với bảng Speaking.
  const filteredQuizResults = useMemo(() => {
    const base =
      selectedStudents.size > 0
        ? quizResults.filter((result) => selectedStudents.has(result.userId))
        : quizResults;
    const dir = manageSortDir === "asc" ? 1 : -1;
    return [...base].sort((a, b) => {
      const nameCmp = (a.studentName || "").localeCompare(b.studentName || "", "vi", {
        sensitivity: "base",
      });
      const lessonCmp = a.lessonId - b.lessonId;
      const tA = a.lastAttempt?.getTime() ?? 0;
      const tB = b.lastAttempt?.getTime() ?? 0;

      if (manageSortKey === "lesson") {
        if (lessonCmp !== 0) return lessonCmp * dir;
        if (nameCmp !== 0) return nameCmp;
        return tB - tA;
      }
      if (manageSortKey === "student") {
        if (nameCmp !== 0) return nameCmp * dir;
        if (lessonCmp !== 0) return lessonCmp;
        return tB - tA;
      }
      if (tA !== tB) return (tA - tB) * dir;
      if (lessonCmp !== 0) return lessonCmp;
      return nameCmp;
    });
  }, [quizResults, selectedStudents, manageSortKey, manageSortDir]);

  // Sử dụng currentLesson do giáo viên chọn, nếu chưa chọn thì dùng max từ lessons
  const maxLesson = useMemo(() => {
    if (currentLesson > 0) {
      return currentLesson;
    }
    // Nếu chưa chọn, mặc định dùng max từ lessons
    return lessons.length > 0 ? Math.max(...lessons) : 0;
  }, [currentLesson, lessons]);

  // Generate allLessons array from 1 to maxLesson
  const allLessons = useMemo(() => {
    if (maxLesson === 0) return [];
    return Array.from({ length: maxLesson }, (_, i) => i + 1);
  }, [maxLesson]);

  // Calculate progress data for each student
  const studentProgressDataMap = useMemo(() => {
    const progressMap = new Map<string, StudentProgressData>();

    students.forEach((student) => {
      const bookProgress = classBookProgress.get(student.id);
      const notDoneLessons: number[] = []; // Đã học tới (từ 1 đến maxLesson) nhưng chưa làm
      const notReachedLessons: number[] = []; // Chưa học tới (sau maxLesson)
      const notPassedLessons: Array<{ lessonId: number; accuracy: number }> = [];
      const passedLessons: number[] = [];
      const recentLessons: number[] = [];
      let passed = 0;
      let recent = 0;

      const now = new Date();

      // Xử lý các bài từ 1 đến maxLesson (phạm vi current)
      // Tất cả các bài trong phạm vi này đều được coi là "đã học tới"
      allLessons.forEach((lessonId) => {
        const lessonData = bookProgress?.lessons?.[lessonId];

        if (bookProgress?.completedLessons?.includes(lessonId)) {
          // >= 90% = đạt
          if (lessonData?.lastAttempt) {
            const attemptDate = lessonData.lastAttempt.toDate();
            const diffTime = Math.abs(now.getTime() - attemptDate.getTime());
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

            if (diffDays <= 1) {
              recent++;
              recentLessons.push(lessonId);
            } else {
              passed++;
              passedLessons.push(lessonId);
            }
          } else {
            passed++;
            passedLessons.push(lessonId);
          }
        } else if (lessonData && 'lastAccuracy' in lessonData && typeof lessonData.lastAccuracy === 'number' && lessonData.lastAccuracy < 90) {
          // Có bài trong lessons, KHÔNG CÓ trong completedLessons VÀ field lastAccuracy tồn tại thực sự là số và < 90 = chưa đạt (cam)
          notPassedLessons.push({
            lessonId,
            accuracy: lessonData.lastAccuracy,
          });
        } else {
          // Còn lại (chưa có trong completedLessons VÀ không có lastAccuracy hoặc lastAccuracy >= 90 mà chưa được cập nhật completedLessons) = chưa làm (đỏ)
          notDoneLessons.push(lessonId);
        }
      });

      // Xử lý các bài sau maxLesson (nếu có) - chưa học tới
      // Tìm bài lớn nhất trong book
      const maxBookLesson = lessons.length > 0 ? Math.max(...lessons) : 0;
      if (maxBookLesson > maxLesson) {
        // Có bài sau maxLesson
        for (let lessonId = maxLesson + 1; lessonId <= maxBookLesson; lessonId++) {
          notReachedLessons.push(lessonId);
        }
      }

      progressMap.set(student.id, {
        studentId: student.id,
        studentName: student.name,
        notDone: notDoneLessons.length,
        notReached: notReachedLessons.length,
        notPassed: notPassedLessons.length,
        passed,
        recent,
        notDoneLessons,
        notReachedLessons,
        notPassedLessons,
        passedLessons,
        recentLessons,
        needCompleteLessons: notDoneLessons.filter((lessonId) =>
          (bookProgress?.needQuizs ?? []).includes(lessonId)
        ),
      });
    });

    return progressMap;
  }, [students, classBookProgress, allLessons, maxLesson, lessons]);

  // Sort students by sum of (notDone + notPassed) descending
  const sortedStudents = useMemo(() => {
    return [...students].sort((a, b) => {
      const progressA = studentProgressDataMap.get(a.id);
      const progressB = studentProgressDataMap.get(b.id);

      // If no progress data, treat as all lessons not done
      const sumA = progressA
        ? progressA.notDone + progressA.notPassed
        : (allLessons.length || 0);
      const sumB = progressB
        ? progressB.notDone + progressB.notPassed
        : (allLessons.length || 0);

      // Sort descending (highest sum first)
      return sumB - sumA;
    });
  }, [students, studentProgressDataMap, allLessons.length]);

  // Update handleSelectAll to use filteredQuizResults
  const handleSelectAll = useCallback(() => {
    if (selectedResults.size === filteredQuizResults.length && filteredQuizResults.length > 0) {
      setSelectedResults(new Set());
    } else {
      setSelectedResults(new Set(filteredQuizResults.map((r) => r.id)));
    }
  }, [selectedResults.size, filteredQuizResults]);


  const handleToggleResult = (resultId: string) => {
    const newSelected = new Set(selectedResults);
    if (newSelected.has(resultId)) {
      newSelected.delete(resultId);
    } else {
      newSelected.add(resultId);
    }
    setSelectedResults(newSelected);
  };

  const handleToggleStudent = (studentId: string) => {
    const newSelected = new Set(selectedStudents);
    if (newSelected.has(studentId)) {
      newSelected.delete(studentId);
    } else {
      newSelected.add(studentId);
    }
    setSelectedStudents(newSelected);
    // Clear selected results when changing student selection
    setSelectedResults(new Set());
  };


  const handleDeleteSelected = () => {
    if (selectedResults.size === 0) {
      return;
    }
    setShowDeleteConfirm(true);
  };

  const confirmDelete = () => {
    const idsToDelete = Array.from(selectedResults);
    deleteSelected(idsToDelete, {
      onSuccess: async () => {
        // Clear selection after successful deletion
        setSelectedResults(new Set());
        setShowDeleteConfirm(false);

        // Manually refetch queries to ensure UI updates immediately
        // Refetch classBookProgress first
        await queryClient.refetchQueries({
          queryKey: ["classBookProgress", classId, selectedBook],
        });

        // Then refetch classQuizResults
        await refetchQuizResults();
      },
      onError: () => {
        // Keep selection on error so user can retry
        setShowDeleteConfirm(false);
      },
    });
  };

  return (
    <div className="space-y-3 sm:space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4">
        {selectedBook && (
          <>
            {/* View Mode Toggle - Hiển thị ở giữa */}
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
                <span className="hidden sm:inline">Quản lý</span>
                <span className="sm:hidden">Quản lý</span>
              </Button>
            </div>
          </>
        )}

        {/* Book Selection */}
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <select
            value={selectedBook}
            onChange={(e) => {
              setSelectedBook(e.target.value);
              setSelectedResults(new Set());
              setSelectedStudents(new Set());
              // Không reset viewMode và currentLesson khi đổi sách, giữ nguyên giá trị
            }}
            className="flex-1 sm:flex-none sm:w-auto px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
          >
            <option value="">Chọn sách</option>
            {books?.map((book) => (
              <option key={book.id} value={book.id.toString()}>
                {book.name}
              </option>
            ))}
          </select>
          {viewMode === "chart" && (
            <Button
              variant={pendingNeedPlusCount > 0 ? "primary" : "outline"}
              size="sm"
              onClick={handleNeedPlusQuizClick}
              disabled={!selectedBook || lessons.length === 0 || isNeedPlusRunning}
              className="whitespace-nowrap px-2 shrink-0 h-10"
              title={pendingNeedPlusCount > 0 ? `Sẽ giao sau 3s: +${pendingNeedPlusCount} bài` : "+1 bài"}
            >
              +1 bài{pendingNeedPlusCount > 0 ? ` (${pendingNeedPlusCount})` : ""}
            </Button>
          )}
          <button
            onClick={handleRefreshSpeakingQuiz}
            disabled={isLoading || !selectedBook}
            className="h-10 w-10 flex items-center justify-center rounded-lg border border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
            title="Đồng bộ dữ liệu Speaking & Quiz"
          >
            <FiRefreshCw className={`w-5 h-5 text-primary ${isLoading ? "animate-spin" : ""}`} />
          </button>
        </div>

        {/* Date Filter - Ngay sau phần chọn sách, chỉ hiển thị khi ở chế độ Quản lý */}
        {selectedBook && viewMode === "manage" && (
          <div className="flex flex-col sm:flex-row sm:items-center gap-2 w-full sm:w-auto">
            <div className="grid grid-cols-2 gap-2 w-full sm:flex sm:items-center sm:gap-4 sm:w-auto">
              <input
                type="date"
                value={customDate}
                onChange={(e) => {
                  setCustomDate(e.target.value);
                  setSelectedResults(new Set());
                  setSelectedStudents(new Set());
                }}
                className="w-full h-10 px-3 py-1.5 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
              />
              <button
                type="button"
                aria-pressed={dateFilterMode === "all"}
                onClick={() => {
                  if (dateFilterMode !== "all") {
                    setDateFilterMode("all");
                  } else {
                    setDateFilterMode("custom");
                    if (!customDate) {
                      const today = new Date().toISOString().split("T")[0];
                      setCustomDate(today);
                    }
                  }
                  setSelectedResults(new Set());
                  setSelectedStudents(new Set());
                }}
                className={`h-10 p-3 w-full rounded-md border flex items-center justify-center cursor-pointer text-sm transition-colors ${
                  dateFilterMode === "all"
                    ? "border-blue-300 bg-blue-50 text-blue-400"
                    : "border-gray-300 hover:bg-gray-50"
                }`}
              >
                All time
              </button>
            </div>
          </div>
        )}

        {/* Current Lesson - Cùng hàng với Chọn sách, chỉ hiển thị khi ở chế độ Biểu đồ */}
        {selectedBook && viewMode === "chart" && (
          <div className="flex flex-col sm:flex-row sm:items-center gap-2 w-full sm:w-auto">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  if (currentLesson > 0) {
                    setCurrentLesson(currentLesson - 1);
                  }
                }}
                disabled={currentLesson === 0}
                className="w-8 h-8 flex items-center justify-center rounded border border-gray-300 bg-white hover:bg-gray-50 hover:border-blue-400 disabled:opacity-40 disabled:cursor-not-allowed text-gray-700 font-bold text-sm transition-colors"
                title="Giảm 1"
              >
                −
              </button>

              <input
                type="number"
                min="0"
                max={lessons.length > 0 ? Math.max(...lessons) : 0}
                value={currentLesson || ""}
                onChange={(e) => {
                  const value = e.target.value;
                  if (value === "") {
                    setCurrentLesson(0);
                  } else {
                    const num = parseInt(value, 10);
                    const maxLesson = lessons.length > 0 ? Math.max(...lessons) : 0;
                    if (!isNaN(num) && num >= 0 && num <= maxLesson) {
                      setCurrentLesson(num);
                    }
                  }
                }}
                onBlur={(e) => {
                  if (e.target.value === "" || parseInt(e.target.value, 10) < 0) {
                    setCurrentLesson(0);
                  }
                }}
                placeholder="0"
                className="w-20 px-2 py-1.5 text-center text-sm font-medium text-blue-600 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white"
              />

              <button
                type="button"
                onClick={() => {
                  const maxLesson = lessons.length > 0 ? Math.max(...lessons) : 0;
                  if (currentLesson < maxLesson) {
                    setCurrentLesson(currentLesson + 1);
                  }
                }}
                disabled={currentLesson >= (lessons.length > 0 ? Math.max(...lessons) : 0)}
                className="w-8 h-8 flex items-center justify-center rounded border border-gray-300 bg-white hover:bg-gray-50 hover:border-blue-400 disabled:opacity-40 disabled:cursor-not-allowed text-gray-700 font-bold text-sm transition-colors"
                title="Tăng 1"
              >
                +
              </button>

              <input
                type="range"
                min="0"
                max={lessons.length > 0 ? Math.max(...lessons) : 0}
                value={currentLesson}
                onChange={(e) => {
                  const lesson = parseInt(e.target.value, 10);
                  setCurrentLesson(lesson);
                }}
                className="flex-1 h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
                style={{
                  background: `linear-gradient(to right, #3b82f6 0%, #3b82f6 ${(currentLesson / (lessons.length > 0 ? Math.max(...lessons) : 1)) * 100}%, #e5e7eb ${(currentLesson / (lessons.length > 0 ? Math.max(...lessons) : 1)) * 100}%, #e5e7eb 100%)`
                }}
              />

              <span className="text-xs text-gray-500 whitespace-nowrap">
                / {lessons.length > 0 ? Math.max(...lessons) : 0}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={handleMarkNeedCompleteQuiz}
                disabled={isMarkingNeedComplete || lessons.length === 0}
                className="whitespace-nowrap px-2"
                title="Đánh dấu Need Complete"
                aria-label="Đánh dấu Need Complete"
              >
                <FiCheckCircle className={`w-4 h-4 text-blue-300 ${isMarkingNeedComplete ? "animate-pulse" : ""}`} />
              </Button>
            </div>
          </div>
        )}

      </div>


      {!selectedBook ? (
        <p className="text-muted text-center py-8">
          Vui lòng chọn sách để xem danh sách bài quiz
        </p>
      ) : isLoading ? (
        <p className="text-center py-8">Đang tải dữ liệu...</p>
      ) : error ? (
        <p className="text-red-500 text-center py-8">
          Có lỗi xảy ra khi tải dữ liệu
        </p>
      ) : viewMode === "chart" ? (
        // Chart View
        <div className="space-y-6">
          {/* Circular Charts */}
          <>
            {students.length === 0 ? (
              <p className="text-muted text-center py-8">
                Không có học sinh nào trong lớp
              </p>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
                {sortedStudents.map((student) => {
                  const progressData = studentProgressDataMap.get(student.id);
                  if (!progressData) {
                    // Show empty chart if no progress data
                    // Calculate notReachedLessons for empty progress
                    const maxBookLesson = lessons.length > 0 ? Math.max(...lessons) : 0;
                    const notReachedLessons: number[] = [];
                    if (maxBookLesson > maxLesson) {
                      for (let lessonId = maxLesson + 1; lessonId <= maxBookLesson; lessonId++) {
                        notReachedLessons.push(lessonId);
                      }
                    }

                    return (
                      <StudentProgressChart
                        key={student.id}
                        studentId={student.id}
                        studentName={student.name}
                        avatarUrl={student.avatarUrl}
                        bookProgress={undefined}
                        allLessons={allLessons}
                        maxLesson={maxLesson}
                        notReachedLessons={notReachedLessons}
                        isOnline={isOnline(student.id)}
                        onClick={() => {
                          const emptyProgressData: StudentProgressData = {
                            studentId: student.id,
                            studentName: student.name,
                            notDone: allLessons.length,
                            notReached: notReachedLessons.length,
                            notPassed: 0,
                            passed: 0,
                            recent: 0,
                            notDoneLessons: allLessons,
                            notReachedLessons,
                            notPassedLessons: [],
                            passedLessons: [],
                            recentLessons: [],
                            needCompleteLessons: [],
                          };
                          setSelectedStudentForDetail({
                            studentId: student.id,
                            studentName: student.name,
                            avatarUrl: student.avatarUrl,
                            progressData: emptyProgressData,
                          });
                        }}
                      />
                    );
                  }
                  return (
                    <StudentProgressChart
                      key={student.id}
                      studentId={student.id}
                      studentName={student.name}
                      avatarUrl={student.avatarUrl}
                      bookProgress={classBookProgress.get(student.id)}
                      allLessons={allLessons}
                      maxLesson={maxLesson}
                      notReachedLessons={progressData.notReachedLessons}
                      isOnline={isOnline(student.id)}
                      onClick={() => {
                        setSelectedStudentForDetail({
                          studentId: student.id,
                          studentName: student.name,
                          avatarUrl: student.avatarUrl,
                          progressData,
                        });
                      }}
                    />
                  );
                })}
              </div>
            )}

            {/* Legend - Chú thích dưới phần biểu đồ */}
            {students.length > 0 && (
              <div className="mt-6 flex flex-wrap items-center justify-center gap-4 text-xs">
                <div className="flex items-center gap-2">
                    <div className="w-4 h-4 rounded-full bg-blue-200"></div>
                    <span>Cần làm</span>
                  </div>
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 rounded-full bg-orange-600"></div>
                  <span>Chưa đạt</span>
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
            )}
          </>

        </div>
      ) : quizResults.length === 0 ? (
        <p className="text-muted text-center py-8">
          Không có bài quiz nào đã nộp trong sách này
        </p>
      ) : (
        <>
          {/* Student Selection Section */}
          <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-3 sm:p-4 border border-gray-200 dark:border-gray-600">
            <div className="flex items-center gap-2 mb-3">
              <h3 className="text-sm font-semibold">Lọc :</h3>
            </div>
            <div className="flex flex-wrap gap-2">
              {studentsWithResults.map((student) => {
                return (
                  <button
                    key={student.id}
                    onClick={() => handleToggleStudent(student.id)}
                    className={`px-2.5 sm:px-3 py-1.5 rounded-md text-xs sm:text-sm border transition-all flex items-center gap-1.5 ${selectedStudents.has(student.id)
                      ? "bg-blue-50 dark:bg-gray-800 border-blue-300"
                      : "bg-white dark:bg-gray-800 border-gray-300 hover:border-blue-400"
                      }`}
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

          {/* Action Buttons */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4 pb-2 border-b">
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleSelectAll}
                disabled={filteredQuizResults.length === 0}
                className="w-full sm:w-auto justify-center"
              >
                {selectedResults.size === filteredQuizResults.length && filteredQuizResults.length > 0 ? (
                  <FiCheckSquare className="w-4 h-4 mr-2" />
                ) : (
                  <FiSquare className="w-4 h-4 mr-2" />
                )}
                <span className="hidden sm:inline">All </span>
                <span className="sm:hidden">All </span>
                ({selectedResults.size}/{filteredQuizResults.length})
              </Button>
            </div>
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleDeleteSelected}
                disabled={selectedResults.size === 0}
                className="text-red-600 hover:text-red-700 w-full sm:w-auto justify-center"
              >
                <FiTrash2 className="w-4 h-4 mr-2" />
                <span className="hidden sm:inline">Xóa bài đã chọn </span>
                <span className="sm:hidden">Xóa đã chọn </span>
                ({selectedResults.size})
              </Button>
            </div>
          </div>

          {/* Results Table */}
          <div className="overflow-x-auto">
            <div className="inline-block min-w-full align-middle">
              <div className="overflow-hidden">
                <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                  <thead className="bg-gray-50 dark:bg-gray-700">
                    <tr>
                      <th className="px-2 sm:px-4 py-2 sm:py-3 text-left text-xs font-medium text-gray-500 uppercase w-10 sm:w-12">
                        <input
                          type="checkbox"
                          checked={
                            selectedResults.size === filteredQuizResults.length &&
                            filteredQuizResults.length > 0
                          }
                          onChange={handleSelectAll}
                          className="rounded border-gray-300"
                        />
                      </th>
                      <th
                        onClick={() => handleManageSort("student")}
                        className={`px-2 sm:px-4 py-2 sm:py-3 text-left text-xs font-medium ${manageSortHeaderColor("student")} uppercase min-w-[100px] cursor-pointer select-none hover:bg-gray-100 dark:hover:bg-gray-600`}
                      >
                        <span className="inline-flex items-center gap-1">
                          Học sinh
                          {renderManageSortArrow("student")}
                        </span>
                      </th>
                      <th
                        onClick={() => handleManageSort("lesson")}
                        className={`px-2 sm:px-4 py-2 sm:py-3 text-left text-xs font-medium ${manageSortHeaderColor("lesson")} uppercase min-w-[80px] cursor-pointer select-none hover:bg-gray-100 dark:hover:bg-gray-600`}
                      >
                        <span className="inline-flex items-center gap-1">
                          Bài
                          {renderManageSortArrow("lesson")}
                        </span>
                      </th>
                      <th className="px-2 sm:px-4 py-2 sm:py-3 text-center text-xs font-medium text-gray-500 uppercase min-w-[90px]">
                        Phần trăm
                      </th>
                      <th
                        onClick={() => handleManageSort("date")}
                        className={`px-2 sm:px-4 py-2 sm:py-3 text-left text-xs font-medium ${manageSortHeaderColor("date")} uppercase min-w-[90px] cursor-pointer select-none hover:bg-gray-100 dark:hover:bg-gray-600`}
                      >
                        <span className="inline-flex items-center gap-1">
                          Ngày
                          {renderManageSortArrow("date")}
                        </span>
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                    {filteredQuizResults.map((result) => (
                      <tr
                        key={result.id}
                        className={`hover:bg-gray-50 dark:hover:bg-gray-700 ${selectedResults.has(result.id) ? "bg-blue-50 dark:bg-blue-900/20" : ""
                          }`}
                      >
                        <td className="px-2 sm:px-4 py-2 sm:py-3 whitespace-nowrap">
                          <input
                            type="checkbox"
                            checked={selectedResults.has(result.id)}
                            onChange={() => handleToggleResult(result.id)}
                            className="rounded border-gray-300"
                          />
                        </td>
                        <td className="px-2 sm:px-4 py-2 sm:py-3 text-xs sm:text-sm font-medium whitespace-nowrap">
                          {result.studentName}
                        </td>
                        <td className="px-2 sm:px-4 py-2 sm:py-3 text-xs sm:text-sm whitespace-nowrap">
                          {result.lessonId}
                        </td>
                        <td
                          className={`px-2 sm:px-4 py-2 sm:py-3 text-center text-xs sm:text-sm font-medium whitespace-nowrap ${result.accuracy >= 90 ? "text-emerald-600 dark:text-emerald-400" : "text-orange-700 dark:text-orange-300"}`}
                        >
                          {result.accuracy}%
                        </td>
                        <td className="px-2 sm:px-4 py-2 sm:py-3 text-xs sm:text-sm whitespace-nowrap text-gray-600 dark:text-gray-400">
                          {formatShortSubmittedAt(result.lastAttempt)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Delete Confirmation Modal */}
      <ConfirmDialog
        isOpen={showDeleteConfirm}
        onClose={() => setShowDeleteConfirm(false)}
        onConfirm={confirmDelete}
        title="Xác nhận xóa bài quiz"
        message={`Bạn có chắc chắn muốn xóa ${selectedResults.size} bài quiz đã chọn không? Hành động này không thể hoàn tác.`}
        confirmText="Xóa"
        cancelText="Hủy"
        confirmVariant="destructive"
      />

      {/* Student Progress Detail Modal */}
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
        />
      )}
    </div>
  );
}

