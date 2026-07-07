/**
 * Global presence types (Firebase Realtime Database).
 * Thay cho cơ chế presence cũ lưu trong Firestore `classes/{id}.presences`.
 */

export type ActivityTabLabel = "Home" | "Grammar" | "Learn" | "AI" | "Hồ sơ";

export type LearnMiniTab = "Từ vựng" | "Speaking";

export type LearnMode =
  | "đáp án"
  | "quiz"
  | "flashcard"
  | "listening"
  | "speaking"
  | "submiting"
  | "none";

/** Chi tiết hoạt động khi học sinh đang ở tab Learn (do màn Learn đẩy vào store). */
export interface LearnActivity {
  miniTab: LearnMiniTab;
  mode: LearnMode;
  bookName?: string;
  lessons?: number[];
  pending?: boolean;
}

/** Vị trí hiện tại của user — ghi realtime vào `/presence/{uid}/currentActivity`. */
export interface CurrentActivity {
  tab: ActivityTabLabel;
  /** serverTimestamp() khi ghi. */
  updatedAt: number;
  // Chỉ có khi tab === "Learn":
  miniTab?: LearnMiniTab;
  mode?: LearnMode;
  bookName?: string;
  lessons?: number[];
  pending?: boolean;
}

/** Node `/presence/{uid}` trên RTDB. */
export interface RtdbPresence {
  online: boolean;
  /** serverTimestamp() (ms). */
  lastSeen: number;
  /** displayName — để hiển thị tên cho user khác lớp / fallback. */
  name: string;
  /** Vị trí hiện tại (last-known, giữ lại cả khi offline). */
  currentActivity?: CurrentActivity;
}
