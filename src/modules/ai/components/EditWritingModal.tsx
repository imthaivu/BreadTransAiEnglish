"use client";

import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { cn } from "@/utils";
import { useEffect, useState } from "react";
import { toast } from "react-hot-toast";
import type { WritingItem, WritingKind } from "../types";
import {
  AI_WRITING_MIN_WORDS,
  AI_WRITING_MAX_WORDS,
  AI_WRITING_WORDS_STEP,
} from "../types";

type EditWritingModalProps = {
  open: boolean;
  item: WritingItem | null;
  onClose: () => void;
  onUpdate: (params: {
    itemId: string;
    mode: "manual" | "ai";
    title?: string;
    script?: string;
    kind?: WritingKind;
    length?: number;
    instruction?: string;
  }) => Promise<WritingItem>;
};

const KIND_OPTIONS: { value: WritingKind; label: string }[] = [
  { value: "paragraph", label: "Đoạn văn" },
  { value: "essay", label: "Bài văn" },
];

const QUICK_INSTRUCTIONS = [
  "Sửa lỗi ngữ pháp & chính tả",
  "Viết ngắn gọn hơn",
  "Viết trang trọng hơn",
  "Dùng từ vựng nâng cao hơn",
  "Diễn đạt tự nhiên hơn",
];

export function EditWritingModal({ open, item, onClose, onUpdate }: EditWritingModalProps) {
  const [tab, setTab] = useState<"manual" | "ai">("manual");
  const [title, setTitle] = useState("");
  const [script, setScript] = useState("");
  const [kind, setKind] = useState<WritingKind>("paragraph");
  const [length, setLength] = useState<number>(AI_WRITING_MIN_WORDS);
  const [instruction, setInstruction] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [isRefining, setIsRefining] = useState(false);

  useEffect(() => {
    if (open && item) {
      setTab("manual");
      setTitle(item.title);
      setScript(item.script);
      setKind(item.kind);
      setLength(item.length);
      setInstruction("");
    }
  }, [open, item?.id]);

  if (!item) return null;

  const handleSaveManual = async () => {
    const trimmedScript = script.trim();
    if (!trimmedScript) {
      toast.error("Nội dung không được để trống.");
      return;
    }
    try {
      setIsSaving(true);
      await onUpdate({
        itemId: item.id,
        mode: "manual",
        title: title.trim() || item.title,
        script: trimmedScript,
        kind,
        length,
      });
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Cập nhật thất bại.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleRefine = async () => {
    const trimmed = instruction.trim();
    if (!trimmed) {
      toast.error("Nhập yêu cầu để AI chỉnh sửa.");
      return;
    }
    try {
      setIsRefining(true);
      const updated = await onUpdate({
        itemId: item.id,
        mode: "ai",
        script: script.trim(),
        kind,
        length,
        instruction: trimmed,
      });
      setTitle(updated.title);
      setScript(updated.script);
      setKind(updated.kind);
      setLength(updated.length);
      setTab("manual");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "AI chỉnh sửa thất bại.");
    } finally {
      setIsRefining(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Chỉnh sửa bài viết" maxWidth="2xl">
      <div className="space-y-4">
        <div className="flex gap-2">
          {(["manual", "ai"] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={cn(
                "rounded-full px-3 py-1.5 text-sm font-medium transition-colors",
                tab === t
                  ? "bg-sky-600 text-white"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              )}
            >
              {t === "manual" ? "Sửa tay" : "Nhờ AI chỉnh sửa"}
            </button>
          ))}
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">Tiêu đề</label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Tiêu đề bài viết"
            className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm focus:border-sky-400 focus:outline-none focus:ring-1 focus:ring-sky-200"
          />
        </div>

        <div className="space-y-2">
          <p className="text-sm font-medium text-slate-700">Loại bài</p>
          <div className="flex flex-wrap gap-2">
            {KIND_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setKind(opt.value)}
                className={cn(
                  "rounded-full px-3 py-1.5 text-sm font-medium transition-colors",
                  kind === opt.value
                    ? "bg-sky-600 text-white"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                )}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-slate-700">Độ dài mong muốn</p>
            <span className="text-sm font-semibold text-violet-700">{length} từ</span>
          </div>
          <input
            type="range"
            min={AI_WRITING_MIN_WORDS}
            max={AI_WRITING_MAX_WORDS}
            step={AI_WRITING_WORDS_STEP}
            value={length}
            onChange={(e) => setLength(Number(e.target.value))}
            className="w-full cursor-pointer accent-violet-600"
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">Nội dung</label>
          <textarea
            value={script}
            onChange={(e) => setScript(e.target.value)}
            rows={8}
            placeholder="Nội dung bài viết..."
            className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm leading-relaxed focus:border-sky-400 focus:outline-none focus:ring-1 focus:ring-sky-200"
          />
        </div>

        {tab === "ai" ? (
          <div className="space-y-2 rounded-lg border border-violet-200 bg-violet-50/60 p-3">
            <label className="block text-sm font-medium text-slate-700">
              Yêu cầu cho AI
            </label>
            <div className="flex flex-wrap gap-2">
              {QUICK_INSTRUCTIONS.map((q) => (
                <button
                  key={q}
                  type="button"
                  onClick={() => setInstruction(q)}
                  className="rounded-full border border-violet-200 bg-white px-2.5 py-1 text-xs text-violet-700 hover:bg-violet-100"
                >
                  {q}
                </button>
              ))}
            </div>
            <textarea
              value={instruction}
              onChange={(e) => setInstruction(e.target.value)}
              rows={2}
              placeholder="Ví dụ: viết lại trang trọng hơn, thêm ví dụ cụ thể..."
              className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm focus:border-violet-400 focus:outline-none focus:ring-1 focus:ring-violet-200"
            />
            <Button
              type="button"
              variant="secondary"
              className="w-full"
              disabled={isRefining}
              onClick={() => void handleRefine()}
            >
              {isRefining ? "AI đang chỉnh sửa…" : "Để AI chỉnh sửa nội dung"}
            </Button>
            <p className="text-xs text-slate-500">
              AI sẽ viết lại phần nội dung ở trên. Bạn xem lại rồi bấm Lưu.
            </p>
          </div>
        ) : null}

        <div className="flex flex-wrap justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={onClose}>
            Hủy
          </Button>
          <Button
            type="button"
            variant="primary"
            disabled={isSaving || isRefining || !script.trim()}
            onClick={() => void handleSaveManual()}
          >
            {isSaving ? "Đang lưu…" : "Lưu thay đổi"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
