"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useClassPuzzleImages } from "../sliding-puzzle/hooks/useClassPuzzleImages";
import type { MultiplayerGameId } from "../realtime/types";

/** Mini Flappy Bird: nền trời gradient, mây, chim vàng và 2 ống xanh. */
export function FlappyBirdPreview() {
  return (
    <div className="absolute inset-0 overflow-hidden bg-gradient-to-b from-sky-300 via-sky-200 to-sky-100">
      {/* Mây */}
      <div className="absolute top-[14%] left-[10%] w-9 h-3 rounded-full bg-white/90 shadow-sm" />
      <div className="absolute top-[10%] left-[14%] w-6 h-3 rounded-full bg-white/90" />
      <div className="absolute top-[22%] right-[18%] w-10 h-3 rounded-full bg-white/85" />
      <div className="absolute top-[18%] right-[22%] w-6 h-3 rounded-full bg-white/85" />

      {/* Ống trên */}
      <div className="absolute top-0 left-[58%] w-[18%] h-[38%] bg-gradient-to-r from-green-600 via-green-400 to-green-600 border-x-2 border-green-800">
        <div className="absolute bottom-0 -left-[8%] -right-[8%] h-3 bg-gradient-to-r from-green-700 via-green-500 to-green-700 border-2 border-green-800 rounded-sm" />
      </div>
      {/* Ống dưới */}
      <div className="absolute bottom-[18%] left-[58%] w-[18%] h-[32%] bg-gradient-to-r from-green-600 via-green-400 to-green-600 border-x-2 border-green-800">
        <div className="absolute top-0 -left-[8%] -right-[8%] h-3 bg-gradient-to-r from-green-700 via-green-500 to-green-700 border-2 border-green-800 rounded-sm" />
      </div>

      {/* Chim */}
      <div className="absolute top-[44%] left-[22%] w-8 h-8 rounded-full bg-gradient-to-b from-yellow-300 to-amber-400 border-2 border-amber-700 shadow-md">
        {/* Mắt */}
        <div className="absolute top-1 right-1 w-2.5 h-2.5 rounded-full bg-white border border-slate-900">
          <div className="absolute top-0.5 right-0.5 w-1 h-1 rounded-full bg-slate-900" />
        </div>
        {/* Mỏ */}
        <div className="absolute top-3 -right-1.5 w-3 h-1.5 bg-orange-500 border border-amber-800 rounded-sm" />
        {/* Cánh */}
        <div className="absolute bottom-1 left-0.5 w-3 h-2 bg-amber-500 rounded-full border border-amber-700" />
      </div>

      {/* Đất */}
      <div className="absolute bottom-0 inset-x-0 h-[18%] bg-gradient-to-b from-amber-600 to-amber-800">
        <div className="absolute top-0 inset-x-0 h-2 bg-gradient-to-b from-lime-500 to-green-600" />
      </div>
    </div>
  );
}

