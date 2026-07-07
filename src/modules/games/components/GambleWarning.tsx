"use client";

interface GambleWarningProps {
  /** Hiển thị cảnh báo khi true (đã vượt mốc cờ bạc trong lượt có vé). */
  show: boolean;
  /**
   * Điểm hiện tại (tuỳ chọn). Khi là số lẻ → tô đỏ để nhấn mạnh đang bị đe doạ
   * trừ bánh; số chẵn/không truyền → vàng cảnh báo nhẹ.
   */
  score?: number;
  /**
   * Lớp định vị (absolute) do từng game truyền vào để tránh đè HUD đang chơi.
   * Component không tự chiếm layout và không chặn input (pointer-events-none).
   */
  className?: string;
}

/**
 * Dòng cảnh báo "điểm lẻ sẽ bị trừ bánh" cho các game ăn điểm có luật cờ bạc
 * theo chẵn/lẻ. Là overlay tuyệt đối, trong suốt với chuột/chạm nên không ảnh
 * hưởng tới thao tác chơi của người dùng.
 */
export function GambleWarning({
  show,
  score,
  className = "",
}: GambleWarningProps) {
  if (!show) return null;

  const atRisk =
    typeof score === "number" && Math.abs(Math.trunc(score)) % 2 === 1;

  return (
    <div
      className={`gamble-warning pointer-events-none absolute z-30 select-none ${className}`}
      role="status"
      aria-live="polite"
    >
      <span
        className={`flex items-center gap-1.5 whitespace-nowrap rounded-full border px-3 py-1 text-[11px] font-black uppercase tracking-wide shadow-lg backdrop-blur-sm ${
          atRisk
            ? "border-rose-300 bg-rose-500/90 text-white"
            : "border-amber-300 bg-amber-400/90 text-slate-900"
        }`}
      >
        <span aria-hidden="true">⚠️</span>
        Điểm lẻ sẽ bị trừ bánh
      </span>

      <style jsx>{`
        .gamble-warning {
          animation: gambleWarnFade 0.35s ease-out;
        }
        @keyframes gambleWarnFade {
          from {
            opacity: 0;
          }
          to {
            opacity: 1;
          }
        }
      `}</style>
    </div>
  );
}
