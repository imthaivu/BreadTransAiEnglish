"use client";

import { Button } from "@/components/ui/Button";
import { cn } from "@/utils";
import { useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import {
  FiArrowDown,
  FiArrowUp,
  FiMove,
  FiPlus,
  FiSave,
  FiSearch,
  FiTrash2,
} from "react-icons/fi";
import { MusicSong } from "../services/content.service";
import {
  useMusicLibrary,
  useUpdateMusicLibrary,
} from "../hooks/useContentManagement";
import { PasteInput } from "./common";

const DRAG_MIME = "application/x-music-song-index";

type SongDraft = { title: string; video: string };

const EMPTY_DRAFT: SongDraft = { title: "", video: "" };

function removeVietnameseTones(str: string): string {
  return str
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D");
}

const draftFromSong = (s: MusicSong): SongDraft => ({
  title: s.title ?? "",
  video: s.video ?? "",
});

export default function AdminMusicPanel() {
  const { data: library, isLoading } = useMusicLibrary();
  const updateMutation = useUpdateMusicLibrary();

  const [drafts, setDrafts] = useState<SongDraft[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [draggingIndex, setDraggingIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (library) {
      setDrafts(
        library.songs.length > 0
          ? library.songs.map(draftFromSong)
          : [{ ...EMPTY_DRAFT }]
      );
      setDirty(false);
    }
  }, [library]);

  const canReorder = !searchQuery.trim();

  const filteredIndices = useMemo(() => {
    if (!searchQuery.trim()) return drafts.map((_, i) => i);
    const q = searchQuery.toLowerCase();
    const qNoTones = removeVietnameseTones(q);
    return drafts
      .map((d, i) => ({ d, i }))
      .filter(({ d }) => {
        const titleLower = d.title.toLowerCase();
        const titleNoTones = removeVietnameseTones(titleLower);
        return (
          titleLower.includes(q) ||
          titleNoTones.includes(qNoTones) ||
          d.video.toLowerCase().includes(q)
        );
      })
      .map(({ i }) => i);
  }, [drafts, searchQuery]);

  const updateDraft = (index: number, patch: Partial<SongDraft>) => {
    setDrafts((prev) =>
      prev.map((d, i) => (i === index ? { ...d, ...patch } : d))
    );
    setDirty(true);
  };

  const addRow = () => {
    setDrafts((prev) => [...prev, { ...EMPTY_DRAFT }]);
    setDirty(true);
  };

  const removeRow = (index: number) => {
    setDrafts((prev) => {
      if (prev.length <= 1) return [{ ...EMPTY_DRAFT }];
      return prev.filter((_, i) => i !== index);
    });
    setDirty(true);
  };

  const moveRow = (index: number, direction: -1 | 1) => {
    setDrafts((prev) => {
      const next = [...prev];
      const target = index + direction;
      if (target < 0 || target >= next.length) return prev;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
    setDirty(true);
  };

  const handleReorder = (fromIndex: number, toIndex: number) => {
    if (fromIndex === toIndex) return;
    setDrafts((prev) => {
      const next = [...prev];
      const [moved] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moved);
      return next;
    });
    setDirty(true);
  };

  const handleSave = async () => {
    const songs: MusicSong[] = [];
    for (let i = 0; i < drafts.length; i += 1) {
      const d = drafts[i];
      const title = d.title.trim();
      const video = d.video.trim();
      if (!title && !video) continue;
      if (!title) {
        toast.error(`Bài #${i + 1}: chưa có tên bài.`);
        return;
      }
      if (!video) {
        toast.error(`Bài #${i + 1}: chưa có link video.`);
        return;
      }
      songs.push({ title, video });
    }
    await updateMutation.mutateAsync(songs);
    setDirty(false);
  };

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="h-24 animate-pulse rounded-lg border border-gray-200 bg-gray-50"
          />
        ))}
      </div>
    );
  }

  return (
    <div>
      <div className="mb-3 rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 text-sm text-blue-900">
        <p>
          Tất cả bài hát lưu chung <strong>1 doc</strong>:{" "}
          <code className="rounded bg-white/80 px-1 text-xs">music/library</code>
          {" "}→ field <code className="rounded bg-white/80 px-1 text-xs">songs[]</code>.
        </p>
      </div>

      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center">
        <PasteInput
          containerClassName="flex-1"
          type="text"
          placeholder="Tìm bài hát..."
          value={searchQuery}
          onValueChange={setSearchQuery}
          leftSlot={<FiSearch className="h-4 w-4" />}
          trimOnPaste
        />
        <Button
          type="button"
          onClick={handleSave}
          disabled={!dirty || updateMutation.isPending}
          className="inline-flex items-center gap-2"
        >
          <FiSave className="h-4 w-4" />
          {updateMutation.isPending ? "Đang lưu..." : "Lưu"}
        </Button>
      </div>

      {searchQuery && (
        <p className="mb-3 text-sm text-gray-500">
          Tìm thấy {filteredIndices.length}/{drafts.length} bài hát
        </p>
      )}

      {!searchQuery && drafts.length > 0 && (
        <p className="mb-2 text-xs text-gray-500">
          Kéo biểu tượng{" "}
          <FiMove className="inline h-3 w-3 align-text-bottom" /> để đổi thứ tự.
          Bấm Lưu sau khi chỉnh sửa.
        </p>
      )}

      {filteredIndices.length === 0 ? (
        <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50 py-12 text-center">
          <p className="text-sm text-gray-500">
            {drafts.length === 0
              ? 'Chưa có bài hát. Bấm "Thêm bài hát" bên dưới để bắt đầu.'
              : "Không tìm thấy bài hát phù hợp."}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {filteredIndices.map((index) => {
            const d = drafts[index];
            const isDragging = draggingIndex === index;
            const isDragOver =
              dragOverIndex === index && draggingIndex !== index;

            return (
              <div
                key={index}
                onDragOver={
                  canReorder
                    ? (e) => {
                        if (draggingIndex === null) return;
                        e.preventDefault();
                        e.dataTransfer.dropEffect = "move";
                        setDragOverIndex(index);
                      }
                    : undefined
                }
                onDragLeave={
                  canReorder
                    ? (e) => {
                        if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                          setDragOverIndex((prev) =>
                            prev === index ? null : prev
                          );
                        }
                      }
                    : undefined
                }
                onDrop={
                  canReorder
                    ? (e) => {
                        e.preventDefault();
                        const from = Number(e.dataTransfer.getData(DRAG_MIME));
                        setDragOverIndex(null);
                        setDraggingIndex(null);
                        if (!Number.isNaN(from)) handleReorder(from, index);
                      }
                    : undefined
                }
                className={cn(
                  "rounded-lg border bg-white p-3 transition-all",
                  isDragging
                    ? "opacity-40 border-primary"
                    : isDragOver
                      ? "border-primary ring-2 ring-primary/30"
                      : "border-gray-200"
                )}
              >
                <div className="flex items-start gap-2">
                  <button
                    type="button"
                    draggable={canReorder}
                    onDragStart={
                      canReorder
                        ? (e) => {
                            e.dataTransfer.setData(DRAG_MIME, String(index));
                            e.dataTransfer.effectAllowed = "move";
                            setDraggingIndex(index);
                          }
                        : undefined
                    }
                    onDragEnd={() => {
                      setDraggingIndex(null);
                      setDragOverIndex(null);
                    }}
                    disabled={!canReorder}
                    title={
                      canReorder
                        ? "Kéo để đổi thứ tự"
                        : "Xoá bộ lọc tìm kiếm để kéo thả"
                    }
                    className={cn(
                      "mt-1 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded text-gray-400 hover:bg-gray-100 hover:text-gray-700",
                      canReorder
                        ? "cursor-grab active:cursor-grabbing"
                        : "cursor-not-allowed opacity-40"
                    )}
                  >
                    <FiMove className="h-3.5 w-3.5" />
                  </button>
                  <span className="mt-1 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded bg-primary/10 text-xs font-semibold text-primary">
                    {index + 1}
                  </span>
                  <div className="min-w-0 flex-1 space-y-2">
                    <div>
                      <label className="mb-1 block text-xs text-gray-600">
                        Tên bài
                      </label>
                      <PasteInput
                        value={d.title}
                        onValueChange={(v) => updateDraft(index, { title: v })}
                        placeholder="Tên bài hát"
                        trimOnPaste
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs text-gray-600">
                        Link YouTube
                      </label>
                      <PasteInput
                        value={d.video}
                        onValueChange={(v) => updateDraft(index, { video: v })}
                        placeholder="https://youtu.be/..."
                        trimOnPaste
                      />
                    </div>
                  </div>
                  <div className="flex flex-col gap-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => moveRow(index, -1)}
                      disabled={index === 0}
                      className="px-2"
                      title="Lên"
                    >
                      <FiArrowUp className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => moveRow(index, 1)}
                      disabled={index === drafts.length - 1}
                      className="px-2"
                      title="Xuống"
                    >
                      <FiArrowDown className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      type="button"
                      variant="destructive"
                      size="sm"
                      onClick={() => removeRow(index)}
                      className="px-2"
                      title="Xoá"
                    >
                      <FiTrash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="mt-3">
        <Button
          type="button"
          variant="outline"
          onClick={addRow}
          className="inline-flex w-full items-center justify-center gap-2 sm:w-auto"
        >
          <FiPlus className="h-4 w-4" />
          Thêm bài hát
        </Button>
      </div>
    </div>
  );
}
