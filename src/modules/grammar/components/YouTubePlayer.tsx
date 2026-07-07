"use client";

import { useEffect, useRef, useState, useCallback, memo } from "react";

// YouTube Player types
interface YouTubePlayerInstance {
  getCurrentTime: () => number;
  getDuration: () => number;
  getVolume?: () => number;
  isMuted?: () => boolean;
  pauseVideo: () => void;
  playVideo: () => void;
  seekTo: (seconds: number, allowSeekAhead: boolean) => void;
  destroy: () => void;
}

interface YouTubePlayerEvent {
  target: YouTubePlayerInstance;
  data: number;
}

interface YouTubePlayerProps {
  videoId: string;
  autoPlay?: boolean;
  onProgress?: (percent: number, currentTime: number, duration: number, volume: number, isMuted: boolean) => void;
  onDurationReady?: (duration: number) => void;
  onPlay?: () => void;
  onPause?: () => void;
  onEnd?: () => void;
  playerRef?: React.MutableRefObject<YouTubePlayerInstance | null>; // Expose player ref for external control
  /** Ẩn nút fullscreen mặc định của YouTube (dùng khi muốn fullscreen kèm phụ đề overlay). */
  disableNativeFullscreen?: boolean;
}

interface YouTubeAPI {
  Player: new (
    elementId: HTMLElement,
    config: {
      videoId: string;
      playerVars: Record<string, unknown>;
      events: {
        onReady?: (event: YouTubePlayerEvent) => void;
        onStateChange?: (event: YouTubePlayerEvent) => void;
      };
    }
  ) => YouTubePlayerInstance;
}

declare global {
  interface Window {
    YT?: YouTubeAPI;
    onYouTubeIframeAPIReady?: () => void;
  }
}

