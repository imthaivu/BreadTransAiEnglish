"use client";

import { Button } from "@/components/ui/Button";
import { useAuth } from "@/lib/auth/context";
import { IClassMember } from "@/types";
import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import {
  FiUser,
  FiEdit,
  FiMinusCircle,
  FiPlusCircle,
  FiHeart,
  FiCalendar,
  FiCheckCircle,
  FiClock,
  FiUserX,
  FiLoader,
  FiInfo,
  FiCamera,
  FiBookOpen,
} from "react-icons/fi";
import { SafeImage as Image } from "@/components/ui/SafeImage";
import toast from "react-hot-toast";
import { useQueryClient } from "@tanstack/react-query";
import {
  useClassDetails,
  useGrammarTrackingData,
  teacherClassKeys,
} from "../hooks";
import {
  useGlobalPresenceMap,
  type CurrentActivity,
} from "@/modules/presence";
import { readAchievementsFromUser } from "@/modules/user/services";
import { useClassContext } from "../context/ClassContext";
import { appendAdmirationToUser } from "../api/admiration";
import {
  studentKeys,
  useStudent,
  useUpdateStudent,
} from "@/modules/admin/hooks/useStudentManagement";
import { syncClassRank } from "../api/class-rank";
import {
  formatClassRankLabel,
  getStudentRankPosition,
} from "../utils/class-rank";
import { useUpdateClass } from "@/modules/admin/hooks/useClassManagement";
import { getStudentById, UpdateStudentData } from "@/modules/admin/services/student.service";
import { AdminTable, AdminTableColumn, AdminModal } from "@/modules/admin/components/common";
import { Modal } from "@/components/ui/Modal";
import { useForm } from "react-hook-form";
import { GrammarTrackingTable } from "./GrammarTrackingTable";
import { StudentAiCreateButton } from "./StudentAiCreateButton";
import {
  formatPresenceRelativeTime,
  formatPresenceShort,
} from "@/utils/presenceRelativeTime";
import { ProfileAvatarLink } from "@/components/ui/ProfileAvatarLink";
import { cn } from "@/utils";
import { calculateCurrentGrade } from "@/utils/grade";
import {
  toLocalDateKey,
  fetchClassAttendanceMonth,
  saveClassAttendanceDay,
  normalizeAttendanceStatus,
  parseDateKey,
  getAttendanceDayMap,
  type AttendanceStatus,
} from "../api/attendance";

// Helper function to format note text into 2 lines, max 18 chars per line
function formatNoteText(text: string): { line1: string; line2: string } {
  const maxLength = 36; // 2 lines * 18 chars
  const maxLineLength = 18;

  if (text.length <= maxLineLength) {
    return { line1: text, line2: "" };
  }

  if (text.length <= maxLength) {
    const line1 = text.substring(0, maxLineLength);
    const line2 = text.substring(maxLineLength);
    return { line1, line2 };
  }

  // Text is longer than 36 chars, truncate
  const line1 = text.substring(0, maxLineLength);
  const line2 = text.substring(maxLineLength, maxLength - 3) + "...";
  return { line1, line2 };
}

// Component to render note cell with modal editing
function NoteCell({ memberId, student }: { memberId: string, student: any }) {
  const { mutate: updateStudent, isPending: isUpdating } = useUpdateStudent();
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [value, setValue] = useState<string>("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const currentNote = student?.note || "";
  const formattedNote = currentNote ? formatNoteText(currentNote) : { line1: "", line2: "" };

  // Sync value with currentNote when modal opens
  useEffect(() => {
    if (isModalOpen) {
      setValue(currentNote);
      // Focus textarea after modal opens
      setTimeout(() => {
        textareaRef.current?.focus();
      }, 100);
    }
  }, [isModalOpen, currentNote]);

  const handleSave = () => {
    if (value === currentNote) {
      setIsModalOpen(false);
      return; // No change, just close modal
    }

    updateStudent(
      {
        studentId: memberId,
        studentData: { note: value },
      },
      {
        onSuccess: () => {
          setIsModalOpen(false);
          toast.success("Đã cập nhật ghi chú!");
        },
        onError: () => {
          toast.error("Cập nhật ghi chú thất bại!");
          setValue(currentNote); // Reset to original value on error
        },
      }
    );
  };

  const handleCancel = () => {
    setValue(currentNote);
    setIsModalOpen(false);
  };

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsModalOpen(true);
  };

  return (
    <>
      <div
        className="flex items-center gap-1 min-w-0"
        onClick={(e) => e.stopPropagation()}
      >
        <div
          onClick={handleClick}
          className="group relative w-full max-w-[200px] min-w-0 cursor-pointer"
        >
          {currentNote ? (
            <div className="flex items-start gap-1">
              <div className="flex-1 transition-colors">
                <p className="text-sm text-gray-700 group-hover:text-primary dark:text-gray-300 leading-snug">
                  {formattedNote.line1}
                </p>
                {formattedNote.line2 && (
                  <p className="text-sm text-gray-700 group-hover:text-primary dark:text-gray-300 leading-snug">
                    {formattedNote.line2}
                  </p>
                )}
              </div>
              <FiEdit className="w-3 h-3 text-primary opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0 mt-0.5" />
            </div>
          ) : (
            <p className="text-sm text-gray-400 dark:text-gray-500 italic group-hover:text-gray-600 dark:group-hover:text-gray-400 transition-colors">
              + Note
            </p>
          )}
          {/* Tooltip on hover */}
          <div className="absolute z-50 hidden group-hover:block bottom-full left-1/2 -translate-x-1/2 mb-1 px-2 py-1 max-w-xs w-max bg-gray-900 dark:bg-gray-800 text-white text-sm rounded shadow-lg pointer-events-none">
            <div className="whitespace-normal break-words">
              {currentNote || "Thêm ghi chú"}
            </div>
            <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-1 border-4 border-transparent border-t-gray-900 dark:border-t-gray-800"></div>
          </div>
        </div>
      </div>

      {/* Edit Note Modal */}
      <AdminModal
        isOpen={isModalOpen}
        onClose={handleCancel}
        title="Note"
        size="md"
      >
        <div className="space-y-2">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Note
            </label>
            <textarea
              ref={textareaRef}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="Nội dung..."
              rows={5}
              className="w-full px-2 py-1.5 text-base border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-primary bg-white dark:bg-gray-800 resize-y"
              disabled={isUpdating}
            />
          </div>
        </div>
        <div className="flex items-center justify-end gap-2 mt-4">
          <Button
            variant="outline"
            onClick={handleCancel}
            disabled={isUpdating}
          >
            Hủy
          </Button>
          <Button
            variant="primary"
            onClick={handleSave}
            disabled={isUpdating}
          >
            {isUpdating ? "Đang lưu..." : "Lưu"}
          </Button>
        </div>
      </AdminModal>
    </>
  );
}

