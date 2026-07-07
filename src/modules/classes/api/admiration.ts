"use client";

import { db } from "@/lib/firebase/client";
import {
  doc,
  getDoc,
  Timestamp,
  serverTimestamp,
  onSnapshot,
  Unsubscribe,
  runTransaction,
  increment,
} from "firebase/firestore";
import { UserRole } from "@/lib/auth/types";

const USERS_COLLECTION = "users";
const KEEP_MESSAGES_DAYS = 7; // Chỉ giữ message trong 7 ngày gần nhất (FIFO theo thời gian)

export type AdmirationReactionType = "dislike" | "haha" | "like" | "heart" | "wow";

/** Message item lưu trong users.admirationsMessage */
export interface AdmirationMessageItem {
  fromStudentAvatarUrl?: string;
  name: string;
  reactionType?: AdmirationReactionType;
  value: number;
  time: Date | Timestamp;
  fromStudentId?: string;
  type?: "admiration" | "speakingGrade";
  classId?: string;
  /** Cho speakingGrade: `${bookId}_${lessonId}` */
  speakingId?: string;
}

export interface IAdmiration {
  id: string;
  fromStudentId: string;
  fromStudentName: string;
  fromStudentAvatarUrl?: string;
  toStudentId: string;
  toStudentName: string;
  classId: string;
  createdAt: Date;
  reactionType?: AdmirationReactionType;
  reactionValue?: number;
  type?: "admiration" | "speakingGrade";
  speakingId?: string;
}

export interface SendAdmirationData {
  fromStudentId: string;
  fromStudentName: string;
  fromStudentAvatarUrl?: string;
  /** Vai trò của người gửi - chỉ "teacher" hoặc "admin" mới được tạo bánh */
  fromUserRole?: UserRole | string;
  toStudentId: string;
  toStudentName: string;
  classId: string;
  reactionType?: AdmirationReactionType;
  reactionValue?: number;
}

/**
 * Get today's date key in YYYY-MM-DD format (Vietnam timezone)
 */
