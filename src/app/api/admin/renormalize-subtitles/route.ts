import { NextRequest, NextResponse } from "next/server";
import { checkTeacherOrAdminAccess } from "@/lib/auth/server-auth";
import { adminStorage } from "@/lib/firebase/admin";
import { normalizeRawSubtitle } from "@/utils/subtitles";

const SUBTITLE_FILE_RE =
  /^movies\/([^/]+)\/episodes\/([^/]+)\/(eng|vn|pronounce)\.srt$/;

/**
 * Chuẩn hoá toàn bộ file SRT phim trên Storage (đọc/ghi trực tiếp qua Admin SDK).
 * Không phụ thuộc sourceLink/linkPhim — chỉ xử lý file .srt đang có trên bucket.
 */
export async function POST(request: NextRequest) {
  try {
    const accessCheck = await checkTeacherOrAdminAccess(request);
    if (!accessCheck.authorized) {
      return NextResponse.json(
        { error: accessCheck.error ?? "Unauthorized" },
        { status: accessCheck.error === "Unauthorized" ? 401 : 403 }
      );
    }

    const bucket = adminStorage().bucket();
    const [files] = await bucket.getFiles({ prefix: "movies/" });

    const movieIds = new Set<string>();
    const episodePairs = new Set<string>();
    let filesChanged = 0;

    for (const file of files) {
      const match = file.name.match(SUBTITLE_FILE_RE);
      if (!match) continue;

      const [, movieId, episodeKey] = match;
      movieIds.add(movieId);
      episodePairs.add(`${movieId}/${episodeKey}`);

      try {
        const [contentBuffer] = await file.download();
        const original = contentBuffer.toString("utf-8").trim();
        if (!original) continue;

        const normalized = normalizeRawSubtitle(original);
        if (normalized && normalized !== original) {
          await file.save(normalized, {
            contentType: "text/plain; charset=utf-8",
            resumable: false,
          });
          filesChanged += 1;
        }
      } catch (err) {
        console.warn(`[renormalize-subtitles] Failed ${file.name}:`, err);
      }
    }

    return NextResponse.json({
      movies: movieIds.size,
      episodes: episodePairs.size,
      filesChanged,
    });
  } catch (error) {
    console.error("[renormalize-subtitles] Error:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Internal Server Error",
      },
      { status: 500 }
    );
  }
}
