"use client";

import { Button } from "@/components/ui/Button";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import { cn } from "@/utils";
import { resolveThumbnail } from "@/utils/youtube";
import { motion } from "framer-motion";
import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import {
  FiDownload,
  FiEdit2,
  FiMove,
  FiPlus,
  FiRefreshCw,
  FiSearch,
  FiTrash2,
  FiUpload,
} from "react-icons/fi";
import {
  useBulkImportMovies,
  useContentTopics,
  useCreateContentTopic,
  useDeleteContentTopic,
  useMusicLibrary,
  useRenormalizeMovieSubtitles,
  useReorderContentTopics,
  useUpdateContentTopic,
} from "../hooks/useContentManagement";
import {
  CONTENT_KIND_LABEL,
  ContentKind,
  ContentTopic,
  getMovieVariant,
  MovieVariant,
} from "../services/content.service";
import { PasteInput } from "./common";
import { downloadMoviesXlsx } from "../utils/exportMovies";
import AdminMusicPanel from "./AdminMusicPanel";
import ContentTopicEditor from "./ContentTopicEditor";
import SingleMovieEditor from "./SingleMovieEditor";

const MovieImportDialog = dynamic(() => import("./MovieImportDialog"), {
  ssr: false,
});

const DRAG_MIME = "application/x-content-topic-id";

const TAB_ITEMS: { kind: ContentKind; label: string }[] = [
  { kind: "grammars", label: CONTENT_KIND_LABEL.grammars },
  { kind: "movies", label: CONTENT_KIND_LABEL.movies },
  { kind: "music", label: CONTENT_KIND_LABEL.music },
];

function removeVietnameseTones(str: string): string {
  return str
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D");
}

function getMovieThumbnail(topic: ContentTopic): string | null {
  if (topic.thumbnail) return topic.thumbnail;
  if (topic.variant === "single" && topic.video) {
    return resolveThumbnail(topic.video);
  }
  const firstVideo = topic.exercises.find((ex) => ex.video)?.video;
  return firstVideo ? resolveThumbnail(firstVideo) : null;
}

function getMovieEpisodeLabel(topic: ContentTopic): string {
  if (getMovieVariant(topic) === "single") return "1 tập";
  const count = topic.exercises.length;
  return count > 0 ? `${count} tập` : "Nhiều tập";
}

