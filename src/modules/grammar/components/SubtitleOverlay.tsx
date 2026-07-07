"use client";

import { getActiveCue, parseSubtitles, SubtitleCue } from "@/utils/subtitles";
import { useMemo } from "react";

interface SubtitleOverlayProps {
  content: string;
  currentTimeSec: number;
  emptyHint?: string;
}

export default function SubtitleOverlay({
  content,
  currentTimeSec,
  emptyHint,
}: SubtitleOverlayProps) {
  const cues = useMemo(() => parseSubtitles(content), [content]);
  const active: SubtitleCue | null = useMemo(
    () => getActiveCue(cues, currentTimeSec),
    [cues, currentTimeSec]
  );

  if (!content.trim()) {
    if (!emptyHint) return null;
    return (
      <div className="pointer-events-none absolute inset-x-0 bottom-[12%] z-[100] flex justify-center px-4">
        <p className="rounded bg-black/60 px-3 py-1.5 text-sm text-gray-300">
          {emptyHint}
        </p>
      </div>
    );
  }

  if (cues.length === 0) {
    return (
      <div className="pointer-events-none absolute inset-x-0 bottom-[12%] z-[100] flex justify-center px-4">
        <p className="rounded bg-black/60 px-3 py-1.5 text-sm text-gray-300">
          Không đọc được phụ đề (kiểm tra định dạng SRT/VTT)
        </p>
      </div>
    );
  }

  if (!active) return null;

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-[12%] z-[100] flex justify-center px-4">
      <p className="max-w-3xl whitespace-pre-wrap rounded bg-black/75 px-4 py-2 text-center text-base leading-snug text-white shadow-lg">
        {active.text}
      </p>
    </div>
  );
}
