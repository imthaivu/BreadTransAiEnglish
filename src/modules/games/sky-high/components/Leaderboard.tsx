"use client";

import { useEffect, useState } from "react";
import { FiCalendar, FiX } from "react-icons/fi";
import { LeaderboardEntry } from "../types";
import { SKY_HIGH_SCORES_KEY } from "../utils/data";

interface LeaderboardProps {
  currentScore?: number;
  onClose?: () => void;
  hasSubmitted?: boolean;
}

export default function Leaderboard({
  currentScore,
  onClose,
  hasSubmitted = false,
}: LeaderboardProps) {
  const [scores, setScores] = useState<LeaderboardEntry[]>([]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = localStorage.getItem(SKY_HIGH_SCORES_KEY);
      if (!raw) {
        setScores([]);
        return;
      }
      const parsed = JSON.parse(raw) as LeaderboardEntry[];
      parsed.sort((a, b) => b.score - a.score || b.height - a.height);
      setScores(parsed.slice(0, 5));
    } catch {
      setScores([]);
    }
  }, []);

  return (
    <div
      className="w-full max-w-md mx-auto bg-white/80 backdrop-blur-md rounded-2xl p-5 shadow-sm border border-white/60 font-sans text-slate-900"
      id="leaderboard-card"
    >
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wide">
          Lịch sử lượt chơi
        </h2>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-md transition-colors"
            aria-label="Đóng"
          >
            <FiX className="w-4 h-4" />
          </button>
        )}
      </div>

      {currentScore !== undefined && (
        <div className="mb-4">
          {hasSubmitted ? (
            <div className="bg-amber-100/70 border border-amber-200/70 p-3 rounded-xl text-center backdrop-blur-sm">
              <div className="text-[10px] font-mono font-bold text-amber-700 uppercase tracking-widest mb-1">
                Kỷ lục mới
              </div>
              <div className="text-sm font-bold text-slate-900">
                {currentScore} vali
              </div>
            </div>
          ) : (
            <div className="bg-white/60 border border-white/70 p-3 rounded-xl text-center backdrop-blur-sm">
              <div className="text-[10px] font-mono font-bold text-slate-600 uppercase tracking-widest mb-1">
                Lượt vừa rồi
              </div>
              <div className="text-sm font-bold text-slate-900">
                {currentScore} vali
              </div>
            </div>
          )}
        </div>
      )}

      <div className="space-y-1.5 max-h-56 overflow-y-auto pr-1">
        {scores.map((score, index) => (
          <div
            key={`${score.date}-${score.score}-${index}`}
            className="flex items-center justify-between p-2.5 rounded-lg bg-white/55 border border-white/60 backdrop-blur-sm"
          >
            <div className="flex items-center gap-2 text-[11px] text-slate-500">
              <FiCalendar className="w-3 h-3 opacity-70" />
              {score.date}
            </div>
            <div className="text-right">
              <span className="text-sm font-bold text-slate-900 tabular-nums">
                {score.score}
              </span>
              <span className="text-[11px] text-slate-500 ml-1">vali</span>
            </div>
          </div>
        ))}
        {scores.length === 0 && (
          <div className="text-center py-5 text-slate-500 text-xs border border-dashed border-white/70 rounded-xl bg-white/40 backdrop-blur-sm">
            Chưa có lượt chơi nào.
          </div>
        )}
      </div>
    </div>
  );
}