// Component to render achievements cell with modal editing
function AchievementsCell({ memberId, student }: { memberId: string, student: any }) {
  const { mutate: updateStudent, isPending: isUpdating } = useUpdateStudent();
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [value, setValue] = useState<string>("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const currentAchievements = readAchievementsFromUser(student);
  const formattedAchievements = currentAchievements
    ? formatNoteText(currentAchievements)
    : { line1: "", line2: "" };

  // Sync value with currentAchievements when modal opens
  useEffect(() => {
    if (isModalOpen) {
      setValue(currentAchievements);
      // Focus textarea after modal opens
      setTimeout(() => {
        textareaRef.current?.focus();
      }, 100);
    }
  }, [isModalOpen, currentAchievements]);

  const handleSave = () => {
    if (value === currentAchievements) {
      setIsModalOpen(false);
      return; // No change, just close modal
    }

    updateStudent(
      {
        studentId: memberId,
        studentData: { achievements: value },
      },
      {
        onSuccess: () => {
          setIsModalOpen(false);
          toast.success("Đã cập nhật thành tích!");
        },
        onError: () => {
          toast.error("Cập nhật thành tích thất bại!");
          setValue(currentAchievements); // Reset to original value on error
        },
      }
    );
  };

  const handleCancel = () => {
    setValue(currentAchievements);
    setIsModalOpen(false);
  };

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsModalOpen(true);
  };

  return (
    <>
      <div
        className="flex items-center gap-1 min-w-0"
        onClick={(e) => e.stopPropagation()}
      >
        <div
          onClick={handleClick}
          className="group relative w-full max-w-[200px] min-w-0 cursor-pointer"
        >
          {currentAchievements ? (
            <div className="flex items-start gap-1">
              <div className="flex-1 transition-colors">
                <p className="text-sm text-gray-700 group-hover:text-primary dark:text-gray-300 leading-snug">
                  {formattedAchievements.line1}
                </p>
                {formattedAchievements.line2 && (
                  <p className="text-sm text-gray-700 group-hover:text-primary dark:text-gray-300 leading-snug">
                    {formattedAchievements.line2}
                  </p>
                )}
              </div>
              <FiEdit className="w-3 h-3 text-primary opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0 mt-0.5" />
            </div>
          ) : (
            <p className="text-sm text-gray-400 dark:text-gray-500 italic group-hover:text-gray-600 dark:group-hover:text-gray-400 transition-colors">
              + T.tích
            </p>
          )}
          {/* Tooltip on hover */}
          <div className="absolute z-50 hidden group-hover:block bottom-full left-1/2 -translate-x-1/2 mb-1 px-2 py-1 max-w-xs w-max bg-gray-900 dark:bg-gray-800 text-white text-sm rounded shadow-lg pointer-events-none">
            <div className="whitespace-normal break-words">
              {currentAchievements || "Thêm thành tích"}
            </div>
            <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-1 border-4 border-transparent border-t-gray-900 dark:border-t-gray-800"></div>
          </div>
        </div>
      </div>

      <AdminModal
        isOpen={isModalOpen}
        onClose={handleCancel}
        title="Thành tích"
        size="md"
      >
        <div className="space-y-2">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              T.tích
            </label>
            <textarea
              ref={textareaRef}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="Nội dung..."
              rows={5}
              className="w-full px-2 py-1.5 text-base border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-primary bg-white dark:bg-gray-800 resize-y"
              disabled={isUpdating}
            />
          </div>
        </div>
        <div className="flex items-center justify-end gap-2 mt-4">
          <Button
            variant="outline"
            onClick={handleCancel}
            disabled={isUpdating}
          >
            Hủy
          </Button>
          <Button
            variant="primary"
            onClick={handleSave}
            disabled={isUpdating}
          >
            {isUpdating ? "Đang lưu..." : "Lưu"}
          </Button>
        </div>
      </AdminModal>
    </>
  );
}

function TimesVocabCell({ student }: { student: any }) {
  const n = student?.timesVocab ?? 0;
  return (
    <span className="text-sm font-medium text-gray-800 dark:text-gray-200 tabular-nums">
      {n}
    </span>
  );
}

function getRateTone(rate: number): { numberClass: string; cardClass: string } {
  if (rate >= 80) {
    return {
      numberClass: "text-emerald-600",
      cardClass: "bg-emerald-50 ring-1 ring-emerald-100",
    };
  }
  if (rate >= 50) {
    return {
      numberClass: "text-yellow-500",
      cardClass: "bg-yellow-50 ring-1 ring-yellow-100",
    };
  }
  return {
    numberClass: "text-orange-600",
    cardClass: "bg-orange-50 ring-1 ring-orange-100",
  };
}

function QuizAccuracyCell({ student }: { student: any }) {
  const quizAccuracy = Number((student?.quizAccuracy ?? 50).toFixed(3));
  const tone = getRateTone(quizAccuracy);

  return (
    <div className={`inline-flex items-center rounded px-1.5 py-0.5 text-sm font-semibold ${tone.cardClass}`}>
      <span className={tone.numberClass}>{quizAccuracy}%</span>
    </div>
  );
}