/** Mini Đảo Ly Tìm Bóng: bàn vàng, 3 ly đỏ-hổ phách, 1 quả bóng nhỏ. */
export function ShellGamePreview() {
  return (
    <div className="absolute inset-0 overflow-hidden bg-gradient-to-b from-amber-50 via-orange-50 to-amber-100">
      {/* Tấm dạ */}
      <div className="absolute bottom-[18%] inset-x-[6%] h-[14%] rounded-full bg-amber-100/70 border border-amber-300/60 blur-[1px]" />

      {/* Ba ly */}
      {[15, 50, 85].map((leftPct, i) => (
        <div
          key={i}
          className="absolute bottom-[24%] -translate-x-1/2 flex flex-col items-center"
          style={{ left: `${leftPct}%` }}
        >
          {/* Bóng đổ */}
          <div className="w-12 h-1.5 bg-amber-900/40 rounded-full blur-[2px] absolute -bottom-1" />
          {/* Thân ly */}
          <div className="relative w-10 h-14 rounded-t-[1.2rem] bg-gradient-to-b from-amber-200 via-amber-400 to-amber-600 border-x border-b border-amber-700 shadow-lg overflow-hidden">
            {/* Đỉnh ly */}
            <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-4 h-2 rounded-full bg-amber-600 border border-amber-300" />
            {/* Vân sáng */}
            <div className="absolute top-0 right-1 w-1.5 h-full bg-white/30 blur-[1px]" />
            {/* Vành ngang */}
            <div className="absolute top-[35%] inset-x-0 h-[3px] bg-amber-900/20" />
            <div className="absolute top-[65%] inset-x-0 h-[3px] bg-amber-900/20" />
          </div>
        </div>
      ))}

      {/* Quả bóng (lộ phía trước ly giữa) */}
      <div
        className="absolute bottom-[20%] left-1/2 -translate-x-1/2 w-4 h-4 rounded-full bg-gradient-to-br from-rose-400 via-rose-500 to-rose-700 shadow-md"
        style={{ boxShadow: "0 0 8px rgba(244,63,94,0.55)" }}
      >
        <div className="absolute top-0.5 left-1 w-1.5 h-1.5 rounded-full bg-white/60 blur-[0.5px]" />
      </div>

      {/* Mặt bàn */}
      <div className="absolute bottom-0 inset-x-0 h-[16%] bg-gradient-to-b from-amber-200 to-amber-400 border-t border-amber-300" />
    </div>
  );
}

/** Mini Cờ Caro: giấy tập kẻ ô + lề đỏ, vài nét X-O kiểu chép tay. */
export function CaroPreview() {
  return (
    <div className="absolute inset-0 overflow-hidden">
      <div
        className="absolute inset-0"
        style={{
          backgroundColor: "#fcfbf7",
          backgroundImage: `
            linear-gradient(90deg, transparent 22%, #ff4d4d 22%, #ff4d4d calc(22% + 2px), transparent calc(22% + 2px)),
            repeating-linear-gradient(#e1effa 0px, #e1effa 1px, transparent 1px, transparent 18px),
            repeating-linear-gradient(90deg, #e1effa 0px, #e1effa 1px, transparent 1px, transparent 18px)
          `,
        }}
      />
      {/* Lỗ kẹp giấy */}
      <div className="absolute top-3 left-[10%] w-1.5 h-1.5 rounded-full bg-slate-300/70 shadow-inner" />
      <div className="absolute bottom-3 left-[10%] w-1.5 h-1.5 rounded-full bg-slate-300/70 shadow-inner" />

      {/* Nước cờ kiểu chữ chép tay (font Itim/cursive): 5 X thắng + 4 O chặn */}
      <div
        className="absolute inset-0 text-center"
        style={{ fontFamily: '"Itim","Comic Sans MS",cursive' }}
      >
        {/* 5 quân X xếp chéo (thắng caro = 5 quân liền) */}
        {[
          { top: "12%", left: "13%" },
          { top: "28%", left: "29%" },
          { top: "44%", left: "45%" },
          { top: "60%", left: "61%" },
          { top: "76%", left: "77%" },
        ].map((pos, i) => (
          <span
            key={`x-${i}`}
            className="absolute text-sky-700 font-bold text-xl leading-none"
            style={pos}
          >
            X
          </span>
        ))}

        {/* 4 quân O xếp chéo liên tiếp song song với hàng X */}
        {[
          { top: "12%", left: "29%" },
          { top: "28%", left: "45%" },
          { top: "44%", left: "61%" },
          { top: "60%", left: "77%" },
        ].map((pos, i) => (
          <span
            key={`o-${i}`}
            className="absolute text-rose-600 font-bold text-xl leading-none"
            style={pos}
          >
            O
          </span>
        ))}
      </div>

      {/* Đường thắng gạch bút chì xuyên qua 5 quân X */}
      <div
        className="absolute"
        style={{
          top: "17%",
          left: "16%",
          width: "89%",
          height: "3px",
          background:
            "linear-gradient(90deg, transparent, rgba(56,189,248,0.9) 12%, rgba(56,189,248,0.9) 88%, transparent)",
          borderRadius: "2px",
          transform: "rotate(45deg)",
          transformOrigin: "left center",
        }}
      />
    </div>
  );
}

