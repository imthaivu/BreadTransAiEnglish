"use client";

import { AnimatePresence, motion } from "framer-motion";
import { FiClock } from "react-icons/fi";

interface TimeoutResultModalProps {
  open: boolean;
  /** true = thắng (màu xanh); false = thua (màu đỏ). */
  won: boolean;
  onClose: () => void;
  /** Tiêu đề tuỳ chỉnh. Bỏ trống dùng "Bạn thắng!/Bạn thua!". */
  title?: string;
  /** Mô tả tuỳ chỉnh. Bỏ trống dùng câu mặc định theo `won`. */
  message?: string;
  /** Nhãn nút hành động chính (vd "Chơi lại"). Bỏ trống thì ẩn nút. */
  actionLabel?: string;
  onAction?: () => void;
}

export function TimeoutResultModal({
  open,
  won,
  onClose,
  title,
  message,
  actionLabel,
  onAction,
}: TimeoutResultModalProps) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[10000] flex items-center justify-center bg-slate-900/50 p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
        >
          <motion.div
            role="dialog"
            aria-modal="true"
            initial={{ opacity: 0, scale: 0.9, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 12 }}
            transition={{ type: "spring", stiffness: 220, damping: 20 }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-[320px] rounded-2xl border-2 border-amber-300 bg-white p-6 text-center shadow-2xl"
          >
            <div
              className={`mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full border ${
                won
                  ? "border-emerald-200 bg-emerald-50 text-emerald-500"
                  : "border-rose-200 bg-rose-50 text-rose-500"
              }`}
            >
              <FiClock className="h-7 w-7" />
            </div>

            <p className="text-xs font-bold uppercase tracking-wider text-amber-500">
              Hết giờ
            </p>
            <h2
              className={`mt-1 text-2xl font-black ${
                won ? "text-emerald-600" : "text-rose-600"
              }`}
            >
              {title ?? (won ? "🏆 Bạn thắng!" : "Bạn thua!")}
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              {message ??
                (won
                  ? "Đối thủ đã hết thời gian suy nghĩ."
                  : "Bạn đã hết thời gian suy nghĩ.")}
            </p>

            <div className="mt-5 flex gap-2">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm font-bold text-slate-600 hover:bg-slate-100"
              >
                Đóng
              </button>
              {actionLabel && onAction && (
                <button
                  type="button"
                  onClick={onAction}
                  className="flex-1 rounded-xl bg-amber-500 px-4 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-amber-600"
                >
                  {actionLabel}
                </button>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
