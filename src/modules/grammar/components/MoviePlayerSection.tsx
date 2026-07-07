"use client";

import { GrammarTopic } from "@/constants/grammar";
import { useAuth } from "@/lib/auth/context";
import { UserRole } from "@/lib/auth/types";
import { useEpisodeSubtitles } from "@/modules/admin/hooks/useContentManagement";
import {
  getEpisodeKey,
  getMovieVariant,
} from "@/modules/admin/services/content.service";
import { MagicDoor } from "@/modules/home/components";
import { saveGrammarView } from "@/modules/classes/services";
import {
  buildBilingualRows,
  getActiveBilingualRow,
  type BilingualSubtitleRow,
} from "@/utils/subtitles";
import {
  getYouTubeVideoId,
  getYouTubeEmbedUrl,
  isYouTubeUrl,
} from "@/utils/youtube";
import { getDeviceType } from "@/utils/device";
import {
  FiChevronLeft,
  FiMaximize,
  FiMinimize,
} from "react-icons/fi";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import toast from "react-hot-toast";
import type { GrammarPlayerExerciseRef } from "./GrammarPlayerSection";
import { YouTubePlayer } from "./YouTubePlayer";
import { Html5VideoPlayer } from "./Html5VideoPlayer";
import { MovieSubtitleOverlay } from "./MovieSubtitleOverlay";
import {
  MoviePlayerGuideTour,
  type MovieGuideTourStep,
} from "./MoviePlayerGuideTour";
import { useVideoWatchTracking } from "../hooks/useVideoWatchTracking";
import {
  markMovieGuideCompleted,
  shouldShowMovieGuide,
} from "../utils/movieGuideStorage";
import {
  isEpisodeUnlocked,
  resolveEpisodeListIndex,
} from "../utils/movieProgress";
import { useStudentMovieWatchTracking } from "../hooks/useStudentMovieWatchTracking";

const MOVIE_SUBTITLE_PREFS_KEY = "breadtrans:movie-subtitle-prefs";

type SubtitleMode = "en" | "off";

type MovieSubtitlePrefs = {
  mode: SubtitleMode;
};

const DEFAULT_SUBTITLE_MODE: SubtitleMode = "en";

function subtitleModeToFlags(mode: SubtitleMode): {
  showEnglish: boolean;
  showViAlways: boolean;
} {
  switch (mode) {
    case "en":
      return { showEnglish: true, showViAlways: false };
    case "off":
      return { showEnglish: false, showViAlways: false };
  }
}

function readMovieSubtitlePrefs(): SubtitleMode {
  if (typeof window === "undefined") return DEFAULT_SUBTITLE_MODE;
  try {
    const raw = window.localStorage.getItem(MOVIE_SUBTITLE_PREFS_KEY);
    if (!raw) return DEFAULT_SUBTITLE_MODE;
    const parsed = JSON.parse(raw) as Partial<
      MovieSubtitlePrefs & { showEnglish?: boolean; showViAlways?: boolean }
    >;
    if (parsed.mode === "en" || parsed.mode === "off") {
      return parsed.mode;
    }
    if (parsed.mode === "vi") return "en";
    // Migrate legacy checkbox prefs
    const showEnglish = parsed.showEnglish === true;
    const showViAlways = parsed.showViAlways === true;
    if (!showEnglish && !showViAlways) return "off";
    if (showViAlways && !showEnglish) return "en";
    if (showEnglish && !showViAlways) return "en";
    return "en";
  } catch {
    return DEFAULT_SUBTITLE_MODE;
  }
}

function queryTourTarget(id: string): HTMLElement | null {
  const nodes = document.querySelectorAll(`[data-movie-tour="${id}"]`);
  for (const el of nodes) {
    if (el instanceof HTMLElement && el.offsetParent !== null) return el;
  }
  const first = nodes[0];
  return first instanceof HTMLElement ? first : null;
}

interface SubtitleModeSwitchProps {
  mode: SubtitleMode;
  onModeChange: (mode: SubtitleMode) => void;
  tourAnchorId?: string;
  className?: string;
}

