"use client";

import type { PlayerColor } from "./types";

/** Lấy tên riêng kiểu VN: "Nguyễn Văn A" → "A". */
export function lastNameOf(fullName: string): string {
  const parts = fullName.trim().split(/\s+/);
  return parts[parts.length - 1] || fullName;
}

/** Màu viền (xanh dương / đỏ) — chỉ dùng làm border quanh avatar. */
const RING: Record<PlayerColor, string> = {
  blue: "#38bdf8", // sky-400
  red: "#fb7185", // rose-400
};

/** Màu nền dự phòng khi học sinh không có avatar. */
const FILL: Record<PlayerColor, string> = {
  blue: "#0ea5e9", // sky-500
  red: "#f43f5e", // rose-500
};

/**
 * Avatar người chơi dùng chung cho mọi game online: ưu tiên hiện avatar, màu
 * xanh dương/đỏ chỉ là viền để phân biệt 2 phe. Không có avatar thì hiện chữ cái
 * đầu của tên trên nền màu.
 */
export function PlayerAvatar({
  name,
  color,
  avatarUrl,
  size = 36,
  className = "",
}: {
  name: string;
  color: PlayerColor;
  avatarUrl: string | null;
  size?: number;
  className?: string;
}) {
  const ring = RING[color];
  const border = Math.max(2, Math.round(size * 0.09));

  if (avatarUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={avatarUrl}
        alt={name}
        referrerPolicy="no-referrer"
        className={`shrink-0 rounded-full bg-slate-200 object-cover ${className}`}
        style={{
          width: size,
          height: size,
          border: `${border}px solid ${ring}`,
        }}
      />
    );
  }

  return (
    <div
      className={`flex shrink-0 items-center justify-center rounded-full font-black text-white ${className}`}
      style={{
        width: size,
        height: size,
        backgroundColor: FILL[color],
        border: `${border}px solid ${ring}`,
        fontSize: Math.round(size * 0.42),
      }}
    >
      {(name.trim().charAt(0) || "?").toUpperCase()}
    </div>
  );
}
