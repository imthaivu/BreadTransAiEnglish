"use client";

import { Button } from "@/components/ui/Button";
import { AUDIO_PLAYER_CONFIG } from "@/constants/streamline";
import {
  FiMusic,
  FiPause,
  FiPlay,
  FiRepeat,
  FiRotateCcw,
  FiRotateCw,
} from "react-icons/fi";
import { useCallback, useEffect, useRef, useState } from "react";
import { usePauseOnTabHidden } from "@/hooks/usePauseOnTabHidden";
import { saveListeningProgress } from "@/modules/listening/services";
import { useAuth } from "@/lib/auth/context";
import { estimateAudioDuration, sanitizeDurationSeconds } from "@/utils/audio";
import {
  isRecordingActive,
  registerPausePlaybackHandler,
  requestStopRecording,
  setPlaybackActive,
  subscribeAudioInterlock,
} from "@/lib/audio/interlock";

interface AudioPlayerProps {
  audioFiles: string[];
  onLessonSelect?: (index: number) => void;
  onDurationChange?: (durationSeconds: number) => void;
  currentLesson?: number;
  className?: string;
  missingLessons?: number[];
  hideLessonList?: boolean; // Hide the lesson selection grid
  defaultRepeatCount?: number; // Default repeat count (0 = no repeat, >0 = repeat that many times)
  trackingContext?: {
    module: string; // "streamline" | "lessons1000"
    itemKey: string; // e.g., book id or composite key
  };
  /** Gọi mỗi khi nghe hết một lượt (kể cả lặp). */
  onListenCompleted?: () => void;
  actionNode?: React.ReactNode; // Optional extra actions to render beside controls
}

