"use client";

import { motion } from "framer-motion";
import { SafeImage as Image } from "@/components/ui/SafeImage";
import { useEffect, useMemo, useState } from "react";

const PARTICLE_COUNT = 24;
const AVATAR_COUNT = 5;

interface AdmirationParticleEffectProps {
  /** Emoji icon for the reaction (👍 ❤️ 😂 😱) */
  icon: string;
  /** Avatar URL of sender (người tặng) */
  senderAvatarUrl?: string;
  /** Avatar URL of receiver (người nhận) */
  receiverAvatarUrl?: string;
  /** Fallback initial when no sender avatar */
  senderInitial?: string;
  /** Fallback initial when no receiver avatar */
  receiverInitial?: string;
}

function getRandom(min: number, max: number) {
  return min + Math.random() * (max - min);
}

function AvatarParticle({
  avatarUrl,
  fallbackInitial,
  config,
}: {
  avatarUrl: string;
  fallbackInitial: string;
  config: { startX: number; duration: number; delay: number; xDrift: number; size: number; rotate: number };
}) {
  const px = Math.round(config.size);
  return (
    <motion.div
      className="absolute overflow-hidden rounded-full will-change-transform ring-2 ring-white/80 shadow-lg"
      style={{
        width: px,
        height: px,
        left: `${config.startX}%`,
        bottom: "10%",
        marginLeft: -px / 2,
      }}
      initial={{ opacity: 1, scale: 1, x: 0, y: 0, rotate: 0 }}
      animate={{
        opacity: 0,
        scale: 0.3,
        x: config.xDrift,
        y: "-80vh",
        rotate: config.rotate,
      }}
      transition={{
        duration: config.duration,
        delay: config.delay,
        ease: [0.22, 0.6, 0.36, 1],
      }}
    >
      {avatarUrl ? (
        <Image
          src={avatarUrl}
          alt=""
          width={px}
          height={px}
          sizes={`${px}px`}
          className="w-full h-full object-cover"
        />
      ) : (
        <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-gray-200 to-gray-300 text-gray-600 font-bold text-xl">
          {fallbackInitial}
        </div>
      )}
    </motion.div>
  );
}

export function AdmirationParticleEffect({
  icon,
  senderAvatarUrl = "",
  receiverAvatarUrl = "",
  senderInitial = "T",
  receiverInitial = "N",
}: AdmirationParticleEffectProps) {
  const [visible, setVisible] = useState(true);

  const particles = useMemo(() => {
    return Array.from({ length: PARTICLE_COUNT }, (_, i) => ({
      id: i,
      startX: getRandom(5, 95),
      duration: getRandom(2, 3.2),
      delay: getRandom(0, 0.4),
      xDrift: getRandom(-120, 120),
      size: getRandom(28, 48),
      rotate: getRandom(-45, 45),
    }));
  }, []);

  const avatarParticles = useMemo(() => {
    return Array.from({ length: AVATAR_COUNT }, (_, i) => ({
      id: `avatar-${i}`,
      startX: getRandom(15, 85),
      duration: getRandom(2.2, 3.4),
      delay: getRandom(0.1, 0.5),
      xDrift: getRandom(-100, 100),
      size: getRandom(56, 88),
      rotate: getRandom(-25, 25),
      isSender: i < 3,
    }));
  }, []);

  useEffect(() => {
    const maxDuration = Math.max(
      ...particles.map((p) => p.duration + p.delay),
      ...avatarParticles.map((p) => p.duration + p.delay)
    );
    const timer = setTimeout(() => setVisible(false), (maxDuration + 0.5) * 1000);

    return () => clearTimeout(timer);
  }, [particles, avatarParticles]);

  if (!visible) return null;

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
            {icon}
          </motion.span>
        ))}

        {avatarParticles.map((p) => (
          <AvatarParticle
            key={p.id}
            avatarUrl={p.isSender ? senderAvatarUrl : receiverAvatarUrl}
            fallbackInitial={p.isSender ? senderInitial : receiverInitial}
            config={{
              startX: p.startX,
              duration: p.duration,
              delay: p.delay,
              xDrift: p.xDrift,
              size: p.size,
              rotate: p.rotate,
            }}
          />
        ))}
      </div>
    </div>
  );
}
