"use client";

import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { cn } from "@/utils";
import { useOcrImageUpload } from "@/modules/ai/hooks/useOcrImageUpload";
import { useCallback, useRef, useState } from "react";
import { toast } from "react-hot-toast";
import {
  AI_SPEAKING_MAX,
  AI_WRITING_MIN_WORDS,
  AI_WRITING_MAX_WORDS,
  AI_WRITING_DEFAULT_WORDS,
  AI_WRITING_WORDS_STEP,
} from "../types";

type CreateSpeakingModalProps = {
  open: boolean;
  onClose: () => void;
  canCreate: boolean;
  onCreate: (params: { title: string; text: string; voice?: string }) => Promise<unknown>;
  onOcr: (mimeType: string, base64: string) => Promise<string>;
  onGenerateText: (params: {
    prompt: string;
    length?: number;
  }) => Promise<{ title: string | null; text: string }>;
};

type Tab = "ready" | "draft";

export function CreateSpeakingModal({
  open,
  onClose,
  canCreate,
  onCreate,
  onOcr,
  onGenerateText,
}: CreateSpeakingModalProps) {
  const [tab, setTab] = useState<Tab>("draft");
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiLength, setAiLength] = useState<number>(AI_WRITING_DEFAULT_WORDS);
  const {
    imagePreview,
    imageData,
    isPreparingImage,
    loadImageFile,
    resetImage,
  } = useOcrImageUpload();
  const [isGenerating, setIsGenerating] = useState(false);
  const [isOcrLoading, setIsOcrLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [triedSubmit, setTriedSubmit] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const titleInvalid = triedSubmit && !title.trim();
  const textInvalid = triedSubmit && !text.trim();

  const resetForm = useCallback(() => {
    setTab("draft");
    setTitle("");
    setText("");
    setAiPrompt("");
    setAiLength(AI_WRITING_DEFAULT_WORDS);
    setTriedSubmit(false);
    resetImage();
  }, [resetImage]);

  const handleClose = () => {
    resetForm();
    onClose();
  };

  const handleGenerate = async () => {
    const trimmed = aiPrompt.trim();
    if (!trimmed) {
      toast.error("Nhập chủ đề để AI tạo văn bản.");
      return;
    }
    try {
      setIsGenerating(true);
      const result = await onGenerateText({ prompt: trimmed, length: aiLength });
      setText(result.text);
      if (!title.trim() && result.title) setTitle(result.title);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Tạo văn bản thất bại.");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleOcr = async () => {
    if (!imageData) {
      toast.error("Chưa có ảnh.");
      return;
    }
    try {
      setIsOcrLoading(true);
      const extracted = await onOcr(imageData.mimeType, imageData.base64);
      setText(extracted);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "OCR thất bại.");
    } finally {
      setIsOcrLoading(false);
    }
  };

  const handleSave = async () => {
    const trimmedTitle = title.trim();
    const trimmedText = text.trim();
    if (!trimmedTitle || !trimmedText) {
      setTriedSubmit(true);
      return;
    }
    if (!canCreate) {
      toast.error(`Tối đa ${AI_SPEAKING_MAX} bài nói.`);
      return;
    }
    try {
      setIsSaving(true);
      await onCreate({ title: trimmedTitle, text: trimmedText });
      handleClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Tạo bài nói thất bại.");
    } finally {
      setIsSaving(false);
    }
  };

  const TABS: { value: Tab; label: string }[] = [
    { value: "draft", label: "Chưa soạn bài nói" },
    { value: "ready", label: "Đã soạn bài nói" },
  ];

  return (
    <Modal open={open} onClose={handleClose} title="Tạo bài nói" maxWidth="2xl">
      <div className="space-y-4">
        {!canCreate ? (
          <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
            Đã đạt tối đa {AI_SPEAKING_MAX} bài nói. Xóa bài cũ để tạo mới.
          </p>
        ) : null}

        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">
            Tiêu đề <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Tiêu đề bài nói"
            aria-invalid={titleInvalid}
            className={cn(
              "w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-1",
              titleInvalid
                ? "border-red-400 focus:border-red-400 focus:ring-red-200"
                : "border-slate-200 focus:border-sky-400 focus:ring-sky-200"
            )}
          />
          {titleInvalid ? (
            <p className="mt-1 text-xs text-red-500">Vui lòng nhập tiêu đề.</p>
          ) : null}
        </div>

        <div className="flex gap-2">
          {TABS.map((t) => (
            <button
              key={t.value}
              type="button"
              onClick={() => setTab(t.value)}
              className={cn(
                "rounded-full px-3 py-1.5 text-sm font-medium transition-colors",
                tab === t.value
                  ? "bg-sky-600 text-white"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              )}
            >
              {t.label}
            </button>
          ))}
        </div>

        {tab === "ready" ? (
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">
              Ảnh bài nói đã chép vào tập
            </label>
            <div
              className={cn(
                "cursor-pointer rounded-lg border border-dashed border-slate-300 px-4 py-6 text-center text-sm text-slate-500",
                "hover:border-sky-400 hover:bg-slate-50"
              )}
              onClick={() => !isPreparingImage && fileInputRef.current?.click()}
            >
              {isPreparingImage ? "Đang xử lý ảnh…" : "Bấm chọn ảnh chứa chữ"}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                disabled={isPreparingImage}
                onChange={(e) => void loadImageFile(e.target.files?.[0] ?? null)}
              />
            </div>
            {imagePreview ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={imagePreview} alt="Preview" className="mt-2 max-h-40 rounded-lg border" />
            ) : null}
            {imageData ? (
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className="mt-2"
                disabled={isOcrLoading || isPreparingImage}
                onClick={() => void handleOcr()}
              >
                {isOcrLoading ? "Đang đọc ảnh…" : "Trích xuất chữ từ ảnh"}
              </Button>
            ) : null}
          </div>
        ) : (
          <div className="space-y-2 rounded-lg border border-violet-200 bg-violet-50/60 p-3">
            <label className="block text-sm font-medium text-slate-700">Nhập đề bài</label>
            <textarea
              value={aiPrompt}
              onChange={(e) => setAiPrompt(e.target.value)}
              rows={2}
              placeholder="Ví dụ: Một đoạn nói về sở thích đọc sách..."
              className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm focus:border-violet-400 focus:outline-none focus:ring-1 focus:ring-violet-200"
            />
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-600">Độ dài</span>
              <span className="text-xs font-semibold text-violet-700">{aiLength} từ</span>
            </div>
            <input
              type="range"
              min={AI_WRITING_MIN_WORDS}
              max={AI_WRITING_MAX_WORDS}
              step={AI_WRITING_WORDS_STEP}
              value={aiLength}
              onChange={(e) => setAiLength(Number(e.target.value))}
              className="w-full cursor-pointer accent-violet-600"
            />
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="w-full"
              disabled={isGenerating || !aiPrompt.trim()}
              onClick={() => void handleGenerate()}
            >
              {isGenerating ? "AI đang tạo…" : "Tạo văn bản bài nói"}
            </Button>
          </div>
        )}

        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">Hoặc tự nhập văn bản </label>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={6}
            placeholder={
              tab === "ready"
                ? "Nhập văn bản cần nói..."
                : "Văn bản mẫu (có thể sửa)..."
            }
            aria-invalid={textInvalid}
            className={cn(
              "w-full rounded-md border px-3 py-2 text-sm leading-relaxed focus:outline-none focus:ring-1",
              textInvalid
                ? "border-red-400 focus:border-red-400 focus:ring-red-200"
                : "border-slate-200 focus:border-sky-400 focus:ring-sky-200"
            )}
          />
          {textInvalid ? (
            <p className="mt-1 text-xs text-red-500">Vui lòng nhập văn bản.</p>
          ) : null}
        </div>

        <div className="flex flex-wrap justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={handleClose}>
            Hủy
          </Button>
          <Button
            type="button"
            variant="primary"
            disabled={!canCreate || isSaving}
            onClick={() => void handleSave()}
          >
            {isSaving ? "Đang tạo MP3…" : "Tạo bài nói mẫu"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
