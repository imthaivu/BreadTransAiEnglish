"use client";

import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { GrammarTopic } from "@/constants/grammar";
import { useAuth } from "@/lib/auth/context";
import { MagicDoor } from "@/modules/home/components";
import { saveGrammarView } from "@/modules/classes/services";
import { useVideoWatchTracking } from "../hooks/useVideoWatchTracking";
import { useMatchVideoHeight } from "../hooks/useMatchVideoHeight";
import { YouTubePlayer } from "./YouTubePlayer";
import { Html5VideoPlayer } from "./Html5VideoPlayer";
import { FiLock, FiPlay, FiSearch, FiMusic, FiChevronLeft } from "react-icons/fi";
import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import toast from "react-hot-toast";
import { Input } from "@/components/ui/Input";
import {
  getYouTubeVideoId,
  getYouTubeEmbedUrl,
  isYouTubeUrl,
  resolveThumbnail,
} from "@/utils/youtube";

export type GrammarPlayerExerciseRef = {
  exerciseNo: number;
  subNo?: number;
};

interface GrammarPlayerSectionProps {
  topic: GrammarTopic;
  onClose: () => void;
  autoPlayVideo?: boolean;
  initialExercise?: GrammarPlayerExerciseRef | null;
  onExerciseChange?: (exercise: GrammarPlayerExerciseRef | null) => void;
}

