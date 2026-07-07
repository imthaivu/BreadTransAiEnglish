"use client";

import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { useEffect, useState } from "react";
import { toast } from "react-hot-toast";
import type { SpeakingItem } from "../types";

type EditSpeakingModalProps = {
  open: boolean;
  item: SpeakingItem | null;
  onClose: () => void;
  onUpdate: (params: {
    itemId: string;
    title?: string;
    text?: string;
  }) => Promise<SpeakingItem>;
};

export function EditSpeakingModal({ open, item, onClose, onUpdate }: EditSpeakingModalProps) {
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (open && item) {
      setTitle(item.title);
      setText(item.script);
    }
  }, [open, item?.id]);

  if (!item) return null;

  const willRegenerate = text.trim() !== item.script;

  const handleSave = async () => {
    const trimmedText = text.trim();
    if (!trimmedText) {
      toast.error("Vui lòng nhập văn bản.");
      return;
    }
    try {
      setIsSaving(true);
      await onUpdate({
        itemId: item.id,
        title: title.trim() || item.title,
        text: trimmedText,
      });
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Cập nhật bài nói thất bại.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Chỉnh sửa bài nói" maxWidth="2xl">
      <div className="space-y-4">
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">Tiêu đề</label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Tiêu đề bài nói"
            className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm focus:border-sky-400 focus:outline-none focus:ring-1 focus:ring-sky-200"
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">Văn bản (script)</label>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={6}
            placeholder="Nội dung cần đọc..."
            className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm leading-relaxed focus:border-sky-400 focus:outline-none focus:ring-1 focus:ring-sky-200"
          />
        </div>

        {willRegenerate ? (
          <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
            Thay đổi văn bản sẽ tạo lại file MP3 mới.
          </p>
        ) : null}

        <div className="flex flex-wrap justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={onClose}>
            Hủy
          </Button>
          <Button
            type="button"
            variant="primary"
            disabled={isSaving || !text.trim()}
            onClick={() => void handleSave()}
          >
            {isSaving ? (willRegenerate ? "Đang tạo MP3…" : "Đang lưu…") : "Lưu thay đổi"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
