import { GoogleGenerativeAI } from "@google/generative-ai";
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth/server-auth";
import { loadSpeakingScriptForLesson } from "@/lib/speaking/load-speaking-script";
import {
  buildSpeakingGradePrompt,
  countWordWrongForScript,
} from "@/lib/speaking/grade-prompt";
import { getSpeakingModelOrder } from "@/lib/speaking/speaking-models";
import { adminDb } from "@/lib/firebase/admin";
import { updatePendingEvaluationIssueServer } from "@/lib/classes/pending-speaking-sync-server";
import { FieldValue } from "firebase-admin/firestore";
import { checkUserRateLimit, checkIPRateLimit } from "@/lib/rate-limit";
import {
  SPEAKING_ALLOWED_MIME_TYPES,
  SPEAKING_EVAL_RATE_LIMIT_PER_HOUR,
  SPEAKING_EVAL_MAX_RETRY_ATTEMPTS,
  SPEAKING_EVAL_RETRY_INTERVAL_MS,
  SPEAKING_MAX_DURATION_RATIO,
  SPEAKING_MAX_FILE_BYTES,
  SPEAKING_MIN_DURATION_RATIO,
  SPEAKING_MIN_FILE_BYTES,
  SPEAKING_MIN_LISTEN_COUNT,
  normalizeSpeakingMimeType,
} from "@/modules/speaking-upload/types";

const SPEAKING_503_MAX_RETRIES = 5;
const SPEAKING_503_RETRY_DELAY_MS = 2000;

const STORAGE_HOST = "firebasestorage.googleapis.com";
const EXPECTED_BUCKET = process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET ?? "";

type AnomalyMetadata = {
  category?: "system" | "browser" | "security";
  suspicion?: "low" | "medium" | "high";
  blocked?: boolean;
  note?: string;
};

function buildAnomalyIssue(
  reason: string,
  details: Record<string, string | number | boolean | null | undefined> | undefined,
  metadata: AnomalyMetadata | undefined
) {
  const category = metadata?.category ?? "system";
  const suspicion = metadata?.suspicion ?? "high";
  const blocked = metadata?.blocked ?? true;
  const note = metadata?.note?.trim();
  const extras = details
    ? Object.entries(details)
        .filter(([, value]) => value !== undefined)
        .map(([key, value]) => `${key}=${String(value)}`)
        .join(" | ")
    : "";
  const prefix = [
    "[ABNORMAL_SUBMISSION]",
    "source=server",
    `category=${category}`,
    `suspicion=${suspicion}`,
    `blocked=${blocked ? "true" : "false"}`,
  ].join(" ");
  const parts = [`${prefix} reason=${reason}`];
  if (note) parts.push(`note=${note}`);
  if (extras) parts.push(extras);
  return parts.join(" | ");
}

async function logSpeakingAnomalyOnServer(
  userId: string,
  bookId: string,
  lessonId: number,
  reason: string,
  details?: Record<string, string | number | boolean | null | undefined>,
  metadata?: AnomalyMetadata
) {
  if (!userId || !bookId || !Number.isFinite(lessonId) || lessonId <= 0) return;
  const issueSpeaking = buildAnomalyIssue(reason, details, metadata);
  try {
    await adminDb()
      .collection("userBookProgress")
      .doc(`${userId}_${bookId}`)
      .set(
        {
          lessons: {
            [lessonId]: {
              issueSpeaking,
              issueSpeakingAt: FieldValue.serverTimestamp(),
            },
          },
        },
        { merge: true }
      );
  } catch (error) {
    console.error("[evaluate] Failed to log anomaly:", error);
  }
}

/**
 * Tách bucket + path từ Firebase Storage download URL.
 * Trả về null nếu URL không phải Firebase Storage / sai bucket.
 */