export const YouTubePlayer = memo(function YouTubePlayer({
  videoId,
  autoPlay = false,
  onProgress,
  onDurationReady,
  onPlay,
  onPause,
  onEnd,
  playerRef: externalPlayerRef,
  disableNativeFullscreen = false,
}: YouTubePlayerProps) {
  const internalPlayerRef = useRef<YouTubePlayerInstance | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const progressIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const onProgressRef = useRef(onProgress);
  const [, setIsReady] = useState(false);
  const currentVideoIdRef = useRef<string | null>(null);

  useEffect(() => {
    onProgressRef.current = onProgress;
  }, [onProgress]);
  
  // Use external ref if provided, otherwise use internal
  const playerRef = externalPlayerRef || internalPlayerRef;

  const startProgressTracking = useCallback(() => {
    if (progressIntervalRef.current) {
      clearInterval(progressIntervalRef.current);
    }

    progressIntervalRef.current = setInterval(() => {
      const currentPlayer = playerRef.current;
      const progressHandler = onProgressRef.current;
      if (currentPlayer && progressHandler) {
        try {
          const currentTime = currentPlayer.getCurrentTime();
          const duration = currentPlayer.getDuration();
          const volume = currentPlayer.getVolume?.() ?? 100; // Default to 100 if not available
          const isMuted = currentPlayer.isMuted?.() ?? false; // Default to false if not available

          if (duration > 0 && currentTime >= 0) {
            const percent = (currentTime / duration) * 100;
            progressHandler(percent, currentTime, duration, volume, isMuted);
          }
        } catch (e) {
          // Ignore errors (player might be destroyed)
        }
      }
    }, 250);
  }, [playerRef]);

  const stopProgressTracking = useCallback(() => {
    if (progressIntervalRef.current) {
      clearInterval(progressIntervalRef.current);
      progressIntervalRef.current = null;
    }
  }, []);

  const initializePlayer = useCallback(() => {
    if (!containerRef.current || !window.YT) return;

    // Only destroy and recreate if videoId changed
    const currentPlayer = playerRef.current;
    if (currentPlayer && currentVideoIdRef.current === videoId) {
      // Same video, don't recreate - player is already initialized
      return;
    }

    // Destroy existing player if videoId changed
    if (currentPlayer && currentVideoIdRef.current !== videoId) {
      try {
        currentPlayer.destroy();
      } catch (e) {
        // Ignore errors
      }
    }

    // Only create new player if container exists and is in DOM
    if (!containerRef.current || !containerRef.current.parentElement) {
      return;
    }

    currentVideoIdRef.current = videoId;
    playerRef.current = new window.YT.Player(containerRef.current, {
      videoId: videoId,
      playerVars: {
        autoplay: autoPlay ? 1 : 0,
        controls: 1,
        rel: 0,
        modestbranding: 1,
        fs: disableNativeFullscreen ? 0 : 1,
        playsinline: 1,
      },
      events: {
        onReady: (event: YouTubePlayerEvent) => {
          setIsReady(true);
          const duration = event.target.getDuration();
          if (duration && onDurationReady) {
            onDurationReady(duration);
          }
          if (autoPlay) {
            try {
              event.target.playVideo();
            } catch (e) {
              console.error("Autoplay failed or was blocked:", e);
            }
          }
        },
        onStateChange: (event: YouTubePlayerEvent) => {
          // YT.PlayerState.PLAYING = 1
          // YT.PlayerState.PAUSED = 2
          // YT.PlayerState.ENDED = 0
          if (event.data === 1) {
            // Playing
            if (onPlay) onPlay();
            startProgressTracking();
          } else if (event.data === 2) {
            // Paused
            if (onPause) onPause();
            stopProgressTracking();
          } else if (event.data === 0) {
            // Ended
            if (onEnd) onEnd();
            stopProgressTracking();
            // Report 100% when video ends
            const currentPlayer = playerRef.current;
            const progressHandler = onProgressRef.current;
            if (currentPlayer && progressHandler) {
              const duration = currentPlayer.getDuration();
              if (duration) {
                const volume = currentPlayer.getVolume?.() ?? 100;
                const isMuted = currentPlayer.isMuted?.() ?? false;
                progressHandler(100, duration, duration, volume, isMuted);
              }
            }
          }
        },
      },
    });
  }, [videoId, autoPlay, disableNativeFullscreen, onDurationReady, onPlay, onPause, onEnd, onProgress, startProgressTracking, stopProgressTracking, playerRef]);

  useEffect(() => {
    // Load YouTube IFrame API if not already loaded
    if (!window.YT) {
      const tag = document.createElement("script");
      tag.src = "https://www.youtube.com/iframe_api";
      const firstScriptTag = document.getElementsByTagName("script")[0];
      firstScriptTag.parentNode?.insertBefore(tag, firstScriptTag);

      window.onYouTubeIframeAPIReady = () => {
        // Small delay to ensure container is in DOM and has size
        setTimeout(() => {
          initializePlayer();
        }, 100);
      };
    } else {
      // Small delay to ensure container is in DOM and has size
      setTimeout(() => {
        initializePlayer();
      }, 100);
    }

    return () => {
      // Cleanup - stop progress tracking
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current);
        progressIntervalRef.current = null;
      }
      // Destroy player on unmount to prevent memory leaks
      // Player will be recreated quickly when component remounts with same videoId
      const currentPlayer = playerRef.current;
      if (currentPlayer) {
        try {
          // Use setTimeout to delay destruction slightly, allowing smooth transitions
          setTimeout(() => {
            if (playerRef.current === currentPlayer) {
              currentPlayer.destroy();
              playerRef.current = null;
              currentVideoIdRef.current = null;
            }
          }, 100);
        } catch (e) {
          console.error("Error destroying YouTube player:", e);
        }
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videoId, initializePlayer]);

  return (
    <div className="youtube-player-host absolute inset-0 w-full h-full bg-black [&_iframe]:absolute [&_iframe]:inset-0 [&_iframe]:h-full [&_iframe]:w-full">
      <div
        ref={containerRef}
        className="absolute inset-0 h-full w-full"
      />
    </div>
  );
}, (prevProps, nextProps) => {
  // Custom comparison: only re-render if videoId or autoPlay changes
  return prevProps.videoId === nextProps.videoId && prevProps.autoPlay === nextProps.autoPlay;
});


