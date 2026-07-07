"use client";

import { useEffect } from "react";

interface ConfettiProps {
  show: boolean;
  duration?: number; // milliseconds
  intensity?: "normal" | "high";
}

// Lightweight confetti: fewer particles, opacity-only animation (GPU friendly)
export default function Confetti({ show, duration = 2000, intensity = "normal" }: ConfettiProps) {
  useEffect(() => {
    if (!show) return;

    const endTime = Date.now() + duration;
    const isHighIntensity = intensity === "high";
    const particlesPerTick = isHighIntensity ? 4 : 1;
    const tickMs = isHighIntensity ? 90 : 250;
    const particleSize = isHighIntensity ? 10 : 8;
    const fadeDurationMs = isHighIntensity ? 1900 : 1500;

    const createConfetti = () => {
      const colors = [
        "#ff6b6b",
        "#4ecdc4",
        "#45b7d1",
        "#96ceb4",
        "#feca57",
        "#ff9ff3",
      ];
      const confetti = document.createElement("div");

      confetti.style.position = "fixed";
      confetti.style.left = Math.random() * 100 + "vw";
      confetti.style.top = "-10px";
      confetti.style.width = `${particleSize}px`;
      confetti.style.height = `${particleSize}px`;
      confetti.style.backgroundColor =
        colors[Math.floor(Math.random() * colors.length)];
      confetti.style.borderRadius = "50%";
      confetti.style.pointerEvents = "none";
      confetti.style.zIndex = "9999";
      confetti.style.animation = `confetti-fade ${fadeDurationMs}ms ease-out forwards`;

      document.body.appendChild(confetti);

      setTimeout(() => {
        if (confetti.parentNode) {
          confetti.parentNode.removeChild(confetti);
        }
      }, fadeDurationMs);
    };

    const interval = setInterval(() => {
      if (Date.now() < endTime) {
        for (let i = 0; i < particlesPerTick; i += 1) {
          createConfetti();
        }
      } else {
        clearInterval(interval);
      }
    }, tickMs);

    return () => clearInterval(interval);
  }, [show, duration, intensity]);

  return null;
}
