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
import { createCurrencyTransaction } from "@/modules/admin/services/currency.service";
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
  type?: "admiration" | "reactStory" | "speakingGrade" | "gameInvite";
  classId?: string;
  /** Cho reactStory: để cập nhật message khi user đổi reaction (lấy lượt cuối) */
  storyId?: string;
  storyOwnerId?: string;
  /** Cho speakingGrade: `${bookId}_${lessonId}` — resolve tên sách/bài giống story */
  speakingId?: string;
  /** Cho gameInvite: lời mời đấu solo khi người nhận đang học */
  gameId?: string;
  roomId?: string;
  inviteId?: string;
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
  type?: "admiration" | "reactStory" | "speakingGrade" | "gameInvite";
  storyId?: string;
  storyOwnerId?: string;
  speakingId?: string;
  gameId?: string;
  roomId?: string;
  inviteId?: string;
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
    storyId: msg.storyId,
    storyOwnerId: msg.storyOwnerId,
    speakingId: msg.speakingId,
    gameId: msg.gameId,
    roomId: msg.roomId,
    inviteId: msg.inviteId,
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
 * Send admiration to another student
 * - Append message vào users[toStudentId].admirationsMessage
 * - Cộng bánh cho recipient
 * (Không giới hạn lượt/ngày - chỉ story reaction dùng admirationsSentStoryToday)
 */
export async function sendAdmiration(data: SendAdmirationData): Promise<IAdmiration> {
  try {
    const reactionValue = typeof data.reactionValue === "number" ? data.reactionValue : 1;

    // Resolve sender role: ưu tiên giá trị truyền vào, fallback đọc từ Firestore
    let senderRole: string | undefined = data.fromUserRole;
    if (!senderRole && data.fromStudentId) {
      try {
        const senderSnap = await getDoc(doc(db, USERS_COLLECTION, data.fromStudentId));
        if (senderSnap.exists()) {
          senderRole = senderSnap.data()?.role as string | undefined;
        }
      } catch {
        // ignore
      }
    }
    const senderIsTeacher = senderRole === UserRole.TEACHER || senderRole === UserRole.ADMIN;

    const recipientRef = doc(db, USERS_COLLECTION, data.toStudentId);

    let admirationResult: IAdmiration | null = null;

    // HS reaction nhau: vẫn lưu thông báo nhưng value = 0 (không thưởng bánh)
    const effectiveValue = senderIsTeacher ? reactionValue : 0;

    await runTransaction(db, async (transaction) => {
      // 1. Tạo message item (dùng Timestamp.now() vì serverTimestamp() không hỗ trợ trong arrays)
      const msgItem: AdmirationMessageItem = {
        fromStudentAvatarUrl: data.fromStudentAvatarUrl,
        name: data.fromStudentName,
        reactionType: data.reactionType,
        value: effectiveValue,
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
        reactionValue: effectiveValue,
        type: "admiration",
      };
    });

    // Chỉ tạo currency khi người gửi là giáo viên/admin
    if (senderIsTeacher && effectiveValue > 0) {
      await createCurrencyTransaction({
        studentId: data.toStudentId,
        studentName: data.toStudentName,
        userId: data.fromStudentId,
        userName: data.fromStudentName,
        userRole: (senderRole as UserRole) ?? UserRole.TEACHER,
        amount: effectiveValue,
        reason: `Nhận ngưỡng mộ (${data.reactionType ?? "heart"}) từ ${data.fromStudentName}`,
        type: "add",
        classId: data.classId,
      });
    }

    return admirationResult!;
  } catch (error) {
    console.error("Error sending admiration:", error);
    throw error;
  }
}

/**
 * Get count of story reactions sent by a student today (đọc từ users.admirationsSentStoryToday)
 */
export async function getTodayStoryReactionCount(studentId: string): Promise<number> {
  try {
    if (!studentId) return 0;

    const userRef = doc(db, USERS_COLLECTION, studentId);
    const userSnap = await getDoc(userRef);
    if (!userSnap.exists()) return 0;

    const data = userSnap.data();
    const sent = data.admirationsSentStoryToday;
    const todayKey = getTodayDateKey();
    if (!sent || sent.dateKey !== todayKey) return 0;
    return typeof sent.count === "number" ? sent.count : 0;
  } catch (error) {
    console.error("Error getting today story reaction count:", error);
    return 0;
  }
}

/**
 * Append admiration message to a user (dùng bởi reactStory)
 * Cập nhật cả admirationsSentStoryToday cho sender
 */
