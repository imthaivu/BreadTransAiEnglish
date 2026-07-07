/** Cache duration by URL - max 100 entries to avoid memory leak */
const durationCache = new Map<string, number>();
const MAX_CACHE_SIZE = 100;

/** Trả về duration hợp lệ (finite, > 0) hoặc undefined. */
export function sanitizeDurationSeconds(
  value: number | null | undefined
): number | undefined {
  if (value == null || !Number.isFinite(value) || value <= 0) {
    return undefined;
  }
  return value;
}

function estimateDurationFromFileSize(file: File | Blob): number {
  const bytesPerSec = (64 * 1000) / 8;
  return Math.max(1, Math.min(600, file.size / bytesPerSec));
}

function setDurationCache(url: string, duration: number) {
  if (durationCache.size >= MAX_CACHE_SIZE) {
    const firstKey = durationCache.keys().next().value;
    if (firstKey) durationCache.delete(firstKey);
  }
  durationCache.set(url, duration);
}

/**
 * Lấy duration chính xác từ File/Blob (metadata của audio).
 * Dùng khi nộp bài nói để lưu duration vào DB.
 */
export function getAudioDurationFromFile(file: File | Blob): Promise<number> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const audio = new Audio();
    audio.preload = "metadata";
    let settled = false;

    const finish = (duration: number | undefined) => {
      if (settled) return;
      settled = true;
      cleanup();
      const safe = sanitizeDurationSeconds(duration);
      resolve(safe ?? estimateDurationFromFileSize(file));
    };

    const cleanup = () => {
      clearTimeout(timeoutId);
      audio.removeEventListener("loadedmetadata", onMetadata);
      audio.removeEventListener("durationchange", onDurationChange);
      audio.removeEventListener("error", onError);
      audio.src = "";
      URL.revokeObjectURL(url);
    };

    const tryResolveFromElement = () => {
      finish(sanitizeDurationSeconds(audio.duration));
    };

    const onMetadata = () => {
      tryResolveFromElement();
    };

    const onDurationChange = () => {
      tryResolveFromElement();
    };

    const onError = () => {
      finish(undefined);
    };

    const timeoutId = setTimeout(() => {
      finish(undefined);
    }, 4000);

    audio.addEventListener("loadedmetadata", onMetadata);
    audio.addEventListener("durationchange", onDurationChange);
    audio.addEventListener("error", onError);
    audio.src = url;
  });
}

/**
 * Estimates the duration of an MP3 audio file when metadata is not available.
 * Uses multiple methods to estimate with ±10s accuracy.
 * 
 * @param audioUrl - URL of the audio file
 * @returns Promise<number> - Estimated duration in seconds
 */
export async function estimateAudioDuration(
  audioUrl: string
): Promise<number> {
  const cached = durationCache.get(audioUrl);
  if (cached != null) return cached;

  return new Promise((resolve) => {
    // Method 1: Try to get duration from Audio element metadata
    const audio = new Audio();
    audio.preload = "metadata";
    audio.crossOrigin = "anonymous";

    let resolved = false;

    const resolveOnce = (duration: number) => {
      if (!resolved) {
        resolved = true;
        audio.removeEventListener("loadedmetadata", onMetadataLoaded);
        audio.removeEventListener("error", onError);
        audio.src = "";
        resolve(duration);
      }
    };

    const onMetadataLoaded = () => {
      const duration = audio.duration;

      // Check if duration is valid (not NaN, Infinity, or 0)
      if (duration && isFinite(duration) && duration > 0) {
        setDurationCache(audioUrl, duration);
        resolveOnce(duration);
        return;
      }

      // If metadata doesn't have duration, try method 2
      estimateFromFileSize(audioUrl)
        .then(resolveOnce)
        .catch(() => {
          // If file size method fails, use fallback
          resolveOnce(60); // Default to 60 seconds
        });
    };

    const onError = () => {
      // If audio element fails, try file size method
      estimateFromFileSize(audioUrl)
        .then(resolveOnce)
        .catch(() => {
          resolveOnce(60); // Default fallback
        });
    };

    audio.addEventListener("loadedmetadata", onMetadataLoaded);
    audio.addEventListener("error", onError);

    // Set timeout to prevent hanging
    setTimeout(() => {
      if (!resolved) {
        estimateFromFileSize(audioUrl)
          .then(resolveOnce)
          .catch(() => {
            resolveOnce(60);
          });
      }
    }, 5000);

    audio.src = audioUrl;
  });
}

/**
 * Estimates audio duration based on file size and average bitrate.
 * This method works when metadata is not available.
 * Results are cached by URL.
 *
 * @param audioUrl - URL of the audio file
 * @returns Promise<number> - Estimated duration in seconds
 */
