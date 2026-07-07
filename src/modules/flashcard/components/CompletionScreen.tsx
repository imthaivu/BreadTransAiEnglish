import { Button } from "@/components/ui/Button";
import { Word } from "../types";
import { useState, useEffect, useMemo } from "react";
import { useAuth } from "@/lib/auth/context";
import { cn } from "@/utils";
import { CanvasStatText } from "./CanvasStatText";
import { SafeImage as Image } from "@/components/ui/SafeImage";
import { FiChevronDown } from "react-icons/fi";

const STAT_COLOR_QUIZ = "#2aa7e2";
const STAT_COLOR_FLASHCARD = "#d97706";

/** Lấy từ cuối của họ tên (tên gọi), vd. "Nguyễn Văn Long" → "Long". */
function getLastNameWord(fullName: string): string {
  const trimmed = fullName.trim();
  if (!trimmed) return "Bạn";
  const words = trimmed.split(/\s+/).filter(Boolean);
  return words[words.length - 1] ?? trimmed;
}

function getNameInitial(fullName: string): string {
  const last = getLastNameWord(fullName);
  const char = Array.from(last)[0];
  return char ? char.toLocaleUpperCase("vi-VN") : "?";
}

interface CompletionScreenProps {
  deckLength: number;
  score: number;
  /** Quiz: % đã tính sẵn từ quizSessionSummary; flashcard: bỏ trống để suy từ score/deckLength */
  accuracy?: number;
  wrongWords: Word[];
  onRestart: () => void;
  onClose: () => void;
  bookName?: string;
  bookId?: string;
  selectedLesson?: number;
  completedLessons?: number[];
  mode?: "flashcard" | "quiz";
  isReviewOnlyMode?: boolean;
  classId?: string;
}

