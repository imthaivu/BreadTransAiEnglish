/**
 * useAudioManager Hook - React hook để quản lý audio
 *
 * Hook này cung cấp các functions và state để quản lý audio
 * trong React components một cách dễ dàng
 */

import {
  AudioBook,
  AudioFile,
  AudioPlaylist,
  AudioProgress,
} from "@/types/audio.type";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  createPlaylist,
  getAllAudioBooks,
  getAudioBookById,
  getAudioBooksByCategory,
  getAudioBooksByLevel,
  getAudioFileById,
  getAudioFilesByBookId,
  getAudioFilesByCategory,
  getAudioFilesByLevel,
  getAudioStats,
  getFavoriteAudioFiles,
  getRecentAudioFiles,
  searchAudioFiles,
} from "./audioManager";

// ===== HOOK TYPES =====

export interface UseAudioManagerReturn {
  // State
  currentAudio: AudioFile | null;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  volume: number;
  playbackRate: number;
  isLoading: boolean;
  error: string | null;

  // Audio Controls
  play: (audioId: string) => Promise<void>;
  pause: () => void;
  stop: () => void;
  seek: (time: number) => void;
  setVolume: (volume: number) => void;
  setPlaybackRate: (rate: number) => void;

  // Audio Data
  audioBooks: AudioBook[];
  currentBook: AudioBook | null;
  audioFiles: AudioFile[];
  recentAudio: AudioFile[];
  favoriteAudio: AudioFile[];

  // Audio Management
  loadAudioBook: (bookId: string) => void;
  loadAudioFiles: (bookId: string) => void;
  searchAudio: (query: string) => AudioFile[];
  getAudioById: (audioId: string) => AudioFile | undefined;
  getBookById: (bookId: string) => AudioBook | undefined;

  // Progress Management
  saveProgress: (
    audioId: string,
    currentTime: number,
    duration: number
  ) => void;
  getProgress: (audioId: string) => AudioProgress | null;
  markAsCompleted: (audioId: string) => void;

  // Playlist Management
  createNewPlaylist: (
    name: string,
    description: string,
    audioIds: string[]
  ) => AudioPlaylist;
  addToPlaylist: (playlistId: string, audioId: string) => void;
  removeFromPlaylist: (playlistId: string, audioId: string) => void;

  // Statistics
  stats: ReturnType<typeof getAudioStats>;
}

