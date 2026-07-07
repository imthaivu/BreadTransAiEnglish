"use client";

import { AnimatePresence, motion } from "framer-motion";
import React from "react";
import {
  LuClock,
  LuHourglass,
  LuRotateCcw,
  LuTrophy,
  LuX,
} from "react-icons/lu";
import { SlidingPuzzleDifficulty } from "../types";

interface VictoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  timeSpent: number;
  timeRemaining: number;
  difficulty: SlidingPuzzleDifficulty;
  isWin: boolean;
  imageUrl?: string;
  onRestart: () => void;
}

const DIFFICULTY_LABEL: Record<SlidingPuzzleDifficulty, string> = {
  easy: "Dễ",
  medium: "Vừa",
  hard: "Khó",
};

export const VictoryModal: React.FC<VictoryModalProps> = ({
  isOpen,
  onClose,
  timeSpent,
  timeRemaining,
  difficulty,
  isWin,
  imageUrl,
  onRestart,
}) => {
  const formatTime = (secs: number) => {
    const mins = Math.floor(secs / 60);
    const remainingSecs = secs % 60;
    return `${mins}:${remainingSecs.toString().padStart(2, "0")}`;
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
          />

          <motion.div
            initial={{ scale: 0.9, y: 20, opacity: 0 }}
            animate={{ scale: 1, y: 0, opacity: 1 }}
            exit={{ scale: 0.9, y: 20, opacity: 0 }}
            className={`relative w-full max-w-sm rounded-2xl p-6 shadow-2xl overflow-hidden text-center border ${
              isWin
                ? "bg-amber-50 border-amber-200"
                : "bg-sky-50 border-sky-200"
            }`}
          >
            <button
              type="button"
              onClick={onClose}
              className="absolute top-3 right-3 text-slate-400 hover:text-slate-700 transition p-1 rounded-md"
              aria-label="Đóng"
            >
              <LuX className="w-4 h-4" />
            </button>

            {isWin ? (
              <div className="mx-auto w-14 h-14 flex items-center justify-center rounded-full bg-amber-400 text-white mb-3 shadow-md">
                <LuTrophy className="w-7 h-7" />
              </div>
            ) : (
              <div className="mx-auto w-14 h-14 flex items-center justify-center rounded-full bg-sky-400 text-white mb-3 shadow-md">
                <LuHourglass className="w-7 h-7" />
              </div>
            )}

            <h3 className="font-bold text-xl text-slate-800 mb-1">
              {isWin ? "Hoàn thành!" : "Hết giờ!"}
            </h3>
            <p className="text-xs text-slate-600 mb-4">
              {isWin
                ? `Bạn đã xếp xong bức ảnh ở mức ${DIFFICULTY_LABEL[difficulty]}.`
                : `Thử lại ở mức ${DIFFICULTY_LABEL[difficulty]} nhé!`}
            </p>

            {imageUrl && (
              <div className="relative mx-auto w-24 h-24 rounded-xl overflow-hidden mb-4 shadow border-2 border-white">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={imageUrl}
                  alt="Ảnh đáp án"
                  referrerPolicy="no-referrer"
                  className={`w-full h-full object-cover ${
                    !isWin ? "grayscale opacity-70" : ""
                  }`}
                />
              </div>
            )}

            <div className="grid grid-cols-2 gap-2 mb-5">
              <div className="bg-white rounded-xl p-2.5 flex flex-col items-center">
                <LuClock className="w-4 h-4 text-sky-500 mb-0.5" />
                <span className="text-lg font-mono font-bold text-slate-800 leading-none">
                  {formatTime(timeSpent)}
                </span>
                <span className="text-[10px] text-slate-500 mt-1">đã chơi</span>
              </div>

              <div className="bg-white rounded-xl p-2.5 flex flex-col items-center">
                <LuHourglass className="w-4 h-4 text-amber-500 mb-0.5" />
                <span className="text-lg font-mono font-bold text-slate-800 leading-none">
                  {formatTime(timeRemaining)}
                </span>
                <span className="text-[10px] text-slate-500 mt-1">còn lại</span>
              </div>
            </div>

            <button
              type="button"
              onClick={() => {
                onRestart();
                onClose();
              }}
              className={`w-full py-3 px-6 rounded-xl text-white font-semibold text-sm transition shadow-md active:scale-95 flex items-center justify-center gap-2 ${
                isWin
                  ? "bg-amber-400 hover:bg-amber-500"
                  : "bg-sky-500 hover:bg-sky-600"
              }`}
            >
              <LuRotateCcw className="w-4 h-4" />
              <span>{isWin ? "Chơi tiếp" : "Thử lại"}</span>
            </button>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};

export default VictoryModal;
