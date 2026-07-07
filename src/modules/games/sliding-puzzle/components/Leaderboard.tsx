"use client";

import React from "react";
import { LuClock, LuStar, LuTrash2, LuTrophy } from "react-icons/lu";
import { SlidingPuzzleDifficulty, SlidingPuzzleHighScore } from "../types";
import { slidingPuzzleAudio } from "../utils/audio";

interface LeaderboardProps {
  scores: SlidingPuzzleHighScore[];
  onClearScores: () => void;
}

const DIFFICULTY_LABEL: Record<SlidingPuzzleDifficulty, string> = {
  easy: "Dễ",
  medium: "Vừa",
  hard: "Khó",
};

const DIFFICULTY_BADGE_CLASS: Record<SlidingPuzzleDifficulty, string> = {
  easy: "bg-emerald-100 text-emerald-700",
  medium: "bg-sky-100 text-sky-700",
  hard: "bg-rose-100 text-rose-700",
};

export const Leaderboard: React.FC<LeaderboardProps> = ({
  scores,
  onClearScores,
}) => {
  const filteredScores = scores
    .slice()
    .sort((a, b) => a.timeSpent - b.timeSpent)
    .slice(0, 5);

  const handleClear = () => {
    if (window.confirm("Xoá tất cả kỷ lục?")) {
      slidingPuzzleAudio.playClick();
      onClearScores();
    }
  };

  const formatTime = (secs: number) => {
    const mins = Math.floor(secs / 60);
    const remainingSecs = secs % 60;
    return `${mins}:${remainingSecs.toString().padStart(2, "0")}`;
  };

  return (
    <div className="w-full bg-amber-50 rounded-2xl border border-amber-200 p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <LuTrophy className="w-4 h-4 text-amber-500" />
          <h2 className="font-semibold text-sm text-slate-800">Kỷ lục</h2>
        </div>

        {scores.length > 0 && (
          <button
            type="button"
            onClick={handleClear}
            className="flex items-center gap-1 text-[11px] text-slate-500 hover:text-rose-600 py-1 px-2 rounded-md hover:bg-rose-50 transition font-medium"
          >
            <LuTrash2 className="w-3 h-3" />
            <span>Xoá</span>
          </button>
        )}
      </div>

      {filteredScores.length > 0 ? (
        <div className="space-y-1.5">
          {filteredScores.map((score, idx) => (
            <div
              key={score.id}
              className={`flex items-center justify-between px-3 py-2 rounded-lg transition-colors ${
                idx === 0
                  ? "bg-amber-100/80 border border-amber-200"
                  : "bg-white border border-amber-100"
              }`}
            >
              <div className="flex items-center gap-2.5">
                <span
                  className={`w-6 h-6 flex items-center justify-center rounded-full text-xs font-bold font-mono ${
                    idx === 0
                      ? "bg-amber-400 text-white"
                      : idx === 1
                        ? "bg-sky-400 text-white"
                        : "bg-slate-200 text-slate-700"
                  }`}
                >
                  {idx + 1}
                </span>

                <div className="flex items-center gap-1.5 text-slate-700">
                  <LuClock className="w-3.5 h-3.5 text-sky-500" />
                  <span className="font-semibold text-sm font-mono">
                    {formatTime(score.timeSpent)}
                  </span>
                  <span
                    className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${DIFFICULTY_BADGE_CLASS[score.difficulty]}`}
                  >
                    {DIFFICULTY_LABEL[score.difficulty]}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-6 text-center text-slate-400">
          <LuStar className="w-7 h-7 text-amber-200 mb-1.5" />
          <p className="text-xs">Chưa có kỷ lục nào</p>
        </div>
      )}
    </div>
  );
};

export default Leaderboard;
