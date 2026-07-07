"use client";

import { cn } from "@/utils";
import { usePauseOnTabHidden } from "@/hooks/usePauseOnTabHidden";
import { useEffect, useRef, useState } from "react";
import {
  FiPause,
  FiPlay,
  FiRotateCcw,
  FiRotateCw,
  FiSkipBack,
  FiSkipForward,
} from "react-icons/fi";

const PLAYBACK_SPEEDS = [1, 1.5];

interface AudioPlayerWithDurationProps {
  src: string;
  autoPlay?: boolean;
  className?: string;
  /** Duration từ DB (userBookProgress.lessons[].duration) */
  initialDuration?: number;
  actionNode?: React.ReactNode;
  /** Bài trước trong playlist (giáo viên review) */
  onPrev?: () => void;
  /** Bài sau trong playlist (giáo viên review) */
  onNext?: () => void;
  hasPrev?: boolean;
  hasNext?: boolean;
  /** Header trái: thay cho mặc định "🎧 Audio" (vd: "Bài 3"). */
  title?: React.ReactNode;
  /** Callback khi audio phát hết — dùng cho chế độ "Play All" tự chuyển bài. */
  onEnded?: () => void;
}

export function AudioPlayerWithDuration({
  src,
  autoPlay = false,
  className = "",
  initialDuration = 0,
  actionNode,
  onPrev,
  onNext,
  hasPrev = false,
  hasNext = false,
  title,
  onEnded,
}: AudioPlayerWithDurationProps) {
  const audioRef = useRef<HTMLAudioElement>(null);
  usePauseOnTabHidden(audioRef);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [playbackRate, setPlaybackRate] = useState(1);
  const playbackRateRef = useRef(1);
  const onEndedRef = useRef<typeof onEnded>(undefined);
  const duration = (initialDuration ?? 0) > 0 ? (initialDuration ?? 0) : 0;
  const hasNavigation = !!onPrev || !!onNext;

  useEffect(() => {
    onEndedRef.current = onEnded;
  }, [onEnded]);

  useEffect(() => {
    playbackRateRef.current = playbackRate;
    if (audioRef.current) {
      audioRef.current.playbackRate = playbackRate;
    }
  }, [playbackRate]);

  useEffect(() => {
    if (!src) return;

    const audio = audioRef.current;
    if (!audio) return;

    const handleTimeUpdate = () => setCurrentTime(audio.currentTime);
    const handlePlay = () => setIsPlaying(true);
    const handlePause = () => setIsPlaying(false);
    const handleEnded = () => {
      setIsPlaying(false);
      setCurrentTime(0);
      onEndedRef.current?.();
    };

    audio.addEventListener("timeupdate", handleTimeUpdate);
    audio.addEventListener("play", handlePlay);
    audio.addEventListener("pause", handlePause);
    audio.addEventListener("ended", handleEnded);

    audio.src = src;
    audio.preload = "metadata";
    audio.playbackRate = playbackRateRef.current;
    setCurrentTime(0);

    if (autoPlay) {
      audio.play().catch(() => {});
    }

    return () => {
      audio.removeEventListener("timeupdate", handleTimeUpdate);
      audio.removeEventListener("play", handlePlay);
      audio.removeEventListener("pause", handlePause);
      audio.removeEventListener("ended", handleEnded);
    };
  }, [src, autoPlay]);

  const togglePlayPause = () => {
    const audio = audioRef.current;
    if (!audio) return;

    if (isPlaying) {
      audio.pause();
    } else {
      audio.play().catch((error) => {
        console.error("Error playing audio:", error);
      });
    }
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const audio = audioRef.current;
    if (!audio || !duration) return;

    const newTime = parseFloat(e.target.value);
    audio.currentTime = newTime;
    setCurrentTime(newTime);
  };

  const handleSkip = (delta: number) => {
    const audio = audioRef.current;
    if (!audio) return;
    const upper = duration || (Number.isFinite(audio.duration) ? audio.duration : 0);
    if (!upper) return;
    const target = Math.max(0, Math.min(upper, audio.currentTime + delta));
    audio.currentTime = target;
    setCurrentTime(target);
  };

  const formatTime = (seconds: number): string => {
    if (!isFinite(seconds) || isNaN(seconds)) return "0:00";
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  return (
    <div className={cn("flex flex-col gap-3 sm:gap-4", className)}>
      <audio ref={audioRef} />

      {/* Header: title + speed controls */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          {title !== undefined ? (
            <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 leading-none truncate">
              {title}
            </h3>
          ) : (
            <>
              <span className="text-lg leading-none">🎧</span>
              <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 leading-none">
                Audio
              </h3>
            </>
          )}
        </div>
        <div className="flex items-center gap-2">
          {actionNode}
          <div className="flex bg-gray-100 dark:bg-gray-800 rounded-lg p-0.5 shadow-sm border border-gray-200/50 dark:border-gray-700/50">
            {PLAYBACK_SPEEDS.map((speed) => (
              <button
                key={speed}
                type="button"
                onClick={() => setPlaybackRate(speed)}
                className={cn(
                  "px-2 py-1 min-w-[2.25rem] rounded-md text-xs font-semibold transition-all",
                  playbackRate === speed
                    ? "bg-white dark:bg-gray-700 text-blue-600 dark:text-blue-400 shadow-sm"
                    : "text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
                )}
                aria-pressed={playbackRate === speed}
              >
                {speed}x
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Progress bar */}
      <div>
        <input
          type="range"
          min="0"
          max={duration || 0}
          value={currentTime}
          onChange={handleSeek}
          disabled={!duration}
          className="h-2 w-full cursor-pointer appearance-none rounded-full bg-gray-200 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-gray-700
            [&::-webkit-slider-thumb]:h-5 [&::-webkit-slider-thumb]:w-5 [&::-webkit-slider-thumb]:cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-blue-500 [&::-webkit-slider-thumb]:border-[3px] [&::-webkit-slider-thumb]:border-white [&::-webkit-slider-thumb]:shadow-md
            [&::-moz-range-thumb]:h-5 [&::-moz-range-thumb]:w-5 [&::-moz-range-thumb]:cursor-pointer [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-[3px] [&::-moz-range-thumb]:border-white [&::-moz-range-thumb]:bg-blue-500"
          style={{
            background: duration
              ? `linear-gradient(to right, #3b82f6 0%, #3b82f6 ${
                  (currentTime / duration) * 100
                }%, #e5e7eb ${
                  (currentTime / duration) * 100
                }%, #e5e7eb 100%)`
              : undefined,
          }}
        />
        <div className="flex justify-between text-xs text-gray-500 mt-2">
          <span>{formatTime(currentTime)}</span>
          <span>{formatTime(duration)}</span>
        </div>
      </div>

      {/* Control buttons */}
      <div className="flex items-center justify-center gap-2 sm:gap-4">
        {hasNavigation && (
          <button
            type="button"
            onClick={() => onPrev?.()}
            disabled={!hasPrev}
            className="w-10 h-10 rounded-full text-gray-600 hover:bg-gray-100 transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center"
            title="Bài trước"
            aria-label="Bài trước"
          >
            <FiSkipBack className="w-6 h-6" />
          </button>
        )}
        <button
          type="button"
          onClick={() => handleSkip(-5)}
          disabled={!duration}
          className="relative w-10 h-10 rounded-full text-gray-600 hover:bg-gray-100 transition-colors disabled:opacity-40 flex items-center justify-center"
          title="Lùi 5s"
          aria-label="Lùi 5 giây"
        >
          <FiRotateCcw className="w-6 h-6" />
          <span className="absolute text-[9px] font-bold top-1/2 left-1/2 -translate-x-[50%] -translate-y-[45%]">5</span>
        </button>
        <button
          type="button"
          onClick={togglePlayPause}
          className="w-12 h-12 rounded-full text-blue-500 hover:bg-gray-100 hover:scale-105 transform transition-transform duration-200 flex items-center justify-center"
          aria-label={isPlaying ? "Tạm dừng" : "Phát"}
          title={isPlaying ? "Tạm dừng" : "Phát"}
        >
          {isPlaying ? (
            <FiPause className="w-8 h-8 fill-current" />
          ) : (
            <FiPlay className="w-8 h-8 fill-current ml-1" />
          )}
        </button>
        <button
          type="button"
          onClick={() => handleSkip(5)}
          disabled={!duration}
          className="relative w-10 h-10 rounded-full text-gray-600 hover:bg-gray-100 transition-colors disabled:opacity-40 flex items-center justify-center"
          title="Tới 5s"
          aria-label="Tới 5 giây"
        >
          <FiRotateCw className="w-6 h-6" />
          <span className="absolute text-[9px] font-bold top-1/2 left-1/2 -translate-x-[50%] -translate-y-[45%]">5</span>
        </button>
        {hasNavigation && (
          <button
            type="button"
            onClick={() => onNext?.()}
            disabled={!hasNext}
            className="w-10 h-10 rounded-full text-gray-600 hover:bg-gray-100 transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center"
            title="Bài sau"
            aria-label="Bài sau"
          >
            <FiSkipForward className="w-6 h-6" />
          </button>
        )}
      </div>
    </div>
  );
}
