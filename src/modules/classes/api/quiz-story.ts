"use client";

import { db } from "@/lib/firebase/client";
import { collection, doc, getDoc, getDocs, runTransaction, Timestamp, serverTimestamp } from "firebase/firestore";
import { IQuizStory, IClassStory, IClassStoryReactionCounts } from "../types";
import { createCurrencyTransaction } from "@/modules/admin/services/currency.service";
import { UserRole } from "@/lib/auth/types";
import {
  getTodayStoryReactionCount,
  appendAdmirationToUser,
} from "./admiration";

const CLASSES_COLLECTION = "classes";
const USERS_COLLECTION = "users";
const STORIES_FIELD = "stories";
const STORY_EXPIRY_HOURS = 7 * 24;
const MAX_STORY_REACTIONS_PER_DAY = 5; // 5 react có thưởng/ngày, vượt quá vẫn có icon nhưng không thưởng

// Type for Firestore story data (may have Timestamp instead of Date)
type FirestoreClassStory = Omit<IClassStory, "createdAt" | "expiresAt"> & {
  createdAt?: Date | Timestamp | string | number;
  expiresAt?: Date | Timestamp | string | number;
  reaction?: IClassStoryReactionCounts;
};

// Re-export getTodayStoryReactionCount from services-admiration (đọc từ users)
export { getTodayStoryReactionCount } from "./admiration";

/**
 * Get bread amount for a reaction type
 */
function getReactionBreadAmount(reactionType: "like" | "heart" | "wow" | "haha" | "dislike"): number {
  const reactionValues: Record<"like" | "heart" | "wow" | "haha" | "dislike", number> = {
    dislike: 0,
    haha: 0,
    like: 1,
    heart: 1,
    wow: 3,
  };
  return reactionValues[reactionType] ?? 0;
}

/**
 * Tổng bánh của một story theo reaction counts (wow=3, heart=1, like=1, haha=0).
 * Dùng để sort: tương tác ít nhất (bánh ít) xếp trước.
 */
export function getStoryBreadSum(reaction: IClassStoryReactionCounts | undefined): number {
  if (!reaction) return 0;
  return (reaction.wow || 0) * 3 + (reaction.heart || 0) * 1 + (reaction.like || 0) * 1 + (reaction.haha || 0) * 0;
}

/**
 * Convert Firestore story to IClassStory (handle Timestamps)
 */
function parseFirestoreStory(s: FirestoreClassStory): IClassStory {
  const createdAt =
    s.createdAt && typeof s.createdAt === "object" && "toDate" in s.createdAt
      ? (s.createdAt as Timestamp).toDate()
      : s.createdAt instanceof Date
        ? s.createdAt
        : s.createdAt
          ? new Date(s.createdAt as string | number)
          : new Date();

  const expiresAt =
    s.expiresAt && typeof s.expiresAt === "object" && "toDate" in s.expiresAt
      ? (s.expiresAt as Timestamp).toDate()
      : s.expiresAt instanceof Date
        ? s.expiresAt
        : s.expiresAt
          ? new Date(s.expiresAt as string | number)
          : new Date(createdAt.getTime() + STORY_EXPIRY_HOURS * 60 * 60 * 1000);

  return {
    ...s,
    reaction: s.reaction || { wow: 0, heart: 0, haha: 0, like: 0 },
    userReactions: s.userReactions || {},
    createdAt,
    expiresAt,
  };
}

/**
 * Save a quiz story to class document (classes/{classId}.stories)
 */
