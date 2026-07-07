"use client";

import { SafeImage as Image } from "@/components/ui/SafeImage";
import { useEffect, useState } from "react";
import { imagePreloader } from "@/modules/flashcard/utils/imagePreloader";

interface ScriptWordDetailProps {
  word: string;
  mean: string | null;
  isLoading?: boolean;
  compact?: boolean;
}

export function ScriptWordDetail({
  word,
  mean,
  isLoading = false,
  compact = false,
}: ScriptWordDetailProps) {
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const imageSize = compact ? 72 : 100;

  useEffect(() => {
    let cancelled = false;
    setImageUrl(null);

    void imagePreloader.getImageUrl(word).then((url) => {
      if (!cancelled) setImageUrl(url);
    });

    return () => {
      cancelled = true;
    };
  }, [word]);

  return (
    <div className={`flex flex-col items-center gap-2 ${compact ? "p-2" : "p-3"}`}>
      <div
        className="rounded-lg border border-gray-200 bg-gray-50 overflow-hidden flex items-center justify-center"
        style={{ width: imageSize, height: imageSize }}
      >
        {imageUrl ? (
          <Image
            src={imageUrl}
            alt={word}
            width={imageSize}
            height={imageSize}
            className="w-full h-full object-cover"
          />
        ) : (
          <span className="text-[10px] text-gray-400 px-1 text-center">No image</span>
        )}
      </div>
      <span className={`block font-bold text-gray-900 ${compact ? "text-sm" : "text-lg"}`}>
        {word}
      </span>
      <div className="text-center px-2 py-1 bg-blue-50 rounded-lg border border-blue-200 w-full min-h-[2rem] flex items-center justify-center">
        {isLoading ? (
          <span className="text-xs text-gray-500">Đang dịch…</span>
        ) : mean ? (
          <span className={`block font-semibold text-gray-800 ${compact ? "text-xs" : "text-sm"}`}>
            {mean}
          </span>
        ) : (
          <span className="text-xs text-gray-500">Chưa có nghĩa</span>
        )}
      </div>
    </div>
  );
}
