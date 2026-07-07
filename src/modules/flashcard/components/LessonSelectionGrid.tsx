import { Button } from "@/components/ui/Button";
import { LessonStatus } from "../types";
import { getLessonButtonClass } from "../utils";
import { useMemo, memo } from "react";

interface Lesson {
  value: string;
  label: string;
}

export type LessonSelectionMode = "multi" | "single";

interface LessonSelectionGridProps {
  lessons: Lesson[];
  selectedLessons: number[];
  lessonStatuses?: Map<number, LessonStatus>;
  completedLessons?: number[];
  listenedLessons?: number[];
  orangeLessons?: number[];
  speakingStatusByLesson?: Record<number, "passed" | "notPassed" | "listened" | "none">;
  needLessons?: number[];
  onSelectLesson: (lesson: number) => void;
  onClose: () => void;
  /** multi = chọn nhiều (flashcard), single = chọn 1 (speaking, bảng tiến độ) */
  mode?: LessonSelectionMode;
}

export const LessonSelectionGrid = memo(({
  lessons,
  selectedLessons,
  lessonStatuses = new Map(),
  completedLessons = [],
  listenedLessons = [],
  orangeLessons = [],
  speakingStatusByLesson = {},
  needLessons = [],
  onSelectLesson,
  onClose,
  mode = "multi",
}: LessonSelectionGridProps) => {
  // Convert selectedLessons array to Set for O(1) lookup instead of O(n)
  const selectedLessonsSet = useMemo(
    () => new Set(selectedLessons),
    [selectedLessons]
  );

  // Convert completedLessons array to Set for O(1) lookup
  const completedLessonsSet = useMemo(
    () => new Set(completedLessons),
    [completedLessons]
  );

  const listenedLessonsSet = useMemo(
    () => new Set(listenedLessons),
    [listenedLessons]
  );

  const needLessonsSet = useMemo(
    () => new Set(needLessons),
    [needLessons]
  );

  const orangeLessonsSet = useMemo(
    () => new Set(orangeLessons),
    [orangeLessons]
  );

  // Memoize button classes to avoid recalculating on every render
  const lessonButtons = useMemo(() => {
    return lessons.map((lesson) => {
      const lessonNum = Number(lesson.value);
      const isSelected = selectedLessonsSet.has(lessonNum);
      const lessonStatus = lessonStatuses.get(lessonNum);
      const isCompleted = completedLessonsSet.has(lessonNum);
      const isListened = listenedLessonsSet.has(lessonNum);
      const isNeedComplete = needLessonsSet.has(lessonNum);
      const isOrangeLesson = orangeLessonsSet.has(lessonNum);
      const accuracy = lessonStatus?.lastAccuracy;
      const speakingStatus = speakingStatusByLesson[lessonNum];

      const getSpeakingColorClass = () => {
        switch (speakingStatus) {
          case "passed":
            return isSelected ? "bg-green-500 text-white border-green-600" : "bg-green-100 text-green-800 border-green-300";
          case "notPassed":
            return isSelected ? "bg-orange-500 text-white border-orange-600" : "bg-orange-100 text-orange-800 border-orange-300";
          case "listened":
            return isSelected ? "bg-yellow-500 text-white border-yellow-600" : "bg-yellow-100 text-yellow-800 border-yellow-300";
          case "none":
            // Ưu tiên màu xanh dương nhạt khi giáo viên đánh dấu bài cần speaking,
            // kể cả khi bài đã có record (vd: đã nộp bên quiz) nhưng chưa có hoạt động speaking.
            if (isNeedComplete) {
              return isSelected
                ? "bg-primary text-white border-blue-600"
                : "bg-blue-100 text-blue-800 border-blue-300";
            }
            // Bỏ màu xám gray-100 cho các bài đã có record từ phía quiz mà chưa có
            // hoạt động speaking — hiển thị như bài mặc định (trắng) để không gây nhầm lẫn.
            return isSelected
              ? "bg-primary text-white border-blue-600"
              : "bg-white text-gray-700 border-gray-300 hover:bg-gray-100";
          default:
            return getLessonButtonClass(
              isSelected,
              lessonStatus,
              isCompleted,
              accuracy,
              isListened,
              isNeedComplete
            );
        }
      };

      const colorClass =
        mode === "single" && speakingStatus
          ? getSpeakingColorClass()
          : mode === "single" && isSelected && isOrangeLesson
          ? "bg-orange-500 text-white border-orange-600"
          : !isSelected && isOrangeLesson
            ? "bg-orange-100 text-orange-800 border-orange-300"
            : getLessonButtonClass(
                isSelected,
                lessonStatus,
                isCompleted,
                accuracy,
                isListened,
                isNeedComplete
              );

      const buttonClass = `w-full h-9 sm:h-8 text-center rounded-md border text-sm font-medium transition-all hover:scale-105 ${colorClass}`;

      return {
        key: lesson.value,
        lessonNum,
        buttonClass,
        label: lesson.value,
      };
    });
  }, [lessons, selectedLessonsSet, lessonStatuses, completedLessonsSet, listenedLessonsSet, needLessonsSet, orangeLessonsSet, speakingStatusByLesson, mode]);

  return (
    <div className="flex flex-col max-h-[calc(90vh-90px)]">
      <div className="grid grid-cols-5 sm:grid-cols-8 md:grid-cols-10 lg:grid-cols-12 xl:grid-cols-12 gap-1.5 sm:gap-2 flex-1 overflow-y-auto p-1 min-h-0 pb-2">
        {lessonButtons.map(({ key, lessonNum, buttonClass, label }) => (
          <button
            key={key}
            onClick={() => onSelectLesson(lessonNum)}
            className={buttonClass}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="flex justify-between items-center pt-2 border-t flex-shrink-0">
        <div className="text-sm text-gray-600">
          {mode === "single"
            ? selectedLessons.length > 0
              ? `Đã chọn: Bài ${selectedLessons[0]}`
              : "Chọn 1 bài"
            : `Đã chọn: ${selectedLessons.length} bài`}
        </div>
        <Button onClick={onClose}>Xong</Button>
      </div>
    </div>
  );
});

LessonSelectionGrid.displayName = "LessonSelectionGrid";
