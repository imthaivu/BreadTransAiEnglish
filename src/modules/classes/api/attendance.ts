"use client";

import { db } from "@/lib/firebase/client";
import {
  doc,
  setDoc,
  updateDoc,
  getDocFromServer,
  deleteField,
  serverTimestamp,
} from "firebase/firestore";

/** Một tháng điểm danh của lớp: doc id = `{classId}_{month}_{year}` */
export const CLASS_ATTENDANCE_COLLECTION = "classAttendance";

export type AttendanceStatus = "present" | "late" | "absent";

export function getClassAttendanceDocId(classId: string, month: number, year: number): string {
  return `${classId}_${month}_${year}`;
}

/**
 * Parse doc id `classId_month_year` (classId có thể chứa `_` — lấy 2 segment cuối là tháng/năm).
 */
export function parseClassAttendanceDocId(
  docId: string
): { classId: string; month: number; year: number } | null {
  const parts = docId.split("_");
  if (parts.length < 3) return null;
  const year = Number(parts[parts.length - 1]);
  const month = Number(parts[parts.length - 2]);
  if (!Number.isFinite(month) || !Number.isFinite(year) || month < 1 || month > 12) return null;
  const classId = parts.slice(0, -2).join("_");
  if (!classId) return null;
  return { classId, month, year };
}

/** Khóa ngày theo giờ local: YYYY-MM-DD */
export function toLocalDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function parseDateKey(dateKey: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateKey);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]) - 1;
  const d = Number(m[3]);
  const dt = new Date(y, mo, d);
  return Number.isNaN(dt.getTime()) ? null : dt;
}

export type ClassAttendanceMonthDoc = {
  /** Ngày -> userId -> trạng thái */
  days?: Record<string, Record<string, string | boolean>>;
  updatedAt?: unknown;
};

/**
 * Firestore có thể lưu theo path `days.2026-04-05` (một map key) hoặc — nếu path bị tách theo `.` —
 * thành `days["2026"]["04"]["05"]`. Khi đọc, map phẳng `days["2026-04-05"]` sẽ trống dù Console vẫn hiện.
 */
/** Chuẩn hoá `days` từ Firestore (map phẳng hoặc lồng Y/M/D). Dùng khi đọc / thống kê. */
export function normalizeClassAttendanceDaysField(
  rawDays: unknown
): ClassAttendanceMonthDoc["days"] | undefined {
  if (!rawDays || typeof rawDays !== "object" || Array.isArray(rawDays)) return undefined;
  const d = rawDays as Record<string, unknown>;

  for (const k of Object.keys(d)) {
    if (parseDateKey(k)) {
      return d as ClassAttendanceMonthDoc["days"];
    }
  }

  const flat: Record<string, Record<string, string | boolean>> = {};
  for (const [yStr, yVal] of Object.entries(d)) {
    if (!/^\d{4}$/.test(yStr) || !yVal || typeof yVal !== "object" || Array.isArray(yVal)) continue;
    for (const [mStr, mVal] of Object.entries(yVal as Record<string, unknown>)) {
      const monthNum = parseInt(mStr, 10);
      if (!Number.isFinite(monthNum) || monthNum < 1 || monthNum > 12) continue;
      if (!mVal || typeof mVal !== "object" || Array.isArray(mVal)) continue;
      for (const [dStr, leaf] of Object.entries(mVal as Record<string, unknown>)) {
        const dayNum = parseInt(dStr, 10);
        if (!Number.isFinite(dayNum) || dayNum < 1 || dayNum > 31) continue;
        if (!leaf || typeof leaf !== "object" || Array.isArray(leaf)) continue;
        const isoM = String(monthNum).padStart(2, "0");
        const isoD = String(dayNum).padStart(2, "0");
        flat[`${yStr}-${isoM}-${isoD}`] = leaf as Record<string, string | boolean>;
      }
    }
  }
  return Object.keys(flat).length > 0 ? flat : undefined;
}

/**
 * Lấy map điểm danh theo ngày từ `days`.
 * Khớp cả khi key trong Firestore lệch (khoảng trắng, không pad 0 — hiếm nhưng tránh UI trống).
 */
export function getAttendanceDayMap(
  days: ClassAttendanceMonthDoc["days"] | undefined,
  dateKey: string
): Record<string, string | boolean> {
  if (!days || typeof days !== "object" || Array.isArray(days)) return {};
  const trimmed = dateKey.trim();
  const direct = days[dateKey] ?? days[trimmed];
  if (direct && typeof direct === "object" && !Array.isArray(direct)) {
    return direct as Record<string, string | boolean>;
  }
  const targetDt = parseDateKey(trimmed);
  if (!targetDt) return {};
  const canon = toLocalDateKey(targetDt);
  for (const k of Object.keys(days)) {
    const pk = parseDateKey(k.trim());
    if (!pk) continue;
    if (toLocalDateKey(pk) === canon) {
      const v = days[k];
      if (v && typeof v === "object" && !Array.isArray(v)) {
        return v as Record<string, string | boolean>;
      }
    }
  }
  return {};
}

/** Chuẩn hoá dữ liệu cũ (boolean true) và chuỗi lạ. */
export function normalizeAttendanceStatus(v: unknown): AttendanceStatus {
  if (v === "present" || v === "late" || v === "absent") return v;
  if (v === true) return "present";
  return "absent";
}

/** Luôn đọc từ server (không dùng cache local) trước khi hiển thị. */
export async function fetchClassAttendanceMonth(
  classId: string,
  month: number,
  year: number
): Promise<ClassAttendanceMonthDoc | null> {
  if (!classId) return null;
  const ref = doc(db, CLASS_ATTENDANCE_COLLECTION, getClassAttendanceDocId(classId, month, year));
  const snap = await getDocFromServer(ref);
  if (!snap.exists()) return null;
  const raw = snap.data() as Record<string, unknown>;
  const normalizedDays = normalizeClassAttendanceDaysField(raw.days);
  return {
    days: normalizedDays,
    updatedAt: raw.updatedAt,
  };
}

/** Lưu đủ trạng thái cho từng học sinh trong ngày (present / late / absent). */
export async function saveClassAttendanceDay(
  classId: string,
  dateKey: string,
  statusByUserId: Record<string, AttendanceStatus>
): Promise<void> {
  const dt = parseDateKey(dateKey);
  if (!classId || !dt) throw new Error("Invalid class or date");

  const month = dt.getMonth() + 1;
  const year = dt.getFullYear();
  const ref = doc(db, CLASS_ATTENDANCE_COLLECTION, getClassAttendanceDocId(classId, month, year));

  const dayMap: Record<string, AttendanceStatus> = {};
  for (const [uid, st] of Object.entries(statusByUserId)) {
    if (st === "present" || st === "late" || st === "absent") {
      dayMap[uid] = st;
    }
  }

  const snap = await getDocFromServer(ref);

  if (Object.keys(dayMap).length === 0) {
    if (!snap.exists()) return;
    await updateDoc(ref, {
      [`days.${dateKey}`]: deleteField(),
      updatedAt: serverTimestamp(),
    });
    return;
  }

  /** Ghi `days` dạng map lồng, không dùng chuỗi `days.YYYY-MM-DD` (tránh SDK tách path theo `.` sai). */
  await setDoc(
    ref,
    {
      classId,
      month,
      year,
      days: { [dateKey]: dayMap },
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
}