function parseFirebaseStoragePath(
  audioUrl: string,
  expectedBucket: string
): { bucket: string; path: string } | null {
  try {
    const u = new URL(audioUrl);
    if (u.host !== STORAGE_HOST) return null;
    const m = u.pathname.match(/^\/v0\/b\/([^/]+)\/o\/(.+)$/);
    if (!m) return null;
    const [, bucket, encodedPath] = m;
    if (!bucket || !encodedPath) return null;
    if (expectedBucket && bucket !== expectedBucket) return null;
    return { bucket, path: decodeURIComponent(encodedPath) };
  } catch {
    return null;
  }
}

/**
 * Kiểm tra path Storage đúng pattern bài nộp speaking.
 * Pattern: speaking_submissions/{date}/book-{bookId}/lesson-{lessonId}/student-{studentId}.{ext}
 */
function isOwnedSpeakingPath(
  path: string,
  studentId: string,
  bookId: string,
  lessonId: number
): boolean {
  if (!path.startsWith("speaking_submissions/")) return false;
  if (!path.includes(`/book-${bookId}/`)) return false;
  if (!path.includes(`/lesson-${lessonId}/`)) return false;
  return new RegExp(`/student-${studentId}\\.[a-zA-Z0-9]+$`).test(path);
}

function extractStudentIdFromSpeakingPath(path: string): string | null {
  const m = path.match(/\/student-([^.]+)\.[a-zA-Z0-9]+$/);
  return m?.[1] ?? null;
}

function isStaffRole(role: string): boolean {
  return role === "teacher" || role === "admin";
}

/** Giáo viên chỉ chấm được học sinh thuộc lớp mình dạy. */
async function teacherCanGradeStudent(
  teacherId: string,
  studentId: string
): Promise<boolean> {
  const userDoc = await adminDb().collection("users").doc(teacherId).get();
  const classIds = userDoc.data()?.classIds;
  if (!Array.isArray(classIds) || classIds.length === 0) return false;

  const checks = await Promise.all(
    classIds.slice(0, 50).map(async (classId: unknown) => {
      if (typeof classId !== "string" || !classId) return false;
      const classDoc = await adminDb().collection("classes").doc(classId).get();
      if (!classDoc.exists) return false;
      const data = classDoc.data();
      const teachers = Array.isArray(data?.teachers) ? data.teachers : [];
      const isTeacher = teachers.some(
        (t: { id?: string }) => typeof t?.id === "string" && t.id === teacherId
      );
      if (!isTeacher) return false;
      const students = Array.isArray(data?.students) ? data.students : [];
      return students.some(
        (s: { studentId?: string }) =>
          typeof s?.studentId === "string" && s.studentId === studentId
      );
    })
  );
  return checks.some(Boolean);
}

/**
 * Đọc audio từ URL với trần kích thước. Tránh việc attacker trỏ tới
 * file 10GB hoặc gây OOM bằng response không có Content-Length.
 */
async function fetchAudioWithLimit(
  audioUrl: string,
  maxBytes: number
): Promise<{ buffer: Buffer; contentType: string | null } | { error: string }> {
  let response: Response;
  try {
    response = await fetch(audioUrl);
  } catch (error) {
    return { error: error instanceof Error ? error.message : "fetch failed" };
  }
  if (!response.ok) {
    return { error: `HTTP ${response.status}` };
  }
  const declared = Number(response.headers.get("content-length") ?? "");
  if (Number.isFinite(declared) && declared > maxBytes) {
    return { error: `content-length ${declared} > ${maxBytes}` };
  }
  const reader = response.body?.getReader();
  if (!reader) {
    return { error: "missing response body" };
  }
  const chunks: Uint8Array[] = [];
  let total = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    total += value.byteLength;
    if (total > maxBytes) {
      try {
        await reader.cancel();
      } catch {
        // ignore cancel errors
      }
      return { error: `streamed ${total} > ${maxBytes}` };
    }
    chunks.push(value);
  }
  const buffer = Buffer.concat(chunks.map((c) => Buffer.from(c)), total);
  return { buffer, contentType: response.headers.get("content-type") };
}

