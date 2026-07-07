"use client";

import { GrammarTopic } from "@/constants/grammar";
import { Input } from "@/components/ui/Input";
import { FiLock, FiMusic, FiSearch } from "react-icons/fi";
import { useMemo, useState } from "react";

export type ThumbnailDifficulty = "easy" | "medium" | "hard";

export interface ThumbnailGridItem {
  id: string;
  title: string;
  thumbnailUrl: string | null;
  variant?: "single" | "series";
  difficulty?: ThumbnailDifficulty;
  episodeCount?: number;
  topic?: GrammarTopic;
  /** Học sinh chưa mở khóa — hiện khóa + gợi ý, không lộ tên/ảnh phim. */
  locked?: boolean;
  unlockHint?: string;
}

interface ContentThumbnailGridProps {
  items: ThumbnailGridItem[];
  onSelect: (item: ThumbnailGridItem) => void;
  searchPlaceholder?: string;
  emptyMessage?: string;
  className?: string;
  /** Nhóm phim lẻ / phim bộ; mặc định giữ thứ tự admin. */
  groupByVariant?: boolean;
  /** Khi true, mỗi nhóm sort theo độ khó (nhạc, v.v.). */
  sortGroupsByDifficulty?: boolean;
}

const DIFFICULTY_RANK: Record<ThumbnailDifficulty, number> = {
  easy: 0,
  medium: 1,
  hard: 2,
};

const DIFFICULTY_LABEL: Record<ThumbnailDifficulty, string> = {
  easy: "Dễ",
  medium: "Vừa",
  hard: "Khó",
};

const DIFFICULTY_BADGE: Record<ThumbnailDifficulty, string> = {
  easy: "bg-emerald-500/90 text-white",
  medium: "bg-amber-500/90 text-white",
  hard: "bg-rose-500/90 text-white",
};

function removeVietnameseTones(str: string): string {
  return str
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D");
}

const sortByDifficulty = (list: ThumbnailGridItem[]): ThumbnailGridItem[] =>
  [...list].sort(
    (a, b) =>
      DIFFICULTY_RANK[a.difficulty ?? "easy"] -
      DIFFICULTY_RANK[b.difficulty ?? "easy"]
  );

/** Giữ thứ tự admin (không sort theo độ khó). */
const preserveOrder = (list: ThumbnailGridItem[]): ThumbnailGridItem[] => list;

export default function ContentThumbnailGrid({
  items,
  onSelect,
  searchPlaceholder = "Tìm kiếm...",
  emptyMessage = "Chưa có nội dung",
  className = "",
  groupByVariant = false,
  sortGroupsByDifficulty = false,
}: ContentThumbnailGridProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const sortGroup = sortGroupsByDifficulty ? sortByDifficulty : preserveOrder;

  const filteredItems = useMemo(() => {
    if (!searchQuery.trim()) return items;
    const query = searchQuery.toLowerCase();
    const queryNoTones = removeVietnameseTones(query);

    return items.filter((item) => {
      const titleLower = item.title.toLowerCase();
      const titleNoTones = removeVietnameseTones(titleLower);
      return (
        titleLower.includes(query) ||
        titleNoTones.includes(queryNoTones) ||
        item.id.includes(query)
      );
    });
  }, [items, searchQuery]);

  const singleItems = useMemo(
    () =>
      groupByVariant
        ? sortGroup(filteredItems.filter((i) => i.variant !== "series"))
        : [],
    [filteredItems, groupByVariant, sortGroup]
  );

  const seriesItems = useMemo(
    () =>
      groupByVariant
        ? sortGroup(filteredItems.filter((i) => i.variant === "series"))
        : [],
    [filteredItems, groupByVariant, sortGroup]
  );

  const renderCard = (item: ThumbnailGridItem) => {
    const locked = item.locked === true;
    return (
      <button
        key={item.id}
        type="button"
        disabled={locked}
        onClick={() => {
          if (!locked) onSelect(item);
        }}
        className={`group overflow-hidden rounded-lg border bg-white text-left transition-colors ${
          locked
            ? "cursor-not-allowed border-gray-200"
            : "border-gray-200 hover:border-primary/40 hover:bg-gray-50"
        }`}
      >
        <div className="relative aspect-video w-full overflow-hidden bg-gray-100">
          {locked ? (
            <div className="flex h-full w-full items-center justify-center bg-slate-200">
              <FiLock className="h-9 w-9 text-slate-500" aria-hidden />
            </div>
          ) : item.thumbnailUrl ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={item.thumbnailUrl}
              alt=""
              className="h-full w-full object-cover transition-transform group-hover:scale-[1.02]"
              loading="lazy"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-gray-400">
              <FiMusic className="h-10 w-10" />
            </div>
          )}
          {!locked && item.difficulty && (
            <span
              className={`absolute left-1.5 top-1.5 rounded px-1.5 py-0.5 text-[10px] font-semibold ${DIFFICULTY_BADGE[item.difficulty]}`}
            >
              {DIFFICULTY_LABEL[item.difficulty]}
            </span>
          )}
          {!locked &&
            typeof item.episodeCount === "number" &&
            item.episodeCount > 0 && (
              <span className="absolute right-1.5 top-1.5 rounded bg-black/70 px-1.5 py-0.5 text-[10px] font-medium text-white">
                {item.episodeCount} tập
              </span>
            )}
        </div>
        <p className="line-clamp-3 p-2 text-xs font-medium text-gray-800 sm:text-sm">
          {locked ? (
            <span className="text-gray-600 font-normal leading-snug">
              {item.unlockHint ?? "Hoàn thành phim trước để mở khóa phim mới"}
            </span>
          ) : (
            item.title
          )}
        </p>
      </button>
    );
  };

  if (items.length === 0) {
    return (
      <div className={`${className}`}>
        <div className="py-12 text-center">
          <h4 className="mb-2 text-lg font-semibold text-gray-600">
            {emptyMessage}
          </h4>
        </div>
      </div>
    );
  }

  return (
    <div className={`${className} mx-auto max-w-6xl px-4`}>
      <div className="mb-4">
        <div className="relative">
          <FiSearch className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 transform text-gray-400" />
          <Input
            type="text"
            placeholder={searchPlaceholder}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10"
          />
        </div>
        {searchQuery && (
          <p className="mt-2 text-sm text-gray-500">
            Tìm thấy {filteredItems.length} mục
          </p>
        )}
      </div>

      {groupByVariant ? (
        <div className="space-y-6">
          {singleItems.length > 0 && (
            <section>
              <h3 className="mb-2 text-sm font-bold text-gray-800">Phim lẻ</h3>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                {singleItems.map(renderCard)}
              </div>
            </section>
          )}
          {seriesItems.length > 0 && (
            <section>
              <h3 className="mb-2 text-sm font-bold text-gray-800">Phim bộ</h3>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                {seriesItems.map(renderCard)}
              </div>
            </section>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {filteredItems.map(renderCard)}
        </div>
      )}

      {filteredItems.length === 0 && searchQuery && (
        <div className="py-8 text-center text-gray-500">
          Không tìm thấy mục nào phù hợp
        </div>
      )}
    </div>
  );
}