function SpeakingAccuracyCell({ student }: { student: any }) {
  const speakingAccuracy = student?.speakingAccuracy ?? 50;
  const speakingRate = Number(speakingAccuracy.toFixed(3));
  const tone = getRateTone(speakingRate);

  return (
    <div className={`inline-flex items-center rounded px-1.5 py-0.5 text-sm font-semibold ${tone.cardClass}`}>
      <span className={tone.numberClass}>{speakingRate}%</span>
    </div>
  );
}

// Hiển thị lớp hiện tại tính từ năm sinh (theo năm học, mốc tháng 8)
function GradeCell({ student }: { student: any }) {
  const birthYear = typeof student?.birthYear === "number" ? student.birthYear : null;
  const grade = calculateCurrentGrade(birthYear);
  if (!birthYear) {
    return (
      <span className="text-xs text-gray-400 italic" title="Chưa có năm sinh">
        —
      </span>
    );
  }
  return (
    <span
      className="inline-flex items-center rounded bg-blue-50 dark:bg-blue-900/20 px-1.5 py-0.5 text-sm font-semibold text-blue-700 dark:text-blue-300 tabular-nums"
      title={`Năm sinh ${birthYear}`}
    >
      {grade != null ? `Lớp ${grade}` : `—`}
    </span>
  );
}

// Tính số ngày tới ngày kiểm tra (0 = hôm nay, âm = đã qua)
function diffDaysToExam(iso: string): number | null {
  if (!iso) return null;
  const parts = iso.split("-").map(Number);
  if (parts.length !== 3 || parts.some((n) => !Number.isFinite(n))) return null;
  const [y, m, d] = parts;
  const target = new Date(y, m - 1, d);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((target.getTime() - today.getTime()) / 86400000);
}

/**
 * Format số ngày thành chuỗi ngắn dạng ymwd, làm tròn theo đơn vị gần nhất.
 *   |Δ| < 7   → Nd
 *   |Δ| < 30  → Nw (round)
 *   |Δ| < 365 → Nm (round)
 *   else      → Ny (round)
 * Quá khứ thêm dấu "-".
 */
function formatExamCountdownShort(diffDays: number): string {
  if (diffDays === 0) return "0d";
  const sign = diffDays < 0 ? "-" : "";
  const abs = Math.abs(diffDays);
  if (abs < 7) return `${sign}${abs}d`;
  if (abs < 30) return `${sign}${Math.round(abs / 7)}w`;
  if (abs < 365) return `${sign}${Math.round(abs / 30)}m`;
  return `${sign}${Math.round(abs / 365)}y`;
}

// Cell chỉnh ngày kiểm tra sắp tới cho từng học sinh (inline, không popup)
function ExamDateCell({ memberId, student }: { memberId: string; student: any }) {
  const { mutate: updateStudent, isPending: isUpdating } = useUpdateStudent();

  const currentDate: string =
    typeof student?.nextExamDate === "string" ? student.nextExamDate : "";

  // local value để input không bị "nhảy" khi cập nhật optimistic
  const [value, setValue] = useState<string>(currentDate);
  useEffect(() => {
    setValue(currentDate);
  }, [currentDate]);

  const persist = useCallback(
    (next: string) => {
      if (next === currentDate) return;
      updateStudent(
        {
          studentId: memberId,
          studentData: { nextExamDate: next },
        },
        {
          onSuccess: () => {
            toast.success(next ? "Đã cập nhật ngày KT!" : "Đã xóa ngày KT!");
          },
          onError: () => {
            toast.error("Cập nhật ngày KT thất bại!");
            setValue(currentDate);
          },
        }
      );
    },
    [currentDate, memberId, updateStudent]
  );

  const diff = value ? diffDaysToExam(value) : null;
  const short = diff != null ? formatExamCountdownShort(diff) : "";
  const isPast = diff != null && diff < 0;
  const isSoon = diff != null && diff >= 0 && diff <= 1;

  const badgeTone = !value
    ? "border-dashed border-gray-300 bg-white text-gray-400 dark:border-gray-600 dark:bg-gray-800"
    : isPast
      ? "border-gray-200 bg-gray-50 text-gray-500 dark:border-gray-700 dark:bg-gray-900/40 dark:text-gray-400"
      : isSoon
        ? "border-red-200 bg-red-50 text-red-700 dark:border-red-900/40 dark:bg-red-900/20 dark:text-red-300"
        : "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/40 dark:bg-amber-900/20 dark:text-amber-300";

  return (
    <div
      className="flex items-center gap-1 justify-center"
      onClick={(e) => e.stopPropagation()}
    >
      <span
        className={cn(
          "inline-flex items-center justify-center rounded px-1 py-0.5 text-[11px] font-semibold tabular-nums border min-w-[28px]",
          badgeTone
        )}
        title={
          value
            ? `Ngày KT: ${value}${diff != null ? ` (${diff === 0 ? "hôm nay" : diff > 0 ? `còn ${diff} ngày` : `đã qua ${Math.abs(diff)} ngày`})` : ""}`
            : "Chưa đặt ngày KT"
        }
      >
        {value ? short : "—"}
      </span>
      <input
        type="date"
        value={value}
        onChange={(e) => {
          const next = e.target.value;
          setValue(next);
          persist(next);
        }}
        disabled={isUpdating}
        title="Chọn ngày kiểm tra sắp tới"
        className="h-7 w-[112px] px-1 text-xs border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-50"
      />
    </div>
  );
}

