export type StudyphimSubType = "en" | "vi" | "pronounce";

export const STUDYPHIM_TYPE_MAP: Record<
  StudyphimSubType,
  "eng" | "vn" | "pronounce"
> = {
  en: "eng",
  vi: "vn",
  pronounce: "pronounce",
};

const STUDYPHIM_BASE = "https://www.studyphim.vn";

/** Lấy slug phim từ URL studyphim (vd. friends-season-1). */
export function extractStudyphimSlug(link: string): string | null {
  const trimmed = link.trim();
  if (!trimmed) return null;
  try {
    const url = new URL(trimmed);
    const match = url.pathname.match(/\/movies\/([^/]+)\/?$/i);
    if (match?.[1]) return match[1];
  } catch {
    const match = trimmed.match(/\/movies\/([^/?#]+)/i);
    if (match?.[1]) return match[1];
  }
  return null;
}

export function buildStudyphimSubUrl(
  slug: string,
  type: StudyphimSubType,
  episode: number
): string {
  return `${STUDYPHIM_BASE}/movies/getSubtitle/${type}/${slug}/${episode}`;
}
