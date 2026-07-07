"use client";

import { motion } from "framer-motion";
import { FiChevronDown, FiLogOut, FiRefreshCw } from "react-icons/fi";
import {
  useDashboardAttendanceInsight,
  useDashboardDeepBookProgress,
  useDashboardDeepUsersClasses,
} from "../hooks/useDashboardStats";
import type {
  DashboardDeepBookProgressInsights,
  DashboardDeepClassesAgg,
  DashboardDeepHourlySeries,
  DashboardDeepNeedArrayStats,
  DashboardDeepNumericSummary,
  DashboardDeepUsersAgg,
  DashboardDeepUsersClassesInsights,
  DashboardDeepUserFieldStats,
  DashboardAttendanceInsights,
} from "../services/dashboard.service";
import { useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Button } from "@/components/ui/Button";
import { db } from "@/lib/firebase/client";
import {
  collection,
  getDoc,
  getDocs,
  doc,
  setDoc,
  updateDoc,
  deleteField,
  writeBatch,
  serverTimestamp,
  type DocumentData,
} from "firebase/firestore";
import { toast } from "react-hot-toast";
import { auth } from "@/lib/firebase/client";
import { useAuth } from "@/lib/auth/context";
import { cn } from "@/utils";
import { PasteButton } from "./common";
import {
  aiSettingsToForm,
  formToAiSettings,
  parseAiSettingsFromFirestore,
} from "@/lib/ai/settings.shared";
import {
  DEFAULT_TTS_MODEL,
  DEFAULT_TTS_VOICE,
  TTS_VOICES,
} from "@/modules/ai/types";

/** needQuizs / needSpeakings pie — màu cố định theo lát */
const NEED_ASSIGN_SLICE_FILL: Record<string, string> = {
  "0–3": "#bfdbfe",
  "4–6": "#facc15",
  "7+": "#ef4444",
};

const KPI_ACCENT_BORDER: Record<"blue" | "green" | "purple" | "orange", string> = {
  blue: "border-l-sky-500",
  green: "border-l-emerald-500",
  purple: "border-l-violet-500",
  orange: "border-l-amber-500",
};

const CHART_AXIS_TICK = { fontSize: 13, fill: "#64748b" };
const TOOLTIP_STYLE = { fontSize: 14, borderRadius: 10 };

type StatAccent = keyof typeof KPI_ACCENT_BORDER;

type KpiTileProps = {
  label: string;
  value: number | null;
  isLoading: boolean;
  accent: StatAccent;
  onLoad?: () => void;
};

function KpiTile({ label, value, isLoading, accent, onLoad }: KpiTileProps) {
  return (
    <div
      className={cn(
        "rounded-lg border border-slate-200/90 bg-white px-3 py-2.5 shadow-sm",
        "border-l-[3px]",
        KPI_ACCENT_BORDER[accent]
      )}
    >
      <p className="text-sm font-medium leading-snug text-slate-500">{label}</p>
      <div className="mt-0.5 min-h-[1.5rem]">
        {isLoading ? (
          <div className="h-6 w-16 max-w-[80%] rounded bg-slate-100 animate-pulse" aria-hidden />
        ) : value !== null ? (
          <p className="text-xl font-bold tabular-nums leading-tight text-slate-900 sm:text-2xl">
            {value.toLocaleString("vi-VN")}
          </p>
        ) : (
          <span className="text-sm text-slate-400">—</span>
        )}
      </div>
    </div>
  );
}

type TrendPoint = { date: string; count: number };
type ModelHealthResult = {
  model: string;
  ok: boolean;
  durationMs: number;
  errorCode?: number;
  errorStatus?: string;
  errorMessage?: string;
};

type DualTrendPanel = {
  title: string;
  subtitle?: string;
  data: TrendPoint[];
  stroke: string;
  tooltipLabel: string;
};

