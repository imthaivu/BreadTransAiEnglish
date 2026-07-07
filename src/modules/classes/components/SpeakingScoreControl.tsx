"use client";

import { cn } from "@/utils";
import { SafeImage as Image } from "@/components/ui/SafeImage";
import toast from "react-hot-toast";
import { useUpdateSpeakingScore } from "@/modules/speaking-upload/hooks";

export function SpeakingScoreControl({
  studentId,
  studentName,
  bookId,
  lessonId,
  aiSuggestedScore,
  currentScore,
  onScoreUpdate,
  rewardParams,
  compact = false,
  onReevaluateAi,
  isReevaluatingAi = false,
}: {
  studentId: string;
  studentName: string;
  bookId: string;
  lessonId: number;
  aiSuggestedScore: string | null;
  currentScore: string | null;
  onScoreUpdate: (score: string | null) => void;
  rewardParams?: {
    teacherId: string;
    teacherName: string;
    teacherAvatarUrl?: string;
    classId: string;
    studentName: string;
  };
  compact?: boolean;
  onReevaluateAi?: () => void | Promise<void>;
  isReevaluatingAi?: boolean;
}) {
  const { mutate: updateScore, isPending } = useUpdateSpeakingScore();
  const normalizedAiScore = aiSuggestedScore
    ? Number(aiSuggestedScore.replace(",", "."))
    : Number.NaN;
  const acceptedScore =
    Number.isFinite(normalizedAiScore) && normalizedAiScore >= 0 && normalizedAiScore <= 10
      ? normalizedAiScore.toFixed(1).replace(/\.0$/, "")
      : null;

  const suggestedColumn =
    Number.isFinite(normalizedAiScore) && normalizedAiScore >= 0 && normalizedAiScore <= 10
      ? Math.min(10, Math.max(0, Math.round(normalizedAiScore)))
      : null;

  const normalizeScoreStr = (value: string | null) => {
    if (!value) return null;
    const n = Number(value.replace(",", "."));
    if (!Number.isFinite(n)) return value;
    return n.toFixed(1).replace(/\.0$/, "");
  };

  const currentNorm = normalizeScoreStr(currentScore);

  const digitButtonTone = (n: number, active: boolean) => {
    if (active) {
      if (n < 7) return "border-orange-600 bg-orange-600 text-white";
      if (n >= 8) return "border-green-500 bg-green-500 text-white";
      return "border-blue-500 bg-blue-500 text-white";
    }
    if (n < 7) return "border-orange-200 text-orange-700 hover:bg-orange-50 dark:border-orange-800 dark:text-orange-300 dark:hover:bg-orange-950/30";
    if (n >= 8) return "border-green-200 text-green-700 hover:bg-green-50 dark:border-green-800 dark:text-green-300 dark:hover:bg-green-950/30";
    return "border-blue-200 text-blue-700 hover:bg-blue-50 dark:border-blue-800 dark:text-blue-300 dark:hover:bg-blue-950/30";
  };

  const applyScore = (score: string) => {
    if (currentNorm === score) return;
    updateScore(
      { studentId, bookId, lessonId, score, rewardParams },
      {
        onSuccess: () => onScoreUpdate(score),
        onError: () => toast.error(`Cập nhật điểm cho ${studentName} thất bại.`),
      }
    );
  };

  const handlePickDigit = (n: number) => {
    const score = n.toFixed(1).replace(/\.0$/, "");
    applyScore(score);
  };

  const handleAccept = () => {
    if (!acceptedScore) return;
    applyScore(acceptedScore);
  };

  const colW = compact ? "w-[1.35rem] sm:w-10" : "w-[1.35rem]";
  const iconRowH = compact ? "h-5 sm:h-7" : "h-6";

  return (
    <div
      className={cn(
        "inline-flex max-w-full flex-wrap items-end justify-center",
        compact ? "gap-1 sm:gap-2" : "gap-1.5"
      )}
    >
      <div
        className={cn(
          "inline-flex max-w-full flex-wrap items-end justify-center",
          compact ? "gap-0.5 sm:gap-1.5" : "gap-1"
        )}
        role="group"
        aria-label="Chấm điểm 0–10"
      >
        {Array.from({ length: 11 }, (_, n) => {
          const norm = n.toFixed(1).replace(/\.0$/, "");
          const active = currentNorm === norm;
          return (
            <div key={n} className={cn("flex shrink-0 flex-col items-center gap-1 sm:gap-1.5", colW)}>
              {onReevaluateAi && suggestedColumn === n && acceptedScore ? (
                <button
                  type="button"
                  onClick={() => void onReevaluateAi()}
                  disabled={isPending || isReevaluatingAi}
                  className={cn(
                    "flex w-full items-center justify-center rounded-md outline-none transition-opacity hover:opacity-90 focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1 disabled:pointer-events-none disabled:opacity-50",
                    iconRowH
                  )}
                  title={`Điểm gợi ý AI: ${acceptedScore}/10 — Bấm để chấm lại AI`}
                >
                  <Image
                    src="/assets/images/geminiAI.png"
                    alt="Chấm lại AI"
                    width={20}
                    height={20}
                    className={cn(
                      "h-3.5 w-3.5 rounded object-contain opacity-95 ring-1 ring-slate-300/90 dark:ring-slate-600 sm:h-5 sm:w-5",
                      isReevaluatingAi && "animate-pulse"
                    )}
                  />
                </button>
              ) : (
                <div className={cn("flex w-full items-center justify-center", iconRowH)}>
                  {suggestedColumn === n ? (
                    <Image
                      src="/assets/images/geminiAI.png"
                      alt=""
                      width={20}
                      height={20}
                      className="h-3.5 w-3.5 rounded object-contain opacity-95 ring-1 ring-slate-300/90 dark:ring-slate-600 sm:h-5 sm:w-5"
                    />
                  ) : null}
                </div>
              )}
              <button
                type="button"
                onClick={() => handlePickDigit(n)}
                disabled={isPending}
                title={`Chấm ${norm}`}
                className={cn(
                  "w-full rounded border font-semibold transition-colors disabled:opacity-50",
                  compact
                    ? "h-7 px-0 text-[11px] sm:h-10 sm:rounded-md sm:text-base"
                    : "h-7 min-w-0 px-0.5 text-xs",
                  digitButtonTone(n, active)
                )}
              >
                {n}
              </button>
            </div>
          );
        })}
      </div>
      <div
        className={cn(
          "flex shrink-0 flex-col items-stretch gap-1 sm:gap-1.5",
          compact ? "min-w-[3.25rem] sm:min-w-[4.5rem]" : "min-w-[3.5rem]"
        )}
      >
        <div className={cn(iconRowH, "shrink-0")} aria-hidden />
        <button
          type="button"
          onClick={handleAccept}
          disabled={isPending || !acceptedScore}
          className={cn(
            "w-full rounded-md border font-semibold transition-colors disabled:opacity-50",
            compact
              ? "px-1 py-1.5 text-[11px] leading-tight sm:px-2 sm:py-2 sm:text-sm"
              : "px-2 py-1 text-sm",
            acceptedScore ? "border-blue-500 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950/30" : "border-gray-300 text-gray-400"
          )}
          title={acceptedScore ? `Xác nhận điểm ${acceptedScore}` : "Chưa có điểm gợi ý từ AI"}
        >
          {compact ? "Accept" : acceptedScore ? `Accept ${acceptedScore}` : "Accept"}
        </button>
      </div>
    </div>
  );
}