export default function AudioPlayer({
  audioFiles,
  onLessonSelect,
  onDurationChange,
  currentLesson = 0,
  className = "",
  missingLessons = [],
  hideLessonList = false,
  defaultRepeatCount = 0,
  trackingContext,
  onListenCompleted,
  actionNode,
}: AudioPlayerProps) {
  const { session } = useAuth();
  const audioRef = useRef<HTMLAudioElement>(null);
  usePauseOnTabHidden(audioRef);
  const [isPlaying, setIsPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [selectedLesson, setSelectedLesson] = useState(currentLesson);
  const playbackRateRef = useRef(playbackRate);
  const [maxPercent, setMaxPercent] = useState(0);
  const [submittedThisSession, setSubmittedThisSession] = useState(false);
  const submittedRef = useRef(false);
  const [audioError, setAudioError] = useState<string | null>(null);
  const [repeatCount, setRepeatCount] = useState(defaultRepeatCount);
  const repeatCountRef = useRef(repeatCount);
  const currentRepeatRef = useRef(0);
  const metadataDurationRef = useRef<number | null>(null);
  const onDurationChangeRef = useRef(onDurationChange);
  const [recordingActive, setRecordingActiveState] = useState(false);

  useEffect(() => {
    onDurationChangeRef.current = onDurationChange;
  }, [onDurationChange]);

  const handleResetProgressTracking = useCallback(() => {
    setSubmittedThisSession(false);
    submittedRef.current = false;
    setMaxPercent(0);
  }, []);

  useEffect(() => {
    playbackRateRef.current = playbackRate;
  }, [playbackRate]);

  useEffect(() => {
    repeatCountRef.current = repeatCount;
  }, [repeatCount]);

  useEffect(() => {
    const syncInterlockState = () => {
      setRecordingActiveState(isRecordingActive());
    };
    syncInterlockState();
    return subscribeAudioInterlock(syncInterlockState);
  }, []);

  useEffect(() => {
    const pausePlayback = () => {
      audioRef.current?.pause();
    };
    registerPausePlaybackHandler(pausePlayback);
    return () => registerPausePlaybackHandler(null);
  }, []);

  useEffect(() => {
    setPlaybackActive(isPlaying);
    return () => {
      setPlaybackActive(false);
    };
  }, [isPlaying]);

  useEffect(() => {
    if (!recordingActive || !isPlaying) return;
    audioRef.current?.pause();
  }, [recordingActive, isPlaying]);

  // Initialize repeat count from defaultRepeatCount
  useEffect(() => {
    if (defaultRepeatCount > 0) {
      setRepeatCount(defaultRepeatCount);
      repeatCountRef.current = defaultRepeatCount;
    }
  }, [defaultRepeatCount]);

  const handleLoadedMetadata = useCallback(() => {
    if (!audioRef.current) return;
    const loadedDuration = sanitizeDurationSeconds(audioRef.current.duration);
    if (loadedDuration !== undefined) {
      metadataDurationRef.current = loadedDuration;
      setDuration(loadedDuration);
      onDurationChangeRef.current?.(loadedDuration);
    }
    audioRef.current.playbackRate = playbackRateRef.current;
  }, []);

  const handleDurationChange = useCallback(() => {
    if (!audioRef.current) return;
    const loadedDuration = sanitizeDurationSeconds(audioRef.current.duration);
    if (loadedDuration !== undefined) {
      metadataDurationRef.current = loadedDuration;
      setDuration(loadedDuration);
      onDurationChangeRef.current?.(loadedDuration);
    }
  }, []);

  const handleTimeUpdate = useCallback(() => {
    if (audioRef.current) {
      setCurrentTime(audioRef.current.currentTime);
      const trackDuration = sanitizeDurationSeconds(audioRef.current.duration);
      if (trackDuration) {
        const percent = (audioRef.current.currentTime / trackDuration) * 100;
        setMaxPercent((prev) => Math.max(prev, percent));
      }
    }
  }, []);

  const handlePlaying = useCallback(() => {
    setIsPlaying(true);
  }, []);

  const handlePause = useCallback(() => {
    setIsPlaying(false);
  }, []);

  const handleEnded = useCallback(() => {
    onListenCompleted?.();
    // Handle repeat functionality
    if (repeatCountRef.current > 0 && currentRepeatRef.current < repeatCountRef.current) {
      currentRepeatRef.current += 1;
      // Reset audio to beginning and play again
      if (audioRef.current) {
        audioRef.current.currentTime = 0;
        setTimeout(() => {
          audioRef.current?.play()
            .then(() => {
              setIsPlaying(true);
            })
            .catch(() => {
              setIsPlaying(false);
            });
        }, 100);
      } else {
        setIsPlaying(false);
      }
    } else {
      // Reset repeat counter when done
      currentRepeatRef.current = 0;
      setIsPlaying(false);
    }
  }, [onListenCompleted]);

  const handleError = useCallback(() => {
    setIsPlaying(false);
    setAudioError("Không thể tải file audio. Vui lòng thử lại sau.");
  }, []);

  useEffect(() => {
    const audio = audioRef.current;
    if (audio) {
      audio.addEventListener("loadedmetadata", handleLoadedMetadata);
      audio.addEventListener("durationchange", handleDurationChange);
      audio.addEventListener("timeupdate", handleTimeUpdate);
      audio.addEventListener("playing", handlePlaying);
      audio.addEventListener("pause", handlePause);
      audio.addEventListener("ended", handleEnded);
      audio.addEventListener("error", handleError);
      return () => {
        audio.removeEventListener("loadedmetadata", handleLoadedMetadata);
        audio.removeEventListener("durationchange", handleDurationChange);
        audio.removeEventListener("timeupdate", handleTimeUpdate);
        audio.removeEventListener("playing", handlePlaying);
        audio.removeEventListener("pause", handlePause);
        audio.removeEventListener("ended", handleEnded);
        audio.removeEventListener("error", handleError);
      };
    }
  }, [
    handleLoadedMetadata,
    handleDurationChange,
    handleTimeUpdate,
    handlePlaying,
    handlePause,
    handleEnded,
    handleError,
  ]);

  useEffect(() => {
    setSelectedLesson(currentLesson);
  }, [currentLesson]);

  useEffect(() => {
    const audio = audioRef.current;
    if (audio && audioFiles[selectedLesson]) {
      const newSrc = audioFiles[selectedLesson];
      if (audio.getAttribute("src") !== newSrc) {
        setAudioError(null); // Reset error when changing audio
        audio.src = newSrc;
        audio.load();
        setMaxPercent(0);
        metadataDurationRef.current = null;
        setDuration(0);
        setSubmittedThisSession(false);
        submittedRef.current = false;

        void estimateAudioDuration(newSrc)
          .then((estimated) => {
            // Chỉ dùng ước lượng khi metadata chưa load — tránh ghi đè duration
            // thật bằng fallback 60s của estimateAudioDuration.
            if (metadataDurationRef.current !== null) return;
            const safe = sanitizeDurationSeconds(estimated);
            if (safe !== undefined) {
              setDuration(safe);
              onDurationChangeRef.current?.(safe);
            }
          })
          .catch(() => {
            // Metadata/duration sẽ được cập nhật qua loadedmetadata nếu có.
          });
      }
    }
  }, [selectedLesson, audioFiles]);

  // Submit when crossing threshold (70%) once per session per audio
  useEffect(() => {
    const uid = session?.user?.id;
    if (!uid || !trackingContext) return;
    if (submittedThisSession || submittedRef.current) return;
    if (duration <= 0) return;
    if (maxPercent < 70) return;

    const audioId = String(selectedLesson + 1);
    submittedRef.current = true;
    setSubmittedThisSession(true);
    saveListeningProgress({
      studentId: uid,
      module: trackingContext.module,
      itemKey: trackingContext.itemKey,
      audioId,
      durationSeconds: duration,
      maxProgressPercent: maxPercent,
    })
      .then(() => {
        // no-op
      })
      .catch((e) => {
        console.error("saveListeningProgress error", e);
        // allow retry on failure
        submittedRef.current = false;
        setSubmittedThisSession(false);
      });
  }, [
    maxPercent,
    duration,
    trackingContext,
    session?.user?.id,
    selectedLesson,
    submittedThisSession,
  ]);

  const handlePlayPause = async () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (isPlaying) {
      audio.pause();
    } else {
      if (recordingActive) {
        requestStopRecording();
      }
      // Reset progress tracking if playing from the start, for re-listens
      // Allow a small buffer (20%) to account for slight delays in setting currentTime
      if (audio.currentTime < (duration * 20) / 100 || audio.ended) {
        handleResetProgressTracking();
        // Reset repeat counter when starting from beginning
        currentRepeatRef.current = 0;
      }
      try {
        await audio.play();
      } catch {
      }
    }
  };

  const handleLessonSelect = (index: number) => {
    if (index !== selectedLesson) {
      setSelectedLesson(index);
      onLessonSelect?.(index);
      setPlaybackRate(1);
      setIsPlaying(false);
      setCurrentTime(0);
      metadataDurationRef.current = null;
      setDuration(0);
      currentRepeatRef.current = 0; // Reset repeat counter when changing lesson

      if (audioRef.current) {
        audioRef.current.playbackRate = 1;
      }
    }
  };

  const handleSeek = (seconds: number) => {
    if (audioRef.current && duration > 0) {
      const newTime = audioRef.current.currentTime + seconds;
      const finalTime = Math.max(0, Math.min(newTime, duration));
      audioRef.current.currentTime = finalTime;

      // If seeking back towards the beginning, reset progress tracking for re-listens
      if (finalTime < 1 && seconds < 0) {
        handleResetProgressTracking();
      }
    }
  };

  const handleProgressChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (audioRef.current && duration > 0) {
      const newTime = (Number(e.target.value) / 100) * duration;
      audioRef.current.currentTime = newTime;
      // If user seeks back to the beginning, reset progress tracking
      if (newTime < 1) {
        handleResetProgressTracking();
      }
    }
  };

  const formatTime = (time: number) => {
    if (isNaN(time) || time === 0) return "00:00";
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    return `${minutes.toString().padStart(2, "0")}:${seconds
      .toString()
      .padStart(2, "0")}`;
  };

  const progressPercent = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div className={`relative ${className}`}>
      <audio ref={audioRef} preload="metadata" />

      {audioFiles.length > 0 ? (
        <>
          {audioError && (
            <div className="mb-4 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
              <p className="text-sm text-red-800 dark:text-red-200">
                ⚠️ {audioError}
              </p>
            </div>
          )}
          <div>
            <input
              type="range"
              min="0"
              max="100"
              value={progressPercent}
              onChange={handleProgressChange}
              disabled={recordingActive}
              className="w-full h-2 bg-gray-200 rounded-full appearance-none cursor-pointer slider"
            />
            <div className="flex justify-between text-xs text-gray-500 mt-2">
              <span>{formatTime(currentTime)}</span>
              <span>{formatTime(duration)}</span>
            </div>
          </div>

          <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-1">
            <div className="flex items-center gap-2 flex-wrap justify-self-start min-w-0">
              {actionNode}
              {defaultRepeatCount > 0 && (
                <button
                  onClick={() => {
                    if (recordingActive) return;
                    const newCount = repeatCount > 0 ? 0 : defaultRepeatCount;
                    setRepeatCount(newCount);
                    currentRepeatRef.current = 0;
                  }}
                  disabled={recordingActive}
                  className={`px-2 py-1.5 flex items-center justify-center gap-1 rounded-lg text-xs font-semibold transition-all border ${
                    repeatCount > 0
                      ? "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-800/50"
                      : "bg-gray-100 text-gray-500 border-transparent hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-400 dark:hover:bg-gray-700"
                  }`}
                >
                  <FiRepeat className={`w-3.5 h-3.5 shrink-0 ${repeatCount > 0 ? "text-blue-600 dark:text-blue-400" : "text-gray-400 dark:text-gray-500"}`} />
                  <span className="leading-none mt-0.5 hidden sm:inline">
                    {repeatCount > 0 ? `Lặp: ${repeatCount} lần` : "Lặp: Tắt"}
                  </span>
                </button>
              )}
            </div>

            <div className="flex items-center justify-center gap-2 sm:gap-4">
              <Button
                onClick={() => handleSeek(-5)}
                variant="ghost"
                disabled={recordingActive}
                className="relative w-10 h-10 flex-shrink-0 rounded-full text-gray-600 hover:bg-gray-100 transition-colors flex items-center justify-center p-0"
                title="Lùi 5s"
              >
                <FiRotateCcw className="w-6 h-6" />
                <span className="absolute text-[9px] font-bold top-1/2 left-1/2 -translate-x-[50%] -translate-y-[45%]">5</span>
              </Button>

              <Button
                onClick={handlePlayPause}
                variant="ghost"
                className="w-12 h-12 flex-shrink-0 rounded-full hover:bg-gray-100 hover:scale-105 transform transition-transform duration-300 flex items-center justify-center p-0 text-blue-500"
                title={isPlaying ? "Tạm dừng" : "Phát"}
              >
                {isPlaying ? (
                  <FiPause className="w-8 h-8 fill-current" />
                ) : (
                  <FiPlay className="w-8 h-8 fill-current ml-1" />
                )}
              </Button>

              <Button
                onClick={() => handleSeek(5)}
                variant="ghost"
                disabled={recordingActive}
                className="relative w-10 h-10 flex-shrink-0 rounded-full text-gray-600 hover:bg-gray-100 transition-colors flex items-center justify-center p-0"
                title="Tới 5s"
              >
                <FiRotateCw className="w-6 h-6" />
                <span className="absolute text-[9px] font-bold top-1/2 left-1/2 -translate-x-[50%] -translate-y-[45%]">5</span>
              </Button>
            </div>

            <div className="flex items-center gap-2 flex-wrap justify-self-end min-w-0">
              <div className="flex bg-gray-100 dark:bg-gray-800 rounded-lg p-0.5 shadow-sm border border-gray-200/50 dark:border-gray-700/50">
                {AUDIO_PLAYER_CONFIG.speeds.map((speed) => (
                  <button
                    key={speed}
                    onClick={() => {
                      if (recordingActive) return;
                      setPlaybackRate(speed);
                      if (audioRef.current) audioRef.current.playbackRate = speed;
                    }}
                    disabled={recordingActive}
                    className={`px-2 py-1 min-w-[2.5rem] flex items-center justify-center gap-1 rounded-md text-xs font-semibold transition-all ${
                      playbackRate === speed
                        ? "bg-white dark:bg-gray-700 text-blue-600 dark:text-blue-400 shadow-sm"
                        : "text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
                    }`}
                  >
                    <span className="leading-none">{speed}x</span>
                  </button>
                ))}
              </div>
            </div>
          </div>



          {!hideLessonList && (
            <div className="grid grid-cols-8 sm:grid-cols-10 lg:grid-cols-16 gap-1">
              {audioFiles.map((_, index) => {
                if (missingLessons.includes(index + 1)) {
                  return null;
                }

                return (
                  <Button
                    key={index}
                    onClick={() => handleLessonSelect(index)}
                    disabled={recordingActive}
                    variant={selectedLesson === index ? "primary" : "secondary"}
                    size="sm"
                    className={`aspect-square w-full h-auto rounded-xl text-lg font-bold transition-all duration-200 ${
                      selectedLesson === index
                        ? " bg-primary text-white shadow-md scale-105"
                        : "bg-white text-gray-700 hover:bg-blue-100 hover:text-blue-700 border border-gray-200"
                    }`}
                  >
                    {index + 1}
                  </Button>
                );
              })}
            </div>
          )}
        </>
      ) : (
        <div className="text-center py-12">
          <div className="flex justify-center mb-4">
            <div className="bg-gray-100 rounded-full">
              <FiMusic className="w-12 h-12 text-gray-400" />
            </div>
          </div>
          <h4 className="text-xl font-semibold text-gray-600 mb-2">
            Chưa có bài học nào
          </h4>
          <p className="text-gray-500">Hãy chọn sách để bắt đầu học</p>
        </div>
      )}

      <style jsx>{
        /* css */ `
          .slider::-webkit-slider-thumb {
            -webkit-appearance: none;
            appearance: none;
            width: 20px;
            height: 20px;
            border-radius: 50%;
            background: #3b82f6; /* blue-600 */
            cursor: pointer;
            border: 4px solid white;
            box-shadow: 0 0 5px rgba(0, 0, 0, 0.2);
            transition: transform 0.2s ease;
          }
          .slider::-webkit-slider-thumb:hover {
            transform: scale(1.1);
          }
          .slider::-moz-range-thumb {
            width: 20px;
            height: 20px;
            border-radius: 50%;
            background: #3b82f6;
            cursor: pointer;
            border: 4px solid white;
            box-shadow: 0 0 5px rgba(0, 0, 0, 0.2);
          }
        `
      }</style>
    </div>
  );
}
