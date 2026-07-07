"use client";

import { Button } from "@/components/ui/Button";
import { cn } from "@/utils";
import { FiClipboard } from "react-icons/fi";
import toast from "react-hot-toast";

interface PasteButtonProps {
  onPaste: (value: string) => void;
  trimOnPaste?: boolean;
  /** Override class cho nút (mặc định đã có absolute positioning bên phải input). */
  className?: string;
  title?: string;
  disabled?: boolean;
}

export default function PasteButton({
  onPaste,
  trimOnPaste = false,
  className,
  title = "Dán từ clipboard",
  disabled = false,
}: PasteButtonProps) {
  const handlePaste = async () => {
    try {
      if (typeof navigator === "undefined" || !navigator.clipboard?.readText) {
        toast.error("Trình duyệt không hỗ trợ đọc clipboard. Dùng Ctrl+V nhé.");
        return;
      }
      const text = await navigator.clipboard.readText();
      if (!text) {
        toast("Clipboard đang trống.");
        return;
      }
      onPaste(trimOnPaste ? text.trim() : text);
    } catch (err) {
      console.error("Không đọc được clipboard:", err);
      toast.error("Cấp quyền clipboard hoặc dùng Ctrl+V.");
    }
  };

  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      onClick={handlePaste}
      disabled={disabled}
      className={cn(
        "absolute right-1 top-1/2 -translate-y-1/2 h-8 px-2 text-gray-500 hover:text-gray-700",
        className
      )}
      title={title}
      aria-label={title}
    >
      <FiClipboard className="h-4 w-4" />
    </Button>
  );
}
