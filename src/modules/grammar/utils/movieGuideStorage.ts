const MOVIE_GUIDE_SHOW_COUNT_KEY = "breadtrans:movie-guide-show-count";
const MAX_GUIDE_SHOWS = 3;

export function getMovieGuideShowCount(): number {
  if (typeof window === "undefined") return MAX_GUIDE_SHOWS;
  try {
    const raw = window.localStorage.getItem(MOVIE_GUIDE_SHOW_COUNT_KEY);
    if (!raw) return 0;
    const n = parseInt(raw, 10);
    if (!Number.isFinite(n) || n < 0) return 0;
    return Math.min(n, MAX_GUIDE_SHOWS);
  } catch {
    return 0;
  }
}

export function shouldShowMovieGuide(): boolean {
  return getMovieGuideShowCount() < MAX_GUIDE_SHOWS;
}

export function markMovieGuideCompleted(): void {
  if (typeof window === "undefined") return;
  const next = Math.min(getMovieGuideShowCount() + 1, MAX_GUIDE_SHOWS);
  window.localStorage.setItem(MOVIE_GUIDE_SHOW_COUNT_KEY, String(next));
}