function isAllowedMimeType(mime: string | null | undefined): boolean {
  const normalized = normalizeSpeakingMimeType(mime);
  return SPEAKING_ALLOWED_MIME_TYPES.includes(normalized);
}

type SpeakingEvalRetryJob = {
  jobId: string;
  studentId: string;
  bookId: string;
  lessonId: number;
  audioUrl: string;
  audioMimeType: string;
  recordedDurationSeconds: number;
  referenceDurationSeconds: number;
  retryCount: number;
  maxAttempts: number;
  status: "pending" | "failed" | "resolved";
  nextRetryAt: Date;
  lastError?: string;
  updatedAt: unknown;
};

async function enqueueRetryJob(params: {
  studentId: string;
  bookId: string;
  lessonId: number;
  audioUrl: string;
  audioMimeType: string;
  recordedDurationSeconds: number;
  referenceDurationSeconds: number;
  modelErrors: string[];
}) {
  const {
    studentId,
    bookId,
    lessonId,
    audioUrl,
    audioMimeType,
    recordedDurationSeconds,
    referenceDurationSeconds,
    modelErrors,
  } = params;
  const jobId = `${studentId}_${bookId}_${lessonId}`;
  const nowMs = Date.now();
  const ref = adminDb().collection("speakingEvalRetries").doc(jobId);
  const snap = await ref.get();
  const prev = snap.exists ? (snap.data() as Partial<SpeakingEvalRetryJob>) : null;
  const previousRetryCount =
    typeof prev?.retryCount === "number" && Number.isFinite(prev.retryCount)
      ? prev.retryCount
      : 0;
  const nextRetryCount = previousRetryCount + 1;
  const shouldFail = nextRetryCount >= SPEAKING_EVAL_MAX_RETRY_ATTEMPTS;
  await ref.set(
    {
      jobId,
      studentId,
      bookId,
      lessonId,
      audioUrl,
      audioMimeType,
      recordedDurationSeconds,
      referenceDurationSeconds,
      retryCount: nextRetryCount,
      maxAttempts: SPEAKING_EVAL_MAX_RETRY_ATTEMPTS,
      status: shouldFail ? "failed" : "pending",
      nextRetryAt: new Date(nowMs + SPEAKING_EVAL_RETRY_INTERVAL_MS),
      lastError: modelErrors.join(" | ").slice(0, 2000),
      updatedAt: FieldValue.serverTimestamp(),
      ...(prev?.updatedAt ? {} : { createdAt: FieldValue.serverTimestamp() }),
      ...(shouldFail ? { failedAt: FieldValue.serverTimestamp() } : {}),
    } satisfies Partial<SpeakingEvalRetryJob>,
    { merge: true }
  );
  return { retryCount: nextRetryCount, exhausted: shouldFail };
}