function SubtitleModeSwitch({
  mode,
  onModeChange,
  tourAnchorId,
  className = "",
}: SubtitleModeSwitchProps) {
  const isEn = mode === "en";
  return (
    <div
      data-movie-tour={tourAnchorId}
      className={`inline-flex rounded-lg bg-white/5 p-0.5 border border-white/[0.06] ${className}`}
      role="group"
      aria-label="Chế độ phụ đề"
    >
      <button
        type="button"
        aria-pressed={isEn}
        onClick={() => onModeChange("en")}
        className={`rounded-md px-2 py-1 text-xs font-semibold transition-colors sm:px-2.5 sm:text-sm ${
          isEn
            ? "bg-amber-400 text-slate-900 shadow-sm"
            : "text-slate-400 hover:text-slate-200"
        }`}
      >
       Sub
      </button>
      <button
        type="button"
        aria-pressed={!isEn}
        onClick={() => onModeChange("off")}
        className={`rounded-md px-2 py-1 text-xs font-semibold transition-colors sm:px-2.5 sm:text-sm ${
          !isEn
            ? "bg-amber-400 text-slate-900 shadow-sm"
            : "text-slate-400 hover:text-slate-200"
        }`}
      >
        Tắt
      </button>
    </div>
  );
}

interface MoviePlayerSectionProps {
  topic: GrammarTopic;
  onClose: () => void;
  autoPlayVideo?: boolean;
  initialExercise?: GrammarPlayerExerciseRef | null;
  onExerciseChange?: (exercise: GrammarPlayerExerciseRef | null) => void;
}

function isDirectVideoUrl(url: string): boolean {
  if (!url) return false;
  try {
    const u = new URL(
      url,
      typeof window !== "undefined" ? window.location.href : "http://localhost"
    );
    const path = u.pathname.toLowerCase();
    return (
      path.endsWith(".mp4") ||
      path.endsWith(".webm") ||
      path.endsWith(".ogg") ||
      path.endsWith(".mov") ||
      path.endsWith(".m4v") ||
      path.endsWith(".mkv")
    );
  } catch {
    const lower = url.toLowerCase();
    return (
      lower.includes(".mp4") ||
      lower.includes(".webm") ||
      lower.includes(".ogg") ||
      lower.includes(".mov") ||
      lower.includes(".m4v") ||
      lower.includes(".mkv")
    );
  }
}