export async function saveQuizStory(
  classId: string,
  userId: string,
  storyData: {
    bookId: string;
    bookName?: string;
    lessonIds: number[];
    lessonNames?: string[];
    score: number;
    totalWords: number;
    accuracy: number;
    isCompleted: boolean;
    studentName: string;
    avatarUrl?: string;
  }
): Promise<IQuizStory> {
  if (!classId || !userId) {
    throw new Error("Class ID and User ID are required");
  }

  if (!storyData.lessonIds || storyData.lessonIds.length === 0) {
    throw new Error("At least one lesson ID is required");
  }

  try {
    const classRef = doc(db, CLASSES_COLLECTION, classId);
    const now = new Date();
    const expiresAt = new Date(now.getTime() + STORY_EXPIRY_HOURS * 60 * 60 * 1000);
    const lessonIdsStr = [...storyData.lessonIds].sort().join("_");
    const storyId = `${userId}_${storyData.bookId}_${lessonIdsStr}_${now.getTime()}`;

    const newStory: IClassStory = {
      bookName: storyData.bookName || `Sách ${storyData.bookId}`,
      lessonIds: storyData.lessonIds,
      accuracy: storyData.accuracy,
      score: storyData.score,
      total: storyData.totalWords,
      reaction: { wow: 0, heart: 0, haha: 0, like: 0 },
      userReactions: {},
      donatedUsers: [],
      createdAt: now,
      expiresAt,
    };

    await runTransaction(db, async (transaction) => {
      const classDoc = await transaction.get(classRef);
      if (!classDoc.exists()) {
        throw new Error("Class not found");
      }

      const data = classDoc.data();
      const stories: Record<string, Record<string, FirestoreClassStory>> =
        data[STORIES_FIELD] || {};

      if (!stories[userId]) {
        stories[userId] = {};
      }

      // Clean expired stories for this user
      const userStories = stories[userId];
      const cleanedUserStories: Record<string, FirestoreClassStory> = {};
      for (const [sid, story] of Object.entries(userStories)) {
        const parsed = parseFirestoreStory(story);
        if (parsed.expiresAt > now) {
          cleanedUserStories[sid] = {
            ...story,
            createdAt: story.createdAt instanceof Timestamp ? story.createdAt : Timestamp.fromDate(parsed.createdAt),
            expiresAt: story.expiresAt instanceof Timestamp ? story.expiresAt : Timestamp.fromDate(parsed.expiresAt),
          };
        }
      }

      cleanedUserStories[storyId] = {
        ...newStory,
        reaction: newStory.reaction,
        userReactions: newStory.userReactions,
        donatedUsers: newStory.donatedUsers,
        createdAt: Timestamp.fromDate(now),
        expiresAt: Timestamp.fromDate(expiresAt),
      };

      stories[userId] = cleanedUserStories;

      transaction.update(classRef, {
        [STORIES_FIELD]: stories,
        updatedAt: serverTimestamp(),
      });
    });

    return {
      id: storyId,
      userId,
      studentName: storyData.studentName,
      avatarUrl: storyData.avatarUrl,
      bookId: storyData.bookId,
      bookName: storyData.bookName || `Sách ${storyData.bookId}`,
      lessonIds: storyData.lessonIds,
      lessonNames: storyData.lessonNames,
      score: storyData.score,
      totalWords: storyData.totalWords,
      accuracy: storyData.accuracy,
      isCompleted: storyData.isCompleted,
      createdAt: now,
      lastSaveStory: now,
      reactions: [],
    };
  } catch (error) {
    console.error("Error saving quiz story:", error);
    throw error;
  }
}

/**
 * Get user info (name, avatarUrl, role) for enriching stories
 */
async function getUserInfo(userId: string): Promise<{ name: string; avatarUrl?: string; role?: string }> {
  try {
    const userRef = doc(db, USERS_COLLECTION, userId);
    const userSnap = await getDoc(userRef);
    if (userSnap.exists()) {
      const d = userSnap.data();
      return {
        name: d.name || d.displayName || "Học sinh",
        avatarUrl: d.avatarUrl,
        role: d.role,
      };
    }
  } catch {
    // ignore
  }
  return { name: "Học sinh" };
}

/**
 * Convert IClassStory to IQuizStory for UI (with user info)
 */
/**
 * Đọc tên sách / bài từ classes.stories (cho inbox, thông báo react story).
 */
export async function getClassStoryMeta(
  classId: string,
  storyOwnerId: string,
  storyId: string
): Promise<{ bookName: string; lessonLabel: string } | null> {
  if (!classId || !storyOwnerId || !storyId) return null;
  try {
    const classRef = doc(db, CLASSES_COLLECTION, classId);
    const classSnap = await getDoc(classRef);
    if (!classSnap.exists()) return null;
    const data = classSnap.data();
    const storiesMap =
      (data[STORIES_FIELD] as Record<
        string,
        Record<string, FirestoreClassStory & { lessonNames?: string[] }>
      >) || {};
    const raw = storiesMap[storyOwnerId]?.[storyId];
    if (!raw) return null;
    const parsed = parseFirestoreStory(raw);
    const lessonNames = raw.lessonNames;
    const lessonLabel =
      Array.isArray(lessonNames) && lessonNames.length > 0
        ? lessonNames.join(", ")
        : (parsed.lessonIds ?? []).length > 0
          ? parsed.lessonIds.join(", ")
          : "—";
    return {
      bookName: parsed.bookName || "Story",
      lessonLabel,
    };
  } catch (error) {
    console.error("getClassStoryMeta:", error);
    return null;
  }
}

