"use client";

import { useMemo, useState } from "react";
import { SafeImage as Image } from "@/components/ui/SafeImage";
import { useClassWatchTrackingData, useClassMembers } from "../hooks";
import type { WatchMediaType, WatchTrackingViewItem } from "../services";
import {
  FiBook,
  FiPlay,
  FiUser,
  FiClock,
  FiFilm,
  FiMusic,
  FiSearch,
} from "react-icons/fi";
import { MiluLoading } from "@/components/ui/LoadingSpinner";
import { IClassMember } from "@/types";
import { ProfileAvatarLink } from "@/components/ui/ProfileAvatarLink";

type MediaFilter = "all" | WatchMediaType;
type TimeRange = "all" | "date";
type SortField =
  | "student"
  | "mediaType"
  | "topic"
  | "exercise"
  | "percent"
  | "watchTime"
  | "watchedAt";
type SortDir = "asc" | "desc";

export type WatchTrackingRow = WatchTrackingViewItem & {
  studentId: string;
  studentName: string;
};

const MEDIA_LABELS: Record<WatchMediaType, string> = {
  grammar: "Ngữ pháp",
  movie: "Phim",
  music: "Nhạc",
};

const MEDIA_TABS: { id: MediaFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "grammar", label: "Ngữ pháp" },
  { id: "movie", label: "Phim" },
  { id: "music", label: "Nhạc" },
];