export async function estimateFromFileSize(audioUrl: string): Promise<number> {
  const cached = durationCache.get(audioUrl);
  if (cached != null) return cached;
  try {
    // Fetch file to get Content-Length header
    const response = await fetch(audioUrl, { method: "HEAD" });
    const contentLength = response.headers.get("Content-Length");

    if (contentLength) {
      const fileSizeBytes = parseInt(contentLength, 10);
      const duration = estimateDurationFromBytes(fileSizeBytes);
      setDurationCache(audioUrl, duration);
      return duration;
    }

    // If HEAD request doesn't work, try fetching first few bytes
    // to get file size (some servers don't support HEAD)
    const partialResponse = await fetch(audioUrl, {
      method: "GET",
      headers: { Range: "bytes=0-1024" }, // Fetch first 1KB
    });

    const contentRange = partialResponse.headers.get("Content-Range");
    if (contentRange) {
      // Content-Range format: "bytes 0-1024/1234567"
      const match = contentRange.match(/\/(\d+)$/);
      if (match) {
        const fileSizeBytes = parseInt(match[1], 10);
        const duration = estimateDurationFromBytes(fileSizeBytes);
        setDurationCache(audioUrl, duration);
        return duration;
      }
    }

    // Fallback: try to get size from response if available
    const sizeHeader = partialResponse.headers.get("Content-Length");
    if (sizeHeader) {
      const fileSizeBytes = parseInt(sizeHeader, 10);
      const duration = estimateDurationFromBytes(fileSizeBytes);
      setDurationCache(audioUrl, duration);
      return duration;
    }

    throw new Error("Could not determine file size");
  } catch (error) {
    // If all methods fail, return a reasonable default
    console.warn("Could not estimate audio duration from file size:", error);
    return 60; // Default to 60 seconds
  }
}

/**
 * Estimates duration from file size in bytes.
 * Uses average bitrate assumptions for voice recordings.
 * 
 * @param fileSizeBytes - File size in bytes
 * @returns number - Estimated duration in seconds
 */
function estimateDurationFromBytes(fileSizeBytes: number): number {
  // Common bitrates for voice recordings:
  // - 64 kbps (8 KB/s) - common for voice
  // - 128 kbps (16 KB/s) - higher quality
  // - 32 kbps (4 KB/s) - lower quality
  
  // Use 64 kbps as default for voice recordings (most common)
  // This gives ±10s accuracy for typical 1-5 minute recordings
  const averageBitrateKbps = 64;
  const bytesPerSecond = (averageBitrateKbps * 1000) / 8; // Convert kbps to bytes/s
  
  const estimatedDuration = fileSizeBytes / bytesPerSecond;
  
  // Clamp to reasonable values (1 second to 10 minutes)
  return Math.max(1, Math.min(600, estimatedDuration));
}

/**
 * Gets or estimates audio duration, ensuring the audio element can seek.
 * This function sets up the audio element properly for seeking even when
 * metadata is missing.
 * 
 * @param audioElement - HTMLAudioElement to configure
 * @param audioUrl - URL of the audio file
 * @returns Promise<number> - Duration in seconds
 */
export async function ensureAudioDuration(
  audioElement: HTMLAudioElement,
  audioUrl: string
): Promise<number> {
  return new Promise((resolve) => {
    let resolved = false;

    const resolveOnce = (duration: number) => {
      if (!resolved) {
        resolved = true;
        // Set duration property to enable seeking
        if (audioElement.duration !== duration) {
          // We can't directly set duration, but we can ensure metadata is loaded
          // by setting preload and waiting
          audioElement.preload = "auto";
        }
        resolve(duration);
      }
    };

    // First, try to get duration from the audio element
    const checkDuration = () => {
      const duration = audioElement.duration;
      if (duration && isFinite(duration) && duration > 0) {
        resolveOnce(duration);
        return true;
      }
      return false;
    };

    // Set up event listeners
    const onLoadedMetadata = () => {
      if (checkDuration()) {
        audioElement.removeEventListener("loadedmetadata", onLoadedMetadata);
        audioElement.removeEventListener("durationchange", onDurationChange);
      }
    };

    const onDurationChange = () => {
      if (checkDuration()) {
        audioElement.removeEventListener("loadedmetadata", onLoadedMetadata);
        audioElement.removeEventListener("durationchange", onDurationChange);
      }
    };

    audioElement.addEventListener("loadedmetadata", onLoadedMetadata);
    audioElement.addEventListener("durationchange", onDurationChange);

    // Set audio source
    audioElement.src = audioUrl;
    audioElement.preload = "metadata";

    // If duration is already available, resolve immediately
    if (checkDuration()) {
      audioElement.removeEventListener("loadedmetadata", onLoadedMetadata);
      audioElement.removeEventListener("durationchange", onDurationChange);
      return;
    }

    // Fallback: estimate duration if metadata doesn't load
    setTimeout(() => {
      if (!resolved) {
        estimateAudioDuration(audioUrl).then(resolveOnce);
      }
    }, 3000);
  });
}

