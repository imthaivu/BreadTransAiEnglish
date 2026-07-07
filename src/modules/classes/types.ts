export type ActivityType = "listening" | "quiz" | "speaking";

export interface IStudentActivity {
  id: string;
  student: {
    id: string;
    name: string;
    avatarUrl?: string;
  };
  type: ActivityType;
  details: {
    book?: string;
    lesson?: string;
    module?: string;
  };
  score?: number; // A normalized percentage score (0-100)
  isCompleted?: boolean;
  timestamp: Date;
  sourceUrl?: string; // For listening to speaking submissions
  listenCount?: number; // For listening activities
  /** Độ dài audio (giây) - từ userBookProgress.lessons[].duration */
  duration?: number;
  speakingScore?: string | null;
}

export interface ILessonStudentProgress {
  studentId: string;
  studentName: string;
  studentAvatarUrl?: string;
  listenCount: number; // Sourced from listeningProgress.segmentsPlayed.length or similar
  accuracy: number; // Sourced from listeningProgress.maxProgressPercent
  speakingSubmissionStatus: "submitted" | "graded" | "not-submitted";
  speakingSubmissionUrl?: string;
  speakingScore?: string | null;
}

// ===== Class Stories (lưu trong classes.stories: userId -> storyId -> IClassStory) =====
export interface IClassStoryReactionCounts {
  wow?: number;
  heart?: number;
  haha?: number;
  like?: number;
}

/** userReactions: map reactingUserId -> reactionType (để biết user hiện tại đã react gì, toggle remove) */
export type UserReactionsMap = Record<string, "wow" | "heart" | "haha" | "like">;

export interface IClassStory {
  bookName: string;
  lessonIds: number[];
  accuracy: number;
  score: number;
  total: number;
  reaction: IClassStoryReactionCounts;
  userReactions?: UserReactionsMap; // Map userId -> reactionType (cho toggle/remove)
  donatedUsers?: string[]; // Array of userIds who have generated currency for this story
  createdAt: Date;
  expiresAt: Date; // Hết hạn sau 7 ngày kể từ ngày đăng
}

/** Map structure: stories[userId][storyId] = IClassStory */
export type ClassStoriesMap = Record<string, Record<string, IClassStory>>;

// ===== IQuizStory - Dùng cho UI (flatten từ ClassStoriesMap + enrich với user info) =====
export interface IQuizStory {
  id: string; // storyId
  userId: string;
  classId?: string;
  studentName: string;
  avatarUrl?: string;
  bookId?: string;
  bookName?: string;
  lessonIds: number[]; // Array of lesson IDs
  lessonNames?: string[]; // Optional array of lesson names
  score: number;
  totalWords: number;
  accuracy: number;
  isCompleted: boolean;
  createdAt: Date;
  lastSaveStory?: Date; // Alias of createdAt
  reactions?: IQuizStoryReaction[]; // Legacy - dùng reactionCounts cho count
  /** Reaction counts (wow, heart, haha, like) - từ class stories */
  reactionCounts?: IClassStoryReactionCounts;
  /** Map userId -> reactionType - cho toggle/remove */
  userReactionsMap?: UserReactionsMap;
  /** User IDs already donated/interacted on this story */
  donatedUsers?: string[];
}

export interface IQuizStoryReaction {
  userId: string;
  userName: string;
  reactionType: "like" | "heart" | "wow" | "haha" | "dislike";
  createdAt: Date;
}
