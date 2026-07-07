"use client";

import { SafeImage as Image } from "@/components/ui/SafeImage";
import { ProfileAvatarLink } from "@/components/ui/ProfileAvatarLink";
import { cn } from "@/utils";
import { useMemo, useState } from "react";
import {
  CLASS_RANK_TABS,
  type ClassRankMetric,
  type ClassRankSnapshot,
  computeTopCount,
  formatMetricValue,
  getTopStudents,
  studentsFromClassRank,
} from "../utils/class-rank";

const RANK_MEDALS = ["🥇", "🥈", "🥉"] as const;

type ClassRankBoardProps = {
  className?: string;
  classLabel?: string;
  rank?: ClassRankSnapshot | null;
};

export function ClassRankBoard({ className, classLabel, rank }: ClassRankBoardProps) {
  const [activeMetric, setActiveMetric] = useState<ClassRankMetric>("countHeart");

  const students = useMemo(() => studentsFromClassRank(rank ?? undefined), [rank]);

  const topStudents = useMemo(
    () => getTopStudents(students, activeMetric),
    [students, activeMetric]
  );

  const topCount = computeTopCount(students.length);
  const activeTab = CLASS_RANK_TABS.find((t) => t.key === activeMetric);

  if (students.length === 0) {
    return (
      <section className={cn("mb-4", className)}>
        {classLabel ? (
          <h3 className="text-sm font-semibold text-gray-900 mb-1">{classLabel}</h3>
        ) : null}
        <p className="text-xs text-gray-500 py-2">Giáo viên chưa cập nhật xếp hạng.</p>
      </section>
    );
  }

  return (
    <section className={cn("mb-4", className)}>
      <div className="flex items-center justify-between gap-2 mb-2">
        <h3 className="text-sm font-semibold text-gray-900">
          {classLabel ? `Top · ${classLabel}` : "Top lớp"}
        </h3>
        <span className="text-[11px] text-gray-500 tabular-nums">
          Top {topCount}/{students.length}
        </span>
      </div>

      <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-hide -mx-0.5 px-0.5">
        {CLASS_RANK_TABS.map((tab) => {
          const active = tab.key === activeMetric;
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveMetric(tab.key)}
              className={cn(
                "shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors",
                active
                  ? "bg-emerald-600 text-white shadow-sm"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              )}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {topStudents.length === 0 ? (
        <p className="text-xs text-gray-500 py-2">Chưa có dữ liệu xếp hạng.</p>
      ) : (
        <ul className="mt-2 flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
          {topStudents.map((student) => {
            const medal =
              student.rank <= 3 ? RANK_MEDALS[student.rank - 1] : `#${student.rank}`;
            const valueLabel = formatMetricValue(activeMetric, student.metricValue);
            return (
              <li
                key={student.id}
                className="shrink-0 w-[88px] rounded-xl border border-gray-100 bg-white px-2 py-2 text-center shadow-sm"
              >
                <div className="relative mx-auto h-10 w-10">
                  <ProfileAvatarLink
                    userId={student.id}
                    className="block h-10 w-10 rounded-full overflow-hidden ring-1 ring-gray-200"
                    ariaLabel={`Hồ sơ ${student.displayName}`}
                  >
                    {student.avatarUrl ? (
                      <Image
                        src={student.avatarUrl}
                        alt=""
                        width={40}
                        height={40}
                        sizes="40px"
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center bg-primary/10 text-xs font-bold text-primary">
                        {(student.displayName || "?").charAt(0).toUpperCase()}
                      </div>
                    )}
                  </ProfileAvatarLink>
                  <span
                    className="absolute -top-1 -right-1 text-[10px] leading-none"
                    aria-hidden
                  >
                    {medal}
                  </span>
                </div>
                <p className="mt-1 truncate text-[11px] font-medium text-gray-800">
                  {student.displayName}
                </p>
                <p className="text-xs font-black tabular-nums text-emerald-600">
                  {valueLabel}
                  {activeTab?.shortLabel &&
                  activeMetric !== "countHeart" &&
                  activeMetric !== "streakCount" &&
                  activeMetric !== "totalBanhRan" ? (
                    <span className="ml-0.5 text-[10px] font-semibold text-gray-400">
                      {activeTab.shortLabel}
                    </span>
                  ) : null}
                  {activeMetric === "countHeart" ? (
                    <span className="ml-0.5 text-[10px]">❤️</span>
                  ) : null}
                  {activeMetric === "streakCount" ? (
                    <span className="ml-0.5 text-[10px]">🔥</span>
                  ) : null}
                  {activeMetric === "totalBanhRan" ? (
                    <span className="ml-0.5 text-[10px]">🍞</span>
                  ) : null}
                </p>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
