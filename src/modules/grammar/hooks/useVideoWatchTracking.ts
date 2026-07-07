"use client";

import { GrammarTopic } from "@/constants/grammar";
import { useAuth } from "@/lib/auth/context";
import { saveWatchHeartbeat } from "@/modules/classes/services";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { studentMovieWatchTrackingKey } from "./useStudentMovieWatchTracking";

export interface VideoPlayerInstance {
  getCurrentTime: () => number;
  getDuration: () => number;
  pauseVideo: () => void;
  playVideo: () => void;
  seekTo: (seconds: number, allowSeekAhead: boolean) => void;
  destroy: () => void;
}

export interface SelectedExerciseForTracking {
  exerciseNo: number;
  subNo?: number;
  title: string;
  video?: string;
}

interface UseVideoWatchTrackingOptions {
  topic?: GrammarTopic;
  selectedVideoUrl: string | null;
  selectedExercise?: SelectedExerciseForTracking | null;
  onCurrentTime?: (currentTimeSec: number) => void;
  mediaType?: "music" | "grammar" | "movie";
  completionName?: string;
}

const ACTIVITY_EVENTS = [
  "touchstart",
  "touchend",
  "mousemove",
  "keydown",
  "click",
  "scroll",
] as const;

function computeIdleMs(timesVocab: number): number {
  return (Math.floor(timesVocab / 100) + 1) * 5 * 60 * 1000;
}

