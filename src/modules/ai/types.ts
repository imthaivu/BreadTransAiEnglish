export const AI_SPEAKING_MAX = 10;
export const AI_WRITING_MAX = 10;

export const AI_OCR_LIMIT_PER_HOUR = 30;
export const AI_TTS_LIMIT_PER_HOUR = 20;
export const AI_WRITING_LIMIT_PER_HOUR = 20;
export const AI_GRADE_LIMIT_PER_HOUR = 30;
export const AI_IP_LIMIT_PER_HOUR = 80;

/** Hạn mức số lượt gọi AI mỗi tuần theo vai trò (mọi thao tác AI đều trừ 1). */
export const AI_WEEKLY_LIMIT_STUDENT = 30;
export const AI_WEEKLY_LIMIT_TEACHER = 50;

export type AiWeeklyUsage = {
  used: number;
  limit: number;
  remaining: number;
  weekKey: string;
  resetAt: string;
};

export type WritingKind = "paragraph" | "essay";

/** Số từ mong muốn cho bài viết (thanh kéo). */
export const AI_WRITING_MIN_WORDS = 40;
export const AI_WRITING_MAX_WORDS = 400;
export const AI_WRITING_DEFAULT_WORDS = 150;
export const AI_WRITING_WORDS_STEP = 10;

export type GradeEntry = {
  id: string;
  issue: string;
  score?: number | null;
  at: string;
};

export type SpeakingItem = {
  id: string;
  title: string;
  script: string;
  audioUrl: string;
  audioPath: string;
  voice?: string;
  createdAt: string;
  gradeHistory: GradeEntry[];
  /** Số lần đã nghe mẫu (lưu lại để không phải nghe lại từ đầu). */
  listenCount?: number;
};

export type WritingItem = {
  id: string;
  title: string;
  script: string;
  kind: WritingKind;
  /** Số từ mong muốn. */
  length: number;
  prompt?: string;
  createdAt: string;
};

export const TTS_VOICES = [
  "Zephyr",
  "Puck",
  "Charon",
  "Kore",
  "Fenrir",
  "Leda",
  "Orus",
  "Aoede",
  "Callirrhoe",
  "Autonoe",
  "Enceladus",
  "Iapetus",
  "Umbriel",
  "Algieba",
  "Despina",
  "Erinome",
  "Algenib",
  "Rasalgethi",
  "Laomedeia",
  "Achernar",
  "Alnilam",
  "Schedar",
  "Gacrux",
  "Pulcherrima",
  "Achird",
  "Zubenelgenubi",
  "Vindemiatrix",
  "Sadachbia",
  "Sadaltager",
  "Sulafat",
] as const;

export const DEFAULT_TTS_VOICE = "Kore";
export const DEFAULT_TTS_MODEL = "gemini-2.5-flash-preview-tts";
export const DEFAULT_OCR_MODEL = "gemini-2.5-flash";
export const DEFAULT_WRITING_MODEL = "gemini-2.5-flash";

export const AI_MIN_LISTEN_COUNT = 3;
