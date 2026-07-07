"use client";

import { AnimatePresence, motion } from "framer-motion";
import React from "react";
import { Cup } from "../types";
import { GameTheme } from "../utils/themes";

interface CupComponentProps {
  cup: Cup;
  hasBall: boolean;
  theme: GameTheme;
  isSelectable: boolean;
  isSelected: boolean;
  isCorrect: boolean | null;
  positions: string[];
  onSelect: () => void;
}

export const CupComponent: React.FC<CupComponentProps> = ({
  cup,
  hasBall,
  theme,
  isSelectable,
  isSelected,
  isCorrect,
  positions,
  onSelect,
}) => {
  const leftPos = positions[cup.index];
  const liftY = cup.isLifting ? -100 : 0;
  const liftRotate = cup.isLifting ? -8 : 0;
  const shadowScale = cup.isLifting ? 0.4 : 1.0;
  const shadowOpacity = cup.isLifting ? 0.25 : 0.6;

  return (
    <motion.div
      layout
      id={cup.id}
      transition={{ type: "spring", stiffness: 160, damping: 22, mass: 1.1 }}
      style={{ left: leftPos, x: "-50%" }}
      className="absolute bottom-16 w-32 md:w-44 flex flex-col items-center justify-end h-80 z-10 select-none"
    >
      <AnimatePresence>
        {hasBall && (
          <motion.div
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0, opacity: 0 }}
            transition={{ type: "spring", damping: 15 }}
            className="absolute bottom-4 z-0 flex flex-col items-center justify-center"
          >
            <div
              className={`w-7 h-7 sm:w-10 sm:h-10 rounded-full ${theme.ballStyle} relative shadow-lg ${theme.ballGlow} transition-all duration-300`}
            >
              <div className="absolute top-1 left-1.5 w-2 h-2 sm:w-3 sm:h-3 rounded-full bg-white/50 filter blur-[0.5px]" />
            </div>
            <div className="w-8 sm:w-10 h-2 bg-black/40 rounded-full filter blur-[2px] mt-1" />
          </motion.div>
        )}
      </AnimatePresence>

      <motion.div
        animate={{ scale: shadowScale, opacity: shadowOpacity }}
        transition={{ duration: 0.3 }}
        className="absolute bottom-1 w-24 md:w-32 h-4 bg-amber-900/40 rounded-full filter blur-[4px] z-[5] pointer-events-none"
      />

      <motion.div
        animate={{ y: liftY, rotate: liftRotate }}
        whileHover={isSelectable ? { scale: 1.05, y: -8 } : {}}
        whileTap={isSelectable ? { scale: 0.95 } : {}}
        transition={{ type: "spring", stiffness: 140, damping: 17 }}
        onClick={() => {
          if (isSelectable) onSelect();
        }}
        className={`relative w-28 h-40 md:w-36 md:h-52 flex flex-col items-center justify-start rounded-t-3xl border-t-4 border-x border-b border-white/40 overflow-visible shadow-xl z-20 ${
          isSelectable ? "cursor-pointer hover:shadow-amber-400/40" : ""
        } ${
          isSelected ? "ring-2 ring-amber-500 shadow-amber-400/40" : ""
        } ${theme.cupColor}`}
      >
        <div
          className={`absolute inset-0 rounded-t-[1.3rem] overflow-hidden ${theme.cupHighlight} border-t border-white/40 pointer-events-none`}
        />

        <div
          className={`absolute -top-5 w-8 h-5 rounded-full border-t border-white/60 shadow-md ${theme.cupCap}`}
        />
        <div className="absolute -top-2 w-3 h-2 bg-white/50 rounded-full filter blur-[1px]" />

        <div className="absolute top-1/4 w-full h-1.5 bg-amber-900/15 flex flex-col justify-between border-y border-white/30" />
        <div className="absolute top-[60%] w-full h-2.5 bg-amber-900/15 flex flex-col justify-between border-y border-white/30" />

        <div className="absolute top-0 right-4 w-1/4 h-full bg-white/15 filter blur-[2px] skew-x-3 pointer-events-none" />

        <div className="absolute bottom-0 left-0 w-full h-2 bg-amber-900/25 rounded-b-sm border-t border-amber-900/15" />

        {isCorrect !== null && isSelected && (
          <div
            className={`absolute inset-0 -m-1 rounded-t-3xl border-2 animate-pulse pointer-events-none ${
              isCorrect
                ? "border-emerald-400 shadow-[0_0_20px_rgba(52,211,153,0.4)]"
                : "border-rose-400 shadow-[0_0_20px_rgba(248,113,113,0.4)]"
            }`}
          />
        )}
      </motion.div>

    </motion.div>
  );
};

export default CupComponent;