export function useVideoWatchTracking({
  topic,
  selectedVideoUrl,
  selectedExercise,
  onCurrentTime,
  mediaType = "grammar",
  completionName,
}: UseVideoWatchTrackingOptions) {
  const { session, profile, refetchProfile } = useAuth();
  const queryClient = useQueryClient();
  const playerRef = useRef<VideoPlayerInstance | null>(null);

  const isPlayingRef = useRef<boolean>(false);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const lastTickTimeRef = useRef<number>(0);
  const accumulatedSecondsRef = useRef<number>(0);
  const heartbeatThresholdRef = useRef<number>(300);
  const activeVideoUrlRef = useRef<string | null>(null);
  const trackedVideoRef = useRef<string | null>(null);
  const videoDurationRef = useRef<number>(0);
  const lastActivityRef = useRef<number>(Date.now());
  const sessionCompletedRef = useRef<Set<string>>(new Set());

  const onCurrentTimeRef = useRef(onCurrentTime);
  const completionNameRef = useRef(completionName);
  const isCompletedRef = useRef(false);
  const idleMsRef = useRef(computeIdleMs(0));
  const refetchProfileRef = useRef(refetchProfile);

  const isCompleted = useMemo(() => {
    if (!completionName) return false;
    if (sessionCompletedRef.current.has(completionName)) return true;
    return (profile?.movies ?? []).includes(completionName);
  }, [completionName, profile?.movies]);

  useEffect(() => {
    completionNameRef.current = completionName;
    isCompletedRef.current = isCompleted;
  }, [completionName, isCompleted]);

  useEffect(() => {
    idleMsRef.current = computeIdleMs(profile?.timesVocab ?? 0);
  }, [profile?.timesVocab]);

  useEffect(() => {
    refetchProfileRef.current = refetchProfile;
  }, [refetchProfile]);

  const resetWatchTracking = useCallback(() => {
    trackedVideoRef.current = null;
    accumulatedSecondsRef.current = 0;
    isPlayingRef.current = false;
  }, []);

  const markVideoTracked = useCallback((videoKey: string) => {
    trackedVideoRef.current = videoKey;
  }, []);

  const clearVideoTracked = useCallback(() => {
    trackedVideoRef.current = null;
  }, []);

  const isVideoAlreadyTracked = useCallback(
    (videoKey: string) => trackedVideoRef.current === videoKey,
    []
  );

  useEffect(() => {
    onCurrentTimeRef.current = onCurrentTime;
  }, [onCurrentTime]);

  const stopTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const handleCompletionMarked = useCallback((name: string | undefined) => {
    if (!name) return;
    sessionCompletedRef.current.add(name);
    isCompletedRef.current = true;
    refetchProfileRef.current?.();
  }, []);

  const invalidateMovieWatchTracking = useCallback(() => {
    const userId = session?.user?.id;
    if (!userId || mediaType !== "movie") return;
    void queryClient.invalidateQueries({
      queryKey: studentMovieWatchTrackingKey(userId),
    });
  }, [mediaType, queryClient, session?.user?.id]);

  const buildHeartbeatPayload = useCallback(
    (videoUrl: string, watchedSeconds: number) => ({
      userId: session!.user!.id,
      videoUrl,
      watchedSeconds,
      topicId: topic?.id,
      topicName: topic?.title,
      exerciseNo: selectedExercise?.exerciseNo,
      subNo: selectedExercise?.subNo,
      exerciseTitle: selectedExercise?.title,
      mediaType,
      durationSeconds:
        videoDurationRef.current > 0 ? videoDurationRef.current : undefined,
      completionName: completionNameRef.current,
    }),
    [session?.user?.id, topic, selectedExercise, mediaType]
  );

  const saveHeartbeat = useCallback(
    (seconds: number) => {
      if (isCompletedRef.current) return;
      const videoUrlToSave = activeVideoUrlRef.current;
      if (!videoUrlToSave || !session?.user?.id || seconds <= 0) return;

      saveWatchHeartbeat(buildHeartbeatPayload(videoUrlToSave, seconds))
        .then((result) => {
          invalidateMovieWatchTracking();
          if (result.markedCompleted) {
            handleCompletionMarked(completionNameRef.current);
          }
        })
        .catch((err) => {
          console.error("Error saving watch heartbeat:", err);
        });
    },
    [session?.user?.id, buildHeartbeatPayload, handleCompletionMarked, invalidateMovieWatchTracking]
  );

  const flushHeartbeat = useCallback(() => {
    if (isCompletedRef.current) return;
    const secondsToSave = Math.floor(accumulatedSecondsRef.current);
    if (secondsToSave > 0) {
      saveHeartbeat(secondsToSave);
      accumulatedSecondsRef.current -= secondsToSave;
    }
  }, [saveHeartbeat]);

  const pauseForIdle = useCallback(() => {
    if (isPlayingRef.current && playerRef.current) {
      try {
        playerRef.current.pauseVideo();
      } catch (e) {
        console.error("Error pausing media on idle:", e);
      }
    }
    isPlayingRef.current = false;
    stopTimer();
    flushHeartbeat();
  }, [stopTimer, flushHeartbeat]);

  const startTimer = useCallback(() => {
    if (timerRef.current || isCompletedRef.current) return;
    lastTickTimeRef.current = Date.now();
    timerRef.current = setInterval(() => {
      if (document.visibilityState !== "visible" || !isPlayingRef.current) {
        return;
      }

      const now = Date.now();
      if (now - lastActivityRef.current > idleMsRef.current) {
        pauseForIdle();
        return;
      }

      const deltaMs = now - lastTickTimeRef.current;
      lastTickTimeRef.current = now;

      if (deltaMs > 0 && deltaMs < 2000) {
        const deltaSec = deltaMs / 1000;
        accumulatedSecondsRef.current += deltaSec;

        const threshold = heartbeatThresholdRef.current;
        if (accumulatedSecondsRef.current >= threshold) {
          const secondsToSave = Math.floor(accumulatedSecondsRef.current);
          saveHeartbeat(secondsToSave);
          accumulatedSecondsRef.current -= secondsToSave;
        }
      } else {
        lastTickTimeRef.current = now;
      }
    }, 1000);
  }, [saveHeartbeat, pauseForIdle]);

  // Idle activity listeners (throttle: only reset if >= 10s since last activity)
  useEffect(() => {
    if (isCompleted) return;

    const onActivity = () => {
      const now = Date.now();
      if (now - lastActivityRef.current >= 10_000) {
        lastActivityRef.current = now;
      }
    };

    for (const evt of ACTIVITY_EVENTS) {
      document.addEventListener(evt, onActivity, { passive: true });
    }
    return () => {
      for (const evt of ACTIVITY_EVENTS) {
        document.removeEventListener(evt, onActivity);
      }
    };
  }, [isCompleted]);

  // Handle Visibility API
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        if (isPlayingRef.current && playerRef.current) {
          try {
            playerRef.current.pauseVideo();
          } catch (e) {
            console.error("Error pausing media on visibility change:", e);
          }
        }
        isPlayingRef.current = false;
        stopTimer();
        if (!isCompletedRef.current) {
          flushHeartbeat();
        }
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [flushHeartbeat, stopTimer]);

  // Handle selected video change or unmount transition
  useEffect(() => {
    const prevSeconds = Math.floor(accumulatedSecondsRef.current);
    if (
      prevSeconds > 0 &&
      activeVideoUrlRef.current &&
      session?.user?.id &&
      !isCompletedRef.current
    ) {
      const urlToSave = activeVideoUrlRef.current;
      saveWatchHeartbeat(buildHeartbeatPayload(urlToSave, prevSeconds))
        .then((result) => {
          invalidateMovieWatchTracking();
          if (result.markedCompleted) {
            handleCompletionMarked(completionNameRef.current);
          }
        })
        .catch((err) => {
          console.error("Error saving watch heartbeat during video switch:", err);
        });
    }

    accumulatedSecondsRef.current = 0;
    isPlayingRef.current = false;
    videoDurationRef.current = 0;
    stopTimer();
    lastActivityRef.current = Date.now();

    activeVideoUrlRef.current = selectedVideoUrl;

    if (mediaType === "music") {
      heartbeatThresholdRef.current = 180;
    } else if (mediaType === "grammar") {
      heartbeatThresholdRef.current = 300;
    } else {
      heartbeatThresholdRef.current = 600;
    }
  }, [
    selectedVideoUrl,
    mediaType,
    session?.user?.id,
    stopTimer,
    buildHeartbeatPayload,
    handleCompletionMarked,
    invalidateMovieWatchTracking,
  ]);

  // Clean up on component unmount
  useEffect(() => {
    return () => {
      const seconds = Math.floor(accumulatedSecondsRef.current);
      if (
        seconds > 0 &&
        activeVideoUrlRef.current &&
        session?.user?.id &&
        !isCompletedRef.current
      ) {
        const urlToSave = activeVideoUrlRef.current;
        saveWatchHeartbeat(buildHeartbeatPayload(urlToSave, seconds))
          .then((result) => {
            invalidateMovieWatchTracking();
            if (result.markedCompleted) {
              handleCompletionMarked(completionNameRef.current);
            }
          })
          .catch((err) => {
            console.error("Error saving watch heartbeat during unmount:", err);
          });
      }
      stopTimer();
    };
  }, [
    session?.user?.id,
    stopTimer,
    buildHeartbeatPayload,
    handleCompletionMarked,
    invalidateMovieWatchTracking,
  ]);

  const handleVideoProgress = useCallback(
    (
      _percent: number,
      currentTime: number,
      duration: number,
      _volume: number,
      _isMuted: boolean
    ) => {
      onCurrentTimeRef.current?.(currentTime);
      if (duration > 0) {
        videoDurationRef.current = duration;
      }
    },
    []
  );

  const handleDurationReady = useCallback((duration: number) => {
    if (duration > 0) {
      videoDurationRef.current = duration;
    }
  }, []);

  const handleVideoPlay = useCallback(() => {
    isPlayingRef.current = true;
    lastActivityRef.current = Date.now();
    if (!isCompletedRef.current) {
      startTimer();
    }
  }, [startTimer]);

  const handleVideoPause = useCallback(() => {
    isPlayingRef.current = false;
    stopTimer();
    if (!isCompletedRef.current) {
      flushHeartbeat();
    }
  }, [stopTimer, flushHeartbeat]);

  const handleVideoEnd = useCallback(() => {
    isPlayingRef.current = false;
    stopTimer();
    if (!isCompletedRef.current) {
      flushHeartbeat();
    }
  }, [stopTimer, flushHeartbeat]);

  /** Nguồn chân lý duy nhất cho trạng thái đang phát (gồm cả auto-pause khi idle / đổi tab). */
  const getIsPlaying = useCallback(() => isPlayingRef.current, []);

  return {
    playerRef,
    getIsPlaying,
    handleVideoProgress,
    handleDurationReady,
    handleVideoPlay,
    handleVideoPause,
    handleVideoEnd,
    handleCheckpointConfirm: () => {},
    handleDishonestModalClose: () => {},
    showCheckpointModal: false,
    checkpointCountdown: 7,
    showDishonestModal: false,
    resetWatchTracking,
    saveFinalProgress: flushHeartbeat,
    markVideoTracked,
    clearVideoTracked,
    isVideoAlreadyTracked,
  };
}