/** Mô tả ngắn gọn vị trí hiện tại của học sinh để hiển thị cho giáo viên. */
function formatCurrentActivity(activity?: CurrentActivity): string {
  if (!activity?.tab) return "";
  if (activity.tab !== "Learn") return activity.tab;
  const parts: string[] = ["Học"];
  if (activity.miniTab) parts.push(activity.miniTab);
  if (activity.bookName) parts.push(activity.bookName);
  if (activity.lessons && activity.lessons.length > 0) {
    parts.push(`Bài ${activity.lessons.join(", ")}`);
  }
  if (activity.mode && activity.mode !== "none") parts.push(activity.mode);
  return parts.join(" • ");
}

function LazyStudentDataCell({ memberId, renderCell }: { memberId: string, renderCell: (student: any) => React.ReactNode }) {
  const { data: student, isLoading } = useStudent(memberId);
  if (isLoading) return <span className="text-xs sm:text-sm text-gray-400 animate-pulse">...</span>;
  return <>{renderCell(student || {})}</>;
}

type SortKey =
  | "online"
  | "rank"
  | "timesVocab"
  | "timesVocabXS"
  | "countHeart"
  | "streakCount"
  | "quizAccuracy"
  | "speakingAccuracy";
type SortDirection = "asc" | "desc";

const MEMBER_TABLE_COLUMN_KEYS = [
  "student",
  "grade",
  "actions",
  "attendance",
  "examDate",
  "note",
  "classRank",
  "achievements",
  "timesVocab",
  "quizAccuracy",
  "speakingAccuracy",
  "snapshot",
] as const;
type MemberTableColumnKey = (typeof MEMBER_TABLE_COLUMN_KEYS)[number];

function isMemberTableColumnKey(k: string): k is MemberTableColumnKey {
  return (MEMBER_TABLE_COLUMN_KEYS as readonly string[]).includes(k);
}

function normalizeStoredColumnKey(k: string): MemberTableColumnKey | null {
  if (k === "noteRank") return "achievements";
  return isMemberTableColumnKey(k) ? k : null;
}

const ATTENDANCE_STATUS_ICONS: {
  value: AttendanceStatus;
  Icon: typeof FiCheckCircle;
  label: string;
}[] = [
  { value: "present", Icon: FiCheckCircle, label: "Có mặt" },
  { value: "late", Icon: FiClock, label: "Trễ" },
  { value: "absent", Icon: FiUserX, label: "Vắng" },
];

function defaultAttendanceStatusMap(studentIds: string[]): Record<string, AttendanceStatus> {
  const m: Record<string, AttendanceStatus> = {};
  for (const id of studentIds) {
    m[id] = "absent";
  }
  return m;
}

/** Giữ cột điểm danh ngay sau Thao tác (và đủ mọi key). */
function pinAttendanceAfterActions(order: MemberTableColumnKey[]): MemberTableColumnKey[] {
  const seen = new Set<MemberTableColumnKey>();
  const unique: MemberTableColumnKey[] = [];
  for (const k of order) {
    if (isMemberTableColumnKey(k) && !seen.has(k)) {
      seen.add(k);
      unique.push(k);
    }
  }
  for (const k of MEMBER_TABLE_COLUMN_KEYS) {
    if (!seen.has(k)) {
      unique.push(k);
      seen.add(k);
    }
  }
  const withoutAtt = unique.filter((k) => k !== "attendance");
  const ia = withoutAtt.indexOf("actions");
  if (ia === -1) return [...MEMBER_TABLE_COLUMN_KEYS];
  return [...withoutAtt.slice(0, ia + 1), "attendance", ...withoutAtt.slice(ia + 1)];
}

