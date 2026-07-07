"use client";

import { SafeImage as Image } from "@/components/ui/SafeImage";
import { useMemo } from "react";
import { ProfileAvatarLink } from "@/components/ui/ProfileAvatarLink";
import type { IAdmiration } from "../api/admiration";

function getReactionIcon(reactionType?: string): string {
  const icons: Record<string, string> = {
    dislike: "👎",
    haha: "😂",
    like: "👍",
    heart: "❤️",
    wow: "😱",
  };
  return icons[reactionType || ""] || "❤️";
}

function getDaysDifference(date: Date): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const targetDate = new Date(date);
  targetDate.setHours(0, 0, 0, 0);
  const diffTime = today.getTime() - targetDate.getTime();
  return Math.floor(diffTime / (1000 * 60 * 60 * 24));
}

function getDateLabel(date: Date): string {
  const daysDiff = getDaysDifference(date);
  if (daysDiff === 0) return "Hôm nay";
  if (daysDiff === 1) return "Hôm qua";
  if (daysDiff <= 7) return `${daysDiff} ngày trước`;
  return date.toLocaleDateString("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function getDateKey(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function groupAdmirationsByDate(admirations: IAdmiration[]): Map<string, IAdmiration[]> {
  const grouped = new Map<string, IAdmiration[]>();
  admirations.forEach((admiration) => {
    const dateKey = getDateKey(admiration.createdAt);
    if (!grouped.has(dateKey)) grouped.set(dateKey, []);
    grouped.get(dateKey)!.push(admiration);
  });
  grouped.forEach((items) => {
    items.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  });
  return grouped;
}

export function AdmirationNotificationsContent({
  items,
  isLoading,
  userInfoCache,
}: {
  items: IAdmiration[];
  isLoading: boolean;
  userInfoCache: Record<string, { name: string; avatarUrl: string }>;
}) {
  const groupedAdmirations = useMemo(() => groupAdmirationsByDate(items), [items]);

  const sortedDateKeys = useMemo(() => {
    return Array.from(groupedAdmirations.keys()).sort((a, b) => {
      const dateA = new Date(a);
      const dateB = new Date(b);
      return dateB.getTime() - dateA.getTime();
    });
  }, [groupedAdmirations]);

  if (isLoading && items.length === 0) {
    return (
      <div className="text-center py-4 text-gray-500 text-xs">
        Đang tải...
      </div>
    );
  }

  if (sortedDateKeys.length === 0) {
    return (
      <div className="text-center py-4 text-gray-500 text-xs">
        Chưa có thông báo nào
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {sortedDateKeys.map((dateKey) => {
        const admirationsForDate = groupedAdmirations.get(dateKey) || [];
        const firstAdmiration = admirationsForDate[0];
        const dateLabel = getDateLabel(firstAdmiration.createdAt);

        return (
          <div key={dateKey} className="space-y-1.5">
            <h3 className="text-xs font-semibold text-gray-600 sticky top-0  py-0.5 z-10">
              {dateLabel}
            </h3>
            <div className="space-y-1.5 mt-2">
              {admirationsForDate.map((admiration) => {
                const reactionIcon = getReactionIcon(admiration.reactionType);
                const isSpeakingGrade = admiration.type === "speakingGrade";
                const cachedInfo = userInfoCache[admiration.fromStudentId];
                const avatarUrl = admiration.fromStudentAvatarUrl || cachedInfo?.avatarUrl || "";
                const displayName = cachedInfo?.name || admiration.fromStudentName;
                const initial = displayName ? displayName.slice(-1).toUpperCase() : "";

                return (
                  <div
                    key={admiration.id}
                    className={`flex items-center gap-2 p-2 rounded-lg border text-xs ${
                      isSpeakingGrade
                        ? "bg-sky-50 border-sky-200"
                        : "bg-yellow-50 border-yellow-200"
                    }`}
                  >
                    <div className="relative flex-shrink-0">
                      <ProfileAvatarLink
                        userId={admiration.fromStudentId}
                        className={
                          avatarUrl
                            ? "relative h-7 w-7 rounded-full overflow-hidden ring-1 ring-gray-200"
                            : "h-7 w-7 rounded-full flex items-center justify-center text-[10px] font-bold ring-1 ring-gray-200 bg-gradient-to-br from-gray-100 to-gray-200 text-gray-700"
                        }
                        ariaLabel={`Hồ sơ ${displayName || ""}`}
                      >
                        {avatarUrl ? (
                          <Image
                            src={avatarUrl}
                            alt={displayName}
                            fill
                            sizes="28px"
                            className="object-cover"
                          />
                        ) : (
                          initial
                        )}
                      </ProfileAvatarLink>
                    </div>
                    <span className="text-base">{reactionIcon}</span>
                    <div className="flex-1 min-w-0 truncate">
                      <div className="flex items-center gap-1.5">
                        <span className="font-medium text-gray-900 truncate">{displayName}</span>
                        <span
                          className={`shrink-0 text-[10px] px-1.5 py-0.5 rounded ${
                            isSpeakingGrade
                              ? "bg-sky-100 text-sky-700"
                              : "bg-yellow-100 text-yellow-600"
                          }`}
                        >
                          {isSpeakingGrade ? "Chấm Speaking" : "Ngưỡng mộ"}
                        </span>
                      </div>
                    </div>
                    <span className="text-[10px] text-gray-400 shrink-0">
                      {admiration.createdAt.toLocaleTimeString("vi-VN", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
