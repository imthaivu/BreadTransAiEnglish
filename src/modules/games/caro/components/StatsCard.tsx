"use client";

import { motion } from "framer-motion";
import { FiAward, FiTrash2 } from "react-icons/fi";
import { Difficulty, GameMode, ScoreState } from "../types";

interface StatsCardProps {
  scores: ScoreState;
  mode: GameMode;
  difficulty: Difficulty;
  onResetScores: () => void;
}

export default function StatsCard({
  scores,
  mode,
  difficulty,
  onResetScores,
}: StatsCardProps) {
  const totalGames = scores.xWins + scores.oWins + scores.draws;
  const winRate =
    totalGames > 0 ? Math.round((scores.xWins / totalGames) * 100) : 0;

  const translateDifficulty = (diff: Difficulty) => {
    switch (diff) {
      case "easy":
        return "Dễ";
      case "medium":
        return "Vừa";
      case "hard":
        return "Khó";
    }
  };

  return (
    <div className="relative border border-[#d2c9bd] bg-[#fbfaf6] rounded-xl shadow-md p-5 pb-4 overflow-hidden caro-notebook-paper">
      <div className="flex border-b-2 border-slate-300 pb-2 mb-4 justify-between items-center caro-handwritten">
        <span className="text-xl font-bold text-slate-800 tracking-wide flex items-center gap-2">
          <FiAward className="w-5 h-5 text-amber-500" />
          Bảng Điểm Học Sinh
        </span>
        <button
          type="button"
          onClick={onResetScores}
          className="text-xs text-red-500 hover:text-red-700 hover:bg-red-50 py-1 px-2.5 rounded border border-red-200 transition bg-white/70 shadow-sm flex items-center gap-1 cursor-pointer font-sans"
          title="Xóa kết quả"
        >
          <FiTrash2 className="w-3 h-3" />
          Xóa
        </button>
      </div>

      <div className="grid grid-cols-2 gap-4 mb-4 font-sans">
        <div className="flex flex-col justify-center space-y-1.5 border-r border-[#afcbeb]/40 pr-3">
          <div className="flex justify-between items-center text-sm">
            <span className="text-slate-600 font-medium">Người chơi X:</span>
            <span className="text-blue-700 font-bold text-lg">
              {scores.xWins}
            </span>
          </div>
          <div className="flex justify-between items-center text-sm">
            <span className="text-slate-600 font-medium">
              {mode === "PvE"
                ? `Máy O (${translateDifficulty(difficulty)}):`
                : "Người chơi O:"}
            </span>
            <span className="text-red-600 font-bold text-lg">
              {scores.oWins}
            </span>
          </div>
          <div className="flex justify-between items-center text-sm">
            <span className="text-slate-600 font-medium">Hòa:</span>
            <span className="text-[#8d7c67] font-bold text-lg">
              {scores.draws}
            </span>
          </div>
        </div>

        <div className="flex flex-col justify-center items-center">
          <div className="text-xs text-slate-500 uppercase tracking-widest font-mono mb-1">
            Tỷ lệ thắng
          </div>
          <motion.div
            className="text-4xl font-extrabold text-blue-800 tracking-tighter caro-handwritten flex items-baseline"
            initial={{ scale: 0.8 }}
            animate={{ scale: 1 }}
            key={winRate}
          >
            {winRate}
            <span className="text-xl text-blue-600">%</span>
          </motion.div>
          <div className="text-[10px] text-slate-400 font-mono mt-1">
            Tổng cộng: {totalGames} trận
          </div>
        </div>
      </div>

      <div className="absolute top-0 right-0 w-16 h-16 pointer-events-none overflow-hidden">
        <div className="absolute top-2 right-[-24px] bg-sky-500/10 text-sky-800 text-[10px] font-bold text-center py-0.5 w-[80px] rotate-45 border-b border-sky-200 uppercase tracking-widest font-mono">
          BreadTrans
        </div>
      </div>
    </div>
  );
}