function formatDuration(seconds?: number) {
  if (!seconds || seconds === 0) return "-";
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  }
  return `${minutes.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
}

function formatDateTime(d: Date) {
  return new Intl.DateTimeFormat("vi-VN", {
    timeZone: "Asia/Ho_Chi_Minh",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

function todayDateInputValue() {
  return new Date().toISOString().split("T")[0];
}

function MediaIcon({ type }: { type: WatchMediaType }) {
  if (type === "movie") {
    return <FiFilm className="w-3.5 h-3.5 text-violet-500 shrink-0" />;
  }
  if (type === "music") {
    return <FiMusic className="w-3.5 h-3.5 text-pink-500 shrink-0" />;
  }
  return <FiBook className="w-3.5 h-3.5 text-blue-500 shrink-0" />;
}

function ProgressRing({
  percent,
  isCompleted,
}: {
  percent: number;
  isCompleted: boolean;
}) {
  const clamped = Math.max(0, Math.min(100, percent));
  const size = 40;
  const stroke = 3.5;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (clamped / 100) * circumference;
  const ringColor = isCompleted
    ? "text-green-500"
    : clamped >= 50
      ? "text-yellow-500"
      : "text-red-500";
  const textColor = isCompleted
    ? "text-green-600 dark:text-green-400"
    : clamped >= 50
      ? "text-yellow-600 dark:text-yellow-400"
      : "text-red-600 dark:text-red-400";
  return (
    <div
      className="relative inline-flex items-center justify-center"
      style={{ width: size, height: size }}
      title={`${Math.round(clamped)}%`}
    >
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={stroke}
          stroke="currentColor"
          className="text-gray-200 dark:text-gray-700"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={stroke}
          strokeLinecap="round"
          stroke="currentColor"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className={`${ringColor} transition-[stroke-dashoffset] duration-500`}
        />
      </svg>
      <span
        className={`absolute text-[9px] sm:text-[10px] font-semibold tabular-nums ${textColor}`}
      >
        {Math.round(clamped)}%
      </span>
    </div>
  );
}

export function GrammarTrackingTable({
  classId,
  members: membersProp,
  isOnline,
  studentId,
  hideEmpty,
  simplified,
  defaultTimeRange = "all",
}: {
  classId: string;
  members?: IClassMember[];
  isOnline: (studentId: string) => boolean;
  studentId?: string;
  hideEmpty?: boolean;
  simplified?: boolean;
  /** Mặc định toàn bộ lịch sử; truyền "today" cho modal xem nhanh hôm nay (sẽ map sang "date" = hôm nay). */
  defaultTimeRange?: "all" | "today" | "date";
}) {
  const [mediaFilter, setMediaFilter] = useState<MediaFilter>("all");
  const [timeRange, setTimeRange] = useState<TimeRange>(
    defaultTimeRange === "all" ? "all" : "date"
  );
  const [selectedDate, setSelectedDate] = useState(todayDateInputValue);
  const [searchQuery, setSearchQuery] = useState("");
  const [studentFilter, setStudentFilter] = useState<string>("all");
  const [sortField, setSortField] = useState<SortField>("watchedAt");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const fetchDate = useMemo(() => {
    if (timeRange === "all") return undefined;
    return new Date(selectedDate);
  }, [timeRange, selectedDate]);

  const { data, isLoading, error } = useClassWatchTrackingData(
    classId,
    fetchDate ? { date: fetchDate } : undefined
  );

  const { data: membersFromHook } = useClassMembers(classId, {
    enabled: !membersProp,
  });
  const members = membersProp || membersFromHook;

  const getMemberByStudentId = (id: string): IClassMember | undefined =>
    members?.find((m) => m.id === id);

  const studentOptions = useMemo(() => {
    if (!data) return [] as { id: string; name: string }[];
    const seen = new Map<string, string>();
    for (const student of data) {
      if (studentId && student.studentId !== studentId) continue;
      if (!seen.has(student.studentId)) {
        seen.set(student.studentId, student.studentName);
      }
    }
    return Array.from(seen.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name, "vi"));
  }, [data, studentId]);

  const flatRows = useMemo(() => {
    if (!data) return [] as WatchTrackingRow[];
    const rows: WatchTrackingRow[] = [];
    for (const student of data) {
      if (studentId && student.studentId !== studentId) continue;
      if (studentFilter !== "all" && student.studentId !== studentFilter) continue;
      for (const view of student.views) {
        if (mediaFilter !== "all" && view.mediaType !== mediaFilter) continue;
        rows.push({
          ...view,
          studentId: student.studentId,
          studentName: student.studentName,
        });
      }
    }
    return rows;
  }, [data, studentId, studentFilter, mediaFilter]);

  const filteredRows = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return flatRows;
    return flatRows.filter((row) => {
      const haystack = [
        row.studentName,
        row.topicName,
        row.exerciseTitle,
        MEDIA_LABELS[row.mediaType],
        `bài ${row.exerciseNo}`,
        row.subNo ? `.${row.subNo}` : "",
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [flatRows, searchQuery]);

  const sortedRows = useMemo(() => {
    const dir = sortDir === "asc" ? 1 : -1;
    return [...filteredRows].sort((a, b) => {
      switch (sortField) {
        case "student":
          return (
            a.studentName.localeCompare(b.studentName, "vi") * dir ||
            b.watchedAt.getTime() - a.watchedAt.getTime()
          );
        case "mediaType":
          return (
            MEDIA_LABELS[a.mediaType].localeCompare(
              MEDIA_LABELS[b.mediaType],
              "vi"
            ) * dir || b.watchedAt.getTime() - a.watchedAt.getTime()
          );
        case "topic":
          return (
            a.topicName.localeCompare(b.topicName, "vi") * dir ||
            b.watchedAt.getTime() - a.watchedAt.getTime()
          );
        case "exercise":
          return (
            a.exerciseTitle.localeCompare(b.exerciseTitle, "vi") * dir ||
            b.watchedAt.getTime() - a.watchedAt.getTime()
          );
        case "percent":
          return (a.watchedPercent - b.watchedPercent) * dir;
        case "watchTime":
          return (
            ((a.actualWatchTime ?? 0) - (b.actualWatchTime ?? 0)) * dir
          );
        case "watchedAt":
        default:
          return (a.watchedAt.getTime() - b.watchedAt.getTime()) * dir;
      }
    });
  }, [filteredRows, sortField, sortDir]);

  const studentsWithViews = useMemo(() => {
    const ids = new Set(sortedRows.map((r) => r.studentId));
    return ids.size;
  }, [sortedRows]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDir("desc");
    }
  };

  const SortHeader = ({
    field,
    label,
    align = "left",
  }: {
    field: SortField;
    label: string;
    align?: "left" | "center";
  }) => {
    const active = sortField === field;
    return (
      <th
        className={`px-2 sm:px-3 py-2 text-[10px] sm:text-xs font-medium text-gray-500 uppercase ${
          align === "center" ? "text-center" : "text-left"
        }`}
      >
        <button
          type="button"
          onClick={() => handleSort(field)}
          className={`inline-flex items-center gap-1 uppercase select-none transition-colors hover:text-gray-700 dark:hover:text-gray-200 ${
            align === "center" ? "justify-center" : ""
          } ${active ? "text-primary" : ""}`}
        >
          {label}
          <span className="text-[8px] leading-none w-2 inline-block">
            {active ? (sortDir === "asc" ? "▲" : "▼") : ""}
          </span>
        </button>
      </th>
    );
  };

  const toolbar = (
    <div className="flex flex-col gap-2.5 mb-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex gap-1 p-1 bg-gray-100 dark:bg-gray-700/50 rounded-lg">
          {MEDIA_TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setMediaFilter(tab.id)}
              className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                mediaFilter === tab.id
                  ? "bg-white dark:bg-gray-800 text-primary shadow-sm"
                  : "text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="flex gap-1 p-1 bg-gray-100 dark:bg-gray-700/50 rounded-lg">
          {(
            [
              { id: "all" as const, label: "Tất cả" },
              { id: "date" as const, label: "Theo ngày" },
            ] as const
          ).map((opt) => (
            <button
              key={opt.id}
              type="button"
              onClick={() => setTimeRange(opt.id)}
              className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                timeRange === opt.id
                  ? "bg-white dark:bg-gray-800 text-primary shadow-sm"
                  : "text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
        <input
          type="date"
          value={selectedDate}
          onChange={(e) => setSelectedDate(e.target.value)}
          disabled={timeRange !== "date"}
          className="px-2.5 py-1.5 text-xs border border-gray-200 dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-gray-700/40 disabled:opacity-50 disabled:cursor-not-allowed"
        />

        <div className="relative flex-1 min-w-[160px]">
          <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search"
            className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-gray-700/40 focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
        </div>
      </div>

      {!studentId && studentOptions.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => setStudentFilter("all")}
            className={`inline-flex items-center gap-1.5 h-8 pl-1 pr-2.5 rounded-full border text-xs font-medium transition-colors ${
              studentFilter === "all"
                ? "border-primary bg-primary/10 text-primary"
                : "border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
            }`}
            aria-pressed={studentFilter === "all"}
          >
            <span className="flex items-center justify-center w-6 h-6 rounded-full bg-primary/10">
              <FiUser className="w-3.5 h-3.5 text-primary" />
            </span>
            All
          </button>
          {studentOptions.map((s) => {
            const member = getMemberByStudentId(s.id);
            const active = studentFilter === s.id;
            return (
              <button
                key={s.id}
                type="button"
                onClick={() =>
                  setStudentFilter((prev) => (prev === s.id ? "all" : s.id))
                }
                className={`inline-flex items-center gap-1.5 h-8 pl-1 pr-2.5 rounded-full border text-xs font-medium transition-colors ${
                  active
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700"
                }`}
                aria-pressed={active}
                title={s.name}
              >
                <span className="relative w-6 h-6 shrink-0">
                  {member?.avatarUrl ? (
                    <Image
                      src={member.avatarUrl}
                      alt={s.name}
                      width={24}
                      height={24}
                      sizes="24px"
                      className="w-6 h-6 rounded-full object-cover"
                    />
                  ) : (
                    <span className="flex items-center justify-center w-6 h-6 rounded-full bg-primary/10">
                      <FiUser className="w-3.5 h-3.5 text-primary" />
                    </span>
                  )}
                  {isOnline(s.id) && (
                    <span className="absolute -bottom-0.5 -right-0.5 w-1.5 h-1.5 bg-green-500 border border-white dark:border-gray-800 rounded-full" />
                  )}
                </span>
                <span className="truncate max-w-[90px]">{s.name}</span>
              </button>
            );
          })}
        </div>
      )}

    </div>
  );

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-64">
        <MiluLoading fullScreen={false} />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-2 sm:p-4 bg-white dark:bg-gray-800 border border-border rounded-lg">
        {toolbar}
        <p className="p-4 text-red-500">Có lỗi khi tải dữ liệu. Vui lòng thử lại.</p>
      </div>
    );
  }

  const showEmpty =
    sortedRows.length === 0 && !(hideEmpty && !studentId);

  if (showEmpty) {
    return (
      <div className="p-2 sm:p-4 bg-white dark:bg-gray-800 border border-border rounded-lg">
        {toolbar}
        <p className="p-4 text-muted text-center text-sm">
          {timeRange === "all"
            ? "Chưa có lịch sử xem nội dung nào."
            : "Không có dữ liệu cho bộ lọc đã chọn."}
        </p>
      </div>
    );
  }

  return (
    <div className="p-2 sm:p-4 bg-white dark:bg-gray-800 border border-border rounded-lg">
      {toolbar}

      <div
        className={`w-full overflow-auto ${simplified ? "h-[60vh]" : ""}`}
      >
        <table className="w-full table-auto divide-y divide-gray-200 dark:divide-gray-700">
          <thead className="bg-gray-50 dark:bg-gray-700 sticky top-0 z-10">
            <tr>
              <SortHeader field="student" label="Học sinh" />
              <SortHeader field="mediaType" label="Loại" />
              <SortHeader field="topic" label="Chủ đề" />
              <SortHeader field="exercise" label="Bài" />
              <SortHeader field="percent" label="Tiến độ" align="center" />
              <SortHeader field="watchTime" label="Thời gian" align="center" />
              <SortHeader field="watchedAt" label="Lần cuối" />
            </tr>
          </thead>
          <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
            {sortedRows.length === 0 && (
              <tr>
                <td
                  colSpan={7}
                  className="px-3 py-10 text-center text-sm text-muted"
                >
                  Không có kết quả phù hợp.
                </td>
              </tr>
            )}
            {sortedRows.map((row, index) => {
              const member = getMemberByStudentId(row.studentId);
              return (
                <tr
                  key={`${row.studentId}-${row.videoUrl}-${row.watchedAt.getTime()}-${index}`}
                >
                  <td className="px-2 sm:px-3 py-2 sm:py-2.5">
                    <div className="flex items-center gap-1.5 min-w-[100px]">
                      <div className="relative w-5 h-5 sm:w-6 sm:h-6 shrink-0">
                        <ProfileAvatarLink
                          userId={row.studentId}
                          className="block h-full w-full rounded-full overflow-hidden"
                          ariaLabel={`Hồ sơ ${row.studentName}`}
                        >
                          {member?.avatarUrl ? (
                            <Image
                              src={member.avatarUrl}
                              alt={row.studentName}
                              width={24}
                              height={24}
                              sizes="24px"
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <div className="w-full h-full rounded-full bg-primary/10 flex items-center justify-center">
                              <FiUser className="w-3 h-3 text-primary" />
                            </div>
                          )}
                        </ProfileAvatarLink>
                        {isOnline(row.studentId) && (
                          <div className="absolute -bottom-0.5 -right-0.5 w-1.5 h-1.5 bg-green-500 border border-white dark:border-gray-800 rounded-full" />
                        )}
                      </div>
                      <span className="text-[11px] sm:text-sm truncate max-w-[120px] sm:max-w-none">
                        {row.studentName}
                      </span>
                    </div>
                  </td>
                  <td className="px-2 sm:px-3 py-2 sm:py-2.5">
                    <div className="flex items-center gap-1">
                      <MediaIcon type={row.mediaType} />
                      <span className="text-[11px] sm:text-xs text-gray-700 dark:text-gray-200 whitespace-nowrap">
                        {MEDIA_LABELS[row.mediaType]}
                      </span>
                    </div>
                  </td>
                  <td className="px-2 sm:px-3 py-2 sm:py-2.5">
                    <span className="text-[11px] sm:text-sm text-gray-800 dark:text-gray-200 line-clamp-2">
                      {row.topicName || "—"}
                    </span>
                  </td>
                  <td className="px-2 sm:px-3 py-2 sm:py-2.5">
                    <div className="flex items-start gap-1">
                      <span className="text-[11px] sm:text-sm text-gray-800 dark:text-gray-200 line-clamp-2">
                        Bài {row.exerciseNo}
                        {row.subNo ? `.${row.subNo}` : ""}
                        {row.exerciseTitle ? ` — ${row.exerciseTitle}` : ""}
                      </span>
                    </div>
                  </td>
                  <td className="px-0.5 py-0.5">
                    <div className="flex items-center justify-center">
                      <ProgressRing
                        percent={row.watchedPercent}
                        isCompleted={!!row.isCompleted}
                      />
                    </div>
                  </td>
                  <td className="px-2 sm:px-3 py-2 sm:py-2.5 text-center">
                    {(row.actualWatchTime ?? 0) > 0 ? (
                      <div className="flex items-center justify-center gap-0.5">
                        <span
                          className="text-[10px] sm:text-xs text-gray-600 dark:text-gray-300"
                          title={
                            row.durationSeconds
                              ? `${formatDuration(row.actualWatchTime)} / ${formatDuration(row.durationSeconds)}`
                              : undefined
                          }
                        >
                          {formatDuration(row.actualWatchTime)}
                        </span>
                      </div>
                    ) : (
                      <span className="text-[11px] text-gray-400">—</span>
                    )}
                  </td>
                  <td className="px-2 sm:px-3 py-2 sm:py-2.5 whitespace-nowrap">
                    <span className="text-[10px] sm:text-xs text-gray-500 dark:text-gray-400">
                      {formatDateTime(row.watchedAt)}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {!simplified && (
        <div className="mt-3 pt-3 border-t border-gray-100 dark:border-gray-700 flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500 dark:text-gray-400">
          <span>
            Học sinh: <span className="font-medium text-primary">{studentsWithViews}</span>
          </span>
          <span>
            Lượt xem: <span className="font-medium text-primary">{sortedRows.length}</span>
          </span>
        </div>
      )}
    </div>
  );
}