function classStoryToQuizStory(
  storyId: string,
  userId: string,
  classId: string,
  story: IClassStory,
  userInfo: { name: string; avatarUrl?: string }
): IQuizStory {
  const { userReactions = {}, reaction = {}, donatedUsers = [] } = story;

  return {
    id: storyId,
    userId,
    classId,
    studentName: userInfo.name,
    avatarUrl: userInfo.avatarUrl,
    bookName: story.bookName,
    lessonIds: story.lessonIds,
    score: story.score,
    totalWords: story.total,
    accuracy: story.accuracy,
    isCompleted: story.accuracy >= 90,
    createdAt: story.createdAt,
    lastSaveStory: story.createdAt,
    reactions: [], // Legacy - dùng reactionCounts
    reactionCounts: reaction,
    userReactionsMap: userReactions,
    donatedUsers,
  };
}

/**
 * Get quiz stories from class document (classes/{classId}.stories)
 */
export async function getClassQuizStories(
  classId: string,
  hours: number = STORY_EXPIRY_HOURS
): Promise<IQuizStory[]> {
  if (!classId) return [];

  try {
    const classRef = doc(db, CLASSES_COLLECTION, classId);
    const classSnap = await getDoc(classRef);

    if (!classSnap.exists()) {
      return [];
    }

    const data = classSnap.data();
    const storiesMap = (data[STORIES_FIELD] as Record<string, Record<string, FirestoreClassStory>>) || {};

    const now = new Date();
    const cutoffTime = new Date(now.getTime() - hours * 60 * 60 * 1000);
    const allStories: IQuizStory[] = [];

    const userIds = Object.keys(storiesMap);
    const userInfoCache: Record<string, { name: string; avatarUrl?: string }> = {};

    for (const userId of userIds) {
      if (!userInfoCache[userId]) {
        userInfoCache[userId] = await getUserInfo(userId);
      }
      const userInfo = userInfoCache[userId];

      for (const [storyId, story] of Object.entries(storiesMap[userId] || {})) {
        const parsed = parseFirestoreStory(story);
        if (parsed.createdAt >= cutoffTime && parsed.expiresAt > now) {
          allStories.push(classStoryToQuizStory(storyId, userId, classId, parsed, userInfo));
        }
      }
    }

    allStories.sort((a, b) => {
      const timeA = a.lastSaveStory || a.createdAt;
      const timeB = b.lastSaveStory || b.createdAt;
      return timeB.getTime() - timeA.getTime();
    });

    return allStories;
  } catch (error) {
    console.error("Error getting class quiz stories:", error);
    return [];
  }
}

/**
 * Get quiz stories across all classes in the system.
 */
export async function getAllSystemQuizStories(
  hours: number = STORY_EXPIRY_HOURS
): Promise<IQuizStory[]> {
  try {
    const classSnaps = await getDocs(collection(db, CLASSES_COLLECTION));
    const allStoriesByClass = await Promise.all(
      classSnaps.docs.map(async (classDoc) => getClassQuizStories(classDoc.id, hours))
    );
    const allStories = allStoriesByClass.flat();
    allStories.sort((a, b) => {
      const timeA = a.lastSaveStory || a.createdAt;
      const timeB = b.lastSaveStory || b.createdAt;
      return timeB.getTime() - timeA.getTime();
    });
    return allStories;
  } catch (error) {
    console.error("Error getting all system quiz stories:", error);
    return [];
  }
}

type UserReactionsMap = Record<string, "wow" | "heart" | "haha" | "like">;

/**
 * Add a reaction to a quiz story in class document.
 * Mỗi user chỉ được react 1 lần (dựa vào userReactions[id]).
 * Chính người đăng react thì không tạo currency.
 */
