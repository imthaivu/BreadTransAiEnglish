"use client";

import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { db } from "@/lib/firebase/client";
import { collection, doc } from "firebase/firestore";
import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { FiArrowDown, FiArrowUp, FiPlus, FiTrash2 } from "react-icons/fi";
import {
  CONTENT_KIND_LABEL,
  ContentExercise,
  ContentKind,
  ContentTopic,
  CreateContentTopicData,
  EpisodeSubtitles,
  getEpisodeKey,
  crawlEpisodeSubtitles,
  getEpisodeSubtitles,
  MOVIE_DIFFICULTIES,
  MovieDifficulty,
  MovieVariant,
  setEpisodeSubtitles,
  SUBTITLE_TYPES,
  SubtitleType,
  UpdateContentTopicData,
} from "../services/content.service";
import { resolveThumbnail } from "@/utils/youtube";
import {
  AdminModal,
  PasteInput,
  SubtitlePasteField,
  ThumbnailField,
} from "./common";

type ExerciseDraft = {
  exerciseNo: string;
  subNo: string;
  title: string;
  video: string;
};

type EpisodeSubsDraft = Record<SubtitleType, string>;

type MovieEpisodeDraft = {
  video: string;
  subs: EpisodeSubsDraft;
};

const EMPTY_SUBS: EpisodeSubsDraft = { eng: "", vn: "", pronounce: "" };

const EMPTY_DRAFT: ExerciseDraft = {
  exerciseNo: "",
  subNo: "",
  title: "",
  video: "",
};

const EMPTY_EPISODE: MovieEpisodeDraft = { video: "", subs: { ...EMPTY_SUBS } };

const draftFromExercise = (ex: ContentExercise): ExerciseDraft => ({
  exerciseNo: String(ex.exerciseNo ?? ""),
  subNo: ex.subNo === undefined || ex.subNo === null ? "" : String(ex.subNo),
  title: ex.title ?? "",
  video: ex.video ?? "",
});

const draftToExercise = (d: ExerciseDraft): ContentExercise | null => {
  const exerciseNo = Number(d.exerciseNo);
  if (!Number.isFinite(exerciseNo) || exerciseNo <= 0) return null;
  const subNoRaw = d.subNo.trim();
  const subNoParsed = subNoRaw === "" ? undefined : Number(subNoRaw);
  if (subNoParsed !== undefined && !Number.isFinite(subNoParsed)) return null;
  return {
    exerciseNo,
    subNo: subNoParsed,
    title: d.title.trim(),
    video: d.video.trim(),
  };
};

interface ContentTopicEditorProps {
  isOpen: boolean;
  mode: "create" | "edit";
  kind: ContentKind;
  variant?: MovieVariant;
  topic: ContentTopic | null;
  onClose: () => void;
  onCreate: (data: CreateContentTopicData) => Promise<string | void> | string | void;
  onUpdate: (
    topicId: string,
    data: UpdateContentTopicData
  ) => Promise<void> | void;
  isSubmitting?: boolean;
}

