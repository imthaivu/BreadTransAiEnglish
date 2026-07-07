"use client";

import { Button } from "@/components/ui/Button";
import { db } from "@/lib/firebase/client";
import { collection, doc } from "firebase/firestore";
import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import {
  ContentTopic,
  CreateContentTopicData,
  EpisodeSubtitles,
  getEpisodeKey,
  crawlEpisodeSubtitles,
  getEpisodeSubtitles,
  MOVIE_DIFFICULTIES,
  MovieDifficulty,
  setEpisodeSubtitles,
  SUBTITLE_TYPES,
  SubtitleType,
  UpdateContentTopicData,
} from "../services/content.service";
import { resolveThumbnail } from "@/utils/youtube";
import { normalizeRawSubtitle } from "@/utils/subtitles";
import {
  AdminModal,
  PasteInput,
  SubtitlePasteField,
  ThumbnailField,
} from "./common";

type SubsDraft = Record<SubtitleType, string>;

const EMPTY_SUBS: SubsDraft = { eng: "", vn: "", pronounce: "" };

const subsFromEpisode = (subs: EpisodeSubtitles): SubsDraft => ({
  eng: subs.eng ?? "",
  vn: subs.vn ?? "",
  pronounce: subs.pronounce ?? "",
});

const normalizeSubsDraft = (draft: SubsDraft): SubsDraft => ({
  eng: normalizeRawSubtitle(draft.eng),
  vn: normalizeRawSubtitle(draft.vn),
  pronounce: normalizeRawSubtitle(draft.pronounce),
});

interface SingleMovieEditorProps {
  isOpen: boolean;
  mode: "create" | "edit";
  topic: ContentTopic | null;
  onClose: () => void;
  onCreate: (data: CreateContentTopicData) => Promise<string | void> | string | void;
  onUpdate: (
    topicId: string,
    data: UpdateContentTopicData
  ) => Promise<void> | void;
  isSubmitting?: boolean;
}

