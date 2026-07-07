import { RefObject, useEffect } from "react";

/** Tạm dừng audio khi tab/ứng dụng bị ẩn — tránh treo phát nền. */
export function usePauseOnTabHidden(
  audioRef: RefObject<HTMLAudioElement | null>
) {
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        audioRef.current?.pause();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [audioRef]);
}