function isDirectVideoUrl(url: string): boolean {
  if (!url) return false;
  try {
    const u = new URL(url, typeof window !== "undefined" ? window.location.href : "http://localhost");
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

// Helper to remove Vietnamese tones for search
function removeVietnameseTones(str: string): string {
  return str
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D");
}

export default function GrammarPlayerSection({
  topic,
  onClose,
  autoPlayVideo = false,
  initialExercise = null,
  onExerciseChange,
}: GrammarPlayerSectionProps) {
  const { session } = useAuth();
  const [showUpgradePrompt, setShowUpgradePrompt] = useState(false);
  const [showMagicDoor, setShowMagicDoor] = useState(false);
  const [selectedVideoUrl, setSelectedVideoUrl] = useState<string | null>(null);
  const [selectedExercise, setSelectedExercise] = useState<{
    exerciseNo: number;
    subNo?: number;
    title: string;
    video?: string;
  } | null>(null);

  const onExerciseChangeRef = useRef(onExerciseChange);
  useEffect(() => {
    onExerciseChangeRef.current = onExerciseChange;
  }, [onExerciseChange]);

  const completionName = useMemo(() => {
    if (!selectedExercise) return undefined;
    const sub = selectedExercise.subNo ? `.${selectedExercise.subNo}` : "";
    return `${topic.title} - Bài ${selectedExercise.exerciseNo}${sub}`;
  }, [topic.title, selectedExercise]);

  const {
    playerRef,
    handleVideoProgress,
    handleDurationReady,
    handleVideoPlay,
    handleVideoPause,
    handleVideoEnd,
    resetWatchTracking,
    markVideoTracked,
    clearVideoTracked,
    isVideoAlreadyTracked,
  } = useVideoWatchTracking({
    topic,
    selectedVideoUrl,
    selectedExercise,
    mediaType: "grammar",
    completionName,
  });

  const autoPlayedRef = useRef(false);

  const [searchQuery, setSearchQuery] = useState("");
  const [showMobileOverlay, setShowMobileOverlay] = useState(false);
  const activeExerciseRef = useRef<HTMLButtonElement | null>(null);
  const { videoRef, sidebarHeight } = useMatchVideoHeight();

  // Filter exercises based on search query
  const filteredExercises = useMemo(() => {
    if (!searchQuery.trim()) {
      return topic.exercises.map((ex, originalIndex) => ({ ...ex, originalIndex }));
    }
    const query = searchQuery.toLowerCase();
    const queryNoTones = removeVietnameseTones(query);

    return topic.exercises
      .map((ex, originalIndex) => ({ ...ex, originalIndex }))
      .filter((ex) => {
        const titleLower = ex.title.toLowerCase();
        const titleNoTones = removeVietnameseTones(titleLower);
        const labelStr = `bài ${ex.exerciseNo}${ex.subNo ? `.${ex.subNo}` : ""}`.toLowerCase();
        return (
          titleLower.includes(query) ||
          titleNoTones.includes(queryNoTones) ||
          labelStr.includes(query)
        );
      });
  }, [topic.exercises, searchQuery]);

  const handleClickWatchVideo = async (
    videoUrl: string,
    index: number,
    exercise: { exerciseNo: number; subNo?: number; title: string; video?: string }
  ) => {
    if (!session?.user && index > 0) {
      setShowMagicDoor(true);
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
          videoUrl: videoUrl,
          watchedPercent: 0,
          mediaType: "grammar",
        });
      } catch (error) {
        console.error("Error saving grammar view:", error);
        clearVideoTracked();
      }
    }
  };

  // Auto-play initial exercise or first exercise when opened
  useEffect(() => {
    if (autoPlayedRef.current) return;
    
    let targetExercise = topic.exercises[0];
    let targetIndex = 0;
    
    if (initialExercise) {
      const foundIdx = topic.exercises.findIndex(
        (ex) =>
          ex.exerciseNo === initialExercise.exerciseNo &&
          ex.subNo === initialExercise.subNo
      );
      if (foundIdx !== -1) {
        targetExercise = topic.exercises[foundIdx];
        targetIndex = foundIdx;
      }
    }
    
    if (!targetExercise?.video) return;
    autoPlayedRef.current = true;
    void handleClickWatchVideo(targetExercise.video, targetIndex, targetExercise);
  }, [autoPlayVideo, topic, initialExercise]);

  // Sync selected exercise back to parent for URL tracking
  useEffect(() => {
    const callback = onExerciseChangeRef.current;
    if (callback) {
      if (selectedExercise) {
        callback({
          exerciseNo: selectedExercise.exerciseNo,
          subNo: selectedExercise.subNo,
        });
      } else {
        callback(null);
      }
    }
  }, [selectedExercise]);

  // Scroll active exercise into sidebar view
  useEffect(() => {
    if (activeExerciseRef.current) {
      activeExerciseRef.current.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
      });
    }
  }, [selectedExercise]);

  return (
    <div className="w-full py-1 sm:py-2">
      {/* Back Button - Above both Player and Playlist */}
      <div className="flex items-center px-1 sm:px-2 mb-2">
        <Button
          onClick={onClose}
          variant="secondary"
          size="sm"
          className="rounded-xl flex items-center gap-1 text-xs font-bold border border-slate-200 shadow-sm"
        >
          <FiChevronLeft className="w-4 h-4" />
        </Button>
      </div>

      <div className="flex flex-col lg:flex-row gap-4 xl:gap-6 w-full justify-center items-stretch relative">
      
      {/* Search Header for Mobile only */}
      <div className="block lg:hidden w-full relative z-[150] px-1 sm:px-2 mb-2">
        <div className="relative">
          <FiSearch className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
          <Input
            type="text"
            placeholder="Tìm bài học..."
            value={searchQuery}
            onFocus={() => setShowMobileOverlay(true)}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setShowMobileOverlay(true);
            }}
            className="pl-9 pr-8 py-2 h-10 text-sm bg-white border border-slate-200 rounded-xl focus-visible:ring-1 focus-visible:ring-primary w-full shadow-sm"
          />
          {searchQuery && (
            <button
              onClick={() => {
                setSearchQuery("");
                setShowMobileOverlay(false);
              }}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-slate-400 hover:text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-full w-5 h-5 flex items-center justify-center transition-colors"
            >
              ✕
            </button>
          )}
        </div>

        {/* Mobile Search Dropdown/Overlay */}
        {showMobileOverlay && (
          <>
            <div
              className="fixed inset-0 bg-black/40 z-40 transition-opacity"
              onClick={() => setShowMobileOverlay(false)}
            />
            <div className="absolute top-12 left-1 sm:left-2 right-1 sm:right-2 bg-white rounded-xl shadow-xl border border-slate-100 z-50 max-h-[350px] overflow-y-auto p-2 space-y-1.5 animate-in fade-in slide-in-from-top-2 duration-150">
              <div className="flex items-center justify-between px-2 py-1 border-b border-slate-100 mb-1">
                <span className="text-xs font-bold text-slate-500 uppercase">
                  Kết quả ({filteredExercises.length})
                </span>
                <button
                  onClick={() => setShowMobileOverlay(false)}
                  className="text-xs font-semibold text-primary hover:underline"
                >
                  Đóng
                </button>
              </div>
              {filteredExercises.length > 0 ? (
                filteredExercises.map((exercise, idx) => {
                  const isLocked = !session?.user && exercise.originalIndex > 0;
                  const isActive = selectedExercise?.exerciseNo === exercise.exerciseNo && selectedExercise?.subNo === exercise.subNo;
                  const songThumbnail = exercise.video ? resolveThumbnail(exercise.video) : null;
                  
                  return (
                    <button
                      key={exercise.originalIndex}
                      type="button"
                      disabled={isLocked && idx > 0}
                      onClick={() => {
                        if (isLocked) {
                          setShowMagicDoor(true);
                        } else if (exercise.video) {
                          handleClickWatchVideo(exercise.video, exercise.originalIndex, exercise);
                          setShowMobileOverlay(false);
                        }
                      }}
                      className={`w-full flex gap-3 p-1.5 rounded-lg text-left transition-all border ${
                        isActive
                          ? "bg-primary/5 border-primary/20"
                          : "bg-white border-transparent hover:bg-slate-50"
                      } ${isLocked ? "opacity-60 cursor-not-allowed" : ""}`}
                    >
                      <div className="relative w-16 aspect-video rounded-md overflow-hidden bg-slate-100 shrink-0 border border-slate-100">
                        {songThumbnail ? (
                          <img
                            src={songThumbnail}
                            alt=""
                            className="w-full h-full object-cover"
                            loading="lazy"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-slate-400">
                            <FiMusic className="w-4 h-4" />
                          </div>
                        )}
                        <span className="absolute bottom-0.5 right-0.5 bg-black/60 text-[8px] font-semibold text-white px-1 rounded">
                          #{exercise.exerciseNo}{exercise.subNo && `.${exercise.subNo}`}
                        </span>
                      </div>
                      <div className="flex-1 min-w-0 flex flex-col justify-center">
                        <span className="text-[10px] text-slate-400 font-semibold uppercase">
                          Bài {exercise.exerciseNo}{exercise.subNo && `.${exercise.subNo}`}
                        </span>
                        <h3 className={`text-xs font-semibold line-clamp-2 leading-tight ${
                          isActive ? "text-primary font-bold" : "text-slate-700"
                        }`}>
                          {exercise.title}
                        </h3>
                      </div>
                    </button>
                  );
                })
              ) : (
                <div className="py-6 text-center text-xs text-slate-400 flex flex-col items-center gap-1">
                  <FiMusic className="w-6 h-6 text-slate-300" />
                  <span>Không tìm thấy bài học nào</span>
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {/* Player Section */}
      <div className="w-full lg:flex-1 lg:min-w-0 space-y-3">
        {selectedVideoUrl ? (
          <div ref={videoRef} className="relative aspect-video w-full rounded-xl sm:rounded-2xl shadow-md overflow-hidden bg-black border border-slate-100">
            {isYouTubeUrl(selectedVideoUrl) ? (
              <YouTubePlayer
                key={selectedVideoUrl}
                videoId={getYouTubeVideoId(selectedVideoUrl)!}
                playerRef={playerRef}
                autoPlay
                onPlay={handleVideoPlay}
                onPause={handleVideoPause}
                onProgress={handleVideoProgress}
                onDurationReady={handleDurationReady}
                onEnd={handleVideoEnd}
              />
            ) : isDirectVideoUrl(selectedVideoUrl) ? (
              <Html5VideoPlayer
                key={selectedVideoUrl}
                src={selectedVideoUrl}
                playerRef={playerRef}
                onPlay={handleVideoPlay}
                onPause={handleVideoPause}
                onProgress={handleVideoProgress}
                onDurationReady={handleDurationReady}
                onEnd={handleVideoEnd}
              />
            ) : (
              <iframe
                src={`${getYouTubeEmbedUrl(selectedVideoUrl)}?autoplay=1`}
                className="w-full h-full"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
                title="Video player"
              />
            )}
                      </div>
        ) : (
          <div ref={videoRef} className="aspect-video w-full rounded-xl sm:rounded-2xl shadow-md bg-slate-900 border border-slate-800 flex flex-col items-center justify-center text-slate-400 gap-3">
            <FiPlay className="w-16 h-16 animate-pulse text-slate-600" />
            <p className="text-sm font-medium">Chọn một bài học từ danh sách để bắt đầu học</p>
          </div>
        )}

        {/* Current Lesson Title */}
        {selectedExercise && (
          <div className="flex flex-col gap-1.5 min-w-0 px-1 sm:px-2 pt-1">
            <h1 className="text-base sm:text-lg font-bold text-slate-800 leading-snug flex items-center gap-2">
              <span className="bg-primary/10 text-primary text-[10px] font-extrabold px-2 py-0.5 rounded-md uppercase tracking-wider h-fit shrink-0">
                Bài {selectedExercise.exerciseNo}{selectedExercise.subNo && `.${selectedExercise.subNo}`}
              </span>
              <span className="truncate">{selectedExercise.title}</span>
            </h1>
          </div>
        )}
      </div>

      {/* Playlist / Related Sidebar Section — desktop cao đúng bằng khung video bên trái. */}
      <div
        className="w-full lg:w-[25%] lg:min-w-[280px] flex-shrink-0 flex flex-col bg-slate-50 border border-slate-200/60 rounded-xl sm:rounded-2xl p-2 self-start max-h-[450px] lg:max-h-none"
        style={sidebarHeight ? { height: sidebarHeight } : undefined}
      >
        <div className="flex flex-col gap-3 mb-4">
          <div className="flex items-center justify-between">
            <div className="flex flex-col min-w-0">
              
              <h2 className="font-bold text-slate-800 text-sm sm:text-base truncate leading-snug">
                {topic.title}
              </h2>
            </div>
            <span className="text-xs text-slate-500 font-medium bg-slate-200/60 px-2.5 py-0.5 rounded-full shrink-0">
              {topic.exercises.length} bài
            </span>
          </div>

          {/* Sidebar Search Bar - Only show on Desktop */}
          <div className="hidden lg:relative lg:block">
            <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
            <Input
              type="text"
              placeholder="Tìm bài học..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 pr-4 py-1.5 h-9 text-sm bg-white border border-slate-200 rounded-xl focus-visible:ring-1 focus-visible:ring-primary w-full"
            />
          </div>
        </div>

        {/* Scrollable Exercises List */}
        <div className="flex-1 overflow-y-auto space-y-1 pr-1 -mr-2 scrollbar-thin scrollbar-thumb-slate-200 scrollbar-track-transparent">
          {filteredExercises.length > 0 ? (
            filteredExercises.map((exercise, idx) => {
              const isLocked = !session?.user && exercise.originalIndex > 0;
              const isActive = selectedExercise?.exerciseNo === exercise.exerciseNo && selectedExercise?.subNo === exercise.subNo;
              const songThumbnail = exercise.video ? resolveThumbnail(exercise.video) : null;

              return (
                <button
                  key={exercise.originalIndex}
                  ref={isActive ? activeExerciseRef : null}
                  type="button"
                  disabled={isLocked && idx > 0}
                  onClick={() => {
                    if (isLocked) {
                      setShowMagicDoor(true);
                    } else if (exercise.video) {
                      handleClickWatchVideo(exercise.video, exercise.originalIndex, exercise);
                    }
                  }}
                  className={`w-full flex gap-2.5 p-1.5 rounded-lg text-left transition-all border ${
                    isActive
                      ? "bg-primary/5 border-primary/20 hover:bg-primary/10 shadow-sm"
                      : "bg-white border-transparent hover:border-slate-100 hover:bg-slate-100/60"
                  } ${isLocked ? "opacity-60 cursor-not-allowed" : ""}`}
                >
                  {/* Thumbnail / Aspect */}
                  <div className="relative w-20 sm:w-24 aspect-video rounded-md overflow-hidden bg-slate-100 flex-shrink-0 shadow-sm border border-slate-100">
                    {songThumbnail ? (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img
                        src={songThumbnail}
                        alt=""
                        className="w-full h-full object-cover"
                        loading="lazy"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-slate-400">
                        <FiMusic className="w-5 h-5" />
                      </div>
                    )}
                    
                    {/* Overlay index / playing indicator */}
                    <div className={`absolute inset-0 flex items-center justify-center transition-all ${
                      isActive ? "bg-primary/40 opacity-100" : "bg-black/20 opacity-0 hover:opacity-100"
                    }`}>
                      {isLocked ? (
                        <FiLock className="w-4 h-4 text-white drop-shadow-md" />
                      ) : isActive ? (
                        <div className="flex gap-0.5 items-end h-3 pb-0.5">
                          <span className="w-[2px] bg-white rounded-full animate-[pulse_0.8s_infinite_alternate] h-1.5" />
                          <span className="w-[2px] bg-white rounded-full animate-[pulse_0.8s_infinite_alternate] h-3" style={{ animationDelay: "0.25s" }} />
                          <span className="w-[2px] bg-white rounded-full animate-[pulse_0.8s_infinite_alternate] h-2" style={{ animationDelay: "0.15s" }} />
                        </div>
                      ) : (
                        <FiPlay className="w-4 h-4 text-white drop-shadow-md scale-95 hover:scale-110 transition-transform" />
                      )}
                    </div>

                    <span className="absolute bottom-0.5 right-0.5 bg-black/60 text-[8px] font-semibold text-white px-1.5 py-0.2 rounded">
                      #{exercise.exerciseNo}{exercise.subNo && `.${exercise.subNo}`}
                    </span>
                  </div>

                  {/* Exercise Title */}
                  <div className="flex-1 min-w-0 flex flex-col justify-center">
                    <span className="text-[9px] text-slate-400 font-bold uppercase tracking-wide">
                      Bài {exercise.exerciseNo}{exercise.subNo && `.${exercise.subNo}`}
                    </span>
                    <h3 className={`text-[11px] sm:text-xs font-semibold line-clamp-2 leading-tight ${
                      isActive ? "text-primary font-bold" : "text-slate-700 hover:text-slate-900"
                    }`}>
                      {exercise.title}
                    </h3>
                  </div>
                </button>
              );
            })
          ) : (
            <div className="py-8 text-center text-sm text-slate-400 flex flex-col items-center gap-2">
              <FiMusic className="w-8 h-8 text-slate-300" />
              <span>Không tìm thấy bài học nào</span>
            </div>
          )}
        </div>
      </div>
      </div>

      {/* Upgrade Prompts / Dialogs */}
      {showUpgradePrompt && (
        <Modal open={showUpgradePrompt} onClose={() => setShowUpgradePrompt(false)} title="Mở khóa nội dung">
          <div className="py-4 text-center">
            <p className="text-sm text-gray-600 mb-4">
              Vui lòng nâng cấp tài khoản VIP để học tất cả các bài học ngữ pháp.
            </p>
            <Button onClick={() => setShowUpgradePrompt(false)}>Đóng</Button>
          </div>
        </Modal>
      )}

      {showMagicDoor && (
        <MagicDoor
          isOpen={showMagicDoor}
          onClose={() => setShowMagicDoor(false)}
          onLogin={() => setShowMagicDoor(false)}
        />
      )}

    </div>
  );
}
