"use client";

import { useLayoutEffect, useRef } from "react";
import { cn } from "@/utils";

interface CanvasStatTextProps {
  text: string;
  /** Màu hex hoặc CSS color */
  color: string;
  fontSize?: number;
  fontWeight?: number | string;
  className?: string;
  /** Giới hạn chiều ngang (px); tự giảm font nếu text dài */
  maxWidth?: number;
  /** Mô tả cho screen reader */
  ariaLabel: string;
}

/**
 * Vẽ giá trị lên canvas thay vì DOM text — chống sửa nhanh qua F12 Elements.
 * Không thay thế xác thực server; Up Story vẫn dùng state React.
 */
export function CanvasStatText({
  text,
  color,
  fontSize = 30,
  fontWeight = 700,
  className,
  maxWidth,
  ariaLabel,
}: CanvasStatTextProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    let size = fontSize;
    let font = `${fontWeight} ${size}px system-ui, -apple-system, sans-serif`;
    ctx.font = font;

    let textWidth = Math.ceil(ctx.measureText(text).width);
    if (maxWidth && textWidth > maxWidth) {
      size = Math.max(9, Math.floor(fontSize * (maxWidth / textWidth)));
      font = `${fontWeight} ${size}px system-ui, -apple-system, sans-serif`;
      ctx.font = font;
      textWidth = Math.ceil(ctx.measureText(text).width);
    }

    const displayWidth = Math.min(
      maxWidth ?? Infinity,
      Math.max(textWidth + 8, 48)
    );
    const displayHeight = Math.ceil(size * 1.35);

    canvas.width = displayWidth * dpr;
    canvas.height = displayHeight * dpr;
    canvas.style.width = `${displayWidth}px`;
    canvas.style.height = `${displayHeight}px`;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, displayWidth, displayHeight);
    ctx.font = font;
    ctx.fillStyle = color;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text, displayWidth / 2, displayHeight / 2);
  }, [text, color, fontSize, fontWeight, maxWidth]);

  return (
    <span
      role="img"
      aria-label={ariaLabel}
      className={cn("inline-flex items-center justify-center", className)}
    >
      <canvas
        ref={canvasRef}
        aria-hidden
        className="pointer-events-none select-none max-w-full"
      />
    </span>
  );
}
