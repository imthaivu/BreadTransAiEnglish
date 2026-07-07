"use client";

/**
 * Presence cũ (Firestore `classes/{id}.presences`) đã được thay bằng global
 * presence trên Realtime Database — xem `src/modules/presence`.
 *
 * File này chỉ còn các helper đọc thông tin user (tên/avatar) đã cache trong
 * localStorage để hiển thị nhanh ở vài chỗ (Inbox/Admiration). Không còn ghi
 * hay đọc presence trên Firestore.
 */

const USER_INFO_STORAGE_KEY = "presence_user_info";

export interface StoredUserInfo {
  name: string;
  avatarUrl: string;
  lastUpdated: number;
}

/** Lấy thông tin user đã cache trong localStorage (hoặc null). */
export function getUserInfoFromLocalStorage(
  userId: string
): StoredUserInfo | null {
  if (typeof window === "undefined" || !userId) return null;

  try {
    const stored = window.localStorage.getItem(USER_INFO_STORAGE_KEY);
    if (!stored) return null;

    const userInfoMap: Record<string, StoredUserInfo> = JSON.parse(stored);
    return userInfoMap[userId] || null;
  } catch (error) {
    console.error("Error getting user info from localStorage:", error);
    return null;
  }
}

/** Lấy toàn bộ thông tin user đã cache trong localStorage. */
export function getAllUserInfoFromLocalStorage(): Record<
  string,
  StoredUserInfo
> {
  if (typeof window === "undefined") return {};

  try {
    const stored = window.localStorage.getItem(USER_INFO_STORAGE_KEY);
    if (!stored) return {};

    return JSON.parse(stored) as Record<string, StoredUserInfo>;
  } catch (error) {
    console.error("Error getting all user info from localStorage:", error);
    return {};
  }
}