export default function MembersList() {
  const { classId, members, isOnline, isLoadingMembers } = useClassContext();
  const presenceMap = useGlobalPresenceMap();

  const isActuallyLoading = isLoadingMembers;
  const students = React.useMemo(() => members?.filter((m) => m.role === "student") || [], [members]);
  const studentsRef = useRef(students);
  studentsRef.current = students;

  const { mutate: updateClass, isPending: isUpdatingClass } = useUpdateClass();
  const [noteProcessValue, setNoteProcessValue] = useState<string>("");
  const [attendanceDate, setAttendanceDate] = useState(() => toLocalDateKey(new Date()));
  const [attendanceStatusMap, setAttendanceStatusMap] = useState<Record<string, AttendanceStatus>>({});
  const [attendanceLoading, setAttendanceLoading] = useState(true);
  const [attendanceSaving, setAttendanceSaving] = useState(false);

  const attendanceStudentIdsKey = React.useMemo(
    () => students.map((s) => s.id).sort().join(","),
    [students]
  );

  const queryClient = useQueryClient();

  const { session, profile } = useAuth();
  const [loadedStudentIds, setLoadedStudentIds] = useState<Set<string>>(new Set());
  const [showGrammarModal, setShowGrammarModal] = useState(false);
  const [sortConfig, setSortConfig] = useState<{ key: SortKey; direction: SortDirection }>({
    key: "rank",
    direction: "asc",
  });
  const [loadingAllInfo, setLoadingAllInfo] = useState(false);

  const [columnOrder, setColumnOrder] = useState<MemberTableColumnKey[]>(() => [
    ...MEMBER_TABLE_COLUMN_KEYS,
  ]);

  useEffect(() => {
    if (!classId) {
      setColumnOrder(pinAttendanceAfterActions([...MEMBER_TABLE_COLUMN_KEYS]));
      return;
    }
    const storageKey = `breadtrans.membersList.columnOrder.${classId}`;
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) {
        const parsed = JSON.parse(raw) as unknown;
        if (Array.isArray(parsed)) {
          const valid = parsed
            .map((k) => normalizeStoredColumnKey(String(k)))
            .filter((k): k is MemberTableColumnKey => k != null);
          const seen = new Set<string>(valid);
          const merged: MemberTableColumnKey[] = [
            ...valid,
            ...MEMBER_TABLE_COLUMN_KEYS.filter((k) => !seen.has(k)),
          ];
          setColumnOrder(pinAttendanceAfterActions(merged));
          return;
        }
      }
    } catch {
      /* ignore */
    }
    setColumnOrder(pinAttendanceAfterActions([...MEMBER_TABLE_COLUMN_KEYS]));
  }, [classId]);

  const handleColumnOrderChange = useCallback(
    (keys: string[]) => {
      const next = keys.filter((k): k is MemberTableColumnKey => isMemberTableColumnKey(k));
      if (next.length !== MEMBER_TABLE_COLUMN_KEYS.length) return;
      setColumnOrder(next);
      if (classId) {
        try {
          localStorage.setItem(
            `breadtrans.membersList.columnOrder.${classId}`,
            JSON.stringify(next)
          );
        } catch {
          /* ignore */
        }
      }
    },
    [classId]
  );

  const { data: classDetailsFromHook } = useClassDetails(
    classId,
    session?.user.id || "",
    {
      enabled: !!session?.user.id,
    }
  );
  const classDetails = classDetailsFromHook;

  const { data: grammarTrackingData } = useGrammarTrackingData(classId, new Date());
  void grammarTrackingData;

  const studentsDataMap = React.useMemo(() => {
    const map = new Map<string, any>();
    for (const studentMember of students) {
      const queryData = queryClient.getQueryData(studentKeys.detail(studentMember.id));
      if (queryData) {
        map.set(studentMember.id, queryData);
      }
    }
    return map;
  }, [students, queryClient, loadedStudentIds]);

  useEffect(() => {
    if (classDetails?.noteProcess !== undefined) {
      setNoteProcessValue(classDetails.noteProcess);
    }
  }, [classDetails?.noteProcess]);

  const handleNoteProcessBlur = () => {
    if (classDetails?.noteProcess !== noteProcessValue) {
      updateClass({
        classId,
        classData: { noteProcess: noteProcessValue },
      });
    }
  };

  const attendanceFetchGenRef = useRef(0);

  const loadAttendanceFromServer = useCallback(async (dateKey: string) => {
    const trimmedKey = dateKey.trim();
    const dt = parseDateKey(trimmedKey);
    if (!classId || !dt) {
      attendanceFetchGenRef.current += 1;
      setAttendanceLoading(false);
      setAttendanceStatusMap({});
      return;
    }
    const month = dt.getMonth() + 1;
    const year = dt.getFullYear();
    const studs = studentsRef.current;
    if (studs.length === 0) {
      attendanceFetchGenRef.current += 1;
      setAttendanceLoading(false);
      setAttendanceStatusMap({});
      return;
    }
    const myGen = ++attendanceFetchGenRef.current;
    setAttendanceLoading(true);
    try {
      const data = await fetchClassAttendanceMonth(classId, month, year);
      if (attendanceFetchGenRef.current !== myGen) return;
      const day = getAttendanceDayMap(data?.days, trimmedKey);
      const next = defaultAttendanceStatusMap(studs.map((s) => s.id));
      for (const s of studs) {
        next[s.id] = normalizeAttendanceStatus(day[s.id]);
      }
      setAttendanceStatusMap(next);
    } catch (e) {
      console.error(e);
      if (attendanceFetchGenRef.current === myGen) {
        toast.error("Lỗi tải điểm danh.");
        setAttendanceStatusMap(defaultAttendanceStatusMap(studs.map((s) => s.id)));
      }
    } finally {
      if (attendanceFetchGenRef.current === myGen) {
        setAttendanceLoading(false);
      }
    }
  }, [classId]);

  useEffect(() => {
    if (!classId || isLoadingMembers || students.length === 0) {
      attendanceFetchGenRef.current += 1;
      setAttendanceLoading(false);
      setAttendanceStatusMap({});
      return;
    }
    void loadAttendanceFromServer(attendanceDate);
    return () => {
      attendanceFetchGenRef.current += 1;
    };
  }, [
    classId,
    isLoadingMembers,
    attendanceStudentIdsKey,
    attendanceDate,
    loadAttendanceFromServer,
    students.length,
  ]);

  const attendanceSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flushAttendanceSave = useCallback(
    async (dateKey: string, statusMap: Record<string, AttendanceStatus>) => {
      if (!classId) return;
      setAttendanceSaving(true);
      try {
        await saveClassAttendanceDay(classId, dateKey, statusMap);
      } catch (e) {
        console.error(e);
        toast.error("Lỗi lưu điểm danh.");
      } finally {
        setAttendanceSaving(false);
      }
    },
    [classId]
  );

  const setAttendanceMemberStatus = useCallback(
    (memberId: string, status: AttendanceStatus) => {
      const dateKey = attendanceDate;
      setAttendanceStatusMap((prev) => {
        const next = { ...prev, [memberId]: status };
        if (attendanceSaveTimerRef.current) clearTimeout(attendanceSaveTimerRef.current);
        attendanceSaveTimerRef.current = setTimeout(() => {
          void flushAttendanceSave(dateKey, next);
        }, 2000);
        return next;
      });
    },
    [attendanceDate, flushAttendanceSave]
  );

  useEffect(() => {
    return () => {
      if (attendanceSaveTimerRef.current) clearTimeout(attendanceSaveTimerRef.current);
    };
  }, []);

  const handleRowClick = (member: IClassMember) => {
    setLoadedStudentIds((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(member.id)) {
        newSet.delete(member.id);
      } else {
        newSet.add(member.id);
      }
      return newSet;
    });
  };

  const handleGetAllInfo = useCallback(async () => {
    if (!classId || students.length === 0 || loadingAllInfo) return;
    setLoadingAllInfo(true);
    const toastId = toast.loading("Đang tải thông tin học sinh…");
    try {
      await Promise.all(
        students.map((member) =>
          queryClient.fetchQuery({
            queryKey: studentKeys.detail(member.id),
            queryFn: () => getStudentById(member.id),
          })
        )
      );
      const updatedRank = await syncClassRank(classId);
      queryClient.setQueryData(teacherClassKeys.detail(classId), (prev: unknown) => {
        if (!prev || typeof prev !== "object") return prev;
        return { ...prev, rank: updatedRank };
      });
      setLoadedStudentIds(new Set(students.map((s) => s.id)));
      await queryClient.invalidateQueries({ queryKey: teacherClassKeys.detail(classId) });
      setSortConfig({ key: "rank", direction: "asc" });
      toast.success("Đã tải thông tin & cập nhật xếp hạng!", { id: toastId });
    } catch (error) {
      console.error(error);
      toast.error("Không thể tải thông tin học sinh.", { id: toastId });
    } finally {
      setLoadingAllInfo(false);
    }
  }, [classId, students, loadingAllInfo, queryClient]);

  const getSortIndicator = useCallback(
    (key: SortKey): string => {
      if (sortConfig.key !== key) return "↕";
      return sortConfig.direction === "asc" ? "↑" : "↓";
    },
    [sortConfig]
  );

  const handleSort = useCallback((key: SortKey) => {
    setSortConfig((prev) => {
      if (prev.key === key) {
        return { key, direction: prev.direction === "asc" ? "desc" : "asc" };
      }
      return { key, direction: "asc" };
    });
  }, []);

  const sortedStudents = React.useMemo(() => {
    const getMemberQuizAccuracy = (member: IClassMember): number => {
      const student = studentsDataMap.get(member.id) || {};
      return Number((student?.quizAccuracy ?? 50).toFixed(3));
    };

    const getMemberSpeakingAccuracy = (member: IClassMember): number => {
      const student = studentsDataMap.get(member.id) || {};
      return Number((student?.speakingAccuracy ?? 50).toFixed(3));
    };

    const getMemberTimesVocab = (member: IClassMember): number => {
      const student = studentsDataMap.get(member.id) || {};
      return student?.timesVocab ?? 0;
    };

    const getMemberTimesVocabXS = (member: IClassMember): number => {
      const student = studentsDataMap.get(member.id) || {};
      return student?.timesVocabXS ?? 0;
    };

    const getMemberCountHeart = (member: IClassMember): number => {
      const student = studentsDataMap.get(member.id) || {};
      return student?.countHeart ?? 0;
    };

    const getMemberStreak = (member: IClassMember): number => {
      const student = studentsDataMap.get(member.id) || {};
      return student?.streakCount ?? 0;
    };

    const getMemberRank = (member: IClassMember): number => {
      return (
        getStudentRankPosition(classDetails?.rank, member.id, "countHeart") ??
        Number.MAX_SAFE_INTEGER
      );
    };

    const next = [...students];
    next.sort((a, b) => {
      let av = 0;
      let bv = 0;

      if (sortConfig.key === "online") {
        av = isOnline(a.id) ? 1 : 0;
        bv = isOnline(b.id) ? 1 : 0;
      } else if (sortConfig.key === "rank") {
        av = getMemberRank(a);
        bv = getMemberRank(b);
      } else if (sortConfig.key === "timesVocab") {
        av = getMemberTimesVocab(a);
        bv = getMemberTimesVocab(b);
      } else if (sortConfig.key === "timesVocabXS") {
        av = getMemberTimesVocabXS(a);
        bv = getMemberTimesVocabXS(b);
      } else if (sortConfig.key === "countHeart") {
        av = getMemberCountHeart(a);
        bv = getMemberCountHeart(b);
      } else if (sortConfig.key === "streakCount") {
        av = getMemberStreak(a);
        bv = getMemberStreak(b);
      } else if (sortConfig.key === "quizAccuracy") {
        av = getMemberQuizAccuracy(a);
        bv = getMemberQuizAccuracy(b);
      } else if (sortConfig.key === "speakingAccuracy") {
        av = getMemberSpeakingAccuracy(a);
        bv = getMemberSpeakingAccuracy(b);
      }

      if (av === bv) return a.name.localeCompare(b.name, "vi");
      return sortConfig.direction === "asc" ? av - bv : bv - av;
    });
    return next;
  }, [students, sortConfig, isOnline, studentsDataMap, classDetails?.rank]);

  const renderLazyCell = useCallback(
    (memberId: string, isLoaded: boolean, render: (student: any) => React.ReactNode) => {
      if (!isLoaded) return <span className="text-sm text-gray-400">…</span>;
      return <LazyStudentDataCell memberId={memberId} renderCell={render} />;
    },
    []
  );

  const columnsByKey = useMemo((): Record<MemberTableColumnKey, AdminTableColumn<IClassMember>> => {
    return {
      student: {
        key: "student",
        title: (
          <button type="button" onClick={() => handleSort("online")} className="inline-flex items-center gap-0.5 whitespace-nowrap text-sm">
            Học sinh {getSortIndicator("online")}
          </button>
        ),
        render: (_, member) => {
          const presenceTs = presenceMap[member.id]?.lastSeen ?? null;
          const online = isOnline(member.id);
          const short = formatPresenceShort(presenceTs);
          const titleFull =
            formatPresenceRelativeTime(presenceTs) || "Chưa rõ hoạt động";
          const presenceTitle = online
            ? `${member.name}, đang online`
            : `${member.name}, ${titleFull}`;

          return (
            <div
              className="flex items-center min-w-0"
              title={presenceTitle}
            >
              <div className="flex-shrink-0 h-7 w-7 sm:h-8 sm:w-8 relative">
                <ProfileAvatarLink
                  userId={member.id}
                  className="block h-7 w-7 sm:h-8 sm:w-8 rounded-full overflow-hidden ring-1 ring-gray-200 dark:ring-gray-600"
                  ariaLabel={`Hồ sơ ${member.name}`}
                >
                  {member.avatarUrl ? (
                    <Image
                      src={member.avatarUrl}
                      alt={member.name}
                      width={32}
                      height={32}
                      sizes="28px"
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="h-full w-full rounded-full bg-primary/10 flex items-center justify-center">
                      <FiUser className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-primary" />
                    </div>
                  )}
                </ProfileAvatarLink>
                <div className="absolute bottom-0 right-0 z-20 flex min-h-[11px] min-w-[11px] items-center justify-center translate-x-px translate-y-px">
                  {online ? (
                    <span
                      className="block h-2 w-2 rounded-full border-2 border-white bg-green-500 shadow-sm dark:border-gray-800 sm:h-2.5 sm:w-2.5"
                      aria-hidden
                    />
                  ) : short ? (
                    <span
                      className="max-w-[36px] truncate rounded-md border border-gray-200 bg-white px-0.5 py-0.5 text-[8px] font-bold tabular-nums leading-none text-gray-800 shadow-sm dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100 sm:text-[9px]"
                      aria-hidden
                    >
                      {short}
                    </span>
                  ) : (
                    <span
                      className="block h-1.5 w-1.5 rounded-full border border-white bg-gray-300 shadow-sm dark:border-gray-800 sm:h-2 sm:w-2"
                      aria-hidden
                    />
                  )}
                </div>
              </div>
              <div className="ml-1.5 sm:ml-2 min-w-0 flex-1">
                <div className="flex items-center gap-1 min-w-0">
                  <div className="text-sm font-medium leading-tight text-gray-900 truncate dark:text-gray-100">
                    {member.name}
                  </div>
                </div>
              </div>
            </div>
          );
        },
      },
      grade: {
        key: "grade",
        title: (
          <span className="whitespace-nowrap text-sm font-medium normal-case tracking-normal" title="Lớp hiện tại (1-12) tính theo năm sinh và năm học">
            Lớp
          </span>
        ),
        width: "72px",
        className: "text-center !px-1",
        render: (_, member) =>
          renderLazyCell(member.id, loadedStudentIds.has(member.id), (student) => (
            <GradeCell student={student} />
          )),
      },
      actions: {
        key: "actions",
        title: (
          <span className="whitespace-nowrap text-xs font-medium" title="Thao tác">
            Thao tác
          </span>
        ),
        width: "116px",
        className: "text-center !px-1",
        render: (_, member) => {
          return (
            <div className="mx-auto flex w-fit max-w-none items-center justify-center gap-px">
              <StudentAiCreateButton
                studentId={member.id}
                studentName={member.name}
                classId={classId}
              />
            </div>
          );
        },
      },
      attendance: {
        key: "attendance",
        title: (
          <span className="whitespace-nowrap text-xs font-medium" title="Điểm danh">
            Đ.Danh
          </span>
        ),
        width: "88px",
        className: "text-center !px-1",
        render: (_, member) => (
          <div
            className="mx-auto flex w-fit max-w-none items-center justify-center gap-px"
            role="group"
            aria-label={`Điểm danh ${member.name}`}
            onClick={(e) => e.stopPropagation()}
          >
            {attendanceLoading ? (
              <span className="text-xs text-gray-400">…</span>
            ) : (
              ATTENDANCE_STATUS_ICONS.map(({ value, Icon, label }) => {
                const on = attendanceStatusMap[member.id] === value;
                return (
                  <Button
                    key={value}
                    variant="ghost"
                    size="sm"
                    type="button"
                    title={label}
                    aria-label={`${label} — ${member.name}`}
                    aria-pressed={on}
                    disabled={students.length === 0}
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setAttendanceMemberStatus(member.id, value);
                    }}
                    className="h-7 w-7 min-w-0 shrink-0 p-0"
                  >
                    <Icon
                      className={cn(
                        "h-3.5 w-3.5 transition-colors",
                        on ? "text-primary" : "text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300"
                      )}
                    />
                  </Button>
                );
              })
            )}
          </div>
        ),
      },
      examDate: {
        key: "examDate",
        title: (
          <span className="whitespace-nowrap text-sm font-medium normal-case tracking-normal" title="Ngày kiểm tra sắp tới (đếm ngược y/m/w/d)">
            KT
          </span>
        ),
        width: "160px",
        className: "text-center !px-1",
        render: (_, member) =>
          renderLazyCell(member.id, loadedStudentIds.has(member.id), (student) => (
            <ExamDateCell memberId={member.id} student={student} />
          )),
      },
      note: {
        key: "note",
        title: <span className="whitespace-nowrap text-sm">Note</span>,
        render: (_, member) =>
          renderLazyCell(member.id, loadedStudentIds.has(member.id), (student) => (
            <NoteCell memberId={member.id} student={student} />
          )),
      },
      classRank: {
        key: "classRank",
        title: (
          <button
            type="button"
            onClick={() => handleSort("rank")}
            className="inline-flex items-center gap-0.5 whitespace-nowrap text-sm font-medium normal-case tracking-normal"
          >
            Rank {getSortIndicator("rank")}
          </button>
        ),
        width: "72px",
        className: "text-center !px-1",
        render: (_, member) => {
          const position = getStudentRankPosition(
            classDetails?.rank,
            member.id,
            "countHeart"
          );
          if (position == null) {
            return <span className="text-xs text-gray-400">—</span>;
          }
          return (
            <span className="text-xs font-semibold tabular-nums text-emerald-700">
              {formatClassRankLabel(position, "countHeart")}
            </span>
          );
        },
      },
      achievements: {
        key: "achievements",
        title: <span className="whitespace-nowrap text-sm">T.tích</span>,
        render: (_, member) =>
          renderLazyCell(member.id, loadedStudentIds.has(member.id), (student) => (
            <AchievementsCell memberId={member.id} student={student} />
          )),
      },
      timesVocab: {
        key: "timesVocab",
        title: (
          <button type="button" onClick={() => handleSort("timesVocab")} className="inline-flex items-center gap-0.5 whitespace-nowrap text-sm font-medium normal-case tracking-normal">
            Quizs {getSortIndicator("timesVocab")}
          </button>
        ),
        render: (_, member) =>
          renderLazyCell(member.id, loadedStudentIds.has(member.id), (student) => (
            <TimesVocabCell student={student} />
          )),
      },
      quizAccuracy: {
        key: "quizAccuracy",
        title: (
          <button type="button" onClick={() => handleSort("quizAccuracy")} className="inline-flex items-center gap-0.5 whitespace-nowrap text-sm font-medium normal-case tracking-normal">
            Quiz % {getSortIndicator("quizAccuracy")}
          </button>
        ),
        render: (_, member) =>
          renderLazyCell(member.id, loadedStudentIds.has(member.id), (student) => (
            <QuizAccuracyCell student={student} />
          )),
      },
      speakingAccuracy: {
        key: "speakingAccuracy",
        title: (
          <button type="button" onClick={() => handleSort("speakingAccuracy")} className="inline-flex items-center gap-0.5 whitespace-nowrap text-sm font-medium normal-case tracking-normal">
            Nói % {getSortIndicator("speakingAccuracy")}
          </button>
        ),
        render: (_, member) =>
          renderLazyCell(member.id, loadedStudentIds.has(member.id), (student) => (
            <SpeakingAccuracyCell student={student} />
          )),
      },
      snapshot: {
        key: "snapshot",
        title: <span className="whitespace-nowrap text-xs font-medium">Hoạt động</span>,
        width: "260px",
        render: (_, member) => {
          const presence = presenceMap[member.id];
          const activity = presence?.currentActivity;
          const label = formatCurrentActivity(activity);

          if (!activity || !label) {
            return <span className="text-xs text-gray-400">Chưa rõ</span>;
          }

          return (
            <div className="py-1 leading-snug">
              <span
                className={cn(
                  "text-[11px] font-medium",
                  activity.pending
                    ? "text-amber-600 dark:text-amber-400"
                    : "text-gray-700 dark:text-gray-300"
                )}
              >
                {label}
              </span>
            </div>
          );
        },
      },
    };
  }, [
    attendanceLoading,
    attendanceStatusMap,
    presenceMap,
    getSortIndicator,
    handleSort,
    isOnline,
    loadedStudentIds,
    renderLazyCell,
    setAttendanceMemberStatus,
    students.length,
    studentsDataMap,
    classId,
    classDetails?.rank,
  ]);

  const columns: AdminTableColumn<IClassMember>[] = useMemo(
    () => columnOrder.map((k) => columnsByKey[k]).filter(Boolean),
    [columnOrder, columnsByKey]
  );

  if (isActuallyLoading) return <p className="text-base text-gray-500 py-1">Đang tải…</p>;

  return (
    <div className="space-y-2">
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-1.5 bg-white dark:bg-gray-800 px-2 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm">
        <div className="relative flex-1 group">
          <input
            type="text"
            className="w-full h-9 text-sm pl-2 pr-14 bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-md focus:ring-1 focus:ring-primary/50 focus:border-primary outline-none transition-all disabled:opacity-60"
            value={noteProcessValue}
            onChange={(e) => setNoteProcessValue(e.target.value)}
            onBlur={handleNoteProcessBlur}
            placeholder="Tiến độ lớp…"
            disabled={isUpdatingClass || !classDetails}
          />
          {isUpdatingClass && (
            <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-gray-400 animate-pulse">
              Lưu…
            </span>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-1.5 shrink-0">
          <div className="relative flex items-center">
            <FiCalendar className="pointer-events-none absolute left-2 h-3.5 w-3.5 text-gray-400" aria-hidden />
            <input
              type="date"
              value={attendanceDate}
              onChange={(e) => setAttendanceDate(e.target.value)}
              disabled={attendanceLoading || students.length === 0}
              aria-label="Ngày điểm danh"
              className="h-9 rounded-md border border-gray-300 bg-white py-0 pl-8 pr-2 text-sm dark:border-gray-600 dark:bg-gray-900 disabled:opacity-50"
            />
          </div>
          {attendanceSaving && (
            <span className="inline-flex items-center gap-1 text-xs text-gray-400">
              <FiLoader className="h-3.5 w-3.5 animate-spin" />
              Đang lưu…
            </span>
          )}
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={() => void handleGetAllInfo()}
            disabled={loadingAllInfo || students.length === 0}
            className="flex items-center gap-1 h-9 px-2.5 rounded-md border border-emerald-200 dark:border-emerald-900/30 bg-emerald-50/50 dark:bg-emerald-900/10 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-100 transition-colors disabled:opacity-50"
            title="Tải thông tin học sinh & cập nhật xếp hạng"
          >
            {loadingAllInfo ? (
              <FiLoader className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <FiInfo className="h-3.5 w-3.5" />
            )}
            <span className="text-sm font-medium">Get all info</span>
          </button>
          <button
            onClick={() => setShowGrammarModal(true)}
            className="flex items-center gap-1 h-9 px-2.5 rounded-md border border-blue-200 dark:border-blue-900/30 bg-blue-50/50 dark:bg-blue-900/10 text-blue-700 dark:text-blue-400 hover:bg-blue-100 transition-colors"
            title="Ngữ pháp hôm nay"
          >
            <span className="text-sm font-medium">Videos</span>
          </button>
        </div>
      </div>

      <AdminTable
        columns={columns}
        data={sortedStudents}
        loading={isActuallyLoading}
        emptyMessage="Chưa có học sinh"
        showCheckbox={false}
        onRowClick={handleRowClick}
        columnReorder
        onColumnOrderChange={handleColumnOrderChange}
        dense
      />

      {/* Grammar Tracking Modal */}
      {showGrammarModal && (
        <Modal
          open={showGrammarModal}
          onClose={() => setShowGrammarModal(false)}
          maxWidth="4xl"
          title="Lịch sử xem"
          className="max-w-6xl"
        >
          <GrammarTrackingTable
            classId={classId}
            isOnline={isOnline}
            hideEmpty={true}
            simplified={true}
            defaultTimeRange="today"
          />
        </Modal>
      )}
    </div>
  );
}