export async function addQuizStoryReaction(
  classId: string,
  ownerUserId: string,
  storyId: string,
  reaction: {
    userId: string;
    userName: string;
    reactionType: "like" | "heart" | "wow" | "haha" | "dislike";
  }
): Promise<{ breadDonated: boolean }> {
  if (!classId || !ownerUserId || !storyId) {
    throw new Error("Class ID, Owner User ID and Story ID are required");
  }

  const actualType: "wow" | "heart" | "haha" | "like" =
    reaction.reactionType === "dislike" ? "haha" : reaction.reactionType;

  let isNewReaction = false;

  try {
    const todayCount = await getTodayStoryReactionCount(reaction.userId);
    const isWithinLimit = todayCount < MAX_STORY_REACTIONS_PER_DAY;

    const classRef = doc(db, CLASSES_COLLECTION, classId);

    await runTransaction(db, async (transaction) => {
      const classDoc = await transaction.get(classRef);
      if (!classDoc.exists()) {
        throw new Error("Class not found");
      }

      const data = classDoc.data();
      const stories: Record<string, Record<string, FirestoreClassStory>> =
        { ...(data[STORIES_FIELD] || {}) };

      if (!stories[ownerUserId] || !stories[ownerUserId][storyId]) {
        throw new Error("Story not found");
      }

      const story = stories[ownerUserId][storyId];
      const userReactions: UserReactionsMap = { ...(story.userReactions || {}) };
      const reactionCounts = { ...(story.reaction || { wow: 0, heart: 0, haha: 0, like: 0 }) };
      const existingType = userReactions[reaction.userId];

      if (existingType) {
        if (existingType === actualType) {
          // Remove: bỏ reaction
          reactionCounts[actualType] = Math.max(0, (reactionCounts[actualType] || 0) - 1);
          delete userReactions[reaction.userId];
          stories[ownerUserId][storyId] = {
            ...story,
            reaction: reactionCounts,
            userReactions,
          };
          transaction.update(classRef, {
            [STORIES_FIELD]: stories,
            updatedAt: serverTimestamp(),
          });
        } else {
          // Change: đổi reaction icon
          reactionCounts[existingType] = Math.max(0, (reactionCounts[existingType] || 0) - 1);
          reactionCounts[actualType] = (reactionCounts[actualType] || 0) + 1;
          userReactions[reaction.userId] = actualType;
          stories[ownerUserId][storyId] = {
            ...story,
            reaction: reactionCounts,
            userReactions,
          };
          transaction.update(classRef, {
            [STORIES_FIELD]: stories,
            updatedAt: serverTimestamp(),
          });
        }
      } else {
        // Add: reaction mới
        reactionCounts[actualType] = (reactionCounts[actualType] || 0) + 1;
        userReactions[reaction.userId] = actualType;

        const donatedUsers = story.donatedUsers || [];
        if (!donatedUsers.includes(reaction.userId)) {
          donatedUsers.push(reaction.userId);
          isNewReaction = true;
        } else {
          isNewReaction = false;
        }

        stories[ownerUserId][storyId] = {
          ...story,
          reaction: reactionCounts,
          userReactions,
          donatedUsers,
        };
        transaction.update(classRef, {
          [STORIES_FIELD]: stories,
          updatedAt: serverTimestamp(),
        });
      }
    });

    let breadDonated = false;

    // Luôn append vào admirationsMessage để bên nhận có thông báo (toast + sound)
    if (isNewReaction && ownerUserId !== reaction.userId) {
      try {
        const ownerInfo = await getUserInfo(ownerUserId);
        const fromUserInfo = await getUserInfo(reaction.userId);
        // Chỉ giáo viên/admin mới tạo bánh khi reaction. HS reaction nhau → 0 bánh
        const senderIsTeacher = fromUserInfo.role === UserRole.TEACHER || fromUserInfo.role === UserRole.ADMIN;
        const breadAmount = senderIsTeacher && isWithinLimit ? getReactionBreadAmount(reaction.reactionType) : 0;

        await appendAdmirationToUser(
          ownerUserId,
          ownerInfo.name,
          {
            fromStudentAvatarUrl: fromUserInfo.avatarUrl,
            name: reaction.userName,
            reactionType: reaction.reactionType,
            value: breadAmount,
            fromStudentId: reaction.userId,
            type: "reactStory",
            classId,
            storyId,
            storyOwnerId: ownerUserId,
          },
          {
            fromStudentId: reaction.userId,
            isStoryReaction: true,
            // Chỉ đếm vào limit/ngày khi thật sự được thưởng (HS reaction nhau không tính)
            skipIncrementSenderCount: !senderIsTeacher || !isWithinLimit,
          }
        );

        if (breadAmount > 0) {
          await createCurrencyTransaction({
            studentId: ownerUserId,
            studentName: ownerInfo.name,
            userId: reaction.userId,
            userName: reaction.userName,
            userRole: (fromUserInfo.role as UserRole) ?? UserRole.TEACHER,
            amount: breadAmount,
            reason: `Nhận reaction (${reaction.reactionType}) từ ${reaction.userName} trên story`,
            type: "add",
            classId,
          });
          breadDonated = true;
        }
      } catch (error) {
        console.error("Error creating currency transaction for story reaction:", error);
      }
    }

    return { breadDonated };
  } catch (error) {
    console.error("Error adding quiz story reaction:", error);
    throw error;
  }
}