export default function MoviePlayerSection({
  topic,
  onClose,
  autoPlayVideo = false,
  initialExercise = null,
  onExerciseChange,
}: MoviePlayerSectionProps) {
  const { session } = useAuth();
  const isStudent = session?.user?.role === UserRole.STUDENT;
  const studentId = isStudent ? session?.user?.id : undefined;
  const movieWatchTrackingQuery = useStudentMovieWatchTracking(studentId);
  const movieWatchViews = movieWatchTrackingQuery.data ?? [];
  const [showMagicDoor, setShowMagicDoor] = useState(false);
  const [subtitleMode, setSubtitleMode] = useState<SubtitleMode>(
    () => readMovieSubtitlePrefs()
  );
  const { showEnglish, showViAlways } = subtitleModeToFlags(subtitleMode);
  const [revealedVi, setRevealedVi] = useState(false);
  const [seekPreviewRowIndex, setSeekPreviewRowIndex] = useState<number | null>(
    null
  );
  const [isPaused, setIsPaused] = useState(false);
  const [currentTimeSec, setCurrentTimeSec] = useState(0);
  const [selectedVideoUrl, setSelectedVideoUrl] = useState<string | null>(null);
  const [selectedExercise, setSelectedExercise] = useState<{
    exerciseNo: number;
    subNo?: number;
    title: string;
    video?: string;
  } | null>(null);

  /** Fullscreen custom — fullscreen cả khung (kèm overlay phụ đề), KHÔNG dùng fullscreen native của player. */
  const [isFullscreen, setIsFullscreen] = useState(false);
  /** Hiện/ẩn nút điều khiển trên khung (tự ẩn khi đang xem để đỡ chiếm màn hình). */
  const [controlsVisible, setControlsVisible] = useState(true);
  /** PC mới cho phép chạm bất kỳ để play/pause; mobile thì tắt để tránh chạm nhầm. */
  const [isPc, setIsPc] = useState(false);
  /** Phản hồi ngắn khi chạm trái/phải tua theo câu trên mobile. */
  const [seekFlash, setSeekFlash] = useState<-1 | 1 | null>(null);
  const [guideOpen, setGuideOpen] = useState(false);

  useEffect(() => {
    setIsPc(getDeviceType() === "pc");
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const prefs: MovieSubtitlePrefs = { mode: subtitleMode };
    window.localStorage.setItem(MOVIE_SUBTITLE_PREFS_KEY, JSON.stringify(prefs));
  }, [subtitleMode]);

  const autoPlayedRef = useRef(false);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const controlsHideTimerRef = useRef<number | null>(null);
  const seekFlashTimerRef = useRef<number | null>(null);
  /** Phát hiện double tap theo từng bên cho mobile seek. */
  const lastSeekTapRef = useRef<{ side: "left" | "right" | null; time: number }>(
    { side: null, time: 0 }
  );
  const onExerciseChangeRef = useRef(onExerciseChange);
  const guideScheduledForUrlRef = useRef<string | null>(null);
  const guideCompletedThisRunRef = useRef(false);

  const variant = getMovieVariant(topic);
  const showEpisodesGuideStep =
    variant === "series" && topic.exercises.length > 1;
  const episodeKey = selectedExercise
    ? getEpisodeKey(selectedExercise.exerciseNo, variant)
    : undefined;

  const subtitlesQuery = useEpisodeSubtitles(
    topic.id,
    episodeKey,
    !!selectedExercise && !!episodeKey
  );

  const bilingualRows = useMemo(
    () =>
      buildBilingualRows(
        subtitlesQuery.data?.eng,
        subtitlesQuery.data?.vn,
        subtitlesQuery.data?.pronounce
      ),
    [subtitlesQuery.data]
  );

  const activeRow = useMemo(
    () => getActiveBilingualRow(bilingualRows, currentTimeSec),
    [bilingualRows, currentTimeSec]
  );

  const completionName = useMemo(() => {
    if (!selectedExercise) return undefined;
    if (variant === "series") {
      return `${topic.title} - Tập ${selectedExercise.exerciseNo}`;
    }
    return topic.title;
  }, [topic.title, selectedExercise, variant]);

  const {
    playerRef,
    getIsPlaying,
    handleVideoProgress,
    handleDurationReady,
    handleVideoPlay,
    handleVideoPause,
    handleVideoEnd,
    resetWatchTracking,
    saveFinalProgress,
    markVideoTracked,
    clearVideoTracked,
    isVideoAlreadyTracked,
  } = useVideoWatchTracking({
    topic,
    selectedVideoUrl,
    selectedExercise,
    onCurrentTime: setCurrentTimeSec,
    mediaType: "movie",
    completionName,
  });

  useEffect(() => {
    onExerciseChangeRef.current = onExerciseChange;
  }, [onExerciseChange]);

  const selectExercise = useCallback(
    async (
      videoUrl: string,
      index: number,
      exercise: {
        exerciseNo: number;
        subNo?: number;
        title: string;
        video?: string;
      }
    ) => {
      if (!session?.user && index > 0) {
        setShowMagicDoor(true);
        return;
      }

      if (isStudent && !isEpisodeUnlocked(movieWatchViews, topic, index)) {
        toast.error("Xem hết các tập trước để mở khóa tập này");
        return;
      }

      if (!videoUrl) {
        toast.error("Video đang được cập nhật");
        return;
      }

      const videoKey = `${topic.id}_${exercise.exerciseNo}_${exercise.subNo || 0}`;

      if (!isVideoAlreadyTracked(videoKey)) {
        resetWatchTracking();
      }

      setSelectedVideoUrl(videoUrl);
      setSelectedExercise(exercise);
      setCurrentTimeSec(0);
      setRevealedVi(false);
      setSeekPreviewRowIndex(null);
      setIsPaused(false);

      if (session?.user?.id && !isVideoAlreadyTracked(videoKey)) {
        markVideoTracked(videoKey);
        try {
          await saveGrammarView({
            studentId: session.user.id,
            topicId: topic.id,
            topicName: topic.title,
            exerciseNo: exercise.exerciseNo,
            subNo: exercise.subNo,
            exerciseTitle: exercise.title,
            videoUrl,
            watchedPercent: 0,
            mediaType: "movie",
          });
        } catch (error) {
          console.error("Error saving grammar view:", error);
          clearVideoTracked();
        }
      }
    },
    [
      session?.user,
      isStudent,
      movieWatchViews,
      topic,
      resetWatchTracking,
      isVideoAlreadyTracked,
      markVideoTracked,
      clearVideoTracked,
    ]
  );

  useEffect(() => {
    if (autoPlayedRef.current) return;

    let targetIndex = 0;
    if (isStudent) {
      targetIndex = resolveEpisodeListIndex(
        movieWatchViews,
        topic,
        initialExercise
      );
    } else if (initialExercise) {
      const foundIdx = topic.exercises.findIndex(
        (ex) =>
          ex.exerciseNo === initialExercise.exerciseNo &&
          ex.subNo === initialExercise.subNo
      );
      if (foundIdx !== -1) targetIndex = foundIdx;
    }

    const targetExercise = topic.exercises[targetIndex] ?? topic.exercises[0];

    if (!targetExercise?.video) return;
    autoPlayedRef.current = true;
    void selectExercise(targetExercise.video, targetIndex, targetExercise);
  }, [
    autoPlayVideo,
    topic,
    initialExercise,
    selectExercise,
    movieWatchViews,
    isStudent,
  ]);

  useEffect(() => {
    const callback = onExerciseChangeRef.current;
    if (!callback) return;
    if (selectedExercise) {
      callback({
        exerciseNo: selectedExercise.exerciseNo,
        subNo: selectedExercise.subNo,
      });
    } else {
      callback(null);
    }
  }, [selectedExercise]);

  // Video tự chuyển câu: bỏ preview tua, ẩn lại VI (chế độ nghe trước).
  useEffect(() => {
    setSeekPreviewRowIndex((prev) => {
      if (prev === null || prev === activeRow?.index) return prev;
      return null;
    });
    setRevealedVi(false);
  }, [activeRow?.index]);

  useEffect(() => {
    setRevealedVi(false);
    setSeekPreviewRowIndex(null);
  }, [subtitleMode]);

  // Hiện nút điều khiển (fullscreen) khi có hoạt động; tự ẩn sau ít giây nếu đang phát
  // — bám theo hành vi tự ẩn của thanh điều khiển video để đỡ chiếm màn hình.
  // Mobile: native controls giữ ~3s sau chạm — PC chỉ cần ~300ms (chuột liên tục reset timer).
  const revealControls = useCallback(() => {
    setControlsVisible(true);
    if (controlsHideTimerRef.current) {
      window.clearTimeout(controlsHideTimerRef.current);
    }
    const hideDelayMs = isPc ? 300 : 3500;
    controlsHideTimerRef.current = window.setTimeout(() => {
      if (getIsPlaying()) setControlsVisible(false);
    }, hideDelayMs);
  }, [getIsPlaying, isPc]);

  const handleRevealVi = useCallback(() => {
    if (showViAlways || !showEnglish) return;
    setRevealedVi(true);
    revealControls();
  }, [showViAlways, showEnglish, revealControls]);

  /** Play/pause qua API (iframe YouTube không nhận click lên parent). */
  const togglePlayPause = useCallback(() => {
    const p = playerRef.current;
    if (!p) return;
    revealControls();

    try {
      const api = p as {
        getPlayerState?: () => number;
        isPaused?: () => boolean;
        playVideo: () => void;
        pauseVideo: () => void;
      };

      if (typeof api.getPlayerState === "function") {
        const state = api.getPlayerState();
        // YT: 1 playing, 3 buffering
        if (state === 1 || state === 3) {
          api.pauseVideo();
        } else {
          api.playVideo();
        }
        return;
      }

      if (typeof api.isPaused === "function") {
        if (api.isPaused()) {
          api.playVideo();
        } else {
          api.pauseVideo();
        }
        return;
      }

      if (getIsPlaying()) {
        api.pauseVideo();
      } else {
        api.playVideo();
      }
    } catch (err) {
      console.error("Error toggling play/pause:", err);
    }
  }, [playerRef, revealControls, getIsPlaying]);

  const handlePlayerPlay = useCallback(() => {
    setIsPaused(false);
    revealControls();
    handleVideoPlay();
  }, [handleVideoPlay, revealControls]);

  const handlePlayerPause = useCallback(() => {
    if (controlsHideTimerRef.current) {
      window.clearTimeout(controlsHideTimerRef.current);
      controlsHideTimerRef.current = null;
    }
    setControlsVisible(true);
    setIsPaused(true);
    handleVideoPause();
  }, [handleVideoPause]);

  const handlePlayerEnd = useCallback(() => {
    setIsPaused(false);
    void handleVideoEnd();
  }, [handleVideoEnd]);

  const seekBy = useCallback((deltaSec: number) => {
    const p = playerRef.current;
    if (!p) return;
    try {
      const duration = p.getDuration();
      const current = p.getCurrentTime();
      const max = duration > 0 ? duration : Number.POSITIVE_INFINITY;
      const next = Math.max(0, Math.min(current + deltaSec, max));
      p.seekTo(next, true);
      setCurrentTimeSec(next);
    } catch (e) {
      console.error("Error seeking via keyboard:", e);
    }
  }, [playerRef]);

  const flashCueSeek = useCallback((dir: -1 | 1) => {
    setSeekFlash(dir);
    if (seekFlashTimerRef.current) {
      window.clearTimeout(seekFlashTimerRef.current);
    }
    seekFlashTimerRef.current = window.setTimeout(() => setSeekFlash(null), 700);
  }, []);

  const handleSeekToRow = useCallback(
    (row: BilingualSubtitleRow) => {
      if (!playerRef.current) return;
      try {
        const sec = row.startMs / 1000;
        setSeekPreviewRowIndex(row.index);
        setRevealedVi(true);
        playerRef.current.seekTo(sec, true);
        playerRef.current.playVideo();
        setCurrentTimeSec(sec);
      } catch (e) {
        console.error("Error seeking:", e);
      }
    },
    [playerRef]
  );

  // Tua theo câu phụ đề: trái = câu trước (hoặc phát lại câu hiện tại nếu đã
  // vào sâu), phải = câu kế tiếp. Fallback ±5s khi chưa có phụ đề.
  const seekToAdjacentRow = useCallback(
    (dir: 1 | -1) => {
      const p = playerRef.current;
      if (!p) return;
      revealControls();
      if (bilingualRows.length === 0) {
        seekBy(dir * 5);
        return;
      }
      let currentMs = 0;
      try {
        currentMs = p.getCurrentTime() * 1000;
      } catch {
        return;
      }

      if (dir === 1) {
        const next = bilingualRows.find((r) => r.startMs > currentMs + 300);
        if (next) handleSeekToRow(next);
        return;
      }

      let curIdx = -1;
      for (let i = 0; i < bilingualRows.length; i += 1) {
        if (bilingualRows[i].startMs <= currentMs) curIdx = i;
        else break;
      }
      if (curIdx < 0) {
        handleSeekToRow(bilingualRows[0]);
        return;
      }
      const cur = bilingualRows[curIdx];
      if (currentMs - cur.startMs > 1500) {
        handleSeekToRow(cur);
      } else if (curIdx - 1 >= 0) {
        handleSeekToRow(bilingualRows[curIdx - 1]);
      } else {
        handleSeekToRow(cur);
      }
    },
    [bilingualRows, handleSeekToRow, seekBy, playerRef, revealControls]
  );

  // Double tap vùng trái/phải để tua theo câu (mobile).
  const handleMobileSeekZoneTap = useCallback(
    (side: "left" | "right") => {
      const now = Date.now();
      const last = lastSeekTapRef.current;
      const isDoubleTap = last.side === side && now - last.time < 320;

      if (isDoubleTap) {
        lastSeekTapRef.current = { side: null, time: 0 };
        if (bilingualRows.length === 0) return;
        const dir = side === "left" ? -1 : 1;
        seekToAdjacentRow(dir as -1 | 1);
        flashCueSeek(dir as -1 | 1);
        return;
      }

      lastSeekTapRef.current = { side, time: now };
    },
    [bilingualRows.length, flashCueSeek, seekToAdjacentRow]
  );

  const toggleFullscreen = useCallback(() => {
    const el = stageRef.current;
    if (!el) return;
    const doc = document as Document & {
      webkitFullscreenElement?: Element | null;
      webkitExitFullscreen?: () => void;
    };
    const node = el as HTMLDivElement & {
      webkitRequestFullscreen?: () => void;
    };
    // Trên mobile: khoá xoay ngang để tận dụng hết màn hình khi xem fullscreen.
    const lockLandscape = () => {
      const orientation = window.screen?.orientation as
        | (ScreenOrientation & { lock?: (o: string) => Promise<void> })
        | undefined;
      if (orientation?.lock) {
        orientation.lock("landscape").catch(() => {});
      }
    };
    const unlockOrientation = () => {
      try {
        window.screen?.orientation?.unlock?.();
      } catch {
        /* ignore */
      }
    };

    const fsElement = document.fullscreenElement ?? doc.webkitFullscreenElement ?? null;
    if (!fsElement) {
      if (node.requestFullscreen) {
        node.requestFullscreen().then(lockLandscape).catch(() => {});
      } else if (node.webkitRequestFullscreen) {
        node.webkitRequestFullscreen();
        lockLandscape();
      }
    } else {
      unlockOrientation();
      if (document.exitFullscreen) {
        document.exitFullscreen().catch(() => {});
      } else if (doc.webkitExitFullscreen) {
        doc.webkitExitFullscreen();
      }
    }
  }, []);

  useEffect(() => {
    const handler = () => {
      const doc = document as Document & { webkitFullscreenElement?: Element | null };
      const fsEl = document.fullscreenElement ?? doc.webkitFullscreenElement ?? null;
      const active = fsEl === stageRef.current;
      setIsFullscreen(active);
      // Thoát fullscreen (kể cả bằng nút hệ thống) thì mở khoá xoay màn hình.
      if (!active) {
        try {
          window.screen?.orientation?.unlock?.();
        } catch {
          /* ignore */
        }
      }
    };
    document.addEventListener("fullscreenchange", handler);
    document.addEventListener("webkitfullscreenchange", handler);
    return () => {
      document.removeEventListener("fullscreenchange", handler);
      document.removeEventListener("webkitfullscreenchange", handler);
    };
  }, []);

  useEffect(() => {
    return () => {
      if (controlsHideTimerRef.current) {
        window.clearTimeout(controlsHideTimerRef.current);
      }
      if (seekFlashTimerRef.current) {
        window.clearTimeout(seekFlashTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!selectedVideoUrl) return;

    const isTypingTarget = (target: EventTarget | null) => {
      if (!(target instanceof HTMLElement)) return false;
      const tag = target.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
      return target.isContentEditable;
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target)) return;

      const key = e.key;
      const p = playerRef.current;

      if (e.code === "Space" || key === " " || key === "k" || key === "K") {
        e.preventDefault();
        if (!p) return;
        if (e.repeat) return;
        togglePlayPause();
        return;
      }

      if (key === "ArrowLeft") {
        e.preventDefault();
        seekToAdjacentRow(-1);
        return;
      }
      if (key === "ArrowRight") {
        e.preventDefault();
        seekToAdjacentRow(1);
        return;
      }
      if (key === "j" || key === "J") {
        e.preventDefault();
        seekBy(-10);
        return;
      }
      if (key === "l" || key === "L") {
        e.preventDefault();
        seekBy(10);
        return;
      }
      if (key === "f" || key === "F") {
        e.preventDefault();
        toggleFullscreen();
      }
    };

    document.addEventListener("keydown", onKeyDown, true);
    return () => document.removeEventListener("keydown", onKeyDown, true);
  }, [selectedVideoUrl, playerRef, seekBy, seekToAdjacentRow, toggleFullscreen, togglePlayPause]);

  const handleBack = () => {
    saveFinalProgress();
    onClose();
  };

  const guideSteps = useMemo((): MovieGuideTourStep[] => {
    const steps: MovieGuideTourStep[] = [
      {
        target: () => queryTourTarget("subtitle-mode"),
        title: "Bước 1: Hiện Sub",
        body: "Hiện tiếng Anh; chạm vào phụ đề để xem bản dịch — chế độ luyện nghe.",
        placement: "bottom",
      },
      {
        target: () => queryTourTarget("subtitle-mode"),
        title: "Bước 2: Tắt",
        body: "Ẩn phụ đề khi bạn muốn xem không chữ.",
        placement: "bottom",
      },
      {
        target: () => queryTourTarget("fullscreen"),
        title: "Toàn màn hình",
        body: "Xem toàn màn hình kèm phụ đề. Phím tắt: F.",
        placement: "left",
      },
      {
        target: () => queryTourTarget("video-stage"),
        title: "Tua theo câu",
        body: isPc
          ? "Dùng phím ← → để tua lùi / tới từng câu phụ đề."
          : "Chạm đúp 2 lần mép trái hoặc phải video để tua theo câu.",
        placement: "top",
      },
      {
        target: () => queryTourTarget("back"),
        title: "Quay lại",
        body: "Thoát phim và lưu tiến độ xem của bạn.",
        placement: "bottom",
      },
    ];
    if (showEpisodesGuideStep) {
      steps.push({
        target: () => queryTourTarget("episodes"),
        title: "Chọn tập",
        body: "Chuyển sang tập khác trong bộ phim.",
        placement: "top",
      });
    }
    return steps;
  }, [isPc, showEpisodesGuideStep]);

  const completeGuide = useCallback(() => {
    guideCompletedThisRunRef.current = true;
    setGuideOpen(false);
    markMovieGuideCompleted();
    try {
      playerRef.current?.playVideo();
      revealControls();
    } catch {
      /* ignore */
    }
  }, [playerRef, revealControls]);

  useEffect(() => {
    if (guideOpen) {
      guideCompletedThisRunRef.current = false;
      return;
    }
    // Đóng giữa chừng → không tăng count, cho phép hiện lại lần sau
    if (!guideCompletedThisRunRef.current) {
      guideScheduledForUrlRef.current = null;
    }
  }, [guideOpen]);

  useEffect(() => {
    if (!selectedVideoUrl || !shouldShowMovieGuide()) return;
    if (guideScheduledForUrlRef.current === selectedVideoUrl) return;
    guideScheduledForUrlRef.current = selectedVideoUrl;
    const t = window.setTimeout(() => setGuideOpen(true), 600);
    return () => window.clearTimeout(t);
  }, [selectedVideoUrl]);

  useEffect(() => {
    if (!guideOpen) return;
    try {
      playerRef.current?.pauseVideo();
    } catch {
      /* ignore */
    }
  }, [guideOpen, playerRef]);

  return (
    <div className="flex flex-col w-full min-h-[calc(100vh-64px)] lg:min-h-screen bg-[#0f1217] text-slate-200">
      <div className="w-full flex flex-col min-h-0 shrink-0">
        <div className="flex items-center gap-2 px-2 sm:px-3 py-2 border-b border-white/[0.06]">
          <button
            type="button"
            data-movie-tour="back"
            onClick={handleBack}
            aria-label="Quay lại"
            title="Quay lại"
            className="rounded-lg flex items-center justify-center shrink-0 h-9 w-9 bg-amber-400 hover:bg-amber-300 text-slate-900 transition-colors"
          >
            <FiChevronLeft className="w-5 h-5" />
          </button>
          <h1 className="text-sm sm:text-base font-bold text-slate-100 truncate flex-1 min-w-0">
            {topic.title}
          </h1>
          <SubtitleModeSwitch
            className="flex shrink-0"
            tourAnchorId="subtitle-mode"
            mode={subtitleMode}
            onModeChange={setSubtitleMode}
          />
        </div>

        <div className="w-full shrink-0">
          {selectedVideoUrl ? (
            <div
              ref={stageRef}
              data-movie-tour="video-stage"
              tabIndex={-1}
              className="movie-stage relative aspect-video w-full overflow-hidden bg-black outline-none"
              onPointerMove={revealControls}
              onPointerDown={revealControls}
            >
              {isYouTubeUrl(selectedVideoUrl) ? (
                <YouTubePlayer
                  key={selectedVideoUrl}
                  videoId={getYouTubeVideoId(selectedVideoUrl)!}
                  playerRef={playerRef}
                  autoPlay
                  disableNativeFullscreen
                  onPlay={handlePlayerPlay}
                  onPause={handlePlayerPause}
                  onProgress={handleVideoProgress}
                  onDurationReady={handleDurationReady}
                  onEnd={handlePlayerEnd}
                />
              ) : isDirectVideoUrl(selectedVideoUrl) ? (
                <Html5VideoPlayer
                  key={selectedVideoUrl}
                  src={selectedVideoUrl}
                  playerRef={playerRef}
                  disableNativeFullscreen
                  onUserInteract={revealControls}
                  onPlay={handlePlayerPlay}
                  onPause={handlePlayerPause}
                  onProgress={handleVideoProgress}
                  onDurationReady={handleDurationReady}
                  onEnd={handlePlayerEnd}
                />
              ) : (
                <iframe
                  src={`${getYouTubeEmbedUrl(selectedVideoUrl)}?autoplay=1`}
                  className="w-full h-full absolute inset-0"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  title="Video player"
                />
              )}
              {/* Video trực tiếp (HTML5) mới dùng overlay tự chế. YouTube đã có
                  control + play/pause + seek gốc nên KHÔNG overlay để tránh trùng. */}
              {isDirectVideoUrl(selectedVideoUrl) && isPc && (
                <button
                  type="button"
                  className="absolute inset-x-0 top-0 bottom-14 sm:bottom-16 z-[15] cursor-pointer border-0 bg-transparent p-0 m-0"
                  aria-label="Phát / Tạm dừng"
                  onClick={(e) => {
                    e.preventDefault();
                    stageRef.current?.focus({ preventScroll: true });
                    togglePlayPause();
                  }}
                />
              )}
              {isDirectVideoUrl(selectedVideoUrl) && !isPc && (
                <>
                  <button
                    type="button"
                    className="absolute left-0 top-0 bottom-16 w-[30%] z-[15] cursor-pointer border-0 bg-transparent p-0 m-0 touch-manipulation select-none"
                    aria-label="Chạm hai lần để tua lùi một câu"
                    onClick={(e) => {
                      e.preventDefault();
                      handleMobileSeekZoneTap("left");
                    }}
                  />
                  <button
                    type="button"
                    className="absolute right-0 top-0 bottom-16 w-[30%] z-[15] cursor-pointer border-0 bg-transparent p-0 m-0 touch-manipulation select-none"
                    aria-label="Chạm hai lần để tua tới một câu"
                    onClick={(e) => {
                      e.preventDefault();
                      handleMobileSeekZoneTap("right");
                    }}
                  />
                  
                </>
              )}
              {seekFlash !== null ? (
                <div
                  className={`pointer-events-none absolute inset-y-0 z-[18] flex w-[30%] items-center justify-center ${
                    seekFlash < 0 ? "left-0" : "right-0"
                  }`}
                  aria-hidden
                >
                  <span className="rounded-lg bg-black/75 px-3 py-1.5 text-base font-bold text-white">
                    {seekFlash < 0 ? "« Câu" : "Câu »"}
                  </span>
                </div>
              ) : null}
              <MovieSubtitleOverlay
                row={activeRow}
                showEnglish={showEnglish}
                showViAlways={showViAlways}
                revealedVi={revealedVi}
                seekPreviewRowIndex={seekPreviewRowIndex}
                isPaused={isPaused}
                onRevealVi={handleRevealVi}
                controlsVisible={controlsVisible}
                isFullscreen={isFullscreen}
              />
              <button
                type="button"
                data-movie-tour="fullscreen"
                onClick={toggleFullscreen}
                className="absolute top-2 right-2 z-30 flex h-9 w-9 items-center justify-center rounded-lg bg-black/70 text-white transition-colors duration-300 hover:bg-black/75 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/60"
                aria-label={isFullscreen ? "Thoát toàn màn hình" : "Toàn màn hình (kèm phụ đề)"}
                title={isFullscreen ? "Thoát toàn màn hình (F)" : "Toàn màn hình kèm phụ đề (F)"}
              >
                {isFullscreen ? (
                  <FiMinimize className="h-5 w-5" />
                ) : (
                  <FiMaximize className="h-5 w-5" />
                )}
              </button>
            </div>
          ) : (
            <div className="relative aspect-video w-full overflow-hidden bg-black flex items-center justify-center text-slate-500 text-sm">
              Đang tải video...
            </div>
          )}
        </div>

        {variant === "series" && topic.exercises.length > 1 ? (
          <div
            data-movie-tour="episodes"
            className="px-2 sm:px-3 py-2 border-b border-white/[0.06] lg:border-b-0"
          >
            <div className="flex flex-wrap gap-1.5 max-h-[88px] overflow-y-auto scrollbar-hide sm:max-h-none sm:overflow-visible">
              {topic.exercises.map((ex, index) => {
                const isActive =
                  selectedExercise?.exerciseNo === ex.exerciseNo &&
                  selectedExercise?.subNo === ex.subNo;
                const episodeLocked =
                  isStudent &&
                  !isEpisodeUnlocked(movieWatchViews, topic, index);
                return (
                  <button
                    key={`${ex.exerciseNo}-${ex.subNo ?? 0}`}
                    type="button"
                    disabled={episodeLocked}
                    onClick={() => {
                      if (episodeLocked) {
                        toast.error(
                          "Xem hết các tập trước để mở khóa tập này"
                        );
                        return;
                      }
                      if (ex.video) {
                        void selectExercise(ex.video, index, ex);
                      }
                    }}
                    className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors ${
                      isActive
                        ? "bg-amber-400 text-slate-900"
                        : episodeLocked
                          ? "bg-white/5 text-slate-500 opacity-50 cursor-not-allowed"
                          : "bg-white/5 text-slate-300 hover:bg-white/10"
                    }`}
                  >
                    Tập {ex.exerciseNo}
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}
      </div>

      <MoviePlayerGuideTour
        open={guideOpen}
        steps={guideSteps}
        onComplete={completeGuide}
      />

      {showMagicDoor ? (
        <MagicDoor
          isOpen={showMagicDoor}
          onClose={() => setShowMagicDoor(false)}
          onLogin={() => setShowMagicDoor(false)}
        />
      ) : null}
    </div>
  );
}
