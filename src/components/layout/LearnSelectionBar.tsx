"use client";

import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { useLearnTab } from "@/components/layout/LearnTabProvider";
import { useLearnSelection } from "@/components/layout/LearnSelectionProvider";
import { useAuth } from "@/lib/auth/context";
import { db } from "@/lib/firebase/client";
import { getAdjacentLesson } from "@/lib/learn-selection";
import {
  LessonSelectionGrid,
  useBooks,
  useCompletedLessons,
  useLessonStatuses,
  useLessons,
  useNeedQuizLessons,
} from "@/modules/flashcard";
import { controlStyles } from "@/styles/control-styles";
import { useQuery } from "@tanstack/react-query";
import { doc, getDoc } from "firebase/firestore";
import { useMemo, useState } from "react";

type SpeakingLessonGridStatus = "passed" | "notPassed" | "listened" | "none";

const lessonNavArrowClass = `${controlStyles.base} ${controlStyles.button} !w-full !min-w-0 !px-0 bg-blue-50 text-blue-600 border-blue-200 hover:bg-blue-100 hover:text-blue-700 disabled:bg-gray-100 disabled:text-gray-400 disabled:border-gray-200`;

export default function LearnSelectionBar() {
  const { activeTab } = useLearnTab();
  const {
    selectedBook,
    selectedLesson,
    setSelectedBook,
    setSelectedLesson,
    isHydrated,
  } = useLearnSelection();
  const { session } = useAuth();
  const userId = session?.user?.id || "";
  const [showLessonModal, setShowLessonModal] = useState(false);

  const { data: books = [], isLoading: booksLoading } = useBooks();
  const { data: lessons = [], isLoading: lessonsLoading } = useLessons(
    selectedBook ?? ""
  );

  const isVocabTab = activeTab === "vocabulary";

  const { data: completedLessons = [] } = useCompletedLessons(
    userId,
    isVocabTab ? selectedBook : null
  );
  const { data: lessonStatuses = new Map() } = useLessonStatuses(
    userId,
    isVocabTab ? selectedBook : null
  );
  const { data: needQuizLessons = [] } = useNeedQuizLessons(
    userId,
    isVocabTab ? selectedBook : null
  );

  const { data: speakingProgress } = useQuery({
    queryKey: ["learnSelectionSpeakingProgress", userId, selectedBook],
    enabled: !!userId && !!selectedBook && !isVocabTab,
    staleTime: 10_000,
    queryFn: async () => {
      const ref = doc(db, "userBookProgress", `${userId}_${selectedBook}`);
      const snap = await getDoc(ref);
      if (!snap.exists()) {
        return {
          completedLessonsSpeaking: [] as number[],
          listenedLessonsSpeaking: [] as number[],
          cScoredLessonsSpeaking: [] as number[],
          speakingStatusByLesson: {} as Record<number, SpeakingLessonGridStatus>,
          needSpeakings: [] as number[],
        };
      }
      const data = snap.data();
      const lessonsObj = data?.lessons || {};
      const listenedLessonsSpeaking: number[] = [];
      const cScoredLessonsSpeaking: number[] = [];
      const speakingStatusByLesson: Record<number, SpeakingLessonGridStatus> =
        {};

      Object.keys(lessonsObj).forEach((key) => {
        const lessonId = Number(key);
        if (!Number.isFinite(lessonId)) return;

        const lesson = lessonsObj[key] ?? {};
        const listenCount = lesson?.listenCount ?? 0;
        if (listenCount >= 1) {
          listenedLessonsSpeaking.push(lessonId);
        }

        const rawScore =
          typeof lesson?.speakingScore === "string"
            ? lesson.speakingScore
            : null;
        const speakingScore = rawScore
          ? Number(rawScore.replace(",", "."))
          : Number.NaN;

        if (Number.isFinite(speakingScore)) {
          speakingStatusByLesson[lessonId] =
            speakingScore >= 7 ? "passed" : "notPassed";
          if (speakingScore < 7) {
            cScoredLessonsSpeaking.push(lessonId);
          }
          return;
        }

        if (listenCount >= 1) {
          speakingStatusByLesson[lessonId] = "listened";
        } else {
          speakingStatusByLesson[lessonId] = "none";
        }
      });

      return {
        completedLessonsSpeaking: (data?.completedLessonsSpeaking ??
          []) as number[],
        listenedLessonsSpeaking,
        cScoredLessonsSpeaking,
        speakingStatusByLesson,
        needSpeakings: (data?.needSpeakings ?? []) as number[],
      };
    },
  });

  const lessonsList = useMemo(
    () =>
      lessons.map((lesson) => ({
        value: lesson.toString(),
        label: `Bài ${lesson}`,
      })),
    [lessons]
  );

  const selectedLessonsForGrid = selectedLesson != null ? [selectedLesson] : [];

  const handleSelectLesson = (lessonNum: number) => {
    setSelectedLesson(lessonNum);
    setShowLessonModal(false);
  };

  const prevLesson = getAdjacentLesson(lessons, selectedLesson, "prev");
  const nextLesson = getAdjacentLesson(lessons, selectedLesson, "next");

  const bookSelectDisabled = booksLoading || !isHydrated;
  const lessonNavDisabled =
    !selectedBook || lessonsLoading || lessons.length === 0;

  const bookName =
    books.find((b) => b.id.toString() === selectedBook)?.name ?? "";

  return (
    <>
      <div className="mb-3 grid grid-cols-2 gap-2 md:gap-4 md:items-stretch">
        <div className="flex items-center min-w-0">
          <select
            value={selectedBook ?? ""}
            onChange={(e) => {
              const value = e.target.value;
              if (value) setSelectedBook(value);
            }}
            disabled={bookSelectDisabled}
            className={`${controlStyles.base} ${controlStyles.select} min-w-0`}
          >
            <option value="">
              {booksLoading ? "Đang tải sách..." : "Chọn sách"}
            </option>
            {books.map((book) => (
              <option key={book.id} value={book.id.toString()}>
                {book.name}
              </option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-[2.5rem_1fr_2.5rem] md:grid-cols-[3rem_1fr_3rem] gap-1 md:gap-2 items-stretch min-w-0">
          <Button
            type="button"
            variant="outline"
            aria-label="Bài trước"
            className={lessonNavArrowClass}
            disabled={lessonNavDisabled || prevLesson == null}
            onClick={() => {
              if (prevLesson != null) setSelectedLesson(prevLesson);
            }}
          >
            &lt;
          </Button>

          <Button
            type="button"
            variant="outline"
            className={`${controlStyles.base} ${controlStyles.button} !w-full min-w-0 truncate`}
            disabled={lessonNavDisabled}
            onClick={() => {
              if (lessons.length > 0) setShowLessonModal(true);
            }}
          >
            {selectedLesson != null ? `Bài ${selectedLesson}` : "Chọn bài"}
          </Button>

          <Button
            type="button"
            variant="outline"
            aria-label="Bài sau"
            className={lessonNavArrowClass}
            disabled={lessonNavDisabled || nextLesson == null}
            onClick={() => {
              if (nextLesson != null) setSelectedLesson(nextLesson);
            }}
          >
            &gt;
          </Button>
        </div>
      </div>

      <Modal
        open={showLessonModal}
        onClose={() => setShowLessonModal(false)}
        title={bookName}
        maxWidth="2xl"
      >
        {isVocabTab ? (
          <LessonSelectionGrid
            lessons={lessonsList}
            selectedLessons={selectedLessonsForGrid}
            lessonStatuses={lessonStatuses}
            completedLessons={completedLessons}
            needLessons={needQuizLessons}
            onSelectLesson={handleSelectLesson}
            onClose={() => setShowLessonModal(false)}
            mode="single"
          />
        ) : (
          <LessonSelectionGrid
            lessons={lessonsList}
            selectedLessons={selectedLessonsForGrid}
            completedLessons={speakingProgress?.completedLessonsSpeaking ?? []}
            listenedLessons={speakingProgress?.listenedLessonsSpeaking ?? []}
            orangeLessons={speakingProgress?.cScoredLessonsSpeaking ?? []}
            speakingStatusByLesson={
              speakingProgress?.speakingStatusByLesson ?? {}
            }
            needLessons={speakingProgress?.needSpeakings ?? []}
            onSelectLesson={handleSelectLesson}
            onClose={() => setShowLessonModal(false)}
            mode="single"
          />
        )}
      </Modal>
    </>
  );
}
