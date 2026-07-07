"use client";

import { memo, useCallback, useEffect, useRef } from "react";

export interface Html5VideoPlayerInstance {
  getCurrentTime: () => number;
  getDuration: () => number;
  getVolume?: () => number;
  isMuted?: () => boolean;
  isPaused?: () => boolean;
  pauseVideo: () => void;
  playVideo: () => void;
  seekTo: (seconds: number, _allowSeekAhead: boolean) => void;
  destroy: () => void;
}

export interface Html5VideoPlayerProps {
  src: string;
  onProgress?: (
    percent: number,
    currentTime: number,
    duration: number,
    volume: number,
    isMuted: boolean
  ) => void;
  onDurationReady?: (duration: number) => void;
  onPlay?: () => void;
  onPause?: () => void;
  onEnd?: () => void;
  playerRef?: React.MutableRefObject<Html5VideoPlayerInstance | null>;
  /** Ẩn nút fullscreen mặc định của trình phát (dùng fullscreen container kèm phụ đề). */
  disableNativeFullscreen?: boolean;
  /** Chạm trực tiếp lên video (vùng giữa không có overlay) — đồng bộ hiện timeline. */
  onUserInteract?: () => void;
}

export const Html5VideoPlayer = memo(function Html5VideoPlayer({
  src,
  onProgress,
  onDurationReady,
  onPlay,
  onPause,
  onEnd,
  playerRef: externalPlayerRef,
  disableNativeFullscreen = false,
  onUserInteract,
}: Html5VideoPlayerProps) {
  const videoElRef = useRef<HTMLVideoElement | null>(null);
  const internalPlayerRef = useRef<Html5VideoPlayerInstance | null>(null);
  const progressIntervalRef = useRef<number | null>(null);
  const onUserInteractRef = useRef(onUserInteract);

  useEffect(() => {
    onUserInteractRef.current = onUserInteract;
  }, [onUserInteract]);

  const playerRef = externalPlayerRef || internalPlayerRef;

  const stopProgressTracking = useCallback(() => {
    if (progressIntervalRef.current != null) {
      window.clearInterval(progressIntervalRef.current);
      progressIntervalRef.current = null;
    }
  }, []);

  const startProgressTracking = useCallback(() => {
    stopProgressTracking();
    progressIntervalRef.current = window.setInterval(() => {
      const v = videoElRef.current;
      if (!v || !onProgress) return;

      const duration = Number.isFinite(v.duration) ? v.duration : 0;
      const currentTime = Number.isFinite(v.currentTime) ? v.currentTime : 0;
      if (duration > 0 && currentTime >= 0) {
        const percent = (currentTime / duration) * 100;
        onProgress(
          Math.min(100, Math.max(0, percent)),
          currentTime,
          duration,
          Math.round((v.volume ?? 1) * 100),
          !!v.muted
        );
      }
    }, 1000);
  }, [onProgress, stopProgressTracking]);

  useEffect(() => {
    const v = videoElRef.current;
    if (!v) return;

    // Expose a YT-like API to reuse existing tracking logic.
    const api: Html5VideoPlayerInstance = {
      getCurrentTime: () => videoElRef.current?.currentTime ?? 0,
      getDuration: () => videoElRef.current?.duration ?? 0,
      getVolume: () => Math.round(((videoElRef.current?.volume ?? 1) as number) * 100),
      isMuted: () => !!videoElRef.current?.muted,
      isPaused: () => videoElRef.current?.paused ?? true,
      pauseVideo: () => {
        videoElRef.current?.pause();
      },
      playVideo: () => {
        videoElRef.current?.play().catch(() => {
          // Ignore autoplay errors
        });
      },
      seekTo: (seconds: number) => {
        if (!videoElRef.current) return;
        const duration = Number.isFinite(videoElRef.current.duration)
          ? videoElRef.current.duration
          : 0;
        const clamped =
          duration > 0 ? Math.min(Math.max(0, seconds), duration) : Math.max(0, seconds);
        videoElRef.current.currentTime = clamped;
      },
      destroy: () => {
        stopProgressTracking();
        if (!videoElRef.current) return;
        try {
          videoElRef.current.pause();
        } catch {
          // ignore
        }
      },
    };

    playerRef.current = api;

    return () => {
      if (playerRef.current === api) {
        playerRef.current = null;
      }
    };
  }, [playerRef, stopProgressTracking]);

  useEffect(() => {
    return () => {
      stopProgressTracking();
    };
  }, [stopProgressTracking]);

  return (
    <video
      key={src}
      ref={videoElRef}
      src={src}
      controls
      autoPlay
      playsInline
      preload="metadata"
      controlsList={disableNativeFullscreen ? "nofullscreen" : undefined}
      className="block w-full h-full bg-black"
      onClick={() => onUserInteractRef.current?.()}
      onTouchStart={() => onUserInteractRef.current?.()}
      onLoadedMetadata={() => {
        const v = videoElRef.current;
        if (!v) return;
        const duration = Number.isFinite(v.duration) ? v.duration : 0;
        if (duration > 0 && onDurationReady) onDurationReady(duration);
      }}
      onPlay={() => {
        if (onPlay) onPlay();
        startProgressTracking();
      }}
      onPause={() => {
        if (onPause) onPause();
        stopProgressTracking();
      }}
      onEnded={() => {
        if (onEnd) onEnd();
        stopProgressTracking();
        const v = videoElRef.current;
        if (!v || !onProgress) return;
        const duration = Number.isFinite(v.duration) ? v.duration : 0;
        if (duration > 0) {
          onProgress(100, duration, duration, Math.round((v.volume ?? 1) * 100), !!v.muted);
        }
      }}
    />
  );
}, (prev, next) => prev.src === next.src);

