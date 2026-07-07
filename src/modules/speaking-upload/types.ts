import { Timestamp } from "firebase/firestore";

export interface SpeakingSubmission {
  studentId: string;
  studentName: string;
  bookId: string;
  lessonId: number;
  fileURL: string;
  originalFileName: string;
  submittedAt: Timestamp;
}

export const SPEAKING_MAX_FILE_BYTES = 15 * 1024 * 1024; // 15MB
export const SPEAKING_MIN_FILE_BYTES = 1024; // 1KB - smaller is likely broken/empty audio

// Số lần phải nghe bài trước khi được nộp speaking (server-side gate).
export const SPEAKING_MIN_LISTEN_COUNT = 3;

// Tỷ lệ duration (recorded / reference) hợp lệ. Ngoài khoảng này
// được coi là ghi âm gian lận / lỗi metadata.
export const SPEAKING_MIN_DURATION_RATIO = 0.5;
export const SPEAKING_MAX_DURATION_RATIO = 2;

// Whitelist MIME audio được chấp nhận. Ngoài danh sách này có thể là
// upload giả mạo (ví dụ JSON, exe được rename thành .webm).
export const SPEAKING_ALLOWED_MIME_TYPES: readonly string[] = [
  "audio/webm",
  "audio/ogg",
  "audio/mpeg",
  "audio/mp3",
  "audio/wav",
  "audio/x-wav",
  "audio/wave",
  "audio/x-m4a",
  "audio/mp4",
  "audio/aac",
  // iOS Safari MediaRecorder đôi khi trả về video/mp4 dù chỉ ghi âm.
  "video/mp4",
];

/** Chuẩn hóa MIME từ recorder (đặc biệt Safari/iOS) trước khi validate/upload. */
export function normalizeSpeakingMimeType(
  mime: string | null | undefined,
  fileName?: string
): string {
  const lower = (mime ?? "").split(";")[0]?.trim().toLowerCase() ?? "";
  if (lower === "video/mp4") return "audio/mp4";
  if (lower) return lower;

  const ext = fileName?.split(".").pop()?.toLowerCase();
  if (ext === "mp4" || ext === "m4a") return "audio/mp4";
  if (ext === "mp3") return "audio/mpeg";
  if (ext === "ogg") return "audio/ogg";
  if (ext === "wav") return "audio/wav";
  return "audio/webm";
}

// Trần số lần evaluate / lesson / user trong vòng 1 giờ (chống spam Gemini API).
export const SPEAKING_EVAL_RATE_LIMIT_PER_HOUR = 20;

// Cấu hình retry server-side khi model nghẽn:
// sau khi nộp thành công nhưng chấm lỗi, server sẽ xếp hàng chấm lại.
export const SPEAKING_EVAL_RETRY_INTERVAL_MS = 60 * 1000; // 1 phút
export const SPEAKING_EVAL_MAX_RETRY_ATTEMPTS = 10;
