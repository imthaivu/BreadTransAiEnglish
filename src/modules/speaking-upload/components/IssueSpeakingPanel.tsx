"use client";

import { parseIssueSpeaking } from "@/lib/speaking/parse-issue-speaking";
import { useSpeechSynthesis } from "@/lib/speech/useSpeechSynthesis";
import { cn } from "@/utils/cn";
import { useMemo } from "react";
import { FiVolume2 } from "react-icons/fi";

type IssueSpeakingPanelProps = {
  issue: string;
  className?: string;
};

function ScoreLine({ line, highlight }: { line: string; highlight?: boolean }) {
  if (!highlight) {
    return <p className="font-medium leading-relaxed">{line}</p>;
  }

  const parts = line.split(/(Tổng điểm)/i);
  return (
    <p className="font-medium leading-relaxed">
      {parts.map((part, i) =>
        /^Tổng điểm$/i.test(part) ? (
          <span key={i} className="text-red-600 font-semibold">
            {part}
          </span>
        ) : (
          <span key={i}>{part}</span>
        )
      )}
    </p>
  );
}

export function IssueSpeakingPanel({ issue, className }: IssueSpeakingPanelProps) {
  const parsed = useMemo(() => parseIssueSpeaking(issue), [issue]);
  const { isSupported, speakingText, speak, speakSequence } = useSpeechSynthesis();

  const hasScores =
    parsed.totalScoreLine ||
    parsed.completionScoreLine ||
    parsed.pronunciationScoreLine;
  const hasWords = parsed.mispronouncedWords.length > 0;

  if (!hasScores && !hasWords && !parsed.encouragement) {
    return (
      <p className={cn("text-sm text-amber-900 whitespace-pre-wrap leading-relaxed", className)}>
        {issue}
      </p>
    );
  }

  return (
    <div className={cn("text-sm text-amber-900 space-y-3", className)}>
      {hasScores && (
        <div className="space-y-0.5">
          {parsed.totalScoreLine && (
            <ScoreLine line={parsed.totalScoreLine} highlight />
          )}
          {parsed.completionScoreLine && <ScoreLine line={parsed.completionScoreLine} />}
          {parsed.pronunciationScoreLine && (
            <ScoreLine line={parsed.pronunciationScoreLine} />
          )}
        </div>
      )}

      {hasWords && (
        <div>
          <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1">
            <p className="text-xs font-semibold text-amber-800">
              Từ phát âm cần luyện lại
              {isSupported ? " — bấm để nghe phát âm chuẩn:" : ":"}
            </p>
            {isSupported && parsed.mispronouncedWords.length > 1 && (
              <button
                type="button"
                onClick={() => speakSequence(parsed.mispronouncedWords)}
                className="text-xs font-medium text-blue-600 hover:text-blue-700 underline underline-offset-2"
              >
                Nghe tất cả
              </button>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            {parsed.mispronouncedWords.map((word) => {
              const isActive = speakingText?.toLowerCase() === word.toLowerCase();
              return (
                <button
                  key={word}
                  type="button"
                  onClick={() => isSupported && speak(word)}
                  disabled={!isSupported}
                  title={
                    isSupported
                      ? `Nghe phát âm: ${word}`
                      : "Trình duyệt không hỗ trợ đọc văn bản"
                  }
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-sm font-medium transition-colors",
                    isSupported
                      ? "border-blue-300 bg-blue-50 text-blue-700 hover:bg-blue-100 hover:border-blue-400 cursor-pointer"
                      : "border-blue-200 bg-blue-50/50 text-blue-600/70 cursor-default opacity-80",
                    isActive && "ring-2 ring-blue-400/50 bg-blue-100 border-blue-500"
                  )}
                >
                  {isSupported && (
                    <FiVolume2
                      className={cn(
                        "h-3.5 w-3.5 shrink-0 text-blue-600",
                        isActive && "text-blue-700"
                      )}
                      aria-hidden
                    />
                  )}
                  <span>{word}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {parsed.encouragement && (
        <p className="leading-relaxed text-amber-800/90">{parsed.encouragement}</p>
      )}
    </div>
  );
}
