"use client";

import { motion } from "framer-motion";

interface ReactionFlyUpProps {
  icon: string;
  x: number;
  y: number;
  onComplete: () => void;
}

export function ReactionFlyUp({ icon, x, y, onComplete }: ReactionFlyUpProps) {
  return (
    <motion.span
      className="fixed z-[9999] pointer-events-none text-5xl drop-shadow-2xl"
      style={{ left: x, top: y, transform: "translate(-50%, -50%)" }}
      initial={{ opacity: 1, scale: 0.5, y: 0 }}
      animate={{
        opacity: 0,
        scale: 1.5,
        y: -180,
      }}
      transition={{
        duration: 0.8,
        ease: [0.22, 0.6, 0.36, 1],
      }}
      onAnimationComplete={onComplete}
      aria-hidden
    >
      {icon}
    </motion.span>
  );
}