export default function SingleMovieEditor({
  isOpen,
  mode,
  topic,
  onClose,
  onCreate,
  onUpdate,
  isSubmitting = false,
}: SingleMovieEditorProps) {
  const [title, setTitle] = useState("");
  const [video, setVideo] = useState("");
  const [thumbnail, setThumbnail] = useState("");
  const [difficulty, setDifficulty] = useState<MovieDifficulty>("easy");
  const [subs, setSubs] = useState<SubsDraft>({ ...EMPTY_SUBS });
  const [subsLoading, setSubsLoading] = useState(false);
  const [crawlLink, setCrawlLink] = useState("");
  const [crawling, setCrawling] = useState(false);
  const [draftMovieId, setDraftMovieId] = useState("");

  useEffect(() => {
    if (!isOpen) return;
    if (mode === "create") {
      setDraftMovieId(doc(collection(db, "movies")).id);
    }
    if (mode === "edit" && topic) {
      setTitle(topic.title);
      setVideo(topic.video ?? topic.exercises[0]?.video ?? "");
      setThumbnail(topic.thumbnail ?? "");
      setDifficulty(topic.difficulty ?? "easy");
      setCrawlLink(topic.sourceLink ?? topic.exercises[0]?.sourceLink ?? "");
      setSubs({ ...EMPTY_SUBS });

      let cancelled = false;
      setSubsLoading(true);
      void (async () => {
        try {
          const loaded = await getEpisodeSubtitles(
            topic.id,
            getEpisodeKey(1, "single")
          );
          if (!cancelled) setSubs(subsFromEpisode(loaded));
        } finally {
          if (!cancelled) setSubsLoading(false);
        }
      })();

      return () => {
        cancelled = true;
      };
    }

    setTitle("");
    setVideo("");
    setThumbnail("");
    setDifficulty("easy");
    setSubs({ ...EMPTY_SUBS });
    setSubsLoading(false);
    setCrawlLink("");
    setCrawling(false);
  }, [isOpen, mode, topic]);

  const updateSub = (type: SubtitleType, value: string) => {
    setSubs((prev) => ({ ...prev, [type]: value }));
  };

  const subsFromCrawl = (loaded: EpisodeSubtitles): SubsDraft => ({
    eng: loaded.eng ?? "",
    vn: loaded.vn ?? "",
    pronounce: loaded.pronounce ?? "",
  });

  const handleCrawlSubs = async () => {
    const link = crawlLink.trim();
    if (!link) {
      toast.error("Dán link phim studyphim.vn.");
      return;
    }
    setCrawling(true);
    try {
      const loaded = await crawlEpisodeSubtitles(link, 1);
      const nextSubs = subsFromCrawl(loaded);
      if (!nextSubs.eng && !nextSubs.vn && !nextSubs.pronounce) {
        toast.error("Không lấy được phụ đề từ link này.");
        return;
      }
      setSubs(nextSubs);
      if (mode === "edit" && topic) {
        const episodeKey = getEpisodeKey(1, "single");
        await setEpisodeSubtitles(topic.id, episodeKey, nextSubs, {
          exerciseNo: 1,
        });
        toast.success("Đã cào và lưu phụ đề.");
      } else {
        toast.success("Đã cào phụ đề. Bấm Lưu để ghi phim.");
      }
    } catch (error) {
      const msg =
        error instanceof Error ? error.message : "Cào phụ đề thất bại.";
      toast.error(msg);
    } finally {
      setCrawling(false);
    }
  };

  const previewThumbnail = resolveThumbnail(video, thumbnail);
  const busy = subsLoading || crawling;

  const handleSubmit = async () => {
    const trimmedTitle = title.trim();
    const trimmedVideo = video.trim();
    if (!trimmedTitle) {
      toast.error("Nhập tên phim.");
      return;
    }
    if (!trimmedVideo) {
      toast.error("Nhập link video.");
      return;
    }

    const payload = {
      title: trimmedTitle,
      variant: "single" as const,
      difficulty,
      video: trimmedVideo,
      thumbnail: thumbnail.trim() || resolveThumbnail(trimmedVideo) || undefined,
      sourceLink: crawlLink.trim() || undefined,
      exercises: [] as [],
    };

    const episodeKey = getEpisodeKey(1, "single");
    const normalizedSubs = normalizeSubsDraft(subs);

    if (mode === "create") {
      const createdId = await onCreate({ ...payload, id: draftMovieId });
      if (typeof createdId === "string") {
        await setEpisodeSubtitles(createdId, episodeKey, normalizedSubs, {
          exerciseNo: 1,
        });
      }
    } else if (topic) {
      await onUpdate(topic.id, payload);
      await setEpisodeSubtitles(topic.id, episodeKey, normalizedSubs, {
        exerciseNo: 1,
      });
    }

    onClose();
  };

  return (
    <AdminModal
      isOpen={isOpen}
      onClose={onClose}
      title={mode === "create" ? "Thêm phim rạp (1 tập)" : "Sửa phim rạp"}
      subtitle={mode === "edit" && topic ? `ID: ${topic.id}` : undefined}
      size="lg"
      closeOnOverlayClick={false}
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={isSubmitting}>
            Huỷ
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={isSubmitting || busy}
          >
            {isSubmitting || busy ? "Đang lưu..." : "Lưu"}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">
            Tên phim <span className="text-red-500">*</span>
          </label>
          <PasteInput
            value={title}
            onValueChange={setTitle}
            placeholder="VD: Inside Out 2"
            autoFocus
            trimOnPaste
            disabled={busy}
          />
        </div>
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
                  disabled={busy}
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
            Link video <span className="text-red-500">*</span>
          </label>
          <PasteInput
            value={video}
            onValueChange={setVideo}
            placeholder="https://youtu.be/..."
            trimOnPaste
            disabled={busy}
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">
            Thumbnail (tuỳ chọn)
          </label>
          <ThumbnailField
            value={thumbnail}
            onValueChange={setThumbnail}
            movieId={topic?.id ?? draftMovieId}
            disabled={busy}
            placeholder="Dán URL/ảnh đã copy, hoặc tải ảnh lên — để trống sẽ lấy từ YouTube"
          />
        </div>
        {previewThumbnail && (
          <div className="overflow-hidden rounded-lg border border-gray-200">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={previewThumbnail}
              alt="Preview thumbnail"
              className="aspect-video w-full object-cover"
            />
          </div>
        )}
        <div>
          <h3 className="mb-2 text-sm font-semibold text-gray-800">Phụ đề</h3>
          <div className="mb-3 rounded-lg border border-gray-200 bg-gray-50 p-3">
            <label className="mb-1 block text-xs text-gray-600">
              Link phim studyphim (cào sub tập 1)
            </label>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <PasteInput
                containerClassName="flex-1"
                value={crawlLink}
                onValueChange={setCrawlLink}
                placeholder="https://www.studyphim.vn/movies/..."
                trimOnPaste
                disabled={busy}
              />
              <Button
                type="button"
                variant="outline"
                onClick={() => void handleCrawlSubs()}
                disabled={busy}
                className="shrink-0"
              >
                {crawling ? "Đang cào..." : "Cào sub"}
              </Button>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-1">
            {SUBTITLE_TYPES.map(({ id, label }) => (
              <SubtitlePasteField
                key={id}
                label={label}
                value={subs[id]}
                onChange={(v) => updateSub(id, v)}
                placeholder="Dán phụ đề SRT..."
                disabled={busy}
              />
            ))}
          </div>
        </div>
      </div>
    </AdminModal>
  );
}