function getTodayDateKey(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function toDate(value: Date | Timestamp | unknown): Date | null {
  if (value && typeof (value as Timestamp).toDate === "function") {
    return (value as Timestamp).toDate();
  }
  if (value instanceof Date) {
    return value;
  }
  if (typeof value === "string" || typeof value === "number") {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  return null;
}

/**
 * Số tin trong users.admirationsMessage có thời điểm sau sinceMs (cho badge nav Inbox).
 */
export async function getUnreadAdmirationsCountSince(
  studentId: string,
  sinceMs: number
): Promise<number> {
  if (!studentId) return 0;
  try {
    const userRef = doc(db, USERS_COLLECTION, studentId);
    const snap = await getDoc(userRef);
    if (!snap.exists()) return 0;
    const messages = (snap.data().admirationsMessage ?? []) as AdmirationMessageItem[];
    let n = 0;
    for (const msg of messages) {
      const d = toDate(msg.time);
      if (d && d.getTime() > sinceMs) n++;
    }
    return n;
  } catch (error) {
    console.error("getUnreadAdmirationsCountSince:", error);
    return 0;
  }
}

function keepMessagesInLastDays(messages: AdmirationMessageItem[], now: Date = new Date()): AdmirationMessageItem[] {
  const cutoff = now.getTime() - KEEP_MESSAGES_DAYS * 24 * 60 * 60 * 1000;
  return messages.filter((msg) => {
    const time = toDate(msg.time);
    return time ? time.getTime() >= cutoff : false;
  });
}

/**
 * Convert AdmirationMessageItem from user doc to IAdmiration (cho UI)
 */
function messageToAdmiration(
  msg: AdmirationMessageItem,
  toStudentId: string,
  toStudentName: string,
  index: number
): IAdmiration {
  const time = msg.time && typeof (msg.time as Timestamp).toDate === "function"
    ? (msg.time as Timestamp).toDate()
    : msg.time instanceof Date
      ? msg.time
      : new Date(String(msg.time));
  return {
    id: `${toStudentId}_${index}_${time.getTime()}`,
    fromStudentId: msg.fromStudentId ?? "",
    fromStudentName: msg.name,
    fromStudentAvatarUrl: msg.fromStudentAvatarUrl,
    toStudentId,
    toStudentName,
    classId: msg.classId ?? "",
    createdAt: time,
    reactionType: msg.reactionType,
    reactionValue: msg.value,
    type: msg.type ?? "admiration",
    speakingId: msg.speakingId,
  };
}

/**
 * Get messages from user doc and convert to IAdmiration[]
 */
function getUserAdmirations(userData: Record<string, unknown>, toStudentId: string, toStudentName: string): IAdmiration[] {
  const messages = (userData.admirationsMessage ?? []) as AdmirationMessageItem[];
  return messages
    .map((msg, idx) => messageToAdmiration(msg, toStudentId, toStudentName, idx))
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}

/**
 * Send admiration to another student — append message vào users[toStudentId].admirationsMessage
 */
export async function sendAdmiration(data: SendAdmirationData): Promise<IAdmiration> {
  try {
    const recipientRef = doc(db, USERS_COLLECTION, data.toStudentId);

    let admirationResult: IAdmiration | null = null;

    await runTransaction(db, async (transaction) => {
      const msgItem: AdmirationMessageItem = {
        fromStudentAvatarUrl: data.fromStudentAvatarUrl,
        name: data.fromStudentName,
        reactionType: data.reactionType,
        value: 0,
        time: Timestamp.now(),
        fromStudentId: data.fromStudentId,
        type: "admiration",
        classId: data.classId,
      };

      // 2. Lấy recipient hiện tại để trim messages theo 7 ngày gần nhất
      const recipientSnap = await transaction.get(recipientRef);
      const recipientData = recipientSnap.exists() ? recipientSnap.data() : {};
      const existingMessages = (recipientData.admirationsMessage ?? []) as AdmirationMessageItem[];
      const trimmed = keepMessagesInLastDays([...existingMessages, msgItem]);

      // 3. Update recipient: admirationsMessage
      transaction.update(recipientRef, {
        admirationsMessage: trimmed,
        countHeart: increment(1),
        updatedAt: serverTimestamp(),
      });

      admirationResult = {
        id: `${data.toStudentId}_${Date.now()}`,
        fromStudentId: data.fromStudentId,
        fromStudentName: data.fromStudentName,
        fromStudentAvatarUrl: data.fromStudentAvatarUrl,
        toStudentId: data.toStudentId,
        toStudentName: data.toStudentName,
        classId: data.classId,
        createdAt: new Date(),
        reactionType: data.reactionType,
        reactionValue: 0,
        type: "admiration",
      };
    });

    return admirationResult!;
  } catch (error) {
    console.error("Error sending admiration:", error);
    throw error;
  }
}

/**
 * Append admiration message to a user inbox.
 */
export async function appendAdmirationToUser(
  toStudentId: string,
  toStudentName: string,
  msg: Omit<AdmirationMessageItem, "time"> & { time?: Date | Timestamp },
  _options?: { fromStudentId?: string; skipIncrementSenderCount?: boolean }
): Promise<void> {
  void toStudentName;
  const recipientRef = doc(db, USERS_COLLECTION, toStudentId);
  const msgItem: AdmirationMessageItem = {
    ...msg,
    value: 0,
    time: msg.time ?? Timestamp.now(),
  };

  await runTransaction(db, async (transaction) => {
    const recipientSnap = await transaction.get(recipientRef);
    const data = recipientSnap.exists() ? recipientSnap.data() : {};
    const existing = (data.admirationsMessage ?? []) as AdmirationMessageItem[];
    const trimmed = keepMessagesInLastDays([...existing, msgItem]);

    if (recipientSnap.exists()) {
      transaction.update(recipientRef, {
        admirationsMessage: trimmed,
        countHeart: increment(1),
        updatedAt: serverTimestamp(),
      });
    } else {
      transaction.set(recipientRef, {
        admirationsMessage: [msgItem],
        countHeart: 1,
        updatedAt: serverTimestamp(),
      });
    }
  });
}

/**
 * Subscribe to admirations received by a student (đọc từ users doc)
 */
export function subscribeToAdmirations(
  studentId: string,
  callback: (admirations: IAdmiration[]) => void
): Unsubscribe {
  if (!studentId) {
    callback([]);
    return () => { };
  }

  const userRef = doc(db, USERS_COLLECTION, studentId);

  const unsubscribe = onSnapshot(
    userRef,
    (snap) => {
      if (!snap.exists()) {
        callback([]);
        return;
      }
      const data = snap.data();
      const toStudentName = (data.displayName ?? data.toStudentName ?? "") as string;
      const admirations = getUserAdmirations(data as Record<string, unknown>, studentId, toStudentName);
      callback(admirations);
    },
    (error) => {
      console.error("Error listening to admirations:", error);
      callback([]);
    }
  );

  return unsubscribe;
}

/**
 * Get recent admirations received by a student
 */
export async function getRecentAdmirations(
  studentId: string,
  limitCount: number = 10
): Promise<IAdmiration[]> {
  const all = await getAdmirationsFromUser(studentId);
  return all.slice(0, limitCount);
}

async function getAdmirationsFromUser(studentId: string): Promise<IAdmiration[]> {
  const userRef = doc(db, USERS_COLLECTION, studentId);
  const snap = await getDoc(userRef);
  if (!snap.exists()) return [];
  const data = snap.data();
  const toStudentName = (data.displayName ?? "") as string;
  return getUserAdmirations(data as Record<string, unknown>, studentId, toStudentName);
}

/**
 * Get count of admirations received by a student today
 */
export async function getTodayAdmirationsReceivedCount(studentId: string): Promise<number> {
  const all = await getAdmirationsFromUser(studentId);
  const todayKey = getTodayDateKey();
  return all.filter((a) => {
    const key = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Ho_Chi_Minh",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(a.createdAt);
    return key === todayKey;
  }).length;
}

/**
 * Get today's admirations received by a student from a specific time
 */
export async function getTodayAdmirationsReceivedFromTime(
  studentId: string,
  fromTime: Date
): Promise<IAdmiration[]> {
  const all = await getAdmirationsFromUser(studentId);
  const todayKey = getTodayDateKey();
  return all.filter((a) => {
    const key = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Ho_Chi_Minh",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(a.createdAt);
    return key === todayKey && a.createdAt > fromTime;
  });
}

/**
 * Get admirations received by a student from a specific time
 */
export async function getAdmirationsReceivedFromTime(
  studentId: string,
  fromTime: Date
): Promise<IAdmiration[]> {
  const all = await getAdmirationsFromUser(studentId);
  return all.filter((a) => a.createdAt > fromTime);
}

/**
 * Get admirations received by a student in a time range
 */
export async function getAdmirationsReceivedInRange(
  studentId: string,
  startTime: Date,
  endTime: Date
): Promise<IAdmiration[]> {
  const all = await getAdmirationsFromUser(studentId);
  return all.filter((a) => a.createdAt >= startTime && a.createdAt <= endTime);
}

/**
 * Get today's admirations received by a student
 */
export async function getTodayAdmirationsReceived(studentId: string): Promise<IAdmiration[]> {
  const all = await getAdmirationsFromUser(studentId);
  const todayKey = getTodayDateKey();
  return all.filter((a) => {
    const key = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Ho_Chi_Minh",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(a.createdAt);
    return key === todayKey;
  });
}

/**
 * Get admiration summary for yesterday and today.
 * Trả về:
 * - totalBreads: tổng bánh nhận (chỉ tính reaction từ giáo viên - HS reaction nhau value=0)
 * - senderAvatars: avatar những người đã gửi
 * - reactionCounts: số lượt cho từng loại icon (gồm cả HS reaction nhau)
 * - totalReactions: tổng số reaction nhận được
 */
export async function getAdmirationSummary(studentId: string): Promise<{
  totalBreads: number;
  senderAvatars: string[];
  reactionCounts: Record<AdmirationReactionType, number>;
  totalReactions: number;
}> {
  const all = await getAdmirationsFromUser(studentId);
  const now = new Date();

  // Get Vietnam dates for today and yesterday
  const vnt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });

  const todayKey = vnt.format(now);
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayKey = vnt.format(yesterday);

  const relevantAdmirations = all.filter((a) => {
    const key = vnt.format(a.createdAt);
    return key === todayKey || key === yesterdayKey;
  });

  const totalBreads = relevantAdmirations.reduce((acc, a) => acc + (a.reactionValue ?? 0), 0);
  const senderAvatars = Array.from(new Set(relevantAdmirations.map((a) => a.fromStudentAvatarUrl).filter(Boolean))) as string[];

  const reactionCounts: Record<AdmirationReactionType, number> = {
    dislike: 0,
    haha: 0,
    like: 0,
    heart: 0,
    wow: 0,
  };
  for (const a of relevantAdmirations) {
    const t = (a.reactionType ?? "heart") as AdmirationReactionType;
    if (t in reactionCounts) reactionCounts[t] += 1;
  }
  const totalReactions = relevantAdmirations.length;

  return { totalBreads, senderAvatars, reactionCounts, totalReactions };
}
