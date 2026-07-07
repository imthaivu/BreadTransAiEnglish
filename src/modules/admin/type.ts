// ===== CLASS MANAGEMENT =====
export enum ClassStatus {
  ACTIVE = "active",
  INACTIVE = "inactive",
}

export interface IClassTeacher {
  id: string;
  name: string;
  avatarUrl?: string;
  phone?: string;
}

export interface IClassSummary {
  studentCount: number;
  totalSubmissions?: number;
  averageProgress?: number;
  lastActivityAt?: Date;
}

export interface IClassMember {
  id: string; // This will be the user ID
  name: string;
  avatarUrl?: string;
  phone?: string;
  role: "student" | "teacher";
  status: "active" | "inactive";
  joinedAt: Date;
  tuitionRenewalAt?: Date;
}

export type { ClassRankSnapshot } from "../classes/utils/class-rank";

/** Entry trong classes.pendingEvaluations — bài speaking chưa có điểm thủ công. */
export interface IPendingSpeakingEvaluationEntry {
  studentId: string;
  studentName: string;
  avatarUrl?: string;
  bookId: string;
  lessonId: number;
  fileUrl: string;
  duration?: number;
  submittedAt: import("firebase/firestore").Timestamp | Date;
  issueSpeaking?: string;
}

export interface IClass {
  id: "string";
  name: string;
  status: ClassStatus;
  links: {
    zalo?: string;
    meet?: string;
  };
  teachers?: IClassTeacher[];
  summary?: IClassSummary;
  noteProcess?: string; // Ghi chú quá trình học tập - giáo viên có thể chỉnh sửa
  students?: Array<{studentId: string; name: string}>; // Array of student objects with studentId and name for offline viewing
  /** Snapshot xếp hạng lớp — GV cập nhật qua Get all info, HS đọc từ class doc. */
  rank?: import("../classes/utils/class-rank").ClassRankSnapshot;
  /**
   * @deprecated Presence đã chuyển sang Realtime Database (`src/modules/presence`).
   * Không còn được đọc/ghi; giữ kiểu cho dữ liệu cũ còn sót lại.
   */
  presences?: Record<string, import("firebase/firestore").Timestamp>;
  /** Bài speaking chưa chấm thủ công — key: studentId_bookId_lessonId */
  pendingEvaluations?: Record<string, IPendingSpeakingEvaluationEntry>;
  createdAt: Date;
  updatedAt: Date;
}