export async function appendAdmirationToUser(
  toStudentId: string,
  toStudentName: string,
  msg: Omit<AdmirationMessageItem, "time"> & { time?: Date | Timestamp },
  options?: { fromStudentId?: string; isStoryReaction?: boolean; skipIncrementSenderCount?: boolean }
): Promise<void> {
  void toStudentName;
  const recipientRef = doc(db, USERS_COLLECTION, toStudentId);
  const msgItem: AdmirationMessageItem = {
    ...msg,
    time: msg.time ?? Timestamp.now(),
  };

  const senderId = options?.fromStudentId ?? msg.fromStudentId;
  const isStoryReaction = options?.isStoryReaction ?? msg.type === "reactStory";
  const skipIncrementSenderCount = options?.skipIncrementSenderCount ?? false;

  await runTransaction(db, async (transaction) => {
    // BẮT BUỘC: Tất cả reads trước khi có write
    const recipientSnap = await transaction.get(recipientRef);
    let senderSnap = null;
    if (isStoryReaction && senderId) {
      const senderRef = doc(db, USERS_COLLECTION, senderId);
      senderSnap = await transaction.get(senderRef);
    }

    // Writes (sau khi đã read xong)
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

    if (isStoryReaction && senderId && senderSnap && !skipIncrementSenderCount) {
      const senderRef = doc(db, USERS_COLLECTION, senderId);
      const senderData = senderSnap.exists() ? senderSnap.data() : {};
      const sentToday = senderData.admirationsSentStoryToday;
      const todayKey = getTodayDateKey();
      const currentCount =
        sentToday && sentToday.dateKey === todayKey
          ? (typeof sentToday.count === "number" ? sentToday.count : 0)
          : 0;

      transaction.update(senderRef, {
        admirationsSentStoryToday: { dateKey: todayKey, count: currentCount + 1 },
        updatedAt: serverTimestamp(),
      });
    }
  });
}

export interface AppendGameInviteMessageParams {
  toStudentId: string;
  toStudentName: string;
  fromStudentId: string;
  fromStudentName: string;
  fromStudentAvatarUrl?: string | null;
  gameId: string;
  roomId: string;
  inviteId: string;
}

/**
 * Ghi lời mời đấu solo vào admirationsMessage khi người nhận đang học.
 * Không cộng bánh / countHeart — chỉ thông báo trong Messages.
 */
export async function appendGameInviteMessage(
  params: AppendGameInviteMessageParams
): Promise<void> {
  const {
    toStudentId,
    fromStudentId,
    fromStudentName,
    fromStudentAvatarUrl,
    gameId,
    roomId,
    inviteId,
  } = params;

  const recipientRef = doc(db, USERS_COLLECTION, toStudentId);
  const msgItem: AdmirationMessageItem = {
    fromStudentAvatarUrl: fromStudentAvatarUrl ?? undefined,
    name: fromStudentName,
    value: 0,
    time: Timestamp.now(),
    fromStudentId,
    type: "gameInvite",
    gameId,
    roomId,
    inviteId,
  };

  await runTransaction(db, async (transaction) => {
    const recipientSnap = await transaction.get(recipientRef);
    const data = recipientSnap.exists() ? recipientSnap.data() : {};
    const existing = (data.admirationsMessage ?? []) as AdmirationMessageItem[];
    const withoutSameRoom = existing.filter(
      (m) => !(m.type === "gameInvite" && m.roomId === roomId)
    );
    const trimmed = keepMessagesInLastDays([...withoutSameRoom, msgItem]);

    if (recipientSnap.exists()) {
      transaction.update(recipientRef, {
        admirationsMessage: trimmed,
        updatedAt: serverTimestamp(),
      });
    } else {
      transaction.set(recipientRef, {
        admirationsMessage: trimmed,
        updatedAt: serverTimestamp(),
      });
    }
  });
}

/** Xoá tin gameInvite đã xử lý khỏi admirationsMessage. */
export async function removeGameInviteMessage(
  studentId: string,
  roomId: string
): Promise<void> {
  if (!studentId || !roomId) return;
  const userRef = doc(db, USERS_COLLECTION, studentId);
  await runTransaction(db, async (transaction) => {
    const snap = await transaction.get(userRef);
    if (!snap.exists()) return;
    const existing = (snap.data().admirationsMessage ?? []) as AdmirationMessageItem[];
    const next = existing.filter(
      (m) => !(m.type === "gameInvite" && m.roomId === roomId)
    );
    if (next.length === existing.length) return;
    transaction.update(userRef, {
      admirationsMessage: next,
      updatedAt: serverTimestamp(),
    });
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
