"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Đo chiều cao thật của khung video (cột trái) để gán cho sidebar playlist (cột phải)
 * trên desktop, giúp 2 cột luôn cao bằng nhau — thay vì hard-code calc(100vh-...).
 *
 * Trả về:
 *  - videoRef: gắn vào khung video (aspect-video).
 *  - sidebarHeight: chiều cao (px) áp cho sidebar khi ở desktop, null nếu mobile/chưa đo.
 */
export function useMatchVideoHeight(breakpoint = 1024) {
  const videoRef = useRef<HTMLDivElement | null>(null);
  const [videoHeight, setVideoHeight] = useState<number | null>(null);
  const [isDesktop, setIsDesktop] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia(`(min-width: ${breakpoint}px)`);
    const update = () => setIsDesktop(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, [breakpoint]);

  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    const measure = () => setVideoHeight(el.offsetHeight);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const sidebarHeight = isDesktop && videoHeight ? videoHeight : null;

  return { videoRef, sidebarHeight };
}
