export type YouTubeThumbnailQuality = "default" | "hqdefault" | "mqdefault" | "sddefault" | "maxresdefault";

/** Extract YouTube video ID from common URL formats. */
export function getYouTubeVideoId(url: string): string | null {
  if (!url) return null;
  const youtubeRegex =
    /(?:youtube\.com\/(?:[^/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?/\s]{11})/;
  const match = url.match(youtubeRegex);
  return match?.[1] ?? null;
}

export function isYouTubeUrl(url: string): boolean {
  return getYouTubeVideoId(url) !== null;
}

export function getYouTubeThumbnailUrl(
  videoIdOrUrl: string,
  quality: YouTubeThumbnailQuality = "hqdefault"
): string | null {
  const videoId = videoIdOrUrl.length === 11 ? videoIdOrUrl : getYouTubeVideoId(videoIdOrUrl);
  if (!videoId) return null;
  return `https://img.youtube.com/vi/${videoId}/${quality}.jpg`;
}

/** Prefer custom thumbnail; fallback to YouTube derived from video URL. */
export function resolveThumbnail(
  videoUrl: string,
  customThumbnail?: string
): string | null {
  const trimmed = customThumbnail?.trim();
  if (trimmed) return trimmed;
  if (!videoUrl) return null;
  return getYouTubeThumbnailUrl(videoUrl);
}

export function getYouTubeEmbedUrl(url: string): string {
  const videoId = getYouTubeVideoId(url);
  if (videoId) return `https://www.youtube.com/embed/${videoId}`;
  return url;
}
