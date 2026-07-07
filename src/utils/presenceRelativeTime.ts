/** Firestore Timestamp / plain seconds / Date → Date (dùng chung dashboard, presence UI). */
export function toPresenceDate(timestamp: unknown): Date | null {
  if (timestamp == null) return null;
  let date: Date;
  if (typeof (timestamp as { toDate?: () => Date }).toDate === "function") {
    date = (timestamp as { toDate: () => Date }).toDate();
  } else if (
    typeof timestamp === "object" &&
    timestamp !== null &&
    "seconds" in timestamp &&
    typeof (timestamp as { seconds: number }).seconds === "number"
  ) {
    date = new Date((timestamp as { seconds: number }).seconds * 1000);
  } else if (timestamp instanceof Date) {
    date = timestamp;
  } else {
    date = new Date(timestamp as string | number);
  }
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

/**
 * Hiển thị "vừa xong", "N phút trước", … từ Firestore Timestamp / Date (giống MembersList).
 */
export function formatPresenceRelativeTime(timestamp: unknown): string | null {
  const date = toPresenceDate(timestamp);
  if (!date) return null;

  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  if (diffMs < 0) return "vừa xong";

  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return "vừa xong";
  if (diffMins < 60) return `${diffMins} phút trước`;

  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours} giờ trước`;

  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays} ngày trước`;

  const diffWeeks = Math.floor(diffDays / 7);
  if (diffDays < 30) return `${diffWeeks} tuần trước`;

  const diffMonths = Math.floor(diffDays / 30);
  if (diffDays < 365) return `${diffMonths} tháng trước`;

  const diffYears = Math.floor(diffDays / 365);
  return `${diffYears} năm trước`;
}

/**
 * Ngược với formatPresenceRelativeTime: hiển thị thời gian CÒN LẠI tới một mốc
 * trong tương lai ("còn N phút", "còn N giờ", …). Trả về null nếu đã qua mốc.
 */
export function formatRemainingTime(timestamp: unknown): string | null {
  const date = toPresenceDate(timestamp);
  if (!date) return null;

  const now = new Date();
  const diffMs = date.getTime() - now.getTime();
  if (diffMs <= 0) return null;

  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return "dưới 1 phút";
  if (diffMins < 60) return `còn ${diffMins} phút`;

  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `còn ${diffHours} giờ`;

  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `còn ${diffDays} ngày`;

  const diffWeeks = Math.floor(diffDays / 7);
  if (diffDays < 30) return `còn ${diffWeeks} tuần`;

  const diffMonths = Math.floor(diffDays / 30);
  if (diffDays < 365) return `còn ${diffMonths} tháng`;

  const diffYears = Math.floor(diffDays / 365);
  return `còn ${diffYears} năm`;
}

/**
 * Rút gọn cho badge trên avatar: m, h, d, w, M (tháng), Y.
 */
export function formatPresenceShort(timestamp: unknown): string | null {
  const date = toPresenceDate(timestamp);
  if (!date) return null;

  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  if (diffMs < 0) return "0m";

  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return "0m";
  if (diffMins < 60) return `${diffMins}m`;

  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h`;

  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays}d`;

  const diffWeeks = Math.floor(diffDays / 7);
  if (diffDays < 30) return `${diffWeeks}w`;

  const diffMonths = Math.floor(diffDays / 30);
  if (diffDays < 365) return `${diffMonths}M`;

  const diffYears = Math.floor(diffDays / 365);
  return `${diffYears}Y`;
}
