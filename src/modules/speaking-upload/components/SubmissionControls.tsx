import { useAuth } from "@/lib/auth/context";
import AudioPlayer from "@/components/streamline/AudioPlayer";
import { LESSONS_1000_BOOKS, Lessons1000Book } from "@/constants/lessons1000";
import { STREAMLINE_BOOKS, StreamlineBook } from "@/constants/streamline";
import { useMemo, useState, useEffect } from "react";
import { LessonScriptPanel } from "./LessonScriptPanel";

interface SubmissionControlsProps {
  selectedBook: string | null;
  selectedLesson: number | null;
  disabled: boolean;
  onLessonChange: (lessonId: number) => void;
  onReferenceDurationChange?: (durationSeconds: number) => void;
}

export const SubmissionControls = ({
  selectedBook,
  selectedLesson,
  disabled,
  onLessonChange,
  onReferenceDurationChange,
}: SubmissionControlsProps) => {
  const { role } = useAuth();
  const [currentLesson, setCurrentLesson] = useState(0);

  const defaultRepeatCount = role === "teacher" || role === "admin" ? 5 : 0;

  const audioBookData = useMemo<{
    type: "streamline" | "lessons1000";
    book: StreamlineBook | Lessons1000Book;
    audioFiles: string[];
    missingLessons: number[];
  } | null>(() => {
    if (!selectedBook) return null;

    const bookId = parseInt(selectedBook, 10);

    if (bookId >= 1 && bookId <= 4) {
      const streamlineBook = STREAMLINE_BOOKS.find((b) => b.id === bookId);
      if (streamlineBook) {
        return {
          type: "streamline" as const,
          book: streamlineBook,
          audioFiles: streamlineBook.audioFiles,
          missingLessons: streamlineBook.missingLessons,
        };
      }
    }

    if (bookId >= 5 && bookId <= 17) {
      const lessons1000Book = LESSONS_1000_BOOKS.find((b) => b.id === bookId);
      if (lessons1000Book) {
        return {
          type: "lessons1000" as const,
          book: lessons1000Book,
          audioFiles: lessons1000Book.audioFiles,
          missingLessons: [],
        };
      }
    }

    return null;
  }, [selectedBook]);

  const isLessonMissing = useMemo(() => {
    if (!selectedLesson || !audioBookData) return false;
    return audioBookData.missingLessons.includes(selectedLesson);
  }, [selectedLesson, audioBookData]);

  useEffect(() => {
    if (selectedLesson && audioBookData) {
      const lessonIndex = selectedLesson - 1;
      if (lessonIndex >= 0 && lessonIndex < audioBookData.audioFiles.length) {
        setCurrentLesson(lessonIndex);
      }
    }
  }, [selectedLesson, audioBookData]);

  const hasSelection = selectedBook && selectedLesson;

  if (!hasSelection) {
    return (
      <p className="text-center text-sm text-gray-500 py-4">
        Chọn sách và bài ở phía trên để bắt đầu speaking.
      </p>
    );
  }

  return (
    <div className="w-full space-y-4 lg:space-y-6">
      {audioBookData && audioBookData.audioFiles.length > 0 ? (
        <div className="p-3 bg-gray-50 dark:bg-gray-700 rounded-xl border border-gray-200 dark:border-gray-600">
          {isLessonMissing ? (
            <div className="p-4 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg">
              <p className="text-sm text-yellow-800 dark:text-yellow-200">
                ⚠️ Bài học {selectedLesson} không có file audio.
              </p>
            </div>
          ) : (
            <AudioPlayer
              key={`${selectedBook}-${selectedLesson}`}
              audioFiles={audioBookData.audioFiles}
              onDurationChange={onReferenceDurationChange}
              onLessonSelect={(idx) => {
                setCurrentLesson(idx);
                onLessonChange(idx + 1);
              }}
              currentLesson={currentLesson}
              missingLessons={audioBookData.missingLessons}
              hideLessonList={true}
              defaultRepeatCount={defaultRepeatCount}
              trackingContext={{
                module: audioBookData.type,
                itemKey: selectedBook,
              }}
            />
          )}
        </div>
      ) : null}

      <LessonScriptPanel
        selectedBook={selectedBook}
        selectedLesson={selectedLesson}
        context="speaking"
      />
    </div>
  );
};