export default function ContentTopicEditor({
  isOpen,
  mode,
  kind,
  variant = "series",
  topic,
  onClose,
  onCreate,
  onUpdate,
  isSubmitting = false,
}: ContentTopicEditorProps) {
  const [title, setTitle] = useState("");
  const [thumbnail, setThumbnail] = useState("");
  const [difficulty, setDifficulty] = useState<MovieDifficulty>("easy");
  const [drafts, setDrafts] = useState<ExerciseDraft[]>([{ ...EMPTY_DRAFT }]);
  const [episodeDrafts, setEpisodeDrafts] = useState<MovieEpisodeDraft[]>([
    { ...EMPTY_EPISODE },
  ]);
  const [subsLoading, setSubsLoading] = useState(false);
  const [crawlLink, setCrawlLink] = useState("");
  const [crawlFromEp, setCrawlFromEp] = useState("1");
  const [crawlToEp, setCrawlToEp] = useState("1");
  const [crawling, setCrawling] = useState(false);
  const [crawlProgress, setCrawlProgress] = useState("");
  const [draftMovieId, setDraftMovieId] = useState("");
  const isMovieSeries = kind === "movies" && variant === "series";
  const busy = subsLoading || crawling;

  const subsFromEpisode = (subs: EpisodeSubtitles): EpisodeSubsDraft => ({
    eng: subs.eng ?? "",
    vn: subs.vn ?? "",
    pronounce: subs.pronounce ?? "",
  });

  // Reset state mỗi khi modal mở hoặc topic thay đổi
  useEffect(() => {
    if (!isOpen) return;
    if (mode === "create" && kind === "movies") {
      setDraftMovieId(doc(collection(db, "movies")).id);
    }
    if (mode === "edit" && topic) {
      setTitle(topic.title);
      setThumbnail(topic.thumbnail ?? "");
      setDifficulty(topic.difficulty ?? "easy");
      if (isMovieSeries) {
        const sorted = [...topic.exercises].sort(
          (a, b) =>
            a.exerciseNo - b.exerciseNo || (a.subNo ?? 0) - (b.subNo ?? 0)
        );
        setCrawlLink(
          topic.sourceLink ?? sorted.find((ex) => ex.sourceLink)?.sourceLink ?? ""
        );
        const baseRows: MovieEpisodeDraft[] =
          sorted.length > 0
            ? sorted.map((ex) => ({
                video: ex.video ?? "",
                subs: { ...EMPTY_SUBS },
              }))
            : [{ ...EMPTY_EPISODE }];
        setEpisodeDrafts(baseRows);

        let cancelled = false;
        setSubsLoading(true);
        void (async () => {
          try {
            const loaded = await Promise.all(
              sorted.map(async (ex) => {
                const key = getEpisodeKey(ex.exerciseNo, "series");
                const subs = await getEpisodeSubtitles(topic.id, key);
                return subsFromEpisode(subs);
              })
            );
            if (!cancelled) {
              setEpisodeDrafts((prev) =>
                prev.map((d, i) => ({
                  ...d,
                  subs: loaded[i] ?? d.subs,
                }))
              );
            }
          } finally {
            if (!cancelled) setSubsLoading(false);
          }
        })();

        return () => {
          cancelled = true;
        };
      } else {
        setDrafts(
          topic.exercises.length > 0
            ? topic.exercises.map(draftFromExercise)
            : [{ ...EMPTY_DRAFT }]
        );
      }
    } else {
      setTitle("");
      setThumbnail("");
      setDifficulty("easy");
      setDrafts([{ ...EMPTY_DRAFT }]);
      setEpisodeDrafts([{ ...EMPTY_EPISODE }]);
      setSubsLoading(false);
      setCrawlLink("");
      setCrawlFromEp("1");
      setCrawlToEp("1");
      setCrawling(false);
      setCrawlProgress("");
    }
  }, [isOpen, mode, topic, isMovieSeries]);

  const handleCrawlSubsRange = async () => {
    const link = crawlLink.trim();
    if (!link) {
      toast.error("Dán link phim studyphim.vn.");
      return;
    }
    const from = Math.max(1, Math.floor(Number(crawlFromEp)) || 1);
    const to = Math.max(from, Math.floor(Number(crawlToEp)) || from);
    setCrawling(true);
    setCrawlProgress("");
    try {
      let saved = 0;
      for (let ep = from; ep <= to; ep += 1) {
        setCrawlProgress(`Đang cào tập ${ep - from + 1}/${to - from + 1}...`);
        const loaded = await crawlEpisodeSubtitles(link, ep);
        const nextSubs: EpisodeSubsDraft = {
          eng: loaded.eng ?? "",
          vn: loaded.vn ?? "",
          pronounce: loaded.pronounce ?? "",
        };
        setEpisodeDrafts((prev) => {
          const next = [...prev];
          while (next.length < ep) {
            next.push({ ...EMPTY_EPISODE });
          }
          const idx = ep - 1;
          next[idx] = { ...next[idx], subs: nextSubs };
          return next;
        });
        if (mode === "edit" && topic) {
          await setEpisodeSubtitles(
            topic.id,
            getEpisodeKey(ep, "series"),
            nextSubs,
            { exerciseNo: ep }
          );
          saved += 1;
        }
      }
      if (mode === "edit" && topic && saved > 0) {
        toast.success(`Đã cào và lưu ${saved} tập.`);
      } else {
        toast.success(`Đã cào ${to - from + 1} tập. Bấm Lưu để ghi phim.`);
      }
    } catch (error) {
      const msg =
        error instanceof Error ? error.message : "Cào phụ đề thất bại.";
      toast.error(msg);
    } finally {
      setCrawling(false);
      setCrawlProgress("");
    }
  };

  const updateDraft = (index: number, patch: Partial<ExerciseDraft>) => {
    setDrafts((prev) =>
      prev.map((d, i) => (i === index ? { ...d, ...patch } : d))
    );
  };

  const updateEpisodeDraft = (index: number, video: string) => {
    setEpisodeDrafts((prev) => {
      const next = prev.map((d, i) => (i === index ? { ...d, video } : d));
      // Tự thêm 1 tập trống khi vừa điền link vào tập cuối (khỏi bấm "Thêm tập").
      const isLast = index === prev.length - 1;
      const wasEmpty = prev[index]?.video.trim() === "";
      if (isLast && wasEmpty && video.trim() !== "") {
        next.push({ ...EMPTY_EPISODE });
      }
      return next;
    });
  };

  const updateEpisodeSub = (
    index: number,
    type: SubtitleType,
    value: string
  ) => {
    setEpisodeDrafts((prev) =>
      prev.map((d, i) =>
        i === index ? { ...d, subs: { ...d.subs, [type]: value } } : d
      )
    );
  };

  const addEpisodeRow = () => {
    setEpisodeDrafts((prev) => [...prev, { ...EMPTY_EPISODE }]);
  };

  const removeEpisodeRow = (index: number) => {
    setEpisodeDrafts((prev) => {
      if (prev.length <= 1) return [{ ...EMPTY_EPISODE }];
      return prev.filter((_, i) => i !== index);
    });
  };

  const moveEpisodeRow = (index: number, direction: -1 | 1) => {
    setEpisodeDrafts((prev) => {
      const next = [...prev];
      const target = index + direction;
      if (target < 0 || target >= next.length) return prev;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  };

  const addRow = () => {
    setDrafts((prev) => {
      // Tự gợi ý exerciseNo kế tiếp = max + 1
      const maxNo = prev.reduce((m, d) => {
        const n = Number(d.exerciseNo);
        return Number.isFinite(n) && n > m ? n : m;
      }, 0);
      return [
        ...prev,
        { ...EMPTY_DRAFT, exerciseNo: maxNo > 0 ? String(maxNo + 1) : "1" },
      ];
    });
  };

  const removeRow = (index: number) => {
    setDrafts((prev) => {
      if (prev.length <= 1) return [{ ...EMPTY_DRAFT }];
      return prev.filter((_, i) => i !== index);
    });
  };

  const moveRow = (index: number, direction: -1 | 1) => {
    setDrafts((prev) => {
      const next = [...prev];
      const target = index + direction;
      if (target < 0 || target >= next.length) return prev;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  };

  const handleSubmit = async () => {
    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      toast.error(isMovieSeries ? "Nhập tên phim." : "Nhập tên chủ đề.");
      return;
    }

    let exercises: ContentExercise[] = [];

    if (isMovieSeries) {
      const validEpisodes = episodeDrafts.filter((d) => d.video.trim() !== "");
      if (validEpisodes.length === 0) {
        toast.error("Thêm ít nhất 1 tập (link video).");
        return;
      }
      const trimmedSource = crawlLink.trim();
      exercises = validEpisodes.map((d, i) => ({
        exerciseNo: i + 1,
        title: `Tập ${i + 1}`,
        video: d.video.trim(),
        ...(trimmedSource ? { sourceLink: trimmedSource } : {}),
      }));
    } else {
      const validDrafts = drafts.filter(
        (d) =>
          d.exerciseNo.trim() !== "" ||
          d.title.trim() !== "" ||
          d.video.trim() !== ""
      );

      for (let i = 0; i < validDrafts.length; i += 1) {
        const ex = draftToExercise(validDrafts[i]);
        if (!ex) {
          toast.error(`Bài #${i + 1}: số bài phải là số dương.`);
          return;
        }
        if (!ex.title) {
          toast.error(`Bài #${i + 1}: chưa có tên bài.`);
          return;
        }
        exercises.push(ex);
      }
    }

    // Order tự động tính ở phía gọi (AdminContent) khi tạo mới.
    const firstVideo = exercises.find((ex) => ex.video)?.video ?? "";
    const resolvedThumbnail =
      thumbnail.trim() || resolveThumbnail(firstVideo) || undefined;

    const movieFields =
      kind === "movies"
        ? {
            variant: "series" as const,
            difficulty,
            thumbnail: resolvedThumbnail,
            sourceLink: crawlLink.trim() || undefined,
          }
        : {};

    if (mode === "create") {
      const createdId = await onCreate({
        title: trimmedTitle,
        exercises,
        ...movieFields,
        ...(kind === "movies" ? { id: draftMovieId } : {}),
      });
      if (isMovieSeries && typeof createdId === "string") {
        await Promise.all(
          episodeDrafts
            .map((d, i) => ({ d, exerciseNo: i + 1 }))
            .filter(({ d }) => d.video.trim() !== "")
            .map(({ d, exerciseNo }) =>
              setEpisodeSubtitles(
                createdId,
                getEpisodeKey(exerciseNo, "series"),
                d.subs,
                { exerciseNo }
              )
            )
        );
      }
    } else if (topic) {
      await onUpdate(topic.id, {
        title: trimmedTitle,
        exercises,
        ...movieFields,
      });
      if (isMovieSeries) {
        await Promise.all(
          episodeDrafts
            .map((d, i) => ({ d, exerciseNo: i + 1 }))
            .filter(({ d }) => d.video.trim() !== "")
            .map(({ d, exerciseNo }) =>
              setEpisodeSubtitles(
                topic.id,
                getEpisodeKey(exerciseNo, "series"),
                d.subs,
                { exerciseNo }
              )
            )
        );
      }
    }

    onClose();
  };

  const modalTitle =
    mode === "create"
      ? kind === "movies"
        ? "Thêm phim nhiều tập"
        : `Thêm chủ đề ${CONTENT_KIND_LABEL[kind].toLowerCase()}`
      : kind === "movies"
        ? "Sửa phim nhiều tập"
        : `Sửa chủ đề ${CONTENT_KIND_LABEL[kind].toLowerCase()}`;

  const previewThumbnail = resolveThumbnail(
    (isMovieSeries
      ? episodeDrafts.find((d) => d.video.trim())?.video
      : drafts.find((d) => d.video.trim())?.video) ?? "",
    thumbnail
  );

  const listCount = isMovieSeries ? episodeDrafts.length : drafts.length;

  return (
    <AdminModal
      isOpen={isOpen}
      onClose={onClose}
      title={modalTitle}
      subtitle={mode === "edit" && topic ? `ID: ${topic.id}` : undefined}
      size="xl"
      closeOnOverlayClick={false}
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={isSubmitting}>
            Huỷ
          </Button>
          <Button onClick={handleSubmit} disabled={isSubmitting || busy}>
            {isSubmitting || busy ? "Đang lưu..." : "Lưu"}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">
            {isMovieSeries ? "Tên phim" : "Tên chủ đề"}{" "}
            <span className="text-red-500">*</span>
          </label>
          <PasteInput
            value={title}
            onValueChange={setTitle}
            placeholder={isMovieSeries ? "VD: Stranger Things" : "VD: Thì hiện tại đơn"}
            autoFocus
            trimOnPaste
          />
        </div>

        {isMovieSeries && (
          <>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                Loại (độ khó)
              </label>
              <div className="flex flex-wrap gap-2">
                {MOVIE_DIFFICULTIES.map(({ id, label }) => {
                  const isActive = difficulty === id;
                  return (
                    <button
                      key={id}
                      type="button"
                      onClick={() => setDifficulty(id)}
                      className={
                        isActive
                          ? "rounded-lg border border-primary bg-primary/10 px-4 py-2 text-sm font-medium text-primary"
                          : "rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-600 hover:border-primary/40 hover:bg-gray-50"
                      }
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                Thumbnail phim (tuỳ chọn)
              </label>
              <ThumbnailField
                value={thumbnail}
                onValueChange={setThumbnail}
                movieId={topic?.id ?? draftMovieId}
                placeholder="Dán URL/ảnh đã copy, hoặc tải ảnh lên — để trống sẽ lấy từ link tập 1"
              />
            </div>
            {previewThumbnail && (
              <div className="overflow-hidden rounded-lg border border-gray-200 max-w-xs">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={previewThumbnail}
                  alt="Preview thumbnail"
                  className="aspect-video w-full object-cover"
                />
              </div>
            )}
          </>
        )}

        <div>
          <div className="mb-2">
            <h3 className="text-sm font-semibold text-gray-800">
              {isMovieSeries ? "Danh sách tập" : "Danh sách bài"}
              <span className="ml-1 text-xs font-normal text-gray-500">
                ({listCount})
              </span>
            </h3>
          </div>

          {isMovieSeries && (
            <div className="mb-3 rounded-lg border border-gray-200 bg-gray-50 p-3">
              <p className="mb-2 text-xs font-medium text-gray-700">
                Cào sub nhanh (studyphim)
              </p>
              <label className="mb-1 block text-xs text-gray-600">
                Link phim
              </label>
              <PasteInput
                value={crawlLink}
                onValueChange={setCrawlLink}
                placeholder="https://www.studyphim.vn/movies/..."
                trimOnPaste
                disabled={busy}
              />
              <div className="mt-2 flex flex-wrap items-end gap-2">
                <div>
                  <label className="mb-1 block text-xs text-gray-600">
                    Từ tập
                  </label>
                  <Input
                    type="number"
                    min={1}
                    value={crawlFromEp}
                    onChange={(e) => setCrawlFromEp(e.target.value)}
                    className="w-20"
                    disabled={busy}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs text-gray-600">
                    Đến tập
                  </label>
                  <Input
                    type="number"
                    min={1}
                    value={crawlToEp}
                    onChange={(e) => setCrawlToEp(e.target.value)}
                    className="w-20"
                    disabled={busy}
                  />
                </div>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => void handleCrawlSubsRange()}
                  disabled={busy}
                >
                  {crawling ? "Đang cào..." : "Cào sub"}
                </Button>
              </div>
              {crawlProgress ? (
                <p className="mt-2 text-xs text-primary">{crawlProgress}</p>
              ) : null}
            </div>
          )}

          <div className="space-y-2">
            {isMovieSeries
              ? episodeDrafts.map((d, i) => (
                  <div
                    key={i}
                    className="rounded-lg border border-gray-200 bg-gray-50 p-3"
                  >
                    <div className="flex items-start gap-3">
                      <span className="mt-6 flex h-8 w-14 flex-shrink-0 items-center justify-center rounded bg-primary/10 text-xs font-semibold text-primary">
                        Tập {i + 1}
                      </span>
                      <div className="min-w-0 flex-1">
                        <label className="mb-1 block text-xs text-gray-600">
                          Link video
                        </label>
                        <PasteInput
                          value={d.video}
                          onValueChange={(v) => updateEpisodeDraft(i, v)}
                          placeholder="https://youtu.be/..."
                          trimOnPaste
                          disabled={busy}
                        />
                      </div>
                    </div>
                    <div className="mt-3 grid gap-2 sm:grid-cols-3">
                      {SUBTITLE_TYPES.map(({ id, label }) => (
                        <SubtitlePasteField
                          key={id}
                          label={label}
                          value={d.subs[id]}
                          onChange={(v) => updateEpisodeSub(i, id, v)}
                          placeholder="Dán phụ đề SRT..."
                          disabled={busy}
                        />
                      ))}
                    </div>
                    <div className="mt-2 flex items-center justify-end gap-1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => moveEpisodeRow(i, -1)}
                        disabled={i === 0}
                        className="px-2"
                        title="Lên"
                      >
                        <FiArrowUp className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => moveEpisodeRow(i, 1)}
                        disabled={i === episodeDrafts.length - 1}
                        className="px-2"
                        title="Xuống"
                      >
                        <FiArrowDown className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        type="button"
                        variant="destructive"
                        size="sm"
                        onClick={() => removeEpisodeRow(i)}
                        className="px-2"
                        title="Xoá tập"
                      >
                        <FiTrash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                ))
              : drafts.map((d, i) => (
              <div
                key={i}
                className="rounded-lg border border-gray-200 bg-gray-50 p-3"
              >
                <div className="grid gap-2 sm:grid-cols-12">
                  <div className="sm:col-span-2">
                    <label className="mb-1 block text-xs text-gray-600">
                      Số bài
                    </label>
                    <Input
                      type="number"
                      min={1}
                      value={d.exerciseNo}
                      onChange={(e) =>
                        updateDraft(i, { exerciseNo: e.target.value })
                      }
                      placeholder="1"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="mb-1 block text-xs text-gray-600">
                      Sub (tuỳ chọn)
                    </label>
                    <Input
                      type="number"
                      min={1}
                      value={d.subNo}
                      onChange={(e) =>
                        updateDraft(i, { subNo: e.target.value })
                      }
                      placeholder="—"
                    />
                  </div>
                  <div className="sm:col-span-8">
                    <label className="mb-1 block text-xs text-gray-600">
                      Tên bài
                    </label>
                    <PasteInput
                      value={d.title}
                      onValueChange={(v) => updateDraft(i, { title: v })}
                      placeholder="Tên bài tập / video"
                      trimOnPaste
                    />
                  </div>
                  <div className="sm:col-span-12">
                    <label className="mb-1 block text-xs text-gray-600">
                      Link video
                    </label>
                    <PasteInput
                      value={d.video}
                      onValueChange={(v) => updateDraft(i, { video: v })}
                      placeholder="https://youtu.be/..."
                      trimOnPaste
                    />
                  </div>
                </div>

                <div className="mt-2 flex items-center justify-end gap-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => moveRow(i, -1)}
                    disabled={i === 0}
                    className="px-2"
                    title="Lên"
                  >
                    <FiArrowUp className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => moveRow(i, 1)}
                    disabled={i === drafts.length - 1}
                    className="px-2"
                    title="Xuống"
                  >
                    <FiArrowDown className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    type="button"
                    variant="destructive"
                    size="sm"
                    onClick={() => removeRow(i)}
                    className="px-2"
                    title="Xoá bài"
                  >
                    <FiTrash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-3 flex justify-end">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={isMovieSeries ? addEpisodeRow : addRow}
              className="inline-flex items-center gap-1.5"
            >
              <FiPlus className="h-3.5 w-3.5" />
              {isMovieSeries ? "Thêm tập" : "Thêm bài"}
            </Button>
          </div>
        </div>
      </div>
    </AdminModal>
  );
}
