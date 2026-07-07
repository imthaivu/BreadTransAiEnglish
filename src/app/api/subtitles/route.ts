import { NextRequest, NextResponse } from "next/server";
import { adminStorage } from "@/lib/firebase/admin";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const movieId = searchParams.get("movieId");
    const episodeKey = searchParams.get("episodeKey");

    if (!movieId || !episodeKey) {
      return NextResponse.json(
        { error: "Missing movieId or episodeKey" },
        { status: 400 }
      );
    }

    const subtitleTypes = ["eng", "vn", "pronounce"] as const;
    const result: Record<string, string> = {};

    // 1. Thử dùng Firebase Admin SDK trước (nhanh, bảo mật và trực tiếp)
    try {
      const bucket = adminStorage().bucket();
      await Promise.all(
        subtitleTypes.map(async (type) => {
          const filePath = `movies/${movieId}/episodes/${episodeKey}/${type}.srt`;
          const file = bucket.file(filePath);
          
          try {
            const [exists] = await file.exists();
            if (exists) {
              const [contentBuffer] = await file.download();
              const content = contentBuffer.toString("utf-8").trim();
              if (content) {
                result[type] = content;
              }
            }
          } catch (err) {
            console.warn(`[Subtitles API] Admin SDK error downloading ${filePath}, will try public fetch:`, err);
          }
        })
      );
    } catch (adminError) {
      console.warn("[Subtitles API] Firebase Admin SDK is not configured or failed, falling back to public storage fetch:", adminError);
    }

    // 2. Fallback: Nếu không dùng được Admin SDK hoặc chưa lấy được file, tải bằng fetch server-side qua URL công khai.
    // LƯU Ý: Fetch ở server-side không bị ràng buộc bởi CORS của trình duyệt (Browser CORS)!
    const bucketName = process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET;
    if (bucketName) {
      await Promise.all(
        subtitleTypes.map(async (type) => {
          if (result[type]) return; // Đã tải xong bằng Admin SDK

          const encodedPath = `movies%2F${encodeURIComponent(movieId)}%2Fepisodes%2F${encodeURIComponent(episodeKey)}%2F${type}.srt`;
          const publicUrl = `https://firebasestorage.googleapis.com/v0/b/${bucketName}/o/${encodedPath}?alt=media`;

          try {
            const res = await fetch(publicUrl);
            if (res.ok) {
              const text = (await res.text()).trim();
              if (text) {
                result[type] = text;
              }
            }
          } catch (fetchError) {
            console.error(`[Subtitles API] Fallback fetch failed for ${publicUrl}:`, fetchError);
          }
        })
      );
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error("[Subtitles API] Error in proxy handler:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal Server Error" },
      { status: 500 }
    );
  }
}
