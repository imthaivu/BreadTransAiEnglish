"use client";

import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { FiCheckCircle, FiLayers, FiUser, FiX } from "react-icons/fi";
import toast from "react-hot-toast";
import { useState, useEffect, useMemo } from "react";
import { useMarkLessonsAsDone } from "../hooks";
import { SafeImage as Image } from "@/components/ui/SafeImage";
import { ProfileAvatarLink } from "@/components/ui/ProfileAvatarLink";
import { Timestamp, doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { useQueryClient } from "@tanstack/react-query";
import { extractSpeakingScoreFromIssue } from "@/modules/speaking-upload/extractSpeakingScoreFromIssue";

function parseRawSpeakingScore(raw: unknown): number {
  if (raw == null) return Number.NaN;
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  if (typeof raw === "string" && raw.trim() !== "") {
    const n = Number(raw.replace(",", "."));
    return Number.isFinite(n) ? n : Number.NaN;
  }
  return Number.NaN;
}

function effectiveSpeakingScoreFromLesson(
  lesson: { speakingScore?: unknown; issueSpeaking?: string | null } | undefined
): number {
  if (!lesson) return Number.NaN;
  let s = parseRawSpeakingScore(lesson.speakingScore);
  if (!Number.isFinite(s)) {
    s = extractSpeakingScoreFromIssue(lesson.issueSpeaking) ?? Number.NaN;
  }
  return s;
}

function buildSpeakingCompletedTiersFromDoc(data: {
  completedLessonsSpeaking?: number[];
  lessons?: Record<string | number, { speakingScore?: unknown; issueSpeaking?: string | null }>;
}) {
  const doneLessons = (data?.completedLessonsSpeaking ?? []) as number[];
  const lessons = (data?.lessons ?? {}) as Record<
    string,
    { speakingScore?: unknown; issueSpeaking?: string | null }
  >;
  const fail = new Set<number>();
  const noScore = new Set<number>();
  for (const lid of doneLessons) {
    const ld = lessons[lid] ?? lessons[String(lid)];
    const s = effectiveSpeakingScoreFromLesson(ld);
    if (!Number.isFinite(s)) noScore.add(lid);
    else if (s < 7) fail.add(lid);
  }
  return { fail, noScore };
}

export interface StudentProgressDetailData {
  studentId: string;
  studentName: string;
  notDoneLessons: number[];
  notPassedLessons: Array<{ lessonId: number; accuracy: number }>;
  needCompleteLessons: number[];
  notEvaluatedLessons?: number[];
  listenedLessons?: number[];
}

interface StudentProgressDetailModalProps {
  classId: string;
  open: boolean;
  onClose: () => void;
  studentName: string;
  studentId: string;
  avatarUrl?: string;
  bookId: string;
  progressData: StudentProgressDetailData;
  mode?: "quiz" | "speaking";
}

export function StudentProgressDetailModal({
  classId,
  open,
  onClose,
  studentName,
  studentId,
  avatarUrl,
  bookId,
  progressData,
  mode = "quiz",
}: StudentProgressDetailModalProps) {
  const queryClient = useQueryClient();
  const { mutate: markLessonsAsDone, isPending: isMarkingLessons } = useMarkLessonsAsDone();
  
  const [selectedLessonIds, setSelectedLessonIds] = useState<Set<number>>(new Set());
  const [progress, setProgress] = useState<{ processed: number; total: number } | null>(null);
  const [isSavingNeedComplete, setIsSavingNeedComplete] = useState(false);
  const [needCompleteLessons, setNeedCompleteLessons] = useState<Set<number>>(new Set());
  const [completedLessons, setCompletedLessons] = useState<Set<number>>(new Set());
  /** Speaking: tô màu theo dữ liệu Firestore (không phụ thuộc maxLesson ở bảng) */
  const [speakingCompletedTiers, setSpeakingCompletedTiers] = useState<{
    fail: Set<number>;
    noScore: Set<number>;
  } | null>(null);

  // Reset selection and progress when modal closes
  useEffect(() => {
    if (!open) {
      setSelectedLessonIds(new Set());
      setProgress(null);
      setNeedCompleteLessons(new Set());
      setCompletedLessons(new Set());
      setSpeakingCompletedTiers(null);
    }
  }, [open]);

  useEffect(() => {
    const loadProgressFlags = async () => {
      if (!open || !studentId || !bookId) return;
      try {
        const progressRef = doc(db, "userBookProgress", `${studentId}_${bookId}`);
        const snap = await getDoc(progressRef);
        if (!snap.exists()) {
          setNeedCompleteLessons(new Set());
          setCompletedLessons(new Set());
          setSpeakingCompletedTiers(null);
          return;
        }
        const data = snap.data();
        const needLessons = mode === "speaking"
          ? ((data?.needSpeakings ?? []) as number[])
          : ((data?.needQuizs ?? []) as number[]);
        const doneLessons = mode === "speaking"
          ? ((data?.completedLessonsSpeaking ?? []) as number[])
          : ((data?.completedLessons ?? []) as number[]);
        setNeedCompleteLessons(new Set(needLessons));
        setCompletedLessons(new Set(doneLessons));

        if (mode === "speaking") {
          setSpeakingCompletedTiers(
            buildSpeakingCompletedTiersFromDoc({
              completedLessonsSpeaking: data.completedLessonsSpeaking as number[] | undefined,
              lessons: data.lessons as Record<
                string,
                { speakingScore?: unknown; issueSpeaking?: string | null }
              > | undefined,
            })
          );
        } else {
          setSpeakingCompletedTiers(null);
        }
      } catch (error) {
        console.error("Failed to load need complete lessons:", error);
        setNeedCompleteLessons(new Set());
        setCompletedLessons(new Set());
        setSpeakingCompletedTiers(null);
      }
    };

    loadProgressFlags();
  }, [open, studentId, bookId, mode]);

  const allLessonIds = useMemo(
    () =>
      Array.from(
        new Set([
          ...progressData.notDoneLessons,
          ...progressData.notPassedLessons.map(({ lessonId }) => lessonId),
          ...(progressData.notEvaluatedLessons ?? []),
          ...(progressData.listenedLessons ?? []),
          ...Array.from(needCompleteLessons),
          ...Array.from(completedLessons),
        ])
      ).sort((a, b) => a - b),
    [progressData, needCompleteLessons, completedLessons]
  );

  // Bỏ chọn các bài không còn trong danh sách (sau cập nhật tiến độ)
  useEffect(() => {
    const valid = new Set(allLessonIds);
    setSelectedLessonIds((prev) => {
      const next = new Set<number>();
      prev.forEach((id) => {
        if (valid.has(id)) next.add(id);
      });
      if (next.size === prev.size) {
        for (const id of prev) {
          if (!next.has(id)) return next;
        }
        return prev;
      }
      return next;
    });
  }, [allLessonIds]);

  const handleToggleLesson = (lessonId: number) => {
    if (!allLessonIds.includes(lessonId)) return;
    setSelectedLessonIds((prev) => {
      const next = new Set(prev);
      if (next.has(lessonId)) next.delete(lessonId);
      else next.add(lessonId);
      return next;
    });
  };

  const handleSelectAllInList = () => {
    if (allLessonIds.length === 0) return;
    const allSelected = allLessonIds.every((id) => selectedLessonIds.has(id));
    if (allSelected) {
      setSelectedLessonIds(new Set());
    } else {
      setSelectedLessonIds(new Set(allLessonIds));
    }
  };

  const handleMarkSelectedAsDone = () => {
    const allSelectedLessons = Array.from(selectedLessonIds).sort((a, b) => a - b);

    if (allSelectedLessons.length === 0) {
      toast.error("Vui lòng chọn ít nhất một bài!");
      return;
    }

    // Reset progress
    setProgress({ processed: 0, total: allSelectedLessons.length });

    if (mode === "speaking") {
      const markDoneSpeaking = async () => {
        try {
          const progressRef = doc(db, "userBookProgress", `${studentId}_${bookId}`);
          const snap = await getDoc(progressRef);
          const data = snap.exists() ? snap.data() : {};

          const existingLessons = (data?.lessons ?? {}) as Record<number, Record<string, unknown>>;
          const existingCompletedSpeaking = (data?.completedLessonsSpeaking ?? []) as number[];
          const existingNeedSpeakings = (data?.needSpeakings ?? []) as number[];
          const completedSet = new Set<number>(existingCompletedSpeaking);
          const doneAt = Timestamp.fromDate(new Date());

          allSelectedLessons.forEach((lessonId) => {
            completedSet.add(lessonId);
            existingLessons[lessonId] = {
              ...(existingLessons[lessonId] ?? {}),
              lastSubmitted: doneAt,
              fileUrl: "",
              duration: 0,
              listenCount: 3,
              speakingScore: "9",
              originalFilename: "",
            };
          });

          const doneSet = new Set(allSelectedLessons);
          const remainingNeedSpeakings = existingNeedSpeakings.filter((lessonId) => !doneSet.has(lessonId));

          await setDoc(
            progressRef,
            {
              userId: studentId,
              bookId,
              lessons: existingLessons,
              completedLessons: (data?.completedLessons ?? []) as number[],
              completedLessonsSpeaking: Array.from(completedSet).sort((a, b) => a - b),
              needSpeakings: remainingNeedSpeakings,
              lastUpdated: serverTimestamp(),
            },
            { merge: true }
          );
          await queryClient.invalidateQueries({ queryKey: ["classBookProgress", classId, bookId] });

          setNeedCompleteLessons(new Set(remainingNeedSpeakings));
          setCompletedLessons(new Set(Array.from(completedSet)));
          const afterSnap = await getDoc(progressRef);
          if (afterSnap.exists()) {
            const d = afterSnap.data();
            setSpeakingCompletedTiers(
              buildSpeakingCompletedTiersFromDoc({
                completedLessonsSpeaking: d.completedLessonsSpeaking as number[] | undefined,
                lessons: d.lessons as Record<
                  string,
                  { speakingScore?: unknown; issueSpeaking?: string | null }
                > | undefined,
              })
            );
          }
          setSelectedLessonIds(new Set());
          setProgress(null);
        } catch (error) {
          console.error("Failed to mark speaking lessons as done:", error);
          toast.error("Không thể cập nhật Done cho Speaking.");
          setProgress(null);
        }
      };

      void markDoneSpeaking();
      return;
    }

    markLessonsAsDone(
      {
        userId: studentId,
        bookId,
        lessonIds: allSelectedLessons,
        onProgress: (processed, total) => {
          setProgress({ processed, total });
        },
      },
      {
        onSuccess: () => {
          setCompletedLessons((prev) => {
            const next = new Set(prev);
            allSelectedLessons.forEach((lessonId) => next.add(lessonId));
            return next;
          });
          setSelectedLessonIds(new Set());
          setProgress(null);
        },
        onError: () => {
          setProgress(null);
        },
      }
    );
  };

  const handleMarkNeedComplete = async () => {
    const selectedLessons = Array.from(selectedLessonIds).sort((a, b) => a - b);

    if (selectedLessons.length === 0) {
      toast.error("Vui lòng chọn ít nhất một bài!");
      return;
    }

    if (!studentId || !bookId) {
      toast.error("Thiếu thông tin học sinh hoặc sách.");
      return;
    }

    setIsSavingNeedComplete(true);
    try {
      const progressRef = doc(db, "userBookProgress", `${studentId}_${bookId}`);
      const snap = await getDoc(progressRef);
      const data = snap.exists() ? snap.data() : undefined;
      const existingNeedLessons = (
        mode === "speaking" ? (data?.needSpeakings ?? []) : (data?.needQuizs ?? [])
      ) as number[];
      const needField = mode === "speaking" ? "needSpeakings" : "needQuizs";
      const mergedNeedLessons = Array.from(new Set([...existingNeedLessons, ...selectedLessons])).sort((a, b) => a - b);

      await setDoc(
        progressRef,
        {
          userId: studentId,
          bookId,
          completedLessons: (data?.completedLessons ?? []) as number[],
          completedLessonsSpeaking: (data?.completedLessonsSpeaking ?? []) as number[],
          lessons: (data?.lessons ?? {}) as Record<string, unknown>,
          [needField]: mergedNeedLessons,
          lastUpdated: serverTimestamp(),
        },
        { merge: true }
      );
      await queryClient.invalidateQueries({ queryKey: ["classBookProgress", classId, bookId] });

      setNeedCompleteLessons(new Set(mergedNeedLessons));
      setSelectedLessonIds(new Set());
      toast.success(`Đã đánh dấu Need Complete ${selectedLessons.length} bài.`);
    } catch (error) {
      console.error("Failed to save need complete lessons:", error);
      toast.error("Không thể lưu Need Complete.");
    } finally {
      setIsSavingNeedComplete(false);
    }
  };

  const handleUnmarkNeedComplete = async () => {
    const selectedLessons = Array.from(selectedLessonIds);

    if (selectedLessons.length === 0) {
      toast.error("Vui lòng chọn ít nhất một bài!");
      return;
    }

    if (!studentId || !bookId) {
      toast.error("Thiếu thông tin học sinh hoặc sách.");
      return;
    }

    setIsSavingNeedComplete(true);
    try {
      const progressRef = doc(db, "userBookProgress", `${studentId}_${bookId}`);
      const snap = await getDoc(progressRef);
      const data = snap.exists() ? snap.data() : undefined;
      const existingNeedLessons = (
        mode === "speaking" ? (data?.needSpeakings ?? []) : (data?.needQuizs ?? [])
      ) as number[];
      const removeSet = new Set(selectedLessons);
      const remainingNeedLessons = existingNeedLessons.filter((lessonId) => !removeSet.has(lessonId));
      const needField = mode === "speaking" ? "needSpeakings" : "needQuizs";

      await setDoc(
        progressRef,
        {
          userId: studentId,
          bookId,
          completedLessons: (data?.completedLessons ?? []) as number[],
          completedLessonsSpeaking: (data?.completedLessonsSpeaking ?? []) as number[],
          lessons: (data?.lessons ?? {}) as Record<string, unknown>,
          [needField]: remainingNeedLessons,
          lastUpdated: serverTimestamp(),
        },
        { merge: true }
      );
      await queryClient.invalidateQueries({ queryKey: ["classBookProgress", classId, bookId] });

      setNeedCompleteLessons(new Set(remainingNeedLessons));
      // Clear current selection so chips return to their base color state.
      setSelectedLessonIds(new Set());
      toast.success(`Đã bỏ Need Complete ${selectedLessons.length} bài.`);
    } catch (error) {
      console.error("Failed to unmark need complete lessons:", error);
      toast.error("Không thể bỏ Need Complete.");
    } finally {
      setIsSavingNeedComplete(false);
    }
  };

  const notPassedAccuracyMap = new Map<number, number>(
    progressData.notPassedLessons.map(({ lessonId, accuracy }) => [lessonId, accuracy])
  );
  const notDoneSet = new Set(progressData.notDoneLessons);
  const notPassedSet = new Set(progressData.notPassedLessons.map(({ lessonId }) => lessonId));
  const notEvaluatedSet = new Set(progressData.notEvaluatedLessons ?? []);
  const listenedSet = new Set(progressData.listenedLessons ?? []);
  const totalSelectedLessons = selectedLessonIds.size;

  return (
    <>
      <Modal
        open={open}
        onClose={onClose}
        title={
          <div className="flex items-center gap-3">
            <ProfileAvatarLink
              userId={studentId}
              className="w-10 h-10 rounded-full overflow-hidden flex-shrink-0 flex items-center justify-center bg-primary/10"
              ariaLabel={`Hồ sơ ${studentName}`}
            >
              {avatarUrl ? (
                <Image src={avatarUrl} alt={studentName} width={40} height={40} sizes="40px" className="w-full h-full object-cover" />
              ) : (
                <FiUser className="w-5 h-5 text-primary" />
              )}
            </ProfileAvatarLink>
            <span>Tiến độ - {studentName}</span>
          </div>
        }
      >
        <div className="space-y-4">
          {/* Progress Indicator */}
          {isMarkingLessons && progress && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-blue-800">
                  Đang đánh dấu bài học...
                </span>
                <span className="text-sm text-blue-600">
                  {progress.processed}/{progress.total}
                </span>
              </div>
              <div className="w-full bg-blue-200 rounded-full h-2">
                <div
                  className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                  style={{
                    width: `${(progress.processed / progress.total) * 100}%`,
                  }}
                />
              </div>
            </div>
          )}

        {/* Lesson List */}
        {allLessonIds.length > 0 && (
          <div>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-semibold">Danh sách bài ({allLessonIds.length})</h3>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleSelectAllInList}
                  disabled={isMarkingLessons || isSavingNeedComplete || allLessonIds.length === 0}
                  className="h-8 px-2.5 min-w-0 text-xs sm:text-sm font-medium"
                  title={
                    allLessonIds.length > 0 && allLessonIds.every((id) => selectedLessonIds.has(id))
                      ? "Bỏ chọn tất cả"
                      : "Chọn tất cả bài"
                  }
                  aria-label="Chọn nhanh tất cả bài trong danh sách"
                >
                  <FiLayers className="w-4 h-4 sm:mr-1" />
                  <span className="hidden sm:inline">
                    {allLessonIds.length > 0 && allLessonIds.every((id) => selectedLessonIds.has(id))
                      ? "Bỏ chọn"
                      : "Tất cả"}
                  </span>
                </Button>
                <Button
                  onClick={handleMarkSelectedAsDone}
                  disabled={isMarkingLessons || isSavingNeedComplete || totalSelectedLessons === 0}
                  className="h-8 w-8 p-0 bg-white inline-flex items-center justify-center text-green-500 border border-green-200 hover:bg-green-50"
                  title={`Đánh dấu Done${totalSelectedLessons > 0 ? ` (${totalSelectedLessons})` : ""}`}
                  aria-label={`Đánh dấu Done${totalSelectedLessons > 0 ? ` (${totalSelectedLessons})` : ""}`}
                >
                  <FiCheckCircle className={`w-5 h-5 ${isMarkingLessons ? "animate-pulse" : ""}`} />
                </Button>
                <Button
                  onClick={handleMarkNeedComplete}
                  disabled={isMarkingLessons || isSavingNeedComplete || totalSelectedLessons === 0}
                  className="h-8 w-8 p-0 bg-white inline-flex items-center justify-center text-blue-300 border border-blue-200 hover:bg-blue-100"
                  title={`Đánh dấu Need Complete${totalSelectedLessons > 0 ? ` (${totalSelectedLessons})` : ""}`}
                  aria-label={`Đánh dấu Need Complete${totalSelectedLessons > 0 ? ` (${totalSelectedLessons})` : ""}`}
                >
                  <FiCheckCircle className={`w-5 h-5 ${isSavingNeedComplete ? "animate-pulse" : ""}`} />
                </Button>
                <Button
                  variant="outline"
                  onClick={handleUnmarkNeedComplete}
                  disabled={isMarkingLessons || isSavingNeedComplete || totalSelectedLessons === 0}
                  className="h-8 w-8 p-0 inline-flex items-center justify-center text-red-500 border-red-200 hover:bg-red-50"
                  title={`Bỏ Need Complete${totalSelectedLessons > 0 ? ` (${totalSelectedLessons})` : ""}`}
                  aria-label={`Bỏ Need Complete${totalSelectedLessons > 0 ? ` (${totalSelectedLessons})` : ""}`}
                >
                  <FiX className={`w-5 h-5 ${isSavingNeedComplete ? "animate-pulse" : ""}`} />
                </Button>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {allLessonIds.map((lessonId) => {
                const isSelected = selectedLessonIds.has(lessonId);
                const isNeed = needCompleteLessons.has(lessonId);
                const isNotDone = notDoneSet.has(lessonId);
                let isNotEvalVis = notEvaluatedSet.has(lessonId);
                const isListened = listenedSet.has(lessonId);
                let isNotPassVis = notPassedSet.has(lessonId);
                if (mode === "speaking" && speakingCompletedTiers && completedLessons.has(lessonId)) {
                  if (speakingCompletedTiers.fail.has(lessonId)) {
                    isNotPassVis = true;
                    isNotEvalVis = false;
                  } else if (speakingCompletedTiers.noScore.has(lessonId)) {
                    isNotEvalVis = true;
                    isNotPassVis = false;
                  } else {
                    isNotPassVis = false;
                    isNotEvalVis = false;
                  }
                }
                const isDone = mode === "speaking"
                  ? completedLessons.has(lessonId) && !isNotEvalVis && !isNotPassVis
                  : completedLessons.has(lessonId);
                const accuracy = notPassedAccuracyMap.get(lessonId);
                const label = typeof accuracy === "number" ? `${lessonId} (${accuracy}%)` : `${lessonId}`;
                return (
                <button
                  key={lessonId}
                  type="button"
                  onClick={() => handleToggleLesson(lessonId)}
                  className={`px-3 py-1.5 rounded-md text-sm font-medium border transition-all cursor-pointer ${
                    isSelected ? "ring-2 ring-blue-500" : ""
                  } ${
                    isDone
                      ? "bg-green-50 border-green-300 text-green-800"
                      : isNeed
                        ? "bg-blue-50 border-blue-300 text-blue-700 hover:bg-blue-100"
                        : mode === "speaking" && isNotEvalVis
                          ? "bg-red-50 border-red-300 text-red-700 hover:bg-red-100"
                          : mode === "speaking" && isNotPassVis
                            ? "bg-orange-50 border-orange-300 text-orange-700 hover:bg-orange-100"
                            : mode === "speaking" && isListened
                              ? "bg-yellow-50 border-yellow-300 text-yellow-800 hover:bg-yellow-100"
                              : isNotDone
                                ? "bg-gray-100 border-gray-300 text-gray-700 hover:bg-gray-200"
                                : isNotPassVis
                                  ? "bg-orange-50 border-orange-300 text-orange-700 hover:bg-orange-100"
                                  : "bg-gray-50 border-gray-200 text-gray-700 hover:bg-gray-100"
                  }`}
                >
                  {label}
                </button>
              )})}
            </div>
          </div>
        )}

          {/* Empty State */}
          {allLessonIds.length === 0 && (
              <p className="text-sm text-gray-500 text-center py-4">
                Không có dữ liệu tiến độ bài học
              </p>
            )}
        </div>
      </Modal>
    </>
  );
}

