"use client";

import { prepareImageForOcr } from "@/utils/image";
import { useCallback, useState } from "react";
import { toast } from "react-hot-toast";

export function useOcrImageUpload() {
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [imageData, setImageData] = useState<{ mimeType: string; base64: string } | null>(
    null
  );
  const [isPreparingImage, setIsPreparingImage] = useState(false);

  const resetImage = useCallback(() => {
    setImagePreview(null);
    setImageData(null);
    setIsPreparingImage(false);
  }, []);

  const loadImageFile = useCallback(async (file: File | null) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("File không phải là ảnh.");
      return;
    }

    try {
      setIsPreparingImage(true);
      setImagePreview(null);
      setImageData(null);

      const prepared = await prepareImageForOcr(file);
      setImagePreview(prepared.previewUrl);
      setImageData({
        mimeType: prepared.mimeType,
        base64: prepared.base64,
      });

      const sizeMb = (prepared.base64.length * 0.75) / (1024 * 1024);
      if (file.size > prepared.base64.length) {
        toast.success(`Đã tối ưu ảnh (${sizeMb.toFixed(1)} MB)`);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Không xử lý được ảnh.");
      setImagePreview(null);
      setImageData(null);
    } finally {
      setIsPreparingImage(false);
    }
  }, []);

  return {
    imagePreview,
    imageData,
    isPreparingImage,
    loadImageFile,
    resetImage,
  };
}