export default function AdminContent() {
  const [activeKind, setActiveKind] = useState<ContentKind>("grammars");
  const [searchQuery, setSearchQuery] = useState("");
  const [editingTopic, setEditingTopic] = useState<ContentTopic | null>(null);
  const [isCreateMode, setIsCreateMode] = useState(false);
  const [topicToDelete, setTopicToDelete] = useState<ContentTopic | null>(null);
  const [movieCreateVariant, setMovieCreateVariant] =
    useState<MovieVariant | null>(null);
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [isRenormalizeOpen, setIsRenormalizeOpen] = useState(false);

  useEffect(() => {
    setSearchQuery("");
  }, [activeKind]);

  const grammarsQuery = useContentTopics("grammars");
  const moviesQuery = useContentTopics("movies");
  const musicLibraryQuery = useMusicLibrary();

  const queryByKind: Record<
    ContentKind,
    { data?: ContentTopic[]; isLoading: boolean }
  > = {
    grammars: grammarsQuery,
    movies: moviesQuery,
    music: { data: [], isLoading: musicLibraryQuery.isLoading },
  };

  const activeQuery = queryByKind[activeKind];
  const topics = activeQuery.data ?? [];
  const isLoading = activeQuery.isLoading;
  const isMusicTab = activeKind === "music";

  const createMutation = useCreateContentTopic(activeKind === "music" ? "movies" : activeKind);
  const moviesCreateMutation = useCreateContentTopic("movies");
  const updateMutation = useUpdateContentTopic(activeKind === "music" ? "grammars" : activeKind);
  const moviesUpdateMutation = useUpdateContentTopic("movies");
  const deleteMutation = useDeleteContentTopic(activeKind);
  const reorderMutation = useReorderContentTopics(activeKind);
  const importMoviesMutation = useBulkImportMovies();
  const renormalizeMutation = useRenormalizeMovieSubtitles();

  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);

  const canReorder = !searchQuery.trim();

  const handleReorder = (fromId: string, toId: string) => {
    if (fromId === toId) return;
    const fromIdx = topics.findIndex((t) => t.id === fromId);
    const toIdx = topics.findIndex((t) => t.id === toId);
    if (fromIdx === -1 || toIdx === -1) return;

    const reordered = [...topics];
    const [moved] = reordered.splice(fromIdx, 1);
    reordered.splice(toIdx, 0, moved);

    const oldOrderById = new Map(topics.map((t) => [t.id, t.order]));
    const items = reordered
      .map((t, i) => ({ id: t.id, order: i + 1 }))
      .filter((it) => oldOrderById.get(it.id) !== it.order);

    if (items.length === 0) return;
    reorderMutation.mutate(items);
  };

  const filteredTopics = useMemo(() => {
    if (!searchQuery.trim()) return topics;
    const q = searchQuery.toLowerCase();
    const qNoTones = removeVietnameseTones(q);
    return topics.filter((topic) => {
      const titleLower = topic.title.toLowerCase();
      const titleNoTones = removeVietnameseTones(titleLower);
      return (
        titleLower.includes(q) ||
        titleNoTones.includes(qNoTones) ||
        topic.id.toLowerCase().includes(q)
      );
    });
  }, [topics, searchQuery]);

  const handleOpenCreate = () => {
    setMovieCreateVariant(null);
    setIsCreateMode(true);
    setEditingTopic(null);
  };

  const handleOpenCreateMovie = (variant: MovieVariant) => {
    setMovieCreateVariant(variant);
    setIsCreateMode(true);
    setEditingTopic(null);
  };

  const handleOpenEdit = (topic: ContentTopic) => {
    setIsCreateMode(false);
    setMovieCreateVariant(getMovieVariant(topic));
    setEditingTopic(topic);
  };

  const handleCloseEditor = () => {
    setIsCreateMode(false);
    setEditingTopic(null);
    setMovieCreateVariant(null);
  };

  const handleConfirmDelete = async () => {
    if (!topicToDelete) return;
    await deleteMutation.mutateAsync(topicToDelete.id);
    setTopicToDelete(null);
  };

  const handleExportMovies = async () => {
    const allMovies = moviesQuery.data ?? [];
    if (allMovies.length === 0) {
      toast.error("Chưa có phim để xuất.");
      return;
    }
    try {
      await downloadMoviesXlsx(allMovies);
      toast.success(`Đã xuất ${allMovies.length} phim.`);
    } catch (error) {
      const msg =
        error instanceof Error ? error.message : "Xuất Excel thất bại.";
      toast.error(msg);
    }
  };

  const handleRenormalizeSubtitles = async () => {
    setIsRenormalizeOpen(false);
    const toastId = toast.loading("Đang chuẩn hoá phụ đề...");
    try {
      await renormalizeMutation.mutateAsync((msg) => {
        toast.loading(msg, { id: toastId });
      });
    } finally {
      toast.dismiss(toastId);
    }
  };

  const editingIsSingleMovie =
    activeKind === "movies" &&
    (movieCreateVariant === "single" ||
      (editingTopic && getMovieVariant(editingTopic) === "single"));

  const editingIsSeriesMovie =
    activeKind === "movies" &&
    (movieCreateVariant === "series" ||
      (editingTopic && getMovieVariant(editingTopic) === "series"));

  const showSeriesEditor = Boolean(
    (activeKind === "grammars" && (isCreateMode || !!editingTopic)) ||
      editingIsSeriesMovie
  );

  const showSingleEditor = Boolean(
    editingIsSingleMovie && (isCreateMode || !!editingTopic)
  );

  const isMoviesTab = activeKind === "movies";

  return (
    <div className="mx-auto w-full max-w-6xl px-3 py-4 sm:px-4 sm:py-5">
      <motion.header
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.18 }}
        className="mb-4 flex items-center justify-between gap-2"
      >
        <h1 className="text-xl sm:text-2xl font-bold text-gray-900">
          Quản lý nội dung
        </h1>
      </motion.header>

      <div className="mb-4 p-1 rounded-xl bg-gray-100">
        <div className="flex gap-1">
          {TAB_ITEMS.map(({ kind, label }) => {
            const isActive = activeKind === kind;
            return (
              <div key={kind} className="flex-1">
                <button
                  type="button"
                  onClick={() => setActiveKind(kind)}
                  className={`
                    w-full text-center py-2.5 px-4 rounded-lg text-sm font-medium transition-colors
                    ${isActive ? "bg-white text-primary shadow-sm" : "text-gray-600 hover:text-gray-900 hover:bg-gray-50"}
                  `}
                >
                  {label}
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {isMusicTab ? (
        <AdminMusicPanel />
      ) : (
        <>
          <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center">
            <PasteInput
              containerClassName="flex-1"
              type="text"
              placeholder={`Tìm kiếm trong ${CONTENT_KIND_LABEL[activeKind].toLowerCase()}...`}
              value={searchQuery}
              onValueChange={setSearchQuery}
              leftSlot={<FiSearch className="h-4 w-4" />}
              trimOnPaste
            />
            {isMoviesTab ? (
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  onClick={() => handleOpenCreateMovie("series")}
                  className="inline-flex items-center gap-2"
                >
                  <FiPlus className="h-4 w-4" />
                  Phim nhiều tập
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => handleOpenCreateMovie("single")}
                  className="inline-flex items-center gap-2"
                >
                  <FiPlus className="h-4 w-4" />
                  Phim rạp (1 tập)
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsImportOpen(true)}
                  className="inline-flex items-center gap-2"
                >
                  <FiUpload className="h-4 w-4" />
                  Nhập Excel
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => void handleExportMovies()}
                  disabled={isLoading || topics.length === 0}
                  className="inline-flex items-center gap-2"
                >
                  <FiDownload className="h-4 w-4" />
                  Xuất Excel
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsRenormalizeOpen(true)}
                  disabled={
                    isLoading ||
                    topics.length === 0 ||
                    renormalizeMutation.isPending
                  }
                  className="inline-flex items-center gap-2"
                  title="Chuẩn hoá lại toàn bộ phụ đề đã lưu (sửa cue cũ bị gộp)"
                >
                  <FiRefreshCw
                    className={cn(
                      "h-4 w-4",
                      renormalizeMutation.isPending && "animate-spin"
                    )}
                  />
                  {renormalizeMutation.isPending
                    ? "Đang chuẩn hoá..."
                    : "Chuẩn hoá sub"}
                </Button>
              </div>
            ) : (
              <Button
                type="button"
                onClick={handleOpenCreate}
                className="inline-flex items-center gap-2"
              >
                <FiPlus className="h-4 w-4" />
                Thêm chủ đề
              </Button>
            )}
          </div>

          {searchQuery && (
            <p className="mb-3 text-sm text-gray-500">
              Tìm thấy {filteredTopics.length}/{topics.length}{" "}
              {activeKind === "movies" ? "phim" : "chủ đề"}
            </p>
          )}

          {!searchQuery && topics.length > 0 && (
            <p className="mb-2 text-xs text-gray-500">
              Kéo biểu tượng{" "}
              <FiMove className="inline h-3 w-3 align-text-bottom" /> ở mỗi thẻ
              để đổi thứ tự.
            </p>
          )}

          {isLoading ? (
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <div
                  key={i}
                  className="h-20 animate-pulse rounded-lg border border-gray-200 bg-gray-50"
                />
              ))}
            </div>
          ) : filteredTopics.length === 0 ? (
            <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50 py-12 text-center">
              <p className="text-sm text-gray-500">
                {topics.length === 0
                  ? isMoviesTab
                    ? "Chưa có phim. Bấm Phim nhiều tập hoặc Phim rạp (1 tập) để thêm."
                    : `Chưa có chủ đề ${CONTENT_KIND_LABEL[activeKind].toLowerCase()}. Bấm "Thêm chủ đề" để bắt đầu.`
                  : activeKind === "movies"
                    ? "Không tìm thấy phim phù hợp."
                    : "Không tìm thấy chủ đề phù hợp."}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {filteredTopics.map((topic, index) => {
                const isDragging = draggingId === topic.id;
                const isDragOver =
                  dragOverId === topic.id && draggingId !== topic.id;
                const thumb = activeKind === "movies" ? getMovieThumbnail(topic) : null;

                return (
                  <div
                    key={topic.id}
                    onDragOver={
                      canReorder
                        ? (e) => {
                            if (!draggingId) return;
                            e.preventDefault();
                            e.dataTransfer.dropEffect = "move";
                            setDragOverId(topic.id);
                          }
                        : undefined
                    }
                    onDragLeave={
                      canReorder
                        ? (e) => {
                            if (
                              !e.currentTarget.contains(
                                e.relatedTarget as Node
                              )
                            ) {
                              setDragOverId((prev) =>
                                prev === topic.id ? null : prev
                              );
                            }
                          }
                        : undefined
                    }
                    onDrop={
                      canReorder
                        ? (e) => {
                            e.preventDefault();
                            const fromId = e.dataTransfer.getData(DRAG_MIME);
                            setDragOverId(null);
                            setDraggingId(null);
                            if (fromId) handleReorder(fromId, topic.id);
                          }
                        : undefined
                    }
                    className={cn(
                      "group relative rounded-lg border bg-white p-3 transition-all",
                      isDragging
                        ? "opacity-40 border-primary"
                        : isDragOver
                          ? "border-primary ring-2 ring-primary/30"
                          : "border-gray-200 hover:border-primary/40 hover:bg-gray-50"
                    )}
                  >
                    {thumb && (
                      <div className="mb-2 overflow-hidden rounded-md border border-gray-100">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={thumb}
                          alt=""
                          className="aspect-video w-full object-cover"
                        />
                      </div>
                    )}
                    <div className="flex items-start gap-2">
                      <button
                        type="button"
                        draggable={canReorder}
                        onDragStart={
                          canReorder
                            ? (e) => {
                                e.dataTransfer.setData(DRAG_MIME, topic.id);
                                e.dataTransfer.effectAllowed = "move";
                                setDraggingId(topic.id);
                              }
                            : undefined
                        }
                        onDragEnd={() => {
                          setDraggingId(null);
                          setDragOverId(null);
                        }}
                        disabled={!canReorder}
                        title={
                          canReorder
                            ? "Kéo để đổi thứ tự"
                            : "Xoá bộ lọc tìm kiếm để kéo thả"
                        }
                        className={cn(
                          "flex h-6 w-6 flex-shrink-0 items-center justify-center rounded text-gray-400 hover:bg-gray-100 hover:text-gray-700",
                          canReorder
                            ? "cursor-grab active:cursor-grabbing"
                            : "cursor-not-allowed opacity-40"
                        )}
                      >
                        <FiMove className="h-3.5 w-3.5" />
                      </button>
                      <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded bg-primary/10 text-xs font-semibold text-primary">
                        {index + 1}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="line-clamp-2 text-sm font-medium text-gray-800">
                          {topic.title || "(chưa đặt tên)"}
                        </p>
                        <p className="mt-1 text-xs text-gray-500">
                          {activeKind === "movies"
                            ? getMovieEpisodeLabel(topic)
                            : `${topic.exercises.length} bài`}
                        </p>
                      </div>
                    </div>
                    <div className="mt-2 flex items-center justify-end gap-1.5">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => handleOpenEdit(topic)}
                        className="inline-flex items-center gap-1.5 px-2"
                        title="Sửa"
                      >
                        <FiEdit2 className="h-3.5 w-3.5" />
                        Sửa
                      </Button>
                      <Button
                        type="button"
                        variant="destructive"
                        size="sm"
                        onClick={() => setTopicToDelete(topic)}
                        className="inline-flex items-center gap-1.5 px-2"
                        title="Xoá"
                      >
                        <FiTrash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      <ContentTopicEditor
        isOpen={showSeriesEditor}
        mode={isCreateMode ? "create" : "edit"}
        kind={activeKind === "movies" ? "movies" : activeKind}
        variant="series"
        topic={editingTopic}
        onClose={handleCloseEditor}
        onCreate={async (data) => {
          const maxOrder = topics.reduce(
            (m, t) => (typeof t.order === "number" && t.order > m ? t.order : m),
            0
          );
          const mutation =
            activeKind === "movies" ? moviesCreateMutation : createMutation;
          return await mutation.mutateAsync({
            ...data,
            order: maxOrder + 1,
          });
        }}
        onUpdate={async (topicId, data) => {
          const mutation =
            activeKind === "movies" ? moviesUpdateMutation : updateMutation;
          await mutation.mutateAsync({ topicId, data });
        }}
        isSubmitting={
          createMutation.isPending ||
          updateMutation.isPending ||
          moviesCreateMutation.isPending ||
          moviesUpdateMutation.isPending
        }
      />

      <SingleMovieEditor
        isOpen={showSingleEditor}
        mode={isCreateMode ? "create" : "edit"}
        topic={editingTopic}
        onClose={handleCloseEditor}
        onCreate={async (data) => {
          const maxOrder = topics.reduce(
            (m, t) => (typeof t.order === "number" && t.order > m ? t.order : m),
            0
          );
          return await moviesCreateMutation.mutateAsync({
            ...data,
            order: maxOrder + 1,
          });
        }}
        onUpdate={async (topicId, data) => {
          await moviesUpdateMutation.mutateAsync({ topicId, data });
        }}
        isSubmitting={
          moviesCreateMutation.isPending || moviesUpdateMutation.isPending
        }
      />

      <MovieImportDialog
        isOpen={isImportOpen}
        onClose={() => setIsImportOpen(false)}
        onImport={async (movies) => {
          await importMoviesMutation.mutateAsync(movies);
        }}
        isSubmitting={importMoviesMutation.isPending}
      />

      <ConfirmDialog
        isOpen={!!topicToDelete}
        onClose={() => setTopicToDelete(null)}
        onConfirm={handleConfirmDelete}
        title={activeKind === "movies" ? "Xoá phim" : "Xoá chủ đề"}
        message={
          activeKind === "movies"
            ? `Xoá phim "${topicToDelete?.title}"?`
            : `Xoá chủ đề "${topicToDelete?.title}"? Toàn bộ bài tập bên trong cũng bị xoá.`
        }
        confirmText={deleteMutation.isPending ? "Đang xoá..." : "Xoá"}
        cancelText="Huỷ"
      />

      <ConfirmDialog
        isOpen={isRenormalizeOpen}
        onClose={() => setIsRenormalizeOpen(false)}
        onConfirm={handleRenormalizeSubtitles}
        title="Chuẩn hoá phụ đề"
        message={`Quét lại toàn bộ phụ đề của ${topics.length} phim trên Storage, sửa các cue cũ bị gộp và ghi đè file thay đổi. Thao tác này có thể mất một lúc.`}
        confirmText={
          renormalizeMutation.isPending ? "Đang chuẩn hoá..." : "Chuẩn hoá"
        }
        cancelText="Huỷ"
      />
    </div>
  );
}
