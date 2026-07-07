"use client";

import { SafeImage as Image } from "@/components/ui/SafeImage";
import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";

interface RewardPopupProps {
  open: boolean;
  /** Số bánh kiếm được ở ván vừa rồi. */
  reward: number;
  /** Có thắng ván không (để đổi lời chúc). */
  won?: boolean;
  /** Đang chờ server tính thưởng — hiện ngay popup ở trạng thái loading. */
  loading?: boolean;
  /** Lớp z-index của overlay. Mặc định z-[60]; truyền cao hơn khi cần nằm trên
   *  các overlay khác (vd. trong GameHost phải vượt FinishedOverlay z-[10001]). */
  zIndexClassName?: string;
  onClose: () => void;
}

const CONFETTI_COLORS = [
  "#f59e0b",
  "#fbbf24",
  "#fb923c",
  "#f472b6",
  "#34d399",
  "#60a5fa",
];

type Confetti = {
  id: number;
  angle: number;
  distance: number;
  size: number;
  color: string;
  delay: number;
  rotate: number;
};

/**
 * Popup khoe số bánh kiếm được sau mỗi ván chơi bằng vé.
 * Dùng chung cho tất cả game (gắn ở GameList sau khi finish ranked).
 */
export function RewardPopup({
  open,
  reward,
  won = true,
  loading = false,
  zIndexClassName = "z-[60]",
  onClose,
}: RewardPopupProps) {
  const hasReward = reward > 0;
  const isPenalty = reward < 0;
  const [display, setDisplay] = useState(0);

  // Đếm dần số bánh cho cuốn hút (chạy cả khi bị trừ — đếm xuống số âm).
  useEffect(() => {
    if (!open || loading || reward === 0) {
      setDisplay(0);
      return;
    }
    let raf = 0;
    const start = performance.now();
    const duration = 900;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplay(Math.round(eased * reward));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [open, reward, loading]);

  // Tạo các mảnh confetti mỗi lần mở (chỉ khi có thưởng).
  const confetti = useMemo<Confetti[]>(() => {
    if (!open || loading || !hasReward) return [];
    return Array.from({ length: 28 }, (_, i) => ({
      id: i,
      angle: (Math.PI * 2 * i) / 28 + Math.random() * 0.4,
      distance: 90 + Math.random() * 140,
      size: 7 + Math.random() * 8,
      color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
      delay: Math.random() * 0.15,
      rotate: Math.random() * 360,
    }));
  }, [open, hasReward, loading]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className={`fixed inset-0 ${zIndexClassName} flex items-center justify-center p-4`}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={loading ? undefined : onClose}
        >
          <div className="absolute inset-0 bg-slate-900/55 backdrop-blur-sm" />

          <motion.div
            className="relative w-full max-w-[300px] overflow-hidden rounded-3xl border border-amber-200 bg-gradient-to-b from-amber-50 to-white px-6 py-7 text-center shadow-2xl"
            initial={{ scale: 0.6, y: 24, rotate: -4, opacity: 0 }}
            animate={{ scale: 1, y: 0, rotate: 0, opacity: 1 }}
            exit={{ scale: 0.7, y: 20, opacity: 0 }}
            transition={{ type: "spring", stiffness: 320, damping: 18 }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Tia sáng xoay phía sau bánh */}
            {hasReward && (
              <motion.div
                aria-hidden
                className="pointer-events-none absolute left-1/2 top-[88px] h-56 w-56 -translate-x-1/2 -translate-y-1/2 opacity-60"
                style={{
                  background:
                    "conic-gradient(from 0deg, rgba(251,191,36,0.35), transparent 25%, rgba(251,191,36,0.35) 50%, transparent 75%, rgba(251,191,36,0.35))",
                  maskImage:
                    "radial-gradient(circle, black 0%, transparent 70%)",
                  WebkitMaskImage:
                    "radial-gradient(circle, black 0%, transparent 70%)",
                }}
                animate={{ rotate: 360 }}
                transition={{ duration: 8, ease: "linear", repeat: Infinity }}
              />
            )}

            {/* Confetti */}
            <div className="pointer-events-none absolute left-1/2 top-[88px] h-0 w-0">
              {confetti.map((c) => (
                <motion.span
                  key={c.id}
                  className="absolute block rounded-[2px]"
                  style={{
                    width: c.size,
                    height: c.size * 0.6,
                    backgroundColor: c.color,
                  }}
                  initial={{ x: 0, y: 0, opacity: 1, rotate: 0 }}
                  animate={{
                    x: Math.cos(c.angle) * c.distance,
                    y: Math.sin(c.angle) * c.distance,
                    opacity: 0,
                    rotate: c.rotate,
                  }}
                  transition={{
                    duration: 1.1,
                    delay: c.delay,
                    ease: "easeOut",
                  }}
                />
              ))}
            </div>

            <div className="relative">
              <motion.div
                className="mx-auto flex h-24 w-24 items-center justify-center"
                animate={
                  hasReward || loading
                    ? { y: [0, -8, 0] }
                    : { rotate: [0, -6, 6, 0] }
                }
                transition={{
                  duration: hasReward || loading ? 1.6 : 1.2,
                  repeat: Infinity,
                  ease: "easeInOut",
                }}
              >
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{
                    delay: 0.1,
                    type: "spring",
                    stiffness: 400,
                    damping: 14,
                  }}
                >
                  <Image
                    src="/assets/images/dorayaki.png"
                    alt="Bánh"
                    width={96}
                    height={96}
                    className={`drop-shadow-lg ${
                      hasReward || loading ? "" : "opacity-60 grayscale"
                    }`}
                  />
                </motion.div>
              </motion.div>

              {loading ? (
                <>
                  <h3 className="mt-3 text-lg font-extrabold text-slate-800">
                    Đang tính bánh…
                  </h3>
                  <div className="mt-2 flex items-center justify-center gap-2 text-amber-600">
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-amber-300 border-t-amber-600" />
                    <span className="text-sm font-semibold">
                      Tổng kết phần thưởng
                    </span>
                  </div>
                </>
              ) : (
                <>
                  <h3 className="mt-3 text-lg font-extrabold text-slate-800">
                    {isPenalty
                      ? "Điểm lẻ — bị phạt!"
                      : hasReward
                        ? "Tuyệt vời!"
                        : won
                          ? "Suýt nữa rồi!"
                          : "Cố lên nhé!"}
                  </h3>

                  {hasReward ? (
                    <div className="mt-1 flex items-end justify-center gap-1">
                      <span className="text-5xl font-black leading-none text-amber-500 tabular-nums">
                        +{display}
                      </span>
                      <span className="mb-1 text-sm font-bold text-amber-600">
                        bánh
                      </span>
                    </div>
                  ) : isPenalty ? (
                    <>
                      <div className="mt-1 flex items-end justify-center gap-1">
                        <span className="text-5xl font-black leading-none text-rose-500 tabular-nums">
                          {display}
                        </span>
                        <span className="mb-1 text-sm font-bold text-rose-500">
                          bánh
                        </span>
                      </div>
                      <p className="mt-1 text-xs font-medium text-slate-500">
                        Điểm lẻ lớn hơn 10 bị trừ bánh. Nhắm số chẵn nhé!
                      </p>
                    </>
                  ) : (
                    <p className="mt-1 text-sm font-medium text-slate-500">
                       Xém thắng rùi nè
                    </p>
                  )}

                  <button
                    type="button"
                    onClick={onClose}
                    className="mt-5 w-full rounded-xl bg-gradient-to-r from-amber-400 to-orange-500 py-2.5 text-sm font-bold uppercase tracking-wide text-white shadow-md transition hover:from-amber-300 hover:to-orange-400 active:scale-95"
                  >
                    Ok
                  </button>
                </>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export default RewardPopup;
