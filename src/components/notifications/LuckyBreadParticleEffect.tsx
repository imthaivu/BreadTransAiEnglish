"use client";

import { motion } from "framer-motion";
import { useEffect, useMemo, useState } from "react";

const BREAD_EMOJI = "🍞";

function getRandom(min: number, max: number) {
  return min + Math.random() * (max - min);
}

interface LuckyBreadParticleEffectProps {
  /** Số Lucky breads nhận được (0–3), số icon rơi tương ứng */
  count: number;
}

export function LuckyBreadParticleEffect({ count }: LuckyBreadParticleEffectProps) {
  const [visible, setVisible] = useState(true);

  const particles = useMemo(() => {
    const n = Math.max(0, Math.min(3, count));
    return Array.from({ length: n }, (_, i) => ({
      id: i,
      startX: getRandom(15 + i * 25, 35 + i * 25),
      duration: getRandom(2, 3.2),
      delay: getRandom(0, 0.4),
      xDrift: getRandom(-80, 80),
      size: getRandom(36, 52),
      rotate: getRandom(-45, 45),
    }));
  }, [count]);

  useEffect(() => {
    if (particles.length === 0) {
      setVisible(false);
      return;
    }
    const maxDuration = Math.max(...particles.map((p) => p.duration + p.delay));
    const timer = setTimeout(() => setVisible(false), (maxDuration + 0.5) * 1000);
    return () => clearTimeout(timer);
  }, [particles]);

  if (!visible || particles.length === 0) return null;

  return (
    <div className="fixed inset-0 z-[9998] pointer-events-none" aria-hidden>
      <div className="absolute inset-0 flex items-end overflow-hidden">
        {particles.map((p) => (
          <motion.span
            key={p.id}
            className="absolute will-change-transform"
            style={{
              fontSize: p.size,
              left: `${p.startX}%`,
              bottom: "10%",
              marginLeft: -p.size / 2,
            }}
            initial={{ opacity: 1, scale: 1, x: 0, y: 0, rotate: 0 }}
            animate={{
              opacity: 0,
              scale: 0.2,
              x: p.xDrift,
              y: "-80vh",
              rotate: p.rotate,
            }}
            transition={{
              duration: p.duration,
              delay: p.delay,
              ease: [0.22, 0.6, 0.36, 1],
            }}
          >
            {BREAD_EMOJI}
          </motion.span>
        ))}
      </div>
    </div>
  );
}
