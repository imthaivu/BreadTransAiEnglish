"use client";

import { useRef, useState } from "react";
import toast from "react-hot-toast";
import { FiUpload } from "react-icons/fi";
import { Button } from "@/components/ui/Button";
import { uploadMovieThumbnail } from "../../services/content.service";
import PasteInput from "./PasteInput";

interface ThumbnailFieldProps {
  value: string;
  onValueChange: (value: string) => void;
  /** Id phim (nếu đang sửa) để lưu ảnh đúng thư mục. */
  movieId?: string;
  disabled?: boolean;
  placeholder?: string;
}

export default function ThumbnailField({
  value,
  onValueChange,
  movieId,
  disabled = false,
  placeholder,
}: ThumbnailFieldProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const uploadFile = async (file: File | undefined | null) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Vui lòng chọn file ảnh.");
      return;
    }
    setUploading(true);
    try {
      const url = await uploadMovieThumbnail(file, movieId);
      onValueChange(url);
      toast.success("Đã tải ảnh lên.");
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Tải ảnh thất bại.";
      toast.error(msg);
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  // Dán ảnh đã copy / ảnh chụp màn hình (Ctrl+V) -> tự upload luôn.
  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    const imageItem = Array.from(items).find((it) =>
      it.type.startsWith("image/")
    );
    if (imageItem) {
      const file = imageItem.getAsFile();
      if (file) {
        e.preventDefault();
        void uploadFile(file);
      }
    }
    // Nếu không phải ảnh: để hành vi dán URL (text) diễn ra bình thường.
  };

  return (
    <div className="flex items-center gap-2">
      <PasteInput
        containerClassName="flex-1"
        value={value}
        onValueChange={onValueChange}
        placeholder={placeholder}
        trimOnPaste
        disabled={disabled || uploading}
        onPaste={handlePaste}
      />
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => uploadFile(e.target.files?.[0])}
      />
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => inputRef.current?.click()}
        disabled={disabled || uploading}
        className="inline-flex items-center gap-1.5 whitespace-nowrap"
      >
        <FiUpload className="h-3.5 w-3.5" />
        {uploading ? "Đang tải..." : "Tải ảnh"}
      </Button>
    </div>
  );
}