export function useAudioManager(userId?: string): UseAudioManagerReturn {
  const [currentAudio, setCurrentAudio] = useState<AudioFile | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolumeState] = useState(1);
  const [playbackRate, setPlaybackRateState] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentBook, setCurrentBook] = useState<AudioBook | null>(null);
  const [audioFiles, setAudioFiles] = useState<AudioFile[]>([]);
  const [recentAudio, setRecentAudio] = useState<AudioFile[]>([]);
  const [favoriteAudio, setFavoriteAudio] = useState<AudioFile[]>([]);
  const [, setPlaylists] = useState<AudioPlaylist[]>([]);
  const [progress, setProgress] = useState<Map<string, AudioProgress>>(
    new Map()
  );

  // ===== COMPUTED VALUES =====
  const audioBooks = useMemo(() => getAllAudioBooks(), []);
  const stats = useMemo(() => getAudioStats(), []);

  // ===== AUDIO ELEMENT REF =====
  const audioRef = useMemo(() => {
    if (typeof window !== "undefined") {
      const audio = new Audio();
      audio.preload = "metadata";
      return audio;
    }
    return null;
  }, []);

  const getProgress = useCallback(
    (audioId: string) => {
      return progress.get(audioId) || null;
    },
    [progress]
  );

  // ===== EFFECTS =====

  // Load recent and favorite audio on mount
  useEffect(() => {
    if (userId) {
      setRecentAudio(getRecentAudioFiles(userId));
      setFavoriteAudio(getFavoriteAudioFiles(userId));
    }
  }, [userId]);

  // Audio event listeners
  useEffect(() => {
    if (!audioRef) return;

    const handleLoadedMetadata = () => {
      setDuration(audioRef.duration);
      setIsLoading(false);
    };

    const handleTimeUpdate = () => {
      setCurrentTime(audioRef.currentTime);
    };

    const handleEnded = () => {
      setIsPlaying(false);
      setCurrentTime(0);
      if (currentAudio) {
        // markAsCompleted(currentAudio.id);
      }
    };

    const handleError = () => {
      setError("Lỗi khi tải audio");
      setIsLoading(false);
      setIsPlaying(false);
    };

    const handlePlay = () => {
      setIsPlaying(true);
      setError(null);
    };

    const handlePause = () => {
      setIsPlaying(false);
    };

    // Add event listeners
    audioRef.addEventListener("loadedmetadata", handleLoadedMetadata);
    audioRef.addEventListener("timeupdate", handleTimeUpdate);
    audioRef.addEventListener("ended", handleEnded);
    audioRef.addEventListener("error", handleError);
    audioRef.addEventListener("play", handlePlay);
    audioRef.addEventListener("pause", handlePause);

    // Cleanup
    return () => {
      audioRef.removeEventListener("loadedmetadata", handleLoadedMetadata);
      audioRef.removeEventListener("timeupdate", handleTimeUpdate);
      audioRef.removeEventListener("ended", handleEnded);
      audioRef.removeEventListener("error", handleError);
      audioRef.removeEventListener("play", handlePlay);
      audioRef.removeEventListener("pause", handlePause);
    };
  }, [audioRef, currentAudio]);

  // ===== AUDIO CONTROLS =====

  const play = useCallback(
    async (audioId: string) => {
      if (!audioRef) return;

      try {
        setIsLoading(true);
        setError(null);

        const audio = getAudioFileById(audioId);
        if (!audio) {
          throw new Error("Audio file not found");
        }

        setCurrentAudio(audio);
        audioRef.src = audio.url;
        audioRef.volume = volume;
        audioRef.playbackRate = playbackRate;

        // Load saved progress
        const savedProgress = getProgress(audioId);
        if (savedProgress && savedProgress.currentTime > 0) {
          audioRef.currentTime = savedProgress.currentTime;
        }

        await audioRef.play();

        // Update recent audio
        if (userId) {
          const recent = getRecentAudioFiles(userId);
          const updatedRecent = [
            audio,
            ...recent.filter((a) => a.id !== audioId),
          ].slice(0, 10);
          setRecentAudio(updatedRecent);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Lỗi khi phát audio");
        setIsLoading(false);
      }
    },
    [audioRef, volume, playbackRate, userId, getProgress]
  );

  const pause = useCallback(() => {
    if (audioRef && isPlaying) {
      audioRef.pause();
    }
  }, [audioRef, isPlaying]);

  const stop = useCallback(() => {
    if (audioRef) {
      audioRef.pause();
      audioRef.currentTime = 0;
      setCurrentTime(0);
      setIsPlaying(false);
    }
  }, [audioRef]);

  const seek = useCallback(
    (time: number) => {
      if (audioRef) {
        audioRef.currentTime = time;
        setCurrentTime(time);
      }
    },
    [audioRef]
  );

  const setVolume = useCallback(
    (newVolume: number) => {
      setVolumeState(newVolume);
      if (audioRef) {
        audioRef.volume = newVolume;
      }
    },
    [audioRef]
  );

  const setPlaybackRate = useCallback(
    (rate: number) => {
      setPlaybackRateState(rate);
      if (audioRef) {
        audioRef.playbackRate = rate;
      }
    },
    [audioRef]
  );

  // ===== AUDIO MANAGEMENT =====

  const loadAudioBook = useCallback((bookId: string) => {
    const book = getAudioBookById(bookId);
    if (book) {
      setCurrentBook(book);
      setAudioFiles(getAudioFilesByBookId(bookId));
    }
  }, []);

  const loadAudioFiles = useCallback((bookId: string) => {
    setAudioFiles(getAudioFilesByBookId(bookId));
  }, []);

  const searchAudio = useCallback((query: string) => {
    return searchAudioFiles(query);
  }, []);

  const getAudioById = useCallback((audioId: string) => {
    return getAudioFileById(audioId);
  }, []);

  const getBookById = useCallback((bookId: string) => {
    return getAudioBookById(bookId);
  }, []);

  // ===== PROGRESS MANAGEMENT =====

  const saveProgress = useCallback(
    (audioId: string, currentTime: number, duration: number) => {
      const progressData: AudioProgress = {
        audioId,
        userId: userId || "anonymous",
        currentTime,
        duration,
        isCompleted: currentTime >= duration * 0.9, // 90% considered completed
        lastPlayedAt: new Date(),
        playCount: (progress.get(audioId)?.playCount || 0) + 1,
      };

      setProgress((prev) => new Map(prev.set(audioId, progressData)));

      // Save to localStorage
      if (typeof window !== "undefined") {
        const savedProgress = JSON.parse(
          localStorage.getItem("audioProgress") || "{}"
        );
        savedProgress[audioId] = progressData;
        localStorage.setItem("audioProgress", JSON.stringify(savedProgress));
      }
    },
    [userId, progress]
  );

  const markAsCompleted = useCallback(
    (audioId: string) => {
      const currentProgress = progress.get(audioId);
      if (currentProgress) {
        const updatedProgress: AudioProgress = {
          ...currentProgress,
          isCompleted: true,
          currentTime: duration,
          lastPlayedAt: new Date(),
        };

        setProgress((prev) => new Map(prev.set(audioId, updatedProgress)));

        // Save to localStorage
        if (typeof window !== "undefined") {
          const savedProgress = JSON.parse(
            localStorage.getItem("audioProgress") || "{}"
          );
          savedProgress[audioId] = updatedProgress;
          localStorage.setItem("audioProgress", JSON.stringify(savedProgress));
        }
      }
    },
    [progress, duration]
  );

  // ===== PLAYLIST MANAGEMENT =====

  const createNewPlaylist = useCallback(
    (name: string, description: string, audioIds: string[]) => {
      const playlist = createPlaylist(
        name,
        description,
        audioIds,
        userId || "anonymous"
      );
      setPlaylists((prev) => [...prev, playlist]);
      return playlist;
    },
    [userId]
  );

  const addToPlaylist = useCallback((playlistId: string, audioId: string) => {
    setPlaylists((prev) =>
      prev.map((playlist) => {
        if (playlist.id === playlistId) {
          const audio = getAudioFileById(audioId);
          if (
            audio &&
            !playlist.audioFiles.find((a: AudioFile) => a.id === audioId)
          ) {
            return {
              ...playlist,
              audioFiles: [...playlist.audioFiles, audio],
              updatedAt: new Date(),
            };
          }
        }
        return playlist;
      })
    );
  }, []);

  const removeFromPlaylist = useCallback(
    (playlistId: string, audioId: string) => {
      setPlaylists((prev) =>
        prev.map((playlist) => {
          if (playlist.id === playlistId) {
            return {
              ...playlist,
              audioFiles: playlist.audioFiles.filter(
                (a: AudioFile) => a.id !== audioId
              ),
              updatedAt: new Date(),
            };
          }
          return playlist;
        })
      );
    },
    []
  );

  // ===== RETURN =====

  return {
    // State
    currentAudio,
    isPlaying,
    currentTime,
    duration,
    volume,
    playbackRate,
    isLoading,
    error,

    // Audio Controls
    play,
    pause,
    stop,
    seek,
    setVolume,
    setPlaybackRate,

    // Audio Data
    audioBooks,
    currentBook,
    audioFiles,
    recentAudio,
    favoriteAudio,

    // Audio Management
    loadAudioBook,
    loadAudioFiles,
    searchAudio,
    getAudioById,
    getBookById,

    // Progress Management
    saveProgress,
    getProgress,
    markAsCompleted,

    // Playlist Management
    createNewPlaylist,
    addToPlaylist,
    removeFromPlaylist,

    // Statistics
    stats,
  };
}

// ===== SPECIALIZED HOOKS =====

/**
 * Hook để quản lý audio cho một book cụ thể
 */
export function useAudioBook(bookId: string) {
  const audioManager = useAudioManager();

  useEffect(() => {
    audioManager.loadAudioBook(bookId);
  }, [bookId, audioManager]);

  return {
    ...audioManager,
    book: audioManager.currentBook,
    files: audioManager.audioFiles,
  };
}

/**
 * Hook để quản lý audio theo category
 */
export function useAudioByCategory(category: AudioBook["category"]) {
  const audioManager = useAudioManager();

  const books = useMemo(() => getAudioBooksByCategory(category), [category]);
  const files = useMemo(() => getAudioFilesByCategory(category), [category]);

  return {
    ...audioManager,
    books,
    files,
  };
}

/**
 * Hook để quản lý audio theo level
 */
export function useAudioByLevel(level: AudioBook["level"]) {
  const audioManager = useAudioManager();

  const books = useMemo(() => getAudioBooksByLevel(level), [level]);
  const files = useMemo(() => getAudioFilesByLevel(level), [level]);

  return {
    ...audioManager,
    books,
    files,
  };
}

export default useAudioManager;
