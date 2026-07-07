"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useCallback, useEffect, useLayoutEffect, useState } from "react";
import { createPortal } from "react-dom";

export type MovieGuideTourPlacement = "top" | "bottom" | "left" | "right" | "auto";

export interface MovieGuideTourStep {
  target: () => HTMLElement | null;
  title: string;
  body: string;
  placement?: MovieGuideTourPlacement;
}

interface MoviePlayerGuideTourProps {
  open: boolean;
  steps: MovieGuideTourStep[];
  /** Chỉ gọi khi người dùng bấm "Đã hiểu" ở bước cuối. */
  onComplete: () => void;
}

interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
}

const PAD = 8;
const CARD_GAP = 12;
const CARD_MAX_W = 320;

function measureTarget(getTarget: () => HTMLElement | null): Rect | null {
  const el = getTarget();
  if (!el) return null;
  const r = el.getBoundingClientRect();
  if (r.width <= 0 || r.height <= 0) return null;
  return {
    top: r.top - PAD,
    left: r.left - PAD,
    width: r.width + PAD * 2,
    height: r.height + PAD * 2,
  };
}

function resolvePlacement(
  rect: Rect,
  preferred: MovieGuideTourPlacement
): Exclude<MovieGuideTourPlacement, "auto"> {
  if (preferred !== "auto") return preferred;
  const spaceBelow = window.innerHeight - (rect.top + rect.height);
  const spaceAbove = rect.top;
  if (spaceBelow >= 160) return "bottom";
  if (spaceAbove >= 160) return "top";
  return window.innerWidth - (rect.left + rect.width) >= CARD_MAX_W + CARD_GAP
    ? "right"
    : "left";
}

function cardPosition(
  rect: Rect,
  placement: Exclude<MovieGuideTourPlacement, "auto">
): { top: number; left: number } {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  let top = 0;
  let left = 0;

  switch (placement) {
    case "bottom":
      top = rect.top + rect.height + CARD_GAP;
      left = rect.left + rect.width / 2 - CARD_MAX_W / 2;
      break;
    case "top":
      top = rect.top - CARD_GAP - 180;
      left = rect.left + rect.width / 2 - CARD_MAX_W / 2;
      break;
    case "right":
      top = rect.top + rect.height / 2 - 90;
      left = rect.left + rect.width + CARD_GAP;
      break;
    case "left":
      top = rect.top + rect.height / 2 - 90;
      left = rect.left - CARD_GAP - CARD_MAX_W;
      break;
  }

  left = Math.max(12, Math.min(left, vw - CARD_MAX_W - 12));
  top = Math.max(12, Math.min(top, vh - 200));
  return { top, left };
}

export function MoviePlayerGuideTour({
  open,
  steps,
  onComplete,
}: MoviePlayerGuideTourProps) {
  const [mounted, setMounted] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const [targetRect, setTargetRect] = useState<Rect | null>(null);

  const step = steps[stepIndex];
  const isLast = stepIndex >= steps.length - 1;

  const updateRect = useCallback(() => {
    if (!step) {
      setTargetRect(null);
      return;
    }
    setTargetRect(measureTarget(step.target));
  }, [step]);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!open) {
      setStepIndex(0);
      setTargetRect(null);
    }
  }, [open]);

  useLayoutEffect(() => {
    if (!open || !step) return;
    updateRect();
    const onLayout = () => updateRect();
    window.addEventListener("resize", onLayout);
    window.addEventListener("scroll", onLayout, true);
    return () => {
      window.removeEventListener("resize", onLayout);
      window.removeEventListener("scroll", onLayout, true);
    };
  }, [open, step, stepIndex, updateRect]);

  const handleNext = () => {
    if (isLast) {
      onComplete();
      return;
    }
    setStepIndex((i) => i + 1);
  };

  if (!mounted || !open || steps.length === 0 || !step) return null;

  const placement = targetRect
    ? resolvePlacement(targetRect, step.placement ?? "auto")
    : "bottom";
  const cardPos = targetRect
    ? cardPosition(targetRect, placement)
    : { top: window.innerHeight / 2 - 100, left: window.innerWidth / 2 - CARD_MAX_W / 2 };

  const content = (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[10050]"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          role="dialog"
          aria-modal="true"
          aria-label="Hướng dẫn xem phim"
        >
          {targetRect ? (
            <>
              <div
                className="pointer-events-auto absolute left-0 right-0 top-0 bg-black/78"
                style={{ height: Math.max(0, targetRect.top) }}
                aria-hidden
              />
              <div
                className="pointer-events-auto absolute left-0 right-0 bottom-0 bg-black/78"
                style={{
                  top: targetRect.top + targetRect.height,
                }}
                aria-hidden
              />
              <div
                className="pointer-events-auto absolute bg-black/78"
                style={{
                  top: targetRect.top,
                  left: 0,
                  width: Math.max(0, targetRect.left),
                  height: targetRect.height,
                }}
                aria-hidden
              />
              <div
                className="pointer-events-auto absolute bg-black/78"
                style={{
                  top: targetRect.top,
                  left: targetRect.left + targetRect.width,
                  right: 0,
                  height: targetRect.height,
                }}
                aria-hidden
              />
              <div
                className="pointer-events-none absolute rounded-lg ring-2 ring-amber-400/90"
                style={{
                  top: targetRect.top,
                  left: targetRect.left,
                  width: targetRect.width,
                  height: targetRect.height,
                }}
              />
            </>
          ) : (
            <div className="pointer-events-auto absolute inset-0 bg-black/78" aria-hidden />
          )}

          <motion.div
            key={stepIndex}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2 }}
            className="absolute z-[10051] w-[min(320px,calc(100vw-24px))] rounded-xl border border-amber-400/40 bg-[#1a1f27] p-4 shadow-2xl"
            style={{ top: cardPos.top, left: cardPos.left }}
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-xs font-medium text-amber-400/90 mb-1">
              Bước {stepIndex + 1} / {steps.length}
            </p>
            <h3 className="text-base font-bold text-slate-100 mb-2">{step.title}</h3>
            <p className="text-sm text-slate-300 leading-relaxed mb-4">{step.body}</p>
            <div className="flex items-center justify-end">
              <button
                type="button"
                onClick={handleNext}
                className="px-4 py-1.5 text-sm font-semibold rounded-lg bg-amber-400 text-slate-900 hover:bg-amber-300 transition-colors"
              >
                {isLast ? "Đã hiểu" : "Tiếp theo"}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );

  return createPortal(content, document.body);
}
