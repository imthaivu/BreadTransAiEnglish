import { NextRequest, NextResponse } from "next/server";
import { normalizeRawSubtitle } from "@/utils/subtitles";
import {
  buildStudyphimSubUrl,
  extractStudyphimSlug,
  STUDYPHIM_TYPE_MAP,
  type StudyphimSubType,
} from "@/utils/studyphim";

const SUB_TYPES: StudyphimSubType[] = ["en", "vi", "pronounce"];

const FETCH_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  Accept: "text/plain,*/*",
};

async function fetchSubtitleType(
  slug: string,
  type: StudyphimSubType,
  episode: number
): Promise<string> {
  const url = buildStudyphimSubUrl(slug, type, episode);
  try {
    const res = await fetch(url, { headers: FETCH_HEADERS });
    if (!res.ok) return "";
    const raw = (await res.text()).trim();
    if (!raw) return "";
    return normalizeRawSubtitle(raw);
  } catch (err) {
    console.warn(`[crawl-subtitles] Failed ${type} ep${episode}:`, err);
    return "";
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const link = searchParams.get("link")?.trim() ?? "";
    const episodeRaw = searchParams.get("episode") ?? "1";
    const episode = Math.max(1, Math.floor(Number(episodeRaw)) || 1);

    const slug = extractStudyphimSlug(link);
    if (!slug) {
      return NextResponse.json(
        { error: "Link không hợp lệ. Dán URL dạng https://www.studyphim.vn/movies/{slug}" },
        { status: 400 }
      );
    }

    const entries = await Promise.all(
      SUB_TYPES.map(async (type) => {
        const content = await fetchSubtitleType(slug, type, episode);
        return [STUDYPHIM_TYPE_MAP[type], content] as const;
      })
    );

    const result: Record<string, string> = {};
    for (const [key, content] of entries) {
      if (content) result[key] = content;
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error("[crawl-subtitles] Error:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Internal Server Error",
      },
      { status: 500 }
    );
  }
}