async function markRetryJobResolved(studentId: string, bookId: string, lessonId: number) {
  const jobId = `${studentId}_${bookId}_${lessonId}`;
  await adminDb()
    .collection("speakingEvalRetries")
    .doc(jobId)
    .set(
      {
        status: "resolved",
        resolvedAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isOverloadedError(error: unknown): boolean {
  if (error && typeof error === "object" && "status" in error) {
    const status = (error as { status?: number }).status;
    if (status === 503) return true;
  }
  const message = error instanceof Error ? error.message : String(error);
  return /\b503\b|service unavailable|overloaded/i.test(message);
}

export async function POST(request: NextRequest) {
  try {
    const retrySecret = process.env.SPEAKING_EVAL_RETRY_SECRET ?? "";
    const internalRetryToken = request.headers.get("x-speaking-eval-retry-secret") ?? "";
    const isInternalRetryCall =
      !!retrySecret && !!internalRetryToken && internalRetryToken === retrySecret;

    let userId = "";
    let callerRole = "student";
    if (isInternalRetryCall) {
      userId = "system-retry";
      callerRole = "admin";
    } else {
      const session = await getServerSession(request);
      if (!session?.user) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
      userId = typeof session.user.id === "string" ? session.user.id : "";
      callerRole = typeof session.user.role === "string" ? session.user.role : "student";
      if (!userId) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
    }

    // 1) IP rate limit (chống spam toàn cục, kể cả khi attacker tạo nhiều token).
    if (!isInternalRetryCall) {
      const ipLimit = checkIPRateLimit(request, "speaking-eval", {
        maxAttempts: 60,
        windowMs: 60 * 60 * 1000,
      });
      if (!ipLimit.allowed) {
        return NextResponse.json(
          { error: "Có quá nhiều yêu cầu chấm speaking từ máy của bạn. Vui lòng thử lại sau." },
          { status: 429 }
        );
      }
    }

    // 2) User rate limit (chống user đã đăng nhập spam Gemini API).
    if (!isInternalRetryCall) {
      const userLimit = checkUserRateLimit(userId, "speaking-eval", {
        maxAttempts: SPEAKING_EVAL_RATE_LIMIT_PER_HOUR,
        windowMs: 60 * 60 * 1000,
      });
      if (!userLimit.allowed) {
        return NextResponse.json(
          {
            error: `Bạn đã chấm speaking quá ${SPEAKING_EVAL_RATE_LIMIT_PER_HOUR} lần trong 1 giờ. Vui lòng thử lại sau.`,
          },
          { status: 429 }
        );
      }
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "Thiếu GEMINI_API_KEY trong môi trường." },
        { status: 500 }
      );
    }

    const formData = await request.formData();
    const audioFile = formData.get("audio");
    const audioUrl = (formData.get("audioUrl") as string | null)?.trim() ?? "";
    const audioMimeType = (formData.get("audioMimeType") as string | null)?.trim() ?? "";
    const bookIdRaw = (formData.get("bookId") as string | null)?.trim() ?? "";
    const lessonIdRaw = (formData.get("lessonId") as string | null)?.trim() ?? "";
    const lessonIdNum = Number(lessonIdRaw);
    const studentIdRaw = (formData.get("studentId") as string | null)?.trim() ?? "";
    const recordedDurationRaw = (formData.get("recordedDurationSeconds") as string | null)?.trim() ?? "";
    const referenceDurationRaw = (formData.get("referenceDurationSeconds") as string | null)?.trim() ?? "";
    const recordedDurationSeconds = Number(recordedDurationRaw);
    const referenceDurationSeconds = Number(referenceDurationRaw);
    const safeRecordedDuration = Number.isFinite(recordedDurationSeconds)
      ? Math.round(recordedDurationSeconds)
      : 0;
    const safeReferenceDuration = Number.isFinite(referenceDurationSeconds)
      ? Math.round(referenceDurationSeconds)
      : 0;

    const hasAudioFile = audioFile instanceof File;
    const hasAudioUrl = !!audioUrl;
    if (!hasAudioFile && !hasAudioUrl) {
      return NextResponse.json(
        { error: "Thiếu file audio hoặc audioUrl." },
        { status: 400 }
      );
    }
    if (!bookIdRaw || !/^\d+$/.test(bookIdRaw)) {
      return NextResponse.json(
        { error: "bookId không hợp lệ." },
        { status: 400 }
      );
    }
    if (!Number.isFinite(lessonIdNum) || lessonIdNum <= 0 || !Number.isInteger(lessonIdNum)) {
      return NextResponse.json(
        { error: "lessonId không hợp lệ." },
        { status: 400 }
      );
    }

    // 3) Verify ownership cho audioUrl: chỉ chấp nhận URL Firebase Storage
    //    thuộc bucket dự án và đường dẫn khớp book/lesson. Học sinh chỉ chấm bài mình;
    //    giáo viên/admin chấm lại bài học sinh trong lớp (studentId lấy từ path Storage).
    let progressUserId = userId;
    if (hasAudioUrl) {
      const parsed = parseFirebaseStoragePath(audioUrl, EXPECTED_BUCKET);
      if (!parsed) {
        await logSpeakingAnomalyOnServer(
          userId,
          bookIdRaw,
          lessonIdNum,
          "AUDIO_URL_FOREIGN_HOST",
          { audioUrlSample: audioUrl.slice(0, 120) },
          {
            category: "security",
            suspicion: "high",
            blocked: true,
            note: "Nghi SSRF/audioUrl ngoài Firebase Storage của hệ thống.",
          }
        );
        return NextResponse.json(
          { error: "audioUrl không hợp lệ." },
          { status: 400 }
        );
      }

      const pathStudentId = extractStudentIdFromSpeakingPath(parsed.path);
      if (
        !pathStudentId ||
        !isOwnedSpeakingPath(parsed.path, pathStudentId, bookIdRaw, lessonIdNum)
      ) {
        await logSpeakingAnomalyOnServer(
          userId,
          bookIdRaw,
          lessonIdNum,
          "AUDIO_URL_OWNERSHIP_MISMATCH",
          { storagePath: parsed.path.slice(0, 200) },
          {
            category: "security",
            suspicion: "high",
            blocked: true,
            note: "Đường dẫn audio không khớp book/lesson hoặc không đúng pattern bài nộp.",
          }
        );
        return NextResponse.json(
          { error: "audioUrl không hợp lệ." },
          { status: 400 }
        );
      }

      if (studentIdRaw && studentIdRaw !== pathStudentId) {
        return NextResponse.json(
          { error: "studentId không khớp với audioUrl." },
          { status: 400 }
        );
      }

      const gradingForStudent = pathStudentId !== userId;
      if (gradingForStudent) {
        if (!isStaffRole(callerRole)) {
          await logSpeakingAnomalyOnServer(
            userId,
            bookIdRaw,
            lessonIdNum,
            "AUDIO_URL_OWNERSHIP_MISMATCH",
            { storagePath: parsed.path.slice(0, 200), pathStudentId },
            {
              category: "security",
              suspicion: "high",
              blocked: true,
              note: "Học sinh cố chấm audio của người khác.",
            }
          );
          return NextResponse.json(
            { error: "audioUrl không thuộc bài nộp của bạn." },
            { status: 403 }
          );
        }
        if (callerRole === "teacher") {
          const allowed = await teacherCanGradeStudent(userId, pathStudentId);
          if (!allowed) {
            return NextResponse.json(
              { error: "Bạn không có quyền chấm bài nói của học sinh này." },
              { status: 403 }
            );
          }
        }
        progressUserId = pathStudentId;
      } else if (studentIdRaw && studentIdRaw !== userId) {
        return NextResponse.json(
          { error: "studentId không khớp với tài khoản hiện tại." },
          { status: 403 }
        );
      }
    } else if (studentIdRaw && studentIdRaw !== userId) {
      if (!isStaffRole(callerRole)) {
        return NextResponse.json(
          { error: "Không được chấm bài nộp thay học sinh khác." },
          { status: 403 }
        );
      }
      if (callerRole === "teacher") {
        const allowed = await teacherCanGradeStudent(userId, studentIdRaw);
        if (!allowed) {
          return NextResponse.json(
            { error: "Bạn không có quyền chấm bài nói của học sinh này." },
            { status: 403 }
          );
        }
      }
      progressUserId = studentIdRaw;
    }

    const gradingOnBehalf = progressUserId !== userId;

    // 4) Validate mime type sớm để khỏi tốn băng thông fetch.
    const claimedMime = hasAudioFile
      ? (audioFile as File).type || audioMimeType
      : audioMimeType;
    if (claimedMime && !isAllowedMimeType(claimedMime)) {
      await logSpeakingAnomalyOnServer(
        userId,
        bookIdRaw,
        lessonIdNum,
        "AUDIO_MIME_NOT_ALLOWED",
        { claimedMime },
        {
          category: "security",
          suspicion: "high",
          blocked: true,
          note: "MIME audio nằm ngoài whitelist; có thể là file giả mạo.",
        }
      );
      return NextResponse.json(
        { error: "Định dạng audio không được hỗ trợ." },
        { status: 400 }
      );
    }

    // 5) Kiểm tra duration ratio server-side (client có thể bypass).
    if (safeRecordedDuration > 0 && safeReferenceDuration > 0) {
      const ratio = safeRecordedDuration / safeReferenceDuration;
      if (ratio < SPEAKING_MIN_DURATION_RATIO || ratio >= SPEAKING_MAX_DURATION_RATIO) {
        await logSpeakingAnomalyOnServer(
          userId,
          bookIdRaw,
          lessonIdNum,
          ratio < SPEAKING_MIN_DURATION_RATIO
            ? "DURATION_RATIO_BELOW_MIN_SERVER"
            : "DURATION_RATIO_ABOVE_MAX_SERVER",
          {
            recordedDuration: safeRecordedDuration,
            referenceDuration: safeReferenceDuration,
            ratio,
          },
          {
            category: "browser",
            suspicion: "medium",
            blocked: true,
            note: "Duration ngoài khoảng cho phép — bypass client-side validation.",
          }
        );
        return NextResponse.json(
          {
            error:
              ratio < SPEAKING_MIN_DURATION_RATIO
                ? "Bạn đọc nhanh quá. Vui lòng ghi âm lại."
                : "Bạn đọc chậm quá. Vui lòng ghi âm lại.",
          },
          { status: 400 }
        );
      }
    }

    // 6) Server-side gate: phải nghe đủ trước khi nộp/chấm bài (học sinh tự nộp).
    //    Giáo viên/admin chấm lại bài học sinh thì bỏ qua gate này.
    let listenCount = 0;
    if (!gradingOnBehalf) try {
      const progressSnap = await adminDb()
        .collection("userBookProgress")
        .doc(`${progressUserId}_${bookIdRaw}`)
        .get();
      if (progressSnap.exists) {
        const data = progressSnap.data() as Record<string, unknown> | undefined;
        const lessonsField = data?.lessons as Record<string, unknown> | undefined;
        const lessonField = lessonsField?.[String(lessonIdNum)] as
          | Record<string, unknown>
          | undefined;
        const raw = lessonField?.listenCount;
        listenCount = typeof raw === "number" && Number.isFinite(raw) ? raw : 0;
      }
    } catch (error) {
      console.error("[evaluate] Failed to read listenCount:", error);
    }
    if (!gradingOnBehalf && listenCount < SPEAKING_MIN_LISTEN_COUNT) {
      await logSpeakingAnomalyOnServer(
        progressUserId,
        bookIdRaw,
        lessonIdNum,
        "LISTEN_COUNT_BELOW_MIN_SERVER",
        { listenCount, minListenCount: SPEAKING_MIN_LISTEN_COUNT },
        {
          category: "security",
          suspicion: "high",
          blocked: true,
          note: "Bypass client-side: gọi /api/speaking/evaluate khi listenCount chưa đủ.",
        }
      );
      return NextResponse.json(
        {
          error: `Bạn cần nghe trên ${SPEAKING_MIN_LISTEN_COUNT} lần trước khi nộp bài.`,
        },
        { status: 403 }
      );
    }

    let script: string;
    try {
      script = await loadSpeakingScriptForLesson(bookIdRaw, lessonIdNum);
    } catch (e) {
      const message = e instanceof Error ? e.message : "Không đọc được script.";
      return NextResponse.json({ error: message }, { status: 400 });
    }
    const countWordWrong = countWordWrongForScript(script);

    const genAI = new GoogleGenerativeAI(apiKey);
    const modelOrder = await getSpeakingModelOrder();

    let audioBuffer: Buffer;
    let mimeType = "audio/webm";
    if (hasAudioFile) {
      const file = audioFile as File;
      if (file.size > SPEAKING_MAX_FILE_BYTES) {
        await logSpeakingAnomalyOnServer(
          userId,
          bookIdRaw,
          lessonIdNum,
          "AUDIO_FILE_TOO_LARGE_SERVER",
          { fileSize: file.size, maxBytes: SPEAKING_MAX_FILE_BYTES },
          {
            category: "security",
            suspicion: "medium",
            blocked: true,
            note: "Vượt SPEAKING_MAX_FILE_BYTES — bypass guard client.",
          }
        );
        return NextResponse.json(
          { error: "File audio vượt quá dung lượng cho phép." },
          { status: 413 }
        );
      }
      audioBuffer = Buffer.from(await file.arrayBuffer());
      mimeType = normalizeSpeakingMimeType(file.type || claimedMime, file.name);
    } else {
      const fetched = await fetchAudioWithLimit(audioUrl, SPEAKING_MAX_FILE_BYTES);
      if ("error" in fetched) {
        await logSpeakingAnomalyOnServer(
          userId,
          bookIdRaw,
          lessonIdNum,
          "AUDIO_URL_FETCH_FAIL",
          { fetchError: fetched.error },
          {
            category: "system",
            suspicion: "medium",
            blocked: true,
            note: "Không tải được audio từ URL hoặc vượt quá kích thước cho phép.",
          }
        );
        return NextResponse.json(
          { error: "Không tải được file audio từ storage." },
          { status: 400 }
        );
      }
      audioBuffer = fetched.buffer;
      mimeType = normalizeSpeakingMimeType(audioMimeType || fetched.contentType);
    }

    if (!isAllowedMimeType(mimeType)) {
      await logSpeakingAnomalyOnServer(
        userId,
        bookIdRaw,
        lessonIdNum,
        "AUDIO_RESOLVED_MIME_NOT_ALLOWED",
        { mimeType },
        {
          category: "security",
          suspicion: "high",
          blocked: true,
          note: "MIME thực tế của audio không được phép.",
        }
      );
      return NextResponse.json(
        { error: "Định dạng audio không được hỗ trợ." },
        { status: 400 }
      );
    }

    if (audioBuffer.byteLength < SPEAKING_MIN_FILE_BYTES) {
      await logSpeakingAnomalyOnServer(
        userId,
        bookIdRaw,
        lessonIdNum,
        "AUDIO_BUFFER_BELOW_MIN",
        {
          byteLength: audioBuffer.byteLength,
          minBytes: SPEAKING_MIN_FILE_BYTES,
          mimeType,
          hasAudioFile,
          hasAudioUrl,
          recordedDuration: safeRecordedDuration,
          referenceDuration: safeReferenceDuration,
        },
        {
          category: "security",
          suspicion: "high",
          blocked: true,
          note: "Bypass client guard hoặc upload audio hỏng trên đường server.",
        }
      );
      return NextResponse.json(
        {
          error:
            "File audio quá nhỏ hoặc không hợp lệ. Vui lòng ghi âm lại và thử nộp lại.",
        },
        { status: 400 }
      );
    }
    if (audioBuffer.byteLength > SPEAKING_MAX_FILE_BYTES) {
      await logSpeakingAnomalyOnServer(
        userId,
        bookIdRaw,
        lessonIdNum,
        "AUDIO_BUFFER_ABOVE_MAX",
        { byteLength: audioBuffer.byteLength, maxBytes: SPEAKING_MAX_FILE_BYTES },
        {
          category: "security",
          suspicion: "medium",
          blocked: true,
          note: "Audio buffer vượt SPEAKING_MAX_FILE_BYTES sau khi tải về.",
        }
      );
      return NextResponse.json(
        { error: "File audio vượt quá dung lượng cho phép." },
        { status: 413 }
      );
    }

    const prompt = buildSpeakingGradePrompt(script, countWordWrong);
    const audioBase64 = audioBuffer.toString("base64");
    const modelErrors: string[] = [];
    let allOverloaded = true;

    modelLoop: for (const modelName of modelOrder) {
      const model = genAI.getGenerativeModel({ model: modelName });
      for (let attempt = 1; attempt <= SPEAKING_503_MAX_RETRIES; attempt++) {
        try {
          const result = await model.generateContent([
            prompt,
            {
              inlineData: {
                data: audioBase64,
                mimeType,
              },
            },
          ]);

          const issueSpeaking = result.response.text().trim();
          if (!issueSpeaking) {
            throw new Error("empty response");
          }

          // 7) Server tự ghi issueSpeaking vào Firestore — client không thể chèn
          //    điểm số giả vào response trước khi gọi updateSpeakingIssue.
          try {
            await adminDb()
              .collection("userBookProgress")
              .doc(`${progressUserId}_${bookIdRaw}`)
              .set(
                {
                  lessons: {
                    [lessonIdNum]: {
                      issueSpeaking,
                      issueSpeakingAt: FieldValue.serverTimestamp(),
                      speakingEvalCount: FieldValue.increment(1),
                      speakingModelUsed: modelName,
                    },
                  },
                },
                { merge: true }
              );
          await markRetryJobResolved(progressUserId, bookIdRaw, lessonIdNum);
          } catch (writeError) {
            console.error("[evaluate] Failed to persist issueSpeaking:", writeError);
          }

          try {
            await updatePendingEvaluationIssueServer(
              progressUserId,
              bookIdRaw,
              lessonIdNum,
              issueSpeaking
            );
          } catch (pendingSyncError) {
            console.error("[evaluate] pendingEvaluations sync failed:", pendingSyncError);
          }

          return NextResponse.json({ issueSpeaking, modelUsed: modelName });
        } catch (e) {
          const message = e instanceof Error ? e.message : "Model error";

          if (isOverloadedError(e)) {
            modelErrors.push(
              `${modelName} (attempt ${attempt}/${SPEAKING_503_MAX_RETRIES}): 503`
            );
            if (attempt < SPEAKING_503_MAX_RETRIES) {
              await sleep(SPEAKING_503_RETRY_DELAY_MS);
              continue;
            }
            continue modelLoop;
          }

          allOverloaded = false;
          modelErrors.push(`${modelName}: ${message}`);
          break modelLoop;
        }
      }
    }

    if (hasAudioUrl && progressUserId && bookIdRaw && lessonIdNum > 0) {
      const queued = await enqueueRetryJob({
        studentId: progressUserId,
        bookId: bookIdRaw,
        lessonId: lessonIdNum,
        audioUrl,
        audioMimeType: mimeType,
        recordedDurationSeconds: safeRecordedDuration,
        referenceDurationSeconds: safeReferenceDuration,
        modelErrors,
      });

      if (!queued.exhausted) {
        return NextResponse.json(
          {
            queuedRetry: true,
            retryCount: queued.retryCount,
            retryIntervalMs: SPEAKING_EVAL_RETRY_INTERVAL_MS,
            maxAttempts: SPEAKING_EVAL_MAX_RETRY_ATTEMPTS,
            details: modelErrors,
          },
          { status: 202 }
        );
      }
    }

    return NextResponse.json(
      {
        error: allOverloaded
          ? "Hệ thống chấm speaking đang quá tải. Vui lòng thử lại sau ít phút."
          : "Không có model nào chấm speaking thành công.",
        details: modelErrors,
      },
      { status: allOverloaded ? 503 : 502 }
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Lỗi không xác định khi chấm speaking.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
