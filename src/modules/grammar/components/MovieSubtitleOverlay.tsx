"use client";

import type { BilingualSubtitleRow } from "@/utils/subtitles";

interface MovieSubtitleOverlayProps {
  row: BilingualSubtitleRow | null;
  showEnglish: boolean;
  showViAlways: boolean;
  revealedVi: boolean;
  /** Câu được tua tới thủ công — hiện cả EN + VI bất kể toggle. */
  seekPreviewRowIndex: number | null;
  /** Đang pause — hiện cả EN + VI cho câu đang dừng. */
  isPaused?: boolean;
  onRevealVi: () => void;
  /** Thanh điều khiển (timeline) đang hiện — nâng phụ đề cao để khỏi bị che. */
  controlsVisible?: boolean;
  /** Đang xem toàn màn hình — dùng để quyết định hiện gợi ý "Dịch" trên mobile. */
  isFullscreen?: boolean;
}

/**
 * Phụ đề dòng đang nói — đè mép dưới video (chế độ xem / nhập tâm).
 *
 * Lớp phủ luôn `pointer-events-none` để KHÔNG chặn nút điều khiển của trình
 * phát; chỉ riêng khung chữ phụ đề bắt click (để chạm hiện tiếng Việt) và được
 * nâng cao hơn thanh điều khiển nên không che các nút play/seek/volume.
 */
export function MovieSubtitleOverlay({
  row,
  showEnglish,
  showViAlways,
  revealedVi,
  seekPreviewRowIndex,
  isPaused = false,
  onRevealVi,
  controlsVisible = true,
  isFullscreen = false,
}: MovieSubtitleOverlayProps) {
  if (!row) return null;
  if (!showEnglish && !showViAlways) return null;

  const hasVi = Boolean(row.vi?.trim());
  const hasEng = Boolean(row.eng?.trim());
  const isCuePreview =
    isPaused || (seekPreviewRowIndex !== null && row.index === seekPreviewRowIndex);

  const showEngLine = (showEnglish || isCuePreview) && hasEng;
  const showViLine =
    hasVi &&
    (showViAlways || isCuePreview || (revealedVi && showEnglish));
  const showViHint =
    hasVi && showEnglish && !showViAlways && !revealedVi && !isCuePreview;

  if (!showEngLine && !showViLine && !showViHint) return null;

  // Cỡ chữ: mobile 12px, laptop 16px; riêng laptop + fullscreen thì 22px.
  const engSizeClass = "text-[12px] sm:text-[22px]";
    const hintSizeClass = "text-[10px] sm:text-[12px]";
    const viSizeClass = "text-[12px] sm:text-[22px]";

  return (
    <div
      className={`absolute inset-x-0 bottom-0 z-20 pointer-events-none flex justify-center px-1.5 sm:px-4 transition-[padding] duration-300 ${
        controlsVisible ? "pb-16 sm:pb-20" : "pb-3 sm:pb-5"
      }`}
    >
      <div
        role="button"
        tabIndex={0}
        onClick={onRevealVi}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onRevealVi();
          }
        }}
        className="pointer-events-auto cursor-pointer max-w-[92%] sm:max-w-4xl bg-black/70 px-1 py-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/60"
        aria-label={showViHint ? "Dịch" : "Phụ đề đang phát"}
      >
        {showEngLine ? (
          <p
            className={`text-center text-white font-semibold leading-snug drop-shadow text-balance ${engSizeClass}`}
          >
            {row.eng}
          </p>
        ) : null}
        {showViLine ? (
          <p
            className={`text-center text-amber-200/95 leading-snug mt-0.5 text-balance ${viSizeClass}`}
          >
            {row.vi}
          </p>
        ) : null}
        {showViHint ? (
          <p
            className={`text-center text-slate-300/80 mt-0.5 ${hintSizeClass} ${
              isFullscreen ? "block" : "hidden sm:block"
            }`}
          >
            Dịch
          </p>
        ) : null}
      </div>
    </div>
  );
}