/**
 * Remove a reaction from a quiz story (dựa vào userReactions)
 */
export async function removeQuizStoryReaction(
  classId: string,
  ownerUserId: string,
  storyId: string,
  reactingUserId: string
): Promise<void> {
  if (!classId || !ownerUserId || !storyId || !reactingUserId) return;

  const classRef = doc(db, CLASSES_COLLECTION, classId);

  await runTransaction(db, async (transaction) => {
    const classDoc = await transaction.get(classRef);
    if (!classDoc.exists()) return;

    const data = classDoc.data();
    const stories: Record<string, Record<string, FirestoreClassStory>> =
      { ...(data[STORIES_FIELD] || {}) };

    if (!stories[ownerUserId]?.[storyId]) return;

    const story = stories[ownerUserId][storyId];
    const userReactions: UserReactionsMap = { ...(story.userReactions || {}) };
    const existingType = userReactions[reactingUserId];
    if (!existingType) return;

    const reactionCounts = { ...(story.reaction || { wow: 0, heart: 0, haha: 0, like: 0 }) };
    reactionCounts[existingType] = Math.max(0, (reactionCounts[existingType] || 0) - 1);
    delete userReactions[reactingUserId];

    stories[ownerUserId][storyId] = {
      ...story,
      reaction: reactionCounts,
      userReactions,
    };

    transaction.update(classRef, {
      [STORIES_FIELD]: stories,
      updatedAt: serverTimestamp(),
    });
  });
}

/**
 * Get quiz stories for a specific user (from a class)
 * Wrapper - filters getClassQuizStories by userId
 */
export async function getQuizStories(
  classId: string,
  userId: string,
  hours: number = STORY_EXPIRY_HOURS
): Promise<IQuizStory[]> {
  const all = await getClassQuizStories(classId, hours);
  return all.filter((s) => s.userId === userId);
}

/**
 * Get lastSaveStory (most recent story createdAt) for a user in a class
 */
export async function getLastSaveStory(
  classId: string,
  userId: string
): Promise<Date | null> {
  if (!classId || !userId) return null;

  try {
    const stories = await getClassQuizStories(classId, STORY_EXPIRY_HOURS);
    const userStories = stories.filter((s) => s.userId === userId);
    if (userStories.length === 0) return null;
    const mostRecent = userStories.reduce((a, b) =>
      (a.lastSaveStory || a.createdAt).getTime() > (b.lastSaveStory || b.createdAt).getTime()
        ? a
        : b
    );
    return mostRecent.lastSaveStory || mostRecent.createdAt;
  } catch (error) {
    console.error("Error getting last save story:", error);
    return null;
  }
}

/**
 * Check if lastSaveStory is within story expiry window (7 days)
 */
export function isLastSaveStoryRecent(lastSaveStory: Date | null): boolean {
  if (!lastSaveStory) return false;
  const now = new Date();
  const hoursDiff = (now.getTime() - lastSaveStory.getTime()) / (1000 * 60 * 60);
  return hoursDiff <= STORY_EXPIRY_HOURS;
}
