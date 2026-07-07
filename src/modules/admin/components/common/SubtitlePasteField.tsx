"use client";

import { cn } from "@/utils";
import { useRef } from "react";
import PasteButton from "./PasteButton";

function sanitizePastedText(text: string): string {
  return text.replace(/\r\n|\r|\n/g, "");
}

interface SubtitlePasteFieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
}

export default function SubtitlePasteField({
  label,
  value,
  onChange,
  placeholder,
  disabled = false,
}: SubtitlePasteFieldProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleTextareaPaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const raw = e.clipboardData.getData("text/plain");
    if (!raw) return;

    e.preventDefault();
    const pasted = sanitizePastedText(raw);
    const el = e.currentTarget;
    const start = el.selectionStart ?? value.length;
    const end = el.selectionEnd ?? value.length;
    const newValue = value.slice(0, start) + pasted + value.slice(end);
    onChange(newValue);

    const caret = start + pasted.length;
    requestAnimationFrame(() => {
      const ta = textareaRef.current;
      if (!ta) return;
      ta.focus();
      ta.setSelectionRange(caret, caret);
    });
  };

  return (
    <div>
      <label className="mb-1 block text-xs text-gray-600">{label}</label>
      <div className="relative">
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onPaste={handleTextareaPaste}
          disabled={disabled}
          placeholder={placeholder}
          rows={4}
          className={cn(
            "w-full resize-y rounded-md border border-gray-300 bg-white px-3 py-2 pr-11",
            "font-mono text-xs text-gray-800 placeholder:text-gray-400",
            "focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary",
            disabled && "cursor-not-allowed opacity-60"
          )}
        />
        <PasteButton
          onPaste={(text) => onChange(sanitizePastedText(text))}
          disabled={disabled}
          className="top-2 translate-y-0"
        />
      </div>
    </div>
  );
}