/** Mini Sky High: bầu trời, tháp vali xếp chồng, mặt đường. */
export function SkyHighPreview() {
  return (
    <div className="absolute inset-0 overflow-hidden bg-gradient-to-b from-indigo-200 via-sky-200 to-amber-100">
      {/* Mây mờ */}
      <div className="absolute top-[12%] left-[8%] w-10 h-3 rounded-full bg-white/80 blur-[1px]" />
      <div className="absolute top-[22%] right-[12%] w-12 h-3 rounded-full bg-white/70 blur-[1px]" />

      {/* Chim Pierre */}
      <div className="absolute top-[16%] right-[28%] flex items-center">
        <div className="w-2.5 h-2 bg-slate-800 rounded-full" />
        <div className="absolute -left-1 top-0 w-2 h-1 bg-slate-800 rounded-full rotate-[-20deg]" />
        <div className="absolute -right-1 top-0 w-2 h-1 bg-slate-800 rounded-full rotate-[20deg]" />
      </div>

      {/* Tháp vali */}
      <div className="absolute bottom-[18%] left-1/2 -translate-x-1/2 flex flex-col items-center gap-[2px]">
        {/* Vali tím */}
        <div className="relative w-12 h-3.5 bg-[#9370DB] border border-[#4B0082] rounded-sm shadow-sm">
          <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-4 h-1 rounded-t-full border border-[#E6E6FA] bg-transparent" />
          <div className="absolute inset-y-0 left-1/2 w-px bg-[#4B0082]/50" />
        </div>
        {/* Vali hồng neon */}
        <div className="relative w-14 h-4 bg-[#FF2E93] border border-[#c2005d] rounded-sm shadow-sm">
          <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-5 h-1 rounded-t-full border border-pink-100 bg-transparent" />
          <div className="absolute inset-y-0 left-1/2 w-px bg-[#c2005d]/60" />
        </div>
        {/* Vali vàng */}
        <div className="relative w-16 h-5 bg-[#FFD700] border border-[#b89200] rounded-sm shadow-sm">
          <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-5 h-1 rounded-t-full border border-yellow-100 bg-transparent" />
          <div className="absolute inset-y-0 left-1/2 w-px bg-[#b89200]/60" />
          <div className="absolute top-1 left-1.5 w-1 h-1 bg-pink-500 rounded-full" />
          <div className="absolute top-1 right-2 w-1 h-1 bg-cyan-500 rounded-full" />
        </div>
        {/* Vali xanh ngọc */}
        <div className="relative w-[72px] h-5 bg-[#008080] border border-[#004d4d] rounded-sm shadow-sm">
          <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-5 h-1 rounded-t-full border border-teal-100 bg-transparent" />
          <div className="absolute inset-y-0 left-1/2 w-px bg-[#004d4d]/60" />
        </div>
        {/* Vali da nâu (đáy) */}
        <div className="relative w-20 h-6 bg-[#8B4513] border border-[#5C2E0B] rounded-sm shadow-md">
          <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-5 h-1 rounded-t-full border border-amber-200 bg-transparent" />
          <div className="absolute inset-y-0 left-1/2 w-px bg-[#3d1f07]/60" />
          <div className="absolute top-1.5 inset-x-1 h-[2px] bg-[#3d1f07]/40" />
          <div className="absolute bottom-1.5 inset-x-1 h-[2px] bg-[#3d1f07]/40" />
        </div>
      </div>

      {/* Bệ sân bay */}
      <div className="absolute bottom-[10%] inset-x-[12%] h-2 bg-slate-300 rounded-sm border border-slate-400" />

      {/* Vỉa hè + đường */}
      <div className="absolute bottom-[6%] inset-x-0 h-[4%] bg-slate-200 border-y border-slate-400" />
      <div className="absolute bottom-0 inset-x-0 h-[6%] bg-slate-700">
        <div className="absolute top-1/2 -translate-y-1/2 inset-x-0 h-0.5 flex gap-2 px-2">
          <span className="flex-1 bg-yellow-300/90" />
          <span className="flex-1 bg-transparent" />
          <span className="flex-1 bg-yellow-300/90" />
          <span className="flex-1 bg-transparent" />
          <span className="flex-1 bg-yellow-300/90" />
        </div>
      </div>
    </div>
  );
}

/** Mini Sliding Puzzle: bảng 3×3 pastel xanh dương + vàng nhạt, đồng hồ phía trên.
 *  Nếu có avatar học sinh trong lớp thì dùng ảnh đó cắt thành 9 mảnh (giống game thật),
 *  nếu không thì hiển thị các ô số như cũ.
 */
export function SlidingPuzzlePreview() {
  const { images } = useClassPuzzleImages();

  const previewImageUrl = useMemo(() => {
    if (images.length === 0) return null;
    return images[0].url;
  }, [images]);

  return (
    <div className="absolute inset-0 overflow-hidden bg-gradient-to-b from-sky-50 to-amber-50">
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="grid grid-cols-3 grid-rows-3 gap-1 w-[62%] aspect-square bg-sky-100 border border-sky-200 p-1 rounded-xl shadow-sm">
          {[0, 1, 2, 3, 4, 5, 6, 7, 8].map((i) => {
            const row = Math.floor(i / 3);
            const col = i % 3;
            const isEmpty = i === 8;
            const number = i + 1;

            if (previewImageUrl && !isEmpty) {
              return (
                <div
                  key={i}
                  className="relative rounded-md overflow-hidden bg-white border border-sky-100 shadow-sm"
                  style={{
                    backgroundImage: `url(${previewImageUrl})`,
                    backgroundSize: "300% 300%",
                    backgroundPosition: `${(col / 2) * 100}% ${(row / 2) * 100}%`,
                  }}
                />
              );
            }

            return (
              <div
                key={i}
                className={`flex items-center justify-center rounded-md text-slate-700 font-bold text-[10px] sm:text-xs ${
                  isEmpty
                    ? "bg-sky-100"
                    : "bg-white border border-sky-100 shadow-sm"
                }`}
              >
                {isEmpty ? null : number}
              </div>
            );
          })}
        </div>
      </div>

      <div className="absolute top-2.5 left-1/2 -translate-x-1/2 flex items-center gap-1 bg-white/90 border border-sky-200 rounded-full px-2 py-0.5 shadow-sm">
        <span className="text-amber-500 text-[10px]">⏳</span>
        <span className="text-[10px] font-mono font-bold text-slate-700 tabular-nums">
          2:00
        </span>
      </div>
    </div>
  );
}

/** Khung thiết kế cố định (160px) được đo bằng ResizeObserver và scale vừa
 *  khít ô cha, để mọi hình minh họa co theo đúng tỉ lệ khi ô nhỏ lại. */
export const PREVIEW_DESIGN_SIZE = 160;

export function ScaledPreview({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0);

  useEffect(() => {
    const el = ref.current?.parentElement;
    if (!el) return;
    const update = () => {
      const size = Math.min(el.clientWidth, el.clientHeight);
      setScale(size / PREVIEW_DESIGN_SIZE);
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className="absolute top-0 left-0 origin-top-left"
      style={{
        width: PREVIEW_DESIGN_SIZE,
        height: PREVIEW_DESIGN_SIZE,
        transform: `scale(${scale})`,
        visibility: scale === 0 ? "hidden" : "visible",
      }}
    >
      {children}
    </div>
  );
}

/** Bản đồ id game → component minh họa CSS. */
export const GAME_PREVIEWS: Record<MultiplayerGameId, React.FC> = {
  "flappy-bird": FlappyBirdPreview,
  "shell-game": ShellGamePreview,
  caro: CaroPreview,
  "sky-high": SkyHighPreview,
  "sliding-puzzle": SlidingPuzzlePreview,
};