function DualTrendCharts({
  isLoading,
  left,
  right,
}: {
  isLoading: boolean;
  left: DualTrendPanel;
  right: DualTrendPanel;
}) {
  if (isLoading) {
    return (
      <div className="rounded-lg border border-slate-200/90 bg-white p-4 shadow-sm">
        <div className="grid gap-4 lg:grid-cols-2 lg:gap-0 lg:divide-x lg:divide-slate-100">
          <div className="h-[248px] animate-pulse rounded-md bg-slate-100 lg:pr-4" aria-hidden />
          <div className="h-[248px] animate-pulse rounded-md bg-slate-100 lg:pl-4" aria-hidden />
        </div>
      </div>
    );
  }

  const panelBody = (side: DualTrendPanel) => (
    <>
      <p className="text-sm font-semibold text-slate-800">{side.title}</p>
      {side.subtitle ? <p className="mb-2 text-xs text-slate-500">{side.subtitle}</p> : null}
      <ResponsiveContainer width="100%" height={208}>
        <LineChart data={side.data} margin={{ top: 8, right: 8, left: 0, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
          <XAxis dataKey="date" tick={{ fontSize: 13 }} stroke="#94a3b8" />
          <YAxis width={36} tick={{ fontSize: 13 }} stroke="#94a3b8" allowDecimals={false} />
          <Tooltip
            contentStyle={TOOLTIP_STYLE}
            formatter={(value) => [
              typeof value === "number" ? value.toLocaleString("vi-VN") : String(value ?? 0),
              side.tooltipLabel,
            ]}
          />
          <Line type="monotone" dataKey="count" stroke={side.stroke} strokeWidth={2.5} dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </>
  );

  return (
    <div className="rounded-lg border border-slate-200/90 bg-white p-4 shadow-sm">
      <div className="grid gap-5 lg:grid-cols-2 lg:gap-0 lg:divide-x lg:divide-slate-100">
        <div className="min-w-0 lg:pr-6">{panelBody(left)}</div>
        <div className="min-w-0 lg:pl-6">{panelBody(right)}</div>
      </div>
    </div>
  );
}

type HBarRow = { name: string; value: number };

function HBarMetricChart({
  title,
  rows,
  xMax,
  barColor,
  denomForPct,
}: {
  title: string;
  rows: HBarRow[];
  xMax?: number;
  barColor: string;
  /** Hiện % trong tooltip = value / denom */
  denomForPct?: number;
}) {
  const maxVal = Math.max(1, ...rows.map((r) => r.value));
  const domainMax = xMax !== undefined && xMax > 0 ? xMax : maxVal;
  const h = Math.max(200, 56 + rows.length * 40);

  return (
    <div className="rounded-lg border border-slate-200/90 bg-white p-4 shadow-sm">
      <p className="mb-2 text-sm font-semibold text-slate-800">{title}</p>
      <ResponsiveContainer width="100%" height={h}>
        <BarChart
          layout="vertical"
          data={rows}
          margin={{ left: 8, right: 20, top: 4, bottom: 4 }}
        >
          <XAxis
            type="number"
            domain={[0, domainMax]}
            tick={CHART_AXIS_TICK}
            stroke="#cbd5e1"
            allowDecimals={false}
          />
          <YAxis
            type="category"
            dataKey="name"
            width={148}
            tick={CHART_AXIS_TICK}
            stroke="#94a3b8"
            interval={0}
          />
          <Tooltip
            contentStyle={TOOLTIP_STYLE}
            formatter={(value) => {
              const v = typeof value === "number" ? value : 0;
              const parts = [v.toLocaleString("vi-VN")];
              if (denomForPct !== undefined && denomForPct > 0) {
                parts.push(`${Math.min(100, Math.round((v / denomForPct) * 100))}%`);
              }
              return parts.join(" · ");
            }}
          />
          <Bar dataKey="value" fill={barColor} radius={[0, 6, 6, 0]} barSize={22} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function DeepScanOverviewCharts({ u, c }: { u: DashboardDeepUsersAgg; c: DashboardDeepClassesAgg }) {
  const hsWithClass = Math.max(0, u.students - u.studentsWithoutClass);
  const fmt = (n: number) => n.toLocaleString("vi-VN");

  const InlinePairs = ({
    title,
    pairs,
  }: {
    title: string;
    pairs: { label: string; value: number }[];
  }) => (
    <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5">
      <span className="shrink-0 text-xs font-semibold text-slate-500">{title}</span>
      {pairs.map((p, i) => (
        <span key={p.label} className="text-sm text-slate-600">
          {i > 0 ? <span className="mr-2 text-slate-300">·</span> : null}
          {p.label}{" "}
          <span className="font-semibold tabular-nums text-slate-900">{fmt(p.value)}</span>
        </span>
      ))}
    </div>
  );

  return (
    <div className="rounded-lg border border-slate-200/90 bg-white px-4 py-3 shadow-sm">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 text-sm">
        <InlinePairs
          title="Lớp"
          pairs={[
            { label: "Active", value: c.active },
            { label: "Inactive", value: c.inactive },
          ]}
        />
        <span className="select-none text-slate-300" aria-hidden>
          |
        </span>
        <InlinePairs
          title="HS theo lớp"
          pairs={[
            { label: "Có lớp", value: hsWithClass },
            { label: "Chưa lớp", value: u.studentsWithoutClass },
          ]}
        />
        <span className="select-none text-slate-300" aria-hidden>
          |
        </span>
        <InlinePairs title="HS tự nhận" pairs={[{ label: "Số lượng", value: u.selfClaimedStudents }]} />
      </div>
    </div>
  );
}

const USER_FIELD_BLOCK_TITLE: Record<string, string> = {
  lastDeviceType: "Thiết bị",
  loginCount: "Lượt đăng nhập",
  speakingAccuracy: "Speaking (độ chính xác)",
  streakCount: "Streak",
  totalBanhRan: "Bánh rán",
  "timesVocabXS / timesVocab": "XS / vocab",
};

const HS_STREAK_PIE_FILL: Record<string, string> = {
  "≤ 7": "#60a5fa",
  "> 7": "#f97316",
};

const HS_DEVICE_PIE_PALETTE = [
  "#0ea5e9",
  "#8b5cf6",
  "#10b981",
  "#f59e0b",
  "#ec4899",
  "#64748b",
  "#06b6d4",
  "#a855f7",
  "#22c55e",
  "#eab308",
];

function HsFieldPieBlock({
  humanTitle,
  data,
  sliceFill,
  embedded = false,
}: {
  humanTitle: string;
  data: { name: string; value: number }[];
  sliceFill: Record<string, string> | ((name: string, index: number) => string);
  /** Bỏ viền — dùng trong khối đã có card ngoài */
  embedded?: boolean;
}) {
  const fillFor = (name: string, i: number) =>
    typeof sliceFill === "function" ? sliceFill(name, i) : sliceFill[name] ?? "#94a3b8";
  const sliceTotal = data.reduce((s, d) => s + d.value, 0);
  const positive = data.filter((d) => d.value > 0);
  const chartData = positive.length > 0 ? positive : data;

  return (
    <div
      className={cn(
        "min-w-0",
        embedded ? "" : "rounded-lg border border-slate-200/90 bg-white p-4 shadow-sm",
        embedded && "pt-1"
      )}
    >
      <p className="text-sm font-semibold text-slate-800">{humanTitle}</p>
      {sliceTotal === 0 ? (
        <p className="mt-6 text-center text-sm text-slate-400">Không có dữ liệu</p>
      ) : (
        <ResponsiveContainer width="100%" height={240}>
          <PieChart>
            <Pie
              data={chartData}
              dataKey="value"
              nameKey="name"
              cx="50%"
              cy="50%"
              innerRadius={52}
              outerRadius={92}
              paddingAngle={2}
              labelLine={false}
              label={({ name, percent }) => `${name} ${((percent ?? 0) * 100).toFixed(0)}%`}
            >
              {chartData.map((d, i) => (
                <Cell key={`${d.name}-${i}`} fill={fillFor(d.name, i)} />
              ))}
            </Pie>
            <Tooltip
              contentStyle={TOOLTIP_STYLE}
              formatter={(v) => (typeof v === "number" ? v.toLocaleString("vi-VN") : String(v ?? ""))}
            />
            <Legend wrapperStyle={{ fontSize: 13, paddingTop: 8 }} />
          </PieChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}

function fmtNum(x: number, maxFrac: number) {
  return x.toLocaleString("vi-VN", {
    maximumFractionDigits: maxFrac,
    minimumFractionDigits: 0,
  });
}

function HourlyVietnamBarChart({
  title,
  subtitle,
  series,
  totalBarName = "Tổng",
  embedded = false,
}: {
  title: string;
  subtitle?: string;
  series: DashboardDeepHourlySeries;
  totalBarName?: string;
  embedded?: boolean;
}) {
  const showRoleStack = series.rows.some((r) => r.students > 0 || r.teachers > 0);
  const peak = series.peakAll;

  return (
    <div
      className={cn(
        "min-w-0",
        embedded ? "" : "rounded-lg border border-slate-200/90 bg-white p-4 shadow-sm"
      )}
    >
      <p className="text-sm font-semibold text-slate-800">{title}</p>
      {subtitle ? <p className="text-xs text-slate-500">{subtitle}</p> : null}
      {peak ? (
        <p className="mt-1 text-sm text-slate-600">
          Đỉnh {String(peak.hour).padStart(2, "0")}h · {peak.count.toLocaleString("vi-VN")}
        </p>
      ) : (
        <p className="mt-1 text-sm text-slate-400">Không có dữ liệu</p>
      )}
      <ResponsiveContainer width="100%" height={embedded ? 200 : 220}>
        <BarChart data={series.rows} margin={{ top: 10, right: 8, left: 4, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
          <XAxis dataKey="label" tick={{ fontSize: 12 }} interval={2} stroke="#94a3b8" />
          <YAxis width={36} tick={{ fontSize: 12 }} stroke="#94a3b8" allowDecimals={false} />
          <Tooltip
            contentStyle={TOOLTIP_STYLE}
            formatter={(value) =>
              typeof value === "number" ? value.toLocaleString("vi-VN") : String(value ?? 0)
            }
          />
          <Legend wrapperStyle={{ fontSize: 13, paddingTop: 4 }} />
          {showRoleStack ? (
            <>
              <Bar dataKey="students" name="Học sinh" stackId="role" fill="#0ea5e9" />
              <Bar dataKey="teachers" name="Giáo viên" stackId="role" fill="#a855f7" />
            </>
          ) : (
            <Bar dataKey="all" name={totalBarName} fill="#64748b" radius={[2, 2, 0, 0]} />
          )}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function needArrayBucketCount(stats: DashboardDeepNeedArrayStats, label: string): number {
  return stats.lengthBuckets.find((b) => b.label === label)?.count ?? 0;
}

function parseModelsFromText(raw: string): string[] {
  const lines = raw
    .split(/\r?\n/)
    .flatMap((line) => line.split(","))
    .map((line) => line.trim())
    .filter(Boolean);
  const unique: string[] = [];
  for (const model of lines) {
    if (!unique.includes(model)) {
      unique.push(model);
    }
  }
  return unique;
}

/** 3 phần: 0–3 (trống + 1 + 2–3 mục), 4–6, 7+ — mỗi doc tiến độ đếm 1 lần */
function needAssignPieSlices(stats: DashboardDeepNeedArrayStats): { name: string; value: number }[] {
  const b1 = needArrayBucketCount(stats, "1");
  const b23 = needArrayBucketCount(stats, "2–3");
  const b46 = needArrayBucketCount(stats, "4–6");
  const b7 = needArrayBucketCount(stats, "7+");
  const zeroToThree = stats.docsMissingOrEmpty + b1 + b23;
  return [
    { name: "0–3", value: zeroToThree },
    { name: "4–6", value: b46 },
    { name: "7+", value: b7 },
  ];
}

const NEED_ARRAY_PIE_META = {
  needQuizs: { heading: "Quiz" },
  needSpeakings: { heading: "Speaking" },
} as const;

function NeedArrayPieBlock({
  kind,
  stats,
  embedded = false,
}: {
  kind: keyof typeof NEED_ARRAY_PIE_META;
  stats: DashboardDeepNeedArrayStats;
  embedded?: boolean;
}) {
  const meta = NEED_ARRAY_PIE_META[kind];
  const data = needAssignPieSlices(stats);
  const total = data.reduce((s, d) => s + d.value, 0);
  const positive = data.filter((d) => d.value > 0);

  return (
    <div
      className={cn(
        "min-w-0",
        embedded ? "" : "rounded-lg border border-slate-200/90 bg-white p-4 shadow-sm",
        embedded && "pt-1"
      )}
    >
      <p className="text-sm font-semibold text-slate-800">{meta.heading}</p>
      {total === 0 ? (
        <p className="mt-6 text-center text-sm text-slate-400">Không có doc</p>
      ) : (
        <ResponsiveContainer width="100%" height={embedded ? 240 : 260}>
          <PieChart>
            <Pie
              data={positive.length > 0 ? positive : data}
              dataKey="value"
              nameKey="name"
              cx="50%"
              cy="50%"
              innerRadius={52}
              outerRadius={92}
              paddingAngle={2}
              labelLine={false}
              label={({ name, percent }) => `${name} ${((percent ?? 0) * 100).toFixed(0)}%`}
            >
              {(positive.length > 0 ? positive : data).map((d) => (
                <Cell key={d.name} fill={NEED_ASSIGN_SLICE_FILL[d.name] ?? "#94a3b8"} />
              ))}
            </Pie>
            <Tooltip
              contentStyle={TOOLTIP_STYLE}
              formatter={(v) => (typeof v === "number" ? v.toLocaleString("vi-VN") : String(v ?? ""))}
            />
            <Legend wrapperStyle={{ fontSize: 13, paddingTop: 8 }} />
          </PieChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}

const HS_FIELD_TABLE_TH =
  "border border-slate-200 bg-slate-50 px-2 py-2 text-left text-xs font-semibold text-slate-800";
const HS_FIELD_TABLE_TD = "border border-slate-200 px-2 py-2 text-sm tabular-nums text-slate-800";
const HS_FIELD_TABLE_TD_TEXT = "border border-slate-200 px-2 py-2 text-sm text-slate-700";

function UserFieldDistributionsGrid({ u }: { u: DashboardDeepUserFieldStats }) {
  const nSample = u.studentsSampled;
  const ratioMean = u.vocabXsRatioPercentSummary != null ? u.vocabXsRatioPercentSummary.mean : undefined;

  const numericFields: {
    label: string;
    fieldKey: string;
    summary: DashboardDeepNumericSummary | null;
    decimals: number;
  }[] = [
    {
      label: USER_FIELD_BLOCK_TITLE["timesVocabXS / timesVocab"],
      fieldKey: "timesVocabXS / timesVocab",
      summary: u.vocabXsRatioPercentSummary,
      decimals: 1,
    },
    {
      label: USER_FIELD_BLOCK_TITLE.speakingAccuracy,
      fieldKey: "speakingAccuracy",
      summary: u.speakingAccuracySummary,
      decimals: 2,
    },
    {
      label: USER_FIELD_BLOCK_TITLE.totalBanhRan,
      fieldKey: "totalBanhRan",
      summary: u.totalBanhRanSummary,
      decimals: 0,
    },
    {
      label: USER_FIELD_BLOCK_TITLE.loginCount,
      fieldKey: "loginCount",
      summary: u.loginCountSummary,
      decimals: 0,
    },
  ];

  return (
    <div className="overflow-hidden rounded-lg border border-slate-200/90 bg-white shadow-sm">
      <div className="border-b border-slate-100 bg-slate-50/70 px-4 py-3">
        <p className="text-sm text-slate-600">
          n ={" "}
          <span className="font-semibold tabular-nums text-slate-800">{nSample.toLocaleString("vi-VN")}</span>
          {ratioMean !== undefined ? (
            <span className="text-slate-500"> · TB XS/vocab {fmtNum(ratioMean, 2)}%</span>
          ) : null}
        </p>
      </div>

      <div className="space-y-5 overflow-x-auto px-4 py-4">
        <div>
          <p className="mb-3 text-sm font-semibold text-slate-800">Số</p>
          <table className="w-full min-w-[560px] border-collapse">
            <thead>
              <tr>
                <th className={HS_FIELD_TABLE_TH}>Trường</th>
                <th className={cn(HS_FIELD_TABLE_TH, "text-right")}>Max</th>
                <th className={cn(HS_FIELD_TABLE_TH, "text-right")}>TB</th>
                <th className={cn(HS_FIELD_TABLE_TH, "text-right")}>Med</th>
                <th className={cn(HS_FIELD_TABLE_TH, "text-right")}>Mod</th>
                <th className={cn(HS_FIELD_TABLE_TH, "text-right")}>n</th>
              </tr>
            </thead>
            <tbody>
              {numericFields.map((row) => (
                <tr key={row.fieldKey}>
                  <td className={HS_FIELD_TABLE_TD_TEXT}>{row.label}</td>
                  {!row.summary ? (
                    <td colSpan={5} className={cn(HS_FIELD_TABLE_TD_TEXT, "text-center text-slate-400")}>
                      —
                    </td>
                  ) : (
                    <>
                      <td className={cn(HS_FIELD_TABLE_TD, "text-right")}>
                        {fmtNum(row.summary.max, row.decimals)}
                      </td>
                      <td className={cn(HS_FIELD_TABLE_TD, "text-right")}>
                        {fmtNum(row.summary.mean, row.decimals)}
                      </td>
                      <td className={cn(HS_FIELD_TABLE_TD, "text-right")}>
                        {fmtNum(row.summary.median, row.decimals)}
                      </td>
                      <td className={cn(HS_FIELD_TABLE_TD, "text-right")}>
                        {fmtNum(row.summary.mode, row.decimals)}
                      </td>
                      <td className={cn(HS_FIELD_TABLE_TD, "text-right")}>
                        {row.summary.n.toLocaleString("vi-VN")}
                      </td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="border-t border-slate-100 pt-5">
          <div className="grid gap-6 lg:grid-cols-2 lg:gap-0 lg:divide-x lg:divide-slate-100">
            <div className="min-w-0 lg:pr-6">
              <HsFieldPieBlock
                embedded
                humanTitle={USER_FIELD_BLOCK_TITLE.streakCount}
                data={[
                  { name: "≤ 7", value: u.streakLte7 },
                  { name: "> 7", value: u.streakGt7 },
                ]}
                sliceFill={HS_STREAK_PIE_FILL}
              />
            </div>
            <div className="min-w-0 lg:pl-6">
              <HsFieldPieBlock
                embedded
                humanTitle={USER_FIELD_BLOCK_TITLE.lastDeviceType}
                data={u.lastDeviceType.map((r) => ({ name: r.label, value: r.count }))}
                sliceFill={(_, i) => HS_DEVICE_PIE_PALETTE[i % HS_DEVICE_PIE_PALETTE.length]}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

const DEEP_STATS_DETAILS_SUMMARY =
  "flex cursor-pointer list-none items-center justify-between gap-3 rounded-lg px-4 py-3 " +
  "text-sm text-slate-700 hover:bg-slate-100/80 group-open:rounded-b-none group-open:border-b group-open:border-slate-100 group-open:bg-white " +
  "[&::-webkit-details-marker]:hidden";

const ATT_BAR_PRESENT = "#10b981";
const ATT_BAR_LATE = "#f59e0b";
const ATT_BAR_ABSENT = "#94a3b8";

function attendanceShortLabel(name: string, max = 16): string {
  const t = name.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
}

/** Tỷ lệ toàn hệ thống: một thanh + số gọn. */
function AttendanceSystemBar({ s }: { s: DashboardAttendanceInsights["system"] }) {
  const t = s.totalMarks;
  if (t <= 0) {
    return <p className="text-xs text-slate-400">Chưa có ô điểm danh trong tháng.</p>;
  }
  const p = (s.present / t) * 100;
  const l = (s.late / t) * 100;
  const a = (s.absent / t) * 100;
  const fmt = (n: number) => n.toLocaleString("vi-VN");
  return (
    <div className="space-y-2">
      <div className="flex h-3 w-full max-w-xl overflow-hidden rounded-md bg-slate-100 ring-1 ring-slate-200/80">
        {p > 0 ? (
          <div
            className="h-full min-w-0 bg-emerald-500 transition-[width] duration-300"
            style={{ width: `${p}%` }}
            title={`Có mặt ${fmt(s.present)}`}
          />
        ) : null}
        {l > 0 ? (
          <div
            className="h-full min-w-0 bg-amber-500 transition-[width] duration-300"
            style={{ width: `${l}%` }}
            title={`Trễ ${fmt(s.late)}`}
          />
        ) : null}
        {a > 0 ? (
          <div
            className="h-full min-w-0 bg-slate-400 transition-[width] duration-300"
            style={{ width: `${a}%` }}
            title={`Vắng ${fmt(s.absent)}`}
          />
        ) : null}
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-600">
        <span className="inline-flex items-center gap-1.5 tabular-nums">
          <span className="h-2 w-2 shrink-0 rounded-sm bg-emerald-500" aria-hidden />
          CM <span className="font-semibold text-slate-900">{fmt(s.present)}</span>
          <span className="text-slate-400">({Math.round(p)}%)</span>
        </span>
        <span className="inline-flex items-center gap-1.5 tabular-nums">
          <span className="h-2 w-2 shrink-0 rounded-sm bg-amber-500" aria-hidden />
          Trễ <span className="font-semibold text-slate-900">{fmt(s.late)}</span>
          <span className="text-slate-400">({Math.round(l)}%)</span>
        </span>
        <span className="inline-flex items-center gap-1.5 tabular-nums">
          <span className="h-2 w-2 shrink-0 rounded-sm bg-slate-400" aria-hidden />
          Vắng <span className="font-semibold text-slate-900">{fmt(s.absent)}</span>
          <span className="text-slate-400">({Math.round(a)}%)</span>
        </span>
        <span className="text-slate-400">
          · Σ <span className="font-semibold text-slate-700">{fmt(t)}</span>
        </span>
      </div>
    </div>
  );
}

function AttendanceScanBody({ data }: { data: DashboardAttendanceInsights }) {
  const s = data.system;

  const classStackRows = useMemo(
    () =>
      data.byClass.map((r) => ({
        name: attendanceShortLabel(r.className, 18),
        fullName: r.className,
        classId: r.classId,
        present: r.present,
        late: r.late,
        absent: r.absent,
      })),
    [data.byClass]
  );

  const chartH = Math.min(360, Math.max(140, 32 + classStackRows.length * 32));

  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-slate-200/90 bg-white p-3 shadow-sm sm:p-4">
        <AttendanceSystemBar s={s} />
      </div>

      <div className="rounded-lg border border-slate-200/90 bg-white p-3 shadow-sm sm:p-4">
        {classStackRows.length === 0 ? (
          <p className="py-6 text-center text-sm text-slate-400">Không có lớp có dữ liệu.</p>
        ) : (
          <ResponsiveContainer width="100%" height={chartH}>
            <BarChart
              layout="vertical"
              data={classStackRows}
              margin={{ left: 4, right: 12, top: 4, bottom: 4 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} />
              <XAxis type="number" tick={CHART_AXIS_TICK} stroke="#cbd5e1" allowDecimals={false} />
              <YAxis
                type="category"
                dataKey="name"
                width={108}
                tick={{ fontSize: 11, fill: "#64748b" }}
                stroke="#94a3b8"
                interval={0}
              />
              <Tooltip
                contentStyle={TOOLTIP_STYLE}
                formatter={(value, name) => [
                  typeof value === "number" ? value.toLocaleString("vi-VN") : String(value ?? 0),
                  String(name),
                ]}
                labelFormatter={(_, payload) => {
                  const p = payload?.[0]?.payload as { fullName?: string; classId?: string } | undefined;
                  if (!p) return "";
                  return p.fullName ? `${p.fullName} (${p.classId})` : String(p.classId ?? "");
                }}
              />
              <Legend wrapperStyle={{ fontSize: 12, paddingTop: 4 }} />
              <Bar dataKey="present" name="Có mặt" stackId="st" fill={ATT_BAR_PRESENT} barSize={14} />
              <Bar dataKey="late" name="Trễ" stackId="st" fill={ATT_BAR_LATE} barSize={14} />
              <Bar dataKey="absent" name="Vắng" stackId="st" fill={ATT_BAR_ABSENT} barSize={14} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}

function UsersClassesScanBody({ data }: { data: DashboardDeepUsersClassesInsights }) {
  const b = data.behavior;
  const u = data.users;
  const c = data.classes;
  return (
    <div className="space-y-4">
      <DeepScanOverviewCharts u={u} c={c} />
      <UserFieldDistributionsGrid u={b.userFields} />
    </div>
  );
}

function BookProgressScanBody({ data }: { data: DashboardDeepBookProgressInsights }) {
  const b = data.behavior;
  const hourlyBlocks: {
    key: string;
    title: string;
    series: typeof b.speakingSubmitByHour;
    totalBarName?: string;
  }[] = [
    {
      key: "speak",
      title: "Nộp speaking",
      series: b.speakingSubmitByHour,
      totalBarName: "HS",
    },
    {
      key: "quiz",
      title: "Làm quiz",
      series: b.quizAttemptByHour,
      totalBarName: "HS",
    },
    {
      key: "graded",
      title: "Chấm speaking",
      series: b.speakingGradedByHour,
    },
  ];

  return (
    <div className="space-y-4">
      <DualTrendCharts
        isLoading={false}
        left={{
          title: "Quiz · lastAttempt",
          data: data.quizAttemptsLast7Days,
          stroke: "#7c3aed",
          tooltipLabel: "Lượt",
        }}
        right={{
          title: "Speaking · lastSubmitted",
          data: data.speakingSubmissionsLast7DaysFull,
          stroke: "#059669",
          tooltipLabel: "Lượt",
        }}
      />
      <div className="rounded-lg border border-slate-200/90 bg-white p-4 shadow-sm">
        {hourlyBlocks.map((block, i) => (
          <div key={block.key} className={cn(i > 0 && "mt-4 border-t border-slate-100 pt-4")}>
            <HourlyVietnamBarChart
              embedded
              title={block.title}
              series={block.series}
              totalBarName={block.totalBarName}
            />
          </div>
        ))}
      </div>
      <div className="rounded-lg border border-slate-200/90 bg-white p-4 shadow-sm">
          <div className="grid gap-6 lg:grid-cols-2 lg:gap-0 lg:divide-x lg:divide-slate-100">
            <div className="min-w-0 lg:pr-6">
              <NeedArrayPieBlock embedded kind="needQuizs" stats={b.needQuizs} />
            </div>
            <div className="min-w-0 lg:pl-6">
              <NeedArrayPieBlock embedded kind="needSpeakings" stats={b.needSpeakings} />
            </div>
          </div>
        </div>
    </div>
  );
}

function DashboardRefreshButton({
  loading,
  disabled,
  onClick,
}: {
  loading: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      disabled={disabled}
      onClick={onClick}
      className="inline-flex items-center gap-1.5"
    >
      <FiRefreshCw className={cn("h-3.5 w-3.5 shrink-0", loading && "animate-spin")} />
      Refresh
    </Button>
  );
}

export default function AdminDashboard() {
  const { signOutApp } = useAuth();
  const [isScanning, setIsScanning] = useState(false);
  const [scanCollectionInput, setScanCollectionInput] = useState("users");
  const [scanFieldsInput, setScanFieldsInput] = useState("");
  const [usersClassesOpen, setUsersClassesOpen] = useState(false);
  const [bookProgressOpen, setBookProgressOpen] = useState(false);
  const [attendanceOpen, setAttendanceOpen] = useState(false);
  const [settingsModelsInput, setSettingsModelsInput] = useState("");
  const [isLoadingSettingsModels, setIsLoadingSettingsModels] = useState(false);
  const [isSavingSettingsModels, setIsSavingSettingsModels] = useState(false);
  const [isBumpingSettingsVersion, setIsBumpingSettingsVersion] = useState(false);
  const [isTestingSettingsModels, setIsTestingSettingsModels] = useState(false);
  const [modelHealthResults, setModelHealthResults] = useState<ModelHealthResult[]>([]);
  const [aiTtsModel, setAiTtsModel] = useState(DEFAULT_TTS_MODEL);
  const [aiTtsVoice, setAiTtsVoice] = useState(DEFAULT_TTS_VOICE);
  const [aiDocumentModelsInput, setAiDocumentModelsInput] = useState("");
  const [aiGradeModelsInput, setAiGradeModelsInput] = useState("");
  const [isLoadingAiSettings, setIsLoadingAiSettings] = useState(false);
  const [isSavingAiSettings, setIsSavingAiSettings] = useState(false);

  const {
    data: attData,
    isLoading: attLoading,
    isError: attIsError,
    refetch: refetchAtt,
    error: attQueryError,
  } = useDashboardAttendanceInsight(attendanceOpen);

  const {
    data: ucData,
    isLoading: ucLoading,
    isError: ucIsError,
    refetch: refetchUc,
    error: ucQueryError,
  } = useDashboardDeepUsersClasses(usersClassesOpen);

  const {
    data: bpData,
    isLoading: bpLoading,
    isError: bpIsError,
    refetch: refetchBp,
    error: bpQueryError,
  } = useDashboardDeepBookProgress(bookProgressOpen);

  useEffect(() => {
    const loadSettingsModels = async () => {
      try {
        setIsLoadingSettingsModels(true);
        const settingsRef = doc(db, "settings", "models");
        const snap = await getDoc(settingsRef);
        if (!snap.exists()) {
          setSettingsModelsInput("gemini-3-flash-preview");
          return;
        }
        const data = snap.data() as { models?: unknown };
        const models = Array.isArray(data.models)
          ? data.models
              .filter((value): value is string => typeof value === "string")
              .map((value) => value.trim())
              .filter(Boolean)
          : [];
        setSettingsModelsInput(models.join("\n"));
      } catch (error) {
        console.error("Lỗi load settings/models:", error);
        toast.error("Không tải được settings models.");
      } finally {
        setIsLoadingSettingsModels(false);
      }
    };
    void loadSettingsModels();
  }, []);

  useEffect(() => {
    const loadAiSettings = async () => {
      try {
        setIsLoadingAiSettings(true);
        const aiRef = doc(db, "settings", "ai");
        const snap = await getDoc(aiRef);
        const form = aiSettingsToForm(
          parseAiSettingsFromFirestore(
            snap.exists() ? (snap.data() as Record<string, unknown>) : undefined
          )
        );
        setAiTtsModel(form.ttsModel);
        setAiTtsVoice(form.ttsVoice);
        setAiDocumentModelsInput(form.documentModelsText);
        setAiGradeModelsInput(form.gradeModelsText);
      } catch (error) {
        console.error("Lỗi load settings/ai:", error);
        toast.error("Không tải được cấu hình AI.");
      } finally {
        setIsLoadingAiSettings(false);
      }
    };
    void loadAiSettings();
  }, []);

  const handleSaveAiSettings = async () => {
    try {
      setIsSavingAiSettings(true);
      const payload = formToAiSettings({
        ttsModel: aiTtsModel,
        ttsVoice: aiTtsVoice,
        documentModelsText: aiDocumentModelsInput,
        gradeModelsText: aiGradeModelsInput,
      });
      const aiRef = doc(db, "settings", "ai");
      await setDoc(
        aiRef,
        {
          ...payload,
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
      const form = aiSettingsToForm(payload);
      setAiTtsModel(form.ttsModel);
      setAiTtsVoice(form.ttsVoice);
      setAiDocumentModelsInput(form.documentModelsText);
      setAiGradeModelsInput(form.gradeModelsText);
      toast.success("Đã lưu cấu hình AI.");
    } catch (error) {
      console.error("Lỗi save settings/ai:", error);
      toast.error("Lưu cấu hình AI thất bại.");
    } finally {
      setIsSavingAiSettings(false);
    }
  };

  const handleSaveSettingsModels = async () => {
    const models = parseModelsFromText(settingsModelsInput);
    if (models.length === 0) {
      toast.error("Nhập ít nhất 1 model.");
      return;
    }

    try {
      setIsSavingSettingsModels(true);
      const modelsRef = doc(db, "settings", "models");

      await setDoc(
        modelsRef,
        {
          models,
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );

      setSettingsModelsInput(models.join("\n"));
      toast.success("Đã lưu models.");
    } catch (error) {
      console.error("Lỗi save settings/models:", error);
      toast.error("Lưu settings models thất bại.");
    } finally {
      setIsSavingSettingsModels(false);
    }
  };

  const handleBumpSettingsVersion = async () => {
    try {
      setIsBumpingSettingsVersion(true);
      const versionRef = doc(db, "settings", "version");
      const versionSnap = await getDoc(versionRef);
      const rawVersion = versionSnap.exists() ? (versionSnap.data() as { version?: unknown }).version : 0;
      const currentVersion =
        typeof rawVersion === "number"
          ? rawVersion
          : typeof rawVersion === "string"
            ? Number(rawVersion)
            : 0;
      const nextVersion = Number.isFinite(currentVersion) ? currentVersion + 1 : 1;

      await setDoc(
        versionRef,
        {
          version: nextVersion,
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
      toast.success(`Đã tăng version lên ${nextVersion}.`);
    } catch (error) {
      console.error("Lỗi tăng settings/version:", error);
      toast.error("Tăng version thất bại.");
    } finally {
      setIsBumpingSettingsVersion(false);
    }
  };

  const handleTestSettingsModelsHealth = async () => {
    const models = parseModelsFromText(settingsModelsInput);
    if (models.length === 0) {
      toast.error("Nhập ít nhất 1 model để test health.");
      return;
    }

    try {
      const user = auth.currentUser;
      if (!user) {
        toast.error("Vui lòng đăng nhập.");
        return;
      }
      const idToken = await user.getIdToken();

      setIsTestingSettingsModels(true);
      setModelHealthResults([]);
      const response = await fetch("/api/admin/speaking/models-health", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({ models }),
      });
      const data = (await response.json()) as {
        error?: string;
        results?: ModelHealthResult[];
      };
      if (!response.ok) {
        throw new Error(data.error || "Test health thất bại.");
      }
      setModelHealthResults(Array.isArray(data.results) ? data.results : []);
      toast.success("Đã test health models.");
    } catch (error) {
      console.error("Lỗi test model health:", error);
      toast.error(error instanceof Error ? error.message : "Test model health thất bại.");
    } finally {
      setIsTestingSettingsModels(false);
    }
  };

  const handleScanUsers = async () => {
    const collectionName = scanCollectionInput.trim();
    if (!collectionName) {
      toast.error("Nhập tên collection.");
      return;
    }

    const fieldsToDelete = Array.from(
      new Set(
        scanFieldsInput
          .split(",")
          .map((field) => field.trim())
          .filter(Boolean)
      )
    );

    if (fieldsToDelete.length === 0) {
      toast.error("Nhập ít nhất 1 field.");
      return;
    }

    if (
      !window.confirm(
        `Xóa field trên toàn bộ document trong collection "${collectionName}"?`
      )
    )
      return;
    try {
      setIsScanning(true);
      const collRef = collection(db, collectionName);
      const snapshot = await getDocs(collRef);
      let updateCount = 0;

      for (const docSnap of snapshot.docs) {
        const data = docSnap.data();
        const existingFields = fieldsToDelete.filter((field) => field in data);

        if (existingFields.length > 0) {
          const updateData = existingFields.reduce<Record<string, ReturnType<typeof deleteField>>>(
            (acc, field) => {
              acc[field] = deleteField();
              return acc;
            },
            {}
          );

          await updateDoc(doc(db, collectionName, docSnap.id), updateData);
          updateCount++;
        }
      }
      toast.success(
        `${updateCount} document · "${collectionName}" · ${fieldsToDelete.length} field`
      );
    } catch (error) {
      console.error("Lỗi khi Clear fields:", error);
      toast.error("Lỗi quét collection.");
    } finally {
      setIsScanning(false);
    }
  };

  const statsLoading = usersClassesOpen && ucLoading;
  const statsReady = !!ucData;

  const stats: KpiTileProps[] = [
    {
      label: "ĐK tháng",
      value: statsReady ? ucData.users.newUsersThisMonth : null,
      isLoading: statsLoading,
      accent: "blue",
    },
    {
      label: "Lớp",
      value: statsReady ? ucData.classes.docCount : null,
      isLoading: statsLoading,
      accent: "green",
    },
    {
      label: "Giáo viên",
      value: statsReady ? ucData.users.teachers : null,
      isLoading: statsLoading,
      accent: "purple",
    },
    {
      label: "Học sinh",
      value: statsReady ? ucData.users.students : null,
      isLoading: statsLoading,
      accent: "orange",
    },
  ];

  return (
    <div className="mx-auto w-full max-w-6xl space-y-5 px-3 py-4 sm:px-4 sm:py-5">
      <motion.header
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.18 }}
        className="flex items-center justify-between gap-2"
      >
        <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Dashboard</h1>
        <div className="flex flex-wrap items-center justify-end gap-1.5">
          <Button
            type="button"
            variant="destructive"
            size="icon"
            onClick={() => signOutApp()}
            className="h-8 w-8 shrink-0"
            aria-label="Thoát"
            title="Thoát"
          >
            <FiLogOut className="h-3.5 w-3.5" />
          </Button>
        </div>
      </motion.header>

      <div className="space-y-4">
        
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.18, delay: 0.02 }}
          className="grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-4"
        >
          {stats.map((stat) => (
            <KpiTile key={stat.label} {...stat} />
          ))}
        </motion.div>

        <details
          className="group rounded-lg border border-slate-200 bg-slate-50/50 open:bg-white open:shadow-sm"
          open={attendanceOpen}
          onToggle={(e) => setAttendanceOpen(e.currentTarget.open)}
        >
          <summary className={DEEP_STATS_DETAILS_SUMMARY}>
            <span className="font-medium">Điểm danh</span>
            <FiChevronDown className="h-3.5 w-3.5 shrink-0 text-slate-400 transition-transform group-open:rotate-180" />
          </summary>
          <div className="space-y-2 border-t border-slate-100 bg-white px-4 py-3 rounded-b-lg">
            <DashboardRefreshButton
              loading={attLoading}
              disabled={attLoading || !attendanceOpen}
              onClick={() => void refetchAtt()}
            />
            {attendanceOpen && attLoading ? (
              <div className="h-20 animate-pulse rounded-lg bg-slate-100" aria-hidden />
            ) : null}
            {attendanceOpen && attIsError ? (
              <p className="text-sm text-red-600">
                Lỗi: {attQueryError instanceof Error ? attQueryError.message : "—"}
              </p>
            ) : null}
            {attData ? <AttendanceScanBody data={attData} /> : null}
          </div>
        </details>

        <details
          className="group rounded-lg border border-slate-200 bg-slate-50/50 open:bg-white open:shadow-sm"
          open={usersClassesOpen}
          onToggle={(e) => setUsersClassesOpen(e.currentTarget.open)}
        >
          <summary className={DEEP_STATS_DETAILS_SUMMARY}>
            <span className="font-medium">Users &amp; lớp</span>
            <FiChevronDown className="h-3.5 w-3.5 shrink-0 text-slate-400 transition-transform group-open:rotate-180" />
          </summary>
          <div className="space-y-2 border-t border-slate-100 bg-white px-4 py-3 rounded-b-lg">
            <DashboardRefreshButton
              loading={ucLoading}
              disabled={ucLoading || !usersClassesOpen}
              onClick={() => void refetchUc()}
            />
            {usersClassesOpen && ucLoading ? (
              <div className="h-16 animate-pulse rounded-lg bg-slate-100" aria-hidden />
            ) : null}
            {usersClassesOpen && ucIsError ? (
              <p className="text-sm text-red-600">
                Lỗi: {ucQueryError instanceof Error ? ucQueryError.message : "—"}
              </p>
            ) : null}
            {ucData ? <UsersClassesScanBody data={ucData} /> : null}
          </div>
        </details>

        <details
          className="group rounded-lg border border-slate-200 bg-slate-50/50 open:bg-white open:shadow-sm"
          open={bookProgressOpen}
          onToggle={(e) => setBookProgressOpen(e.currentTarget.open)}
        >
          <summary className={DEEP_STATS_DETAILS_SUMMARY}>
            <span className="font-medium">userBookProgress</span>
            <FiChevronDown className="h-3.5 w-3.5 shrink-0 text-slate-400 transition-transform group-open:rotate-180" />
          </summary>
          <div className="space-y-2 border-t border-slate-100 bg-white px-4 py-3 rounded-b-lg">
            <div className="flex flex-wrap items-center gap-2">
              <DashboardRefreshButton
                loading={bpLoading}
                disabled={bpLoading || !bookProgressOpen}
                onClick={() => void refetchBp()}
              />
            </div>
            {bookProgressOpen && bpLoading ? (
              <div className="h-16 animate-pulse rounded-lg bg-slate-100" aria-hidden />
            ) : null}
            {bookProgressOpen && bpIsError ? (
              <p className="text-sm text-red-600">
                Lỗi: {bpQueryError instanceof Error ? bpQueryError.message : "—"}
              </p>
            ) : null}
            {bpData ? <BookProgressScanBody data={bpData} /> : null}
          </div>
        </details>

        <details className="group rounded-lg border border-slate-200 bg-slate-50/50 open:bg-white open:shadow-sm">
          <summary className={DEEP_STATS_DETAILS_SUMMARY}>
            <span className="font-medium">Settings &amp; AI</span>
            <FiChevronDown className="h-3.5 w-3.5 shrink-0 text-slate-400 transition-transform group-open:rotate-180" />
          </summary>
          <div className="space-y-3 border-t border-slate-100 bg-white px-4 py-3 rounded-b-lg">
            <p className="text-xs text-slate-500">
              Nhập mỗi model 1 dòng
            </p>
            <div className="relative">
              <textarea
                value={settingsModelsInput}
                onChange={(e) => setSettingsModelsInput(e.target.value)}
                placeholder="gemini-3.1-flash-lite-preview&#10;gemini-3.1-flash-preview&#10;gemini-3-flash-preview"
                spellCheck={false}
                rows={7}
                className={cn(
                  "w-full rounded-md border border-slate-200 bg-slate-50/50 px-3 py-2 pr-11 text-sm font-mono",
                  "focus:border-sky-400 focus:bg-white focus:outline-none focus:ring-1 focus:ring-sky-200/60"
                )}
              />
              <PasteButton
                onPaste={setSettingsModelsInput}
                className="absolute right-1 top-1 translate-y-0"
              />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                size="sm"
                className="shrink-0"
                disabled={
                  isLoadingSettingsModels ||
                  isSavingSettingsModels ||
                  isBumpingSettingsVersion ||
                  isTestingSettingsModels
                }
                onClick={handleSaveSettingsModels}
              >
                {isSavingSettingsModels ? "Đang lưu…" : "Save models"}
              </Button>
              <Button
                type="button"
                size="sm"
                className="shrink-0"
                disabled={
                  isLoadingSettingsModels ||
                  isSavingSettingsModels ||
                  isBumpingSettingsVersion ||
                  isTestingSettingsModels
                }
                onClick={() => void handleBumpSettingsVersion()}
              >
                {isBumpingSettingsVersion ? "Đang tăng version…" : "Tăng version"}
              </Button>
              <Button
                type="button"
                size="sm"
                className="shrink-0"
                disabled={
                  isLoadingSettingsModels ||
                  isSavingSettingsModels ||
                  isBumpingSettingsVersion ||
                  isTestingSettingsModels
                }
                onClick={() => void handleTestSettingsModelsHealth()}
              >
                {isTestingSettingsModels ? "Đang test…" : "Test health"}
              </Button>
            </div>
            {modelHealthResults.length > 0 ? (
              <div className="overflow-x-auto rounded-md border border-slate-200">
                <table className="min-w-full border-collapse text-sm">
                  <thead>
                    <tr className="bg-slate-50 text-slate-700">
                      <th className="border-b border-slate-200 px-3 py-2 text-left font-semibold">Model</th>
                      <th className="border-b border-slate-200 px-3 py-2 text-left font-semibold">Status</th>
                      <th className="border-b border-slate-200 px-3 py-2 text-left font-semibold">Latency</th>
                      <th className="border-b border-slate-200 px-3 py-2 text-left font-semibold">Message</th>
                    </tr>
                  </thead>
                  <tbody>
                    {modelHealthResults.map((result) => (
                      <tr key={result.model} className="align-top">
                        <td className="border-b border-slate-100 px-3 py-2 font-mono text-xs text-slate-700">
                          {result.model}
                        </td>
                        <td className="border-b border-slate-100 px-3 py-2">
                          <span
                            className={cn(
                              "inline-flex rounded-full px-2 py-0.5 text-xs font-semibold",
                              result.ok ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700"
                            )}
                          >
                            {result.ok ? "SỐNG" : "LỖI"}
                          </span>
                        </td>
                        <td className="border-b border-slate-100 px-3 py-2 tabular-nums text-slate-700">
                          {result.durationMs}ms
                        </td>
                        <td className="border-b border-slate-100 px-3 py-2 text-slate-600">
                          {result.ok
                            ? "OK"
                            : `${result.errorCode ?? ""} ${result.errorStatus ?? ""} ${result.errorMessage ?? ""}`.trim()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}

            <div className="space-y-4 border-t border-dashed border-slate-200 pt-3">
            <p className="text-xs text-slate-500">
              Cấu hình model trang AI học sinh. OCR + writing dùng Document models (thử lần lượt khi nghẽn); để trống = dùng Settings models ở trên. Chấm speaking: để trống grade models cũng dùng Settings models.
            </p>
            {isLoadingAiSettings ? (
              <div className="h-16 animate-pulse rounded-lg bg-slate-100" aria-hidden />
            ) : (
              <>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="block text-sm">
                    <span className="mb-1 block font-medium text-slate-700">TTS (text → MP3)</span>
                    <input
                      type="text"
                      value={aiTtsModel}
                      onChange={(e) => setAiTtsModel(e.target.value)}
                      placeholder={DEFAULT_TTS_MODEL}
                      spellCheck={false}
                      className="w-full rounded-md border border-slate-200 bg-slate-50/50 px-3 py-2 font-mono text-sm focus:border-sky-400 focus:outline-none focus:ring-1 focus:ring-sky-200/60"
                    />
                  </label>
                  <label className="block text-sm">
                    <span className="mb-1 block font-medium text-slate-700">Giọng TTS</span>
                    <select
                      value={aiTtsVoice}
                      onChange={(e) => setAiTtsVoice(e.target.value)}
                      className="w-full rounded-md border border-slate-200 bg-slate-50/50 px-3 py-2 text-sm focus:border-sky-400 focus:outline-none"
                    >
                      {TTS_VOICES.map((v) => (
                        <option key={v} value={v}>
                          {v}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">
                    Document models (OCR + writing) — mỗi dòng 1 model, thử lần lượt khi nghẽn
                  </label>
                  <textarea
                    value={aiDocumentModelsInput}
                    onChange={(e) => setAiDocumentModelsInput(e.target.value)}
                    placeholder="Để trống = dùng Settings models"
                    spellCheck={false}
                    rows={4}
                    className="w-full rounded-md border border-slate-200 bg-slate-50/50 px-3 py-2 font-mono text-sm focus:border-sky-400 focus:outline-none focus:ring-1 focus:ring-sky-200/60"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">
                    Grade models (chấm bài nói /ai) — mỗi dòng 1 model
                  </label>
                  <textarea
                    value={aiGradeModelsInput}
                    onChange={(e) => setAiGradeModelsInput(e.target.value)}
                    placeholder="Để trống = dùng Settings models"
                    spellCheck={false}
                    rows={4}
                    className="w-full rounded-md border border-slate-200 bg-slate-50/50 px-3 py-2 font-mono text-sm focus:border-sky-400 focus:outline-none focus:ring-1 focus:ring-sky-200/60"
                  />
                </div>
                <Button
                  type="button"
                  size="sm"
                  disabled={isLoadingAiSettings || isSavingAiSettings}
                  onClick={() => void handleSaveAiSettings()}
                >
                  {isSavingAiSettings ? "Đang lưu…" : "Lưu cấu hình AI"}
                </Button>
              </>
            )}
            </div>
          </div>
        </details>

        <details className="group rounded-lg border border-slate-200 bg-slate-50/50 open:bg-white open:shadow-sm">
          <summary className={DEEP_STATS_DETAILS_SUMMARY}>
            <span className="font-medium">Collection</span>
            <FiChevronDown className="h-3.5 w-3.5 shrink-0 text-slate-400 transition-transform group-open:rotate-180" />
          </summary>
          <div className="border-t border-slate-100 bg-white px-4 py-3 rounded-b-lg">
            <div className="flex flex-wrap items-center gap-2">
              <label htmlFor="scan-collection-name" className="sr-only">
                Tên collection
              </label>
              <div className="relative min-w-0 flex-1">
                <input
                  id="scan-collection-name"
                  type="text"
                  value={scanCollectionInput}
                  onChange={(e) => setScanCollectionInput(e.target.value)}
                  placeholder="Collection"
                  autoComplete="off"
                  spellCheck={false}
                  className={cn(
                    "w-full rounded-md border border-slate-200 bg-slate-50/50 px-3 py-2 pr-11 text-sm",
                    "focus:border-sky-400 focus:bg-white focus:outline-none focus:ring-1 focus:ring-sky-200/60"
                  )}
                />
                <PasteButton onPaste={setScanCollectionInput} trimOnPaste />
              </div>
              <label htmlFor="scan-collection-fields" className="sr-only">
                Field cần xóa, cách nhau bằng dấu phẩy
              </label>
              <div className="relative min-w-0 flex-1">
                <input
                  id="scan-collection-fields"
                  type="text"
                  value={scanFieldsInput}
                  onChange={(e) => setScanFieldsInput(e.target.value)}
                  placeholder="field1, field2"
                  autoComplete="off"
                  spellCheck={false}
                  className={cn(
                    "w-full rounded-md border border-slate-200 bg-slate-50/50 px-3 py-2 pr-11 text-sm",
                    "focus:border-sky-400 focus:bg-white focus:outline-none focus:ring-1 focus:ring-sky-200/60"
                  )}
                />
                <PasteButton onPaste={setScanFieldsInput} trimOnPaste />
              </div>
              <Button
                type="button"
                variant="destructive"
                size="sm"
                className="shrink-0"
                disabled={isScanning}
                onClick={handleScanUsers}
              >
                {isScanning ? "…" : "Chạy"}
              </Button>
            </div>
          </div>
        </details>
      </div>
    </div>
  );
}
