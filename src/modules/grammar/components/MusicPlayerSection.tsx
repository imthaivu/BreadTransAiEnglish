"use client";

import { useMemo, useState, useEffect, useRef } from "react";
import { MusicSong } from "@/modules/admin/services/content.service";
import { YouTubePlayer } from "./YouTubePlayer";
import { getYouTubeVideoId, resolveThumbnail } from "@/utils/youtube";
import { useVideoWatchTracking } from "../hooks/useVideoWatchTracking";
import { useMatchVideoHeight } from "../hooks/useMatchVideoHeight";
import { useAuth } from "@/lib/auth/context";
import { saveGrammarView } from "@/modules/classes/services";
import { FiMusic, FiSearch, FiPlay, FiChevronLeft } from "react-icons/fi";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";

interface MusicPlayerSectionProps {
  songs: MusicSong[];
  activeSongIndex: number;
  onSongSelect: (index: number) => void;
  autoPlay?: boolean;
  /** Quay lại lưới chọn bài hát. */
  onClose?: () => void;
}

// Helper to remove Vietnamese tones for search
function removeVietnameseTones(str: string): string {
  return str
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D");
}

export default function MusicPlayerSection({
  songs,
  activeSongIndex,
  onSongSelect,
  autoPlay = false,
  onClose,
}: MusicPlayerSectionProps) {
  const { session } = useAuth();
  const [searchQuery, setSearchQuery] = useState("");
  const [showMobileOverlay, setShowMobileOverlay] = useState(false);
  const activeSongRef = useRef<HTMLButtonElement | null>(null);
  const { videoRef, sidebarHeight } = useMatchVideoHeight();
  /** Các URL bài hát đã đăng ký "đã mở" trong phiên — tránh ghi heartbeat 0s trùng. */
  const openedSongsRef = useRef<Set<string>>(new Set());

  // Filter songs based on search query
  const filteredSongs = useMemo(() => {
    if (!searchQuery.trim()) {
      return songs.map((song, originalIndex) => ({ ...song, originalIndex }));
    }
    const query = searchQuery.toLowerCase();
    const queryNoTones = removeVietnameseTones(query);

    return songs
      .map((song, originalIndex) => ({ ...song, originalIndex }))
      .filter((song) => {
        const titleLower = song.title.toLowerCase();
        const titleNoTones = removeVietnameseTones(titleLower);
        return titleLower.includes(query) || titleNoTones.includes(queryNoTones);
      });
  }, [songs, searchQuery]);

  const currentSong = songs[activeSongIndex] || songs[0];

  const completionName = currentSong?.title || undefined;

  const {
    playerRef,
    handleVideoProgress,
    handleDurationReady,
    handleVideoPlay,
    handleVideoPause,
    handleVideoEnd,
  } = useVideoWatchTracking({
    selectedVideoUrl: currentSong?.video || null,
    topic: {
      id: "music",
      title: "Singing",
    } as any,
    selectedExercise: {
      exerciseNo: activeSongIndex + 1,
      title: currentSong?.title || "",
    },
    mediaType: "music",
    completionName,
  });

  // Đăng ký "đã mở" mỗi khi chọn bài hát mới (giống Grammar/Movie) — heartbeat 0s
  // để bảng theo dõi của giáo viên thấy "ai đã mở bài hát nào", không cần phải nghe.
  useEffect(() => {
    const videoUrl = currentSong?.video;
    if (!session?.user?.id || !videoUrl) return;
    if (openedSongsRef.current.has(videoUrl)) return;

    openedSongsRef.current.add(videoUrl);
    void saveGrammarView({
      studentId: session.user.id,
      topicId: "music",
      topicName: "Singing",
      exerciseNo: activeSongIndex + 1,
      exerciseTitle: currentSong?.title || "",
      videoUrl,
      watchedPercent: 0,
      mediaType: "music",
    }).catch((error) => {
      console.error("Error saving music view:", error);
      openedSongsRef.current.delete(videoUrl);
    });
  }, [session?.user?.id, currentSong?.video, currentSong?.title, activeSongIndex]);

  // Scroll active song into view inside the scroll container
  useEffect(() => {
    if (activeSongRef.current) {
      activeSongRef.current.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
      });
    }
  }, [activeSongIndex]);

  return (
    <div className="w-full py-1 sm:py-2">
      {/* Back Button - quay lại lưới chọn bài hát */}
      {onClose && (
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
      )}

      <div className="flex flex-col lg:flex-row gap-4 xl:gap-6 w-full justify-center items-stretch lg:items-start relative">
      {/* Search Header for Mobile only */}
      <div className="block lg:hidden w-full relative z-[150] px-1 sm:px-2 mb-2">
        <div className="relative">
          <FiSearch className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
          <Input
            type="text"
            placeholder="Tìm bài hát..."
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
                  Kết quả ({filteredSongs.length})
                </span>
                <button
                  onClick={() => setShowMobileOverlay(false)}
                  className="text-xs font-semibold text-primary hover:underline"
                >
                  Đóng
                </button>
              </div>
              {filteredSongs.length > 0 ? (
                filteredSongs.map(({ title, video, thumbnail, originalIndex }) => {
                  const isActive = originalIndex === activeSongIndex;
                  const songThumbnail = resolveThumbnail(video, thumbnail);
                  return (
                    <button
                      key={originalIndex}
                      type="button"
                      onClick={() => {
                        onSongSelect(originalIndex);
                        setShowMobileOverlay(false);
                      }}
                      className={`w-full flex gap-3 p-1.5 rounded-lg text-left transition-all border ${
                        isActive
                          ? "bg-primary/5 border-primary/20"
                          : "bg-white border-transparent hover:bg-slate-50"
                      }`}
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
                          #{originalIndex + 1}
                        </span>
                      </div>
                      <div className="flex-1 min-w-0 flex items-center">
                        <h3 className={`text-xs font-semibold line-clamp-2 leading-tight ${
                          isActive ? "text-primary font-bold" : "text-slate-700"
                        }`}>
                          {title}
                        </h3>
                      </div>
                    </button>
                  );
                })
              ) : (
                <div className="py-6 text-center text-xs text-slate-400 flex flex-col items-center gap-1">
                  <FiMusic className="w-6 h-6 text-slate-300" />
                  <span>Không tìm thấy bài hát nào</span>
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {/* Player Section */}
      <div className="w-full lg:flex-1 lg:min-w-0 space-y-3">
        {currentSong?.video ? (
          <div ref={videoRef} className="relative aspect-video w-full rounded-xl sm:rounded-2xl shadow-md overflow-hidden bg-black border border-slate-100">
            <YouTubePlayer
              key={currentSong.video}
              videoId={getYouTubeVideoId(currentSong.video) || ""}
              playerRef={playerRef}
              autoPlay={autoPlay}
              onPlay={handleVideoPlay}
              onPause={handleVideoPause}
              onProgress={handleVideoProgress}
              onDurationReady={handleDurationReady}
              onEnd={handleVideoEnd}
            />
          </div>
        ) : (
          <div ref={videoRef} className="aspect-video w-full rounded-xl sm:rounded-2xl shadow-md bg-slate-900 border border-slate-800 flex flex-col items-center justify-center text-slate-400 gap-3">
            <FiMusic className="w-16 h-16 animate-pulse text-slate-600" />
            <p className="text-sm font-medium">Chọn một bài hát để bắt đầu nghe nhạc</p>
          </div>
        )}

        {/* Current Song Title & Info */}
        {currentSong && (
          <div className="flex flex-col gap-1.5 px-1 sm:px-2 pt-1">
            <h1 className="text-base sm:text-lg font-bold text-slate-800 leading-snug flex items-center gap-2">
              <span className="bg-primary/10 text-primary text-[10px] font-extrabold px-2 py-0.5 rounded-md uppercase tracking-wider h-fit shrink-0">
                #{activeSongIndex + 1}
              </span>
              <span>{currentSong.title}</span>
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
            <h2 className="font-bold text-slate-800 text-sm sm:text-base flex items-center gap-2">
               Danh sách
            </h2>
            <span className="text-xs text-slate-500 font-medium bg-slate-200/60 px-2.5 py-0.5 rounded-full">
              {songs.length} bài
            </span>
          </div>

          {/* Sidebar Search Bar - Only show on Desktop */}
          <div className="hidden lg:relative lg:block">
            <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
            <Input
              type="text"
              placeholder="Tìm bài hát..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 pr-4 py-1.5 h-9 text-sm bg-white border border-slate-200 rounded-xl focus-visible:ring-1 focus-visible:ring-primary w-full"
            />
          </div>
        </div>

        {/* Scrollable Song List */}
        <div className="flex-1 overflow-y-auto space-y-1 pr-1 -mr-2 scrollbar-thin scrollbar-thumb-slate-200 scrollbar-track-transparent">
          {filteredSongs.length > 0 ? (
            filteredSongs.map(({ title, video, thumbnail, originalIndex }) => {
              const isActive = originalIndex === activeSongIndex;
              const songThumbnail = resolveThumbnail(video, thumbnail);

              return (
                <button
                  key={originalIndex}
                  ref={isActive ? activeSongRef : null}
                  type="button"
                  onClick={() => onSongSelect(originalIndex)}
                  className={`w-full flex gap-2.5 p-1.5 rounded-lg text-left transition-all border ${
                    isActive
                      ? "bg-primary/5 border-primary/20 hover:bg-primary/10 shadow-sm"
                      : "bg-white border-transparent hover:border-slate-100 hover:bg-slate-100/60"
                  }`}
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
                      {isActive ? (
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
                      #{originalIndex + 1}
                    </span>
                  </div>

                  {/* Song Title */}
                  <div className="flex-1 min-w-0 flex items-center">
                    <h3 className={`text-[11px] sm:text-xs font-semibold line-clamp-2 leading-tight ${
                      isActive ? "text-primary font-bold" : "text-slate-700 hover:text-slate-900"
                    }`}>
                      {title}
                    </h3>
                  </div>
                </button>
              );
            })
          ) : (
            <div className="py-8 text-center text-sm text-slate-400 flex flex-col items-center gap-2">
              <FiMusic className="w-8 h-8 text-slate-300" />
              <span>Không tìm thấy bài hát nào</span>
            </div>
          )}
        </div>
      </div>
      </div>
    </div>
  );
}