export const CompletionScreen = ({
  deckLength,
  score,
  accuracy: accuracyProp,
  wrongWords,
  onRestart,
  onClose,
  bookName,
  selectedLesson,
  mode = "flashcard",
  isReviewOnlyMode = false,
}: CompletionScreenProps) => {
  const accuracy = useMemo(() => {
    const raw =
      mode === "quiz" && accuracyProp !== undefined
        ? accuracyProp
        : deckLength > 0
          ? Math.round((score / deckLength) * 100)
          : 0;
    return Math.min(100, Math.max(0, raw));
  }, [mode, accuracyProp, score, deckLength]);
  const [completionTime, setCompletionTime] = useState<string>("");
  const [showDetails, setShowDetails] = useState(false);

  const { session, profile } = useAuth();
  const studentName = session?.user?.name || profile?.displayName || "";
  const avatarUrl = profile?.avatarUrl || session?.user?.image || "";
  const shortName = getLastNameWord(studentName);
  const nameInitial = getNameInitial(studentName);

  const isQuiz = mode === "quiz";
  const isQuizIncomplete = isQuiz && accuracy < 85;
  const completionTitle = isQuizIncomplete
    ? `${shortName} chưa xong quiz`
    : isQuiz
      ? `${shortName} xong quiz`
      : `${shortName} xong flashcard`;

  const accentText = isQuiz ? "text-blue-700" : "text-amber-800";
  const accentMuted = isQuiz ? "text-blue-600" : "text-amber-700";
  const statCanvasColor = isQuiz ? STAT_COLOR_QUIZ : STAT_COLOR_FLASHCARD;
  const metaMutedColor = "#6b7280";
  const showBookLessons = Boolean(bookName && selectedLesson != null);
  const buttonClass = isQuiz
    ? "bg-primary hover:bg-primary/90"
    : "bg-amber-500 hover:bg-amber-600";

  useEffect(() => {
    const now = new Date();
    const formattedDate = now.toLocaleString("vi-VN", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
    setCompletionTime(formattedDate);
  }, []);

  return (
    <div className="flex flex-col flex-1 min-h-0 h-full w-full max-w-lg sm:max-w-xl mx-auto px-2 sm:px-3 py-1 overflow-hidden justify-start">
      <div
        className={cn(
          "rounded-2xl border shadow-sm overflow-y-auto flex flex-col w-full max-h-full",
          isQuiz
            ? "border-blue-100 bg-gradient-to-b from-blue-50/90 via-white to-white"
            : "border-amber-100 bg-gradient-to-b from-amber-50/90 via-white to-white"
        )}
      >
        <div className="px-4 pt-3 pb-2 text-center space-y-1.5 flex-shrink-0">
          <div className="flex items-center justify-center gap-2.5">
            <div
              className={cn(
                "relative h-9 w-9 sm:h-10 sm:w-10 rounded-full overflow-hidden flex-shrink-0 ring-2",
                isQuiz ? "ring-blue-200" : "ring-amber-200"
              )}
            >
              {avatarUrl ? (
                <Image
                  src={avatarUrl}
                  alt={studentName || shortName}
                  fill
                  sizes="40px"
                  className="object-cover"
                />
              ) : (
                <span
                  className={cn(
                    "flex h-full w-full items-center justify-center text-sm font-bold",
                    isQuiz ? "bg-blue-100 text-blue-700" : "bg-amber-100 text-amber-800"
                  )}
                >
                  {nameInitial}
                </span>
              )}
            </div>
            <h2
              className={cn(
                "text-lg sm:text-xl font-bold tracking-tight leading-tight",
                isQuizIncomplete ? "text-orange-600" : accentText
              )}
            >
              {completionTitle}
            </h2>
          </div>

          {showBookLessons && (
            <div className="flex flex-col items-center gap-0.5 px-1 text-xl font-medium text-gray-600 leading-snug">
              <p>Sách: {bookName}</p>
              <p>Bài: {selectedLesson}</p>
            </div>
          )}

          {completionTime && (
            <div className="flex justify-center px-1">
              <CanvasStatText
                text={completionTime}
                color={metaMutedColor}
                fontSize={11}
                fontWeight={400}
                maxWidth={320}
                ariaLabel={`Hoàn thành lúc ${completionTime}`}
              />
            </div>
          )}

          {isReviewOnlyMode && (
            <p className="text-[11px] font-medium text-orange-600 bg-orange-50 border border-orange-100 rounded-lg px-2 py-1.5 leading-snug">
              Bạn đang ở chế độ chỉ ôn từ. Điểm số không được lưu.
            </p>
          )}
        </div>

        <div className="flex flex-col gap-2 px-3 sm:px-4 py-1">
          <button
            type="button"
            onClick={() => setShowDetails((open) => !open)}
            className={cn(
              "flex w-full items-center justify-between gap-2 rounded-xl border bg-white px-3 py-2.5 text-left shadow-sm transition-colors",
              isQuiz
                ? "border-blue-100 hover:bg-blue-50/50"
                : "border-amber-100 hover:bg-amber-50/50"
            )}
            aria-expanded={showDetails}
          >
            <div className="min-w-0 flex-1">
              <p className={cn("text-xs font-semibold", accentText)}>
                {showDetails ? "Thu gọn" : "Xem chi tiết"}
              </p>
            </div>
            <FiChevronDown
              className={cn(
                "h-4 w-4 flex-shrink-0 text-gray-400 transition-transform duration-200",
                showDetails && "rotate-180"
              )}
              aria-hidden
            />
          </button>

          {showDetails && (
            <>
              <div className="grid grid-cols-2 gap-2 flex-shrink-0">
                <div className="rounded-xl border border-gray-100 bg-white px-2 py-2.5 text-center shadow-sm">
                  <div className="h-8 flex items-center justify-center">
                    <CanvasStatText
                      text={isQuiz ? `${score}/${deckLength}` : String(score)}
                      color={statCanvasColor}
                      fontSize={26}
                      ariaLabel={
                        isQuiz
                          ? `${score} trên ${deckLength} câu đúng`
                          : `${score} từ đúng`
                      }
                    />
                  </div>
                  <p className="mt-0.5 text-[11px] sm:text-xs text-gray-500 font-medium">
                    {isQuiz ? "Câu đúng" : "Từ đúng"}
                  </p>
                </div>
                <div className="rounded-xl border border-gray-100 bg-white px-2 py-2.5 text-center shadow-sm">
                  <div className="h-8 flex items-center justify-center">
                    <CanvasStatText
                      text={`${accuracy}%`}
                      color={statCanvasColor}
                      fontSize={26}
                      ariaLabel={`Độ chính xác ${accuracy} phần trăm`}
                    />
                  </div>
                  <p className="mt-0.5 text-[11px] sm:text-xs text-gray-500 font-medium">
                    Độ chính xác
                  </p>
                </div>
              </div>

              {wrongWords.length > 0 && (
                <div className="flex-shrink-0 rounded-xl border border-gray-200 bg-white p-2.5 sm:p-3 text-left shadow-sm">
                  <h4 className={cn("text-xs font-semibold mb-1.5", accentText)}>
                    Cần ôn {wrongWords.length} từ
                  </h4>
                  <ul className="grid grid-cols-1 sm:grid-cols-2 gap-1">
                    {wrongWords.map((word, index) => (
                      <li
                        key={`${word.word}-${index}`}
                        className="rounded-md bg-gray-50 px-2 py-1 text-[11px] sm:text-xs leading-snug truncate"
                        title={`${word.word} (${word.ipa}) → ${word.mean}`}
                      >
                        <span className={cn("font-semibold", accentMuted)}>
                          {word.word}
                        </span>
                        {word.ipa ? (
                          <span className="text-gray-500"> ({word.ipa})</span>
                        ) : null}
                        <span className="text-gray-400 mx-1">→</span>
                        <span className="text-gray-700">{word.mean}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          )}
        </div>

        <div className="flex flex-col sm:flex-row justify-center gap-2 px-4 py-3 flex-shrink-0 border-t border-gray-100/80 bg-white/50">
          <Button
            onClick={onRestart}
            className={cn("px-6 py-2.5 text-white w-full sm:w-auto", buttonClass)}
          >
            Học lại
          </Button>
          <Button
            onClick={onClose}
            variant="outline"
            className="px-6 py-2.5 w-full sm:w-auto"
          >
            Đóng
          </Button>
        </div>
      </div>
    </div>
  );
};
