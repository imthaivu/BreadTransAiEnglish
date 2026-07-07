export interface AppUserProfile {
  uid: string;
  displayName: string | null;
  email?: string;
  phone?: string;
  address?: string;
  bankAccount?: string;
  /** Thông tin nhận tiền: ảnh QR ngân hàng (storage), tên NH, số TK, tên người nhận */
  bankQrUrl?: string;
  bankName?: string;
  /** Mã BIN ngân hàng (VietQR) — khôi phục picker và tạo QR */
  bankBin?: string;
  bankAccountNumber?: string;
  bankAccountName?: string;
  avatarUrl?: string;
  role: UserRole;
  classIds?: string[];
  isActive: boolean;
  totalBanhRan?: number;
  createdAt: Date;
  updatedAt: Date;
  streakCount?: number;
  lastStreakUpdate?: Date;
  parentName?: string;
  parentPhone?: string;
  achievements?: string;
  sessionToken?: string;
  loginCount?: number;
  lastLoginAt?: Date;
  lastDeviceType?: "pc" | "non-pc"; // Track last device type for login count logic
  // Admiration notifications - lưu trong users, chỉ giữ 7 ngày gần nhất (FIFO)
  admirationsMessage?: { fromStudentAvatarUrl?: string; name: string; reactionType?: string; value: number; time: Date | unknown }[];
  admirationsSentToday?: { dateKey: string; count: number };
  admirationsSentStoryToday?: { dateKey: string; count: number };
  timesVocabXS?: number;
  timesVocab?: number;
  /** Tên media đã hoàn thành (phim/nhạc/ngữ pháp) — bỏ qua silent tracking khi xem lại */
  movies?: string[];
  quizAccuracy?: number;
  speakingAccuracy?: number;
  countHeart?: number;
  /** Vé chơi game có thưởng bánh — do giáo viên cấp, mỗi vé hết hạn sau 24h. */
  gameTickets?: { expiresAt: string; grantedBy: string; grantedAt: string }[];
  /** @deprecated Dùng gameTickets — giữ khi migrate dữ liệu cũ. */
  allowedTicket?: boolean;
  ticketExpiresAt?: string;
  ticketGrantedBy?: string;
  ticketGrantedAt?: string;
}

export enum UserRole {
  STUDENT = "student",
  TEACHER = "teacher",
  ADMIN = "admin",
}
