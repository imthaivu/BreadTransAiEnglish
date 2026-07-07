"use client";

import {
  FiCornerUpLeft,
  FiRotateCcw,
  FiShield,
  FiShieldOff,
  FiUsers,
} from "react-icons/fi";
import { Difficulty, GameMode } from "../types";
import { sounds } from "../utils/sounds";

interface CaroDashboardProps {
  mode: GameMode;
  difficulty: Difficulty;
  blockTwoEnds: boolean;
  canUndo: boolean;
  /** Đang ở chế độ ranked (khoá PvP / chặn 2 đầu / undo cả khi chưa bắt đầu). */
  rankedMode?: boolean;
  /** Đã tiêu vé & bắt đầu lượt ranked (khoá thêm cả độ khó). */
  rankedLocked?: boolean;
  onSetMode: (mode: GameMode) => void;
  onSetDifficulty: (diff: Difficulty) => void;
  onSetBlockTwoEnds: (val: boolean) => void;
  onRestart: () => void;
  onUndo: () => void;
}

const DIFF_LABEL: Record<Difficulty, string> = {
  easy: "Dễ",
  medium: "Vừa",
  hard: "Khó",
};

const DIFF_ACTIVE_CLS: Record<Difficulty, string> = {
  easy: "bg-emerald-500 text-white border-emerald-500 ring-2 ring-emerald-300/40",
  medium: "bg-amber-500 text-white border-amber-500 ring-2 ring-amber-300/40",
  hard: "bg-rose-500 text-white border-rose-500 ring-2 ring-rose-300/40",
};

const DIFF_INACTIVE_TEXT_CLS: Record<Difficulty, string> = {
  easy: "text-sky-400",
  medium: "text-amber-500",
  hard: "text-rose-500",
};

export default function CaroDashboard({
  mode,
  difficulty,
  blockTwoEnds,
  canUndo,
  rankedMode = false,
  rankedLocked = false,
  onSetMode,
  onSetDifficulty,
  onSetBlockTwoEnds,
  onRestart,
  onUndo,
}: CaroDashboardProps) {
  const handlePickDifficulty = (d: Difficulty) => {
    if (rankedMode) return;
    sounds.playClick();
    if (!rankedMode && mode !== "PvE") onSetMode("PvE");
    onSetDifficulty(d);
  };

  const handlePickPvP = () => {
    if (rankedMode) return;
    sounds.playClick();
    if (mode !== "PvP") onSetMode("PvP");
  };

  const isPvP = mode === "PvP";
  const undoDisabled = !canUndo || rankedMode;

  return (
    <div className="w-full bg-white border border-[#d2c9bd] rounded-xl shadow-sm p-2 flex flex-row flex-wrap items-center gap-1.5">
      <button
        type="button"
        onClick={() => {
          sounds.playClick();
          onRestart();
        }}
        title="Ván mới"
        aria-label="Ván mới"
        className="h-9 px-2.5 sm:px-3 rounded-lg bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-white font-semibold text-sm shadow border border-amber-600/30 flex items-center justify-center gap-1.5 cursor-pointer transition"
      >
        <FiRotateCcw className="w-4 h-4" />
        <span className="hidden sm:inline">
          {rankedLocked ? "Bỏ cuộc" : "Ván Mới"}
        </span>
      </button>

      <button
        type="button"
        onClick={() => {
          if (undoDisabled) return;
          onUndo();
        }}
        disabled={undoDisabled}
        title="Quay lại bước trước"
        aria-label="Quay lại"
        className={`h-9 px-2.5 sm:px-3 rounded-lg flex items-center justify-center gap-1.5 text-sm font-medium transition border ${
          undoDisabled
            ? "bg-slate-100 border-slate-200 text-slate-400 cursor-not-allowed"
            : "bg-white border-slate-300 text-slate-700 hover:bg-slate-50 cursor-pointer"
        }`}
      >
        <FiCornerUpLeft className="w-4 h-4" />
        <span className="hidden sm:inline">Quay Lại</span>
      </button>

      <span className="hidden sm:block w-px h-6 bg-slate-200 mx-0.5" />

      <div className="flex items-center gap-1">
        {(["easy", "medium", "hard"] as Difficulty[]).map((d) => {
          const isActive = mode === "PvE" && difficulty === d;
          return (
            <button
              key={d}
              type="button"
              onClick={() => handlePickDifficulty(d)}
              title={`Chơi với máy — ${DIFF_LABEL[d]}`}
              aria-label={`Chơi với máy — ${DIFF_LABEL[d]}`}
              disabled={rankedMode}
              className={`h-9 px-2 sm:px-3 rounded-lg flex items-center justify-center font-semibold transition border text-xs sm:text-sm ${
                rankedMode
                  ? "bg-slate-100 border-slate-200 text-slate-400 cursor-not-allowed"
                  : `cursor-pointer ${
                      isActive
                        ? DIFF_ACTIVE_CLS[d]
                        : `bg-slate-50 border-slate-200 hover:bg-slate-100 ${DIFF_INACTIVE_TEXT_CLS[d]}`
                    }`
              }`}
            >
              {DIFF_LABEL[d]}
            </button>
          );
        })}
      </div>

      <button
        type="button"
        onClick={handlePickPvP}
        disabled={rankedMode}
        title="Chơi 2 người trên cùng máy"
        aria-label="Chơi 2 người"
        className={`h-9 px-2.5 sm:px-3 rounded-lg flex items-center justify-center gap-1.5 text-sm font-semibold transition border ${
          rankedMode
            ? "bg-slate-100 border-slate-200 text-slate-400 cursor-not-allowed"
            : `cursor-pointer ${
                isPvP
                  ? "bg-indigo-500 text-white border-indigo-500 ring-2 ring-indigo-300/40"
                  : "bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100"
              }`
        }`}
      >
        <FiUsers className="w-4 h-4" />
        <span className="hidden sm:inline">1 vs 1</span>
      </button>

      <button
        type="button"
        onClick={() => {
          if (rankedMode) return;
          sounds.playClick();
          onSetBlockTwoEnds(!blockTwoEnds);
        }}
        disabled={rankedMode}
        title={
          blockTwoEnds
            ? "Đang BẬT: 5 quân bị chặn cả 2 đầu không tính thắng"
            : "Đang TẮT: 5 quân vẫn tính thắng dù bị chặn"
        }
        aria-label="Luật chặn 2 đầu"
        aria-pressed={blockTwoEnds}
        className={`h-9 px-2.5 sm:px-3 rounded-lg flex items-center justify-center gap-1.5 text-sm font-medium transition border ${
          rankedMode
            ? "bg-slate-100 border-slate-200 text-slate-400 cursor-not-allowed"
            : `cursor-pointer ${
                blockTwoEnds
                  ? "bg-emerald-50 border-emerald-400 text-emerald-700"
                  : "bg-slate-50 border-slate-200 text-slate-500 hover:bg-slate-100"
              }`
        }`}
      >
        {blockTwoEnds ? (
          <FiShield className="w-4 h-4" />
        ) : (
          <FiShieldOff className="w-4 h-4" />
        )}
        <span className="hidden sm:inline">Chặn 2 đầu</span>
      </button>
    </div>
  );
}
