import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { FieldValue } from "firebase-admin/firestore";
import { SPEAKING_EVAL_MAX_RETRY_ATTEMPTS } from "@/modules/speaking-upload/types";

type RetryJob = {
  jobId?: string;
  studentId?: string;
  bookId?: string;
  lessonId?: number;
  audioUrl?: string;
  audioMimeType?: string;
  recordedDurationSeconds?: number;
  referenceDurationSeconds?: number;
  retryCount?: number;
  status?: "pending" | "failed" | "resolved";
};

export async function GET(request: NextRequest) {
  try {
    const cronSecret = process.env.SPEAKING_EVAL_CRON_SECRET ?? "";
    const providedSecret = request.headers.get("x-speaking-eval-cron-secret") ?? "";
    if (!cronSecret || providedSecret !== cronSecret) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const retrySecret = process.env.SPEAKING_EVAL_RETRY_SECRET ?? "";
    if (!retrySecret) {
      return NextResponse.json(
        { error: "Missing SPEAKING_EVAL_RETRY_SECRET." },
        { status: 500 }
      );
    }

    const now = new Date();
    const jobsSnap = await adminDb()
      .collection("speakingEvalRetries")
      .where("status", "==", "pending")
      .where("nextRetryAt", "<=", now)
      .orderBy("nextRetryAt", "asc")
      .limit(20)
      .get();

    let processed = 0;
    let dispatched = 0;
    let skipped = 0;
    const errors: string[] = [];

    for (const doc of jobsSnap.docs) {
      processed += 1;
      const data = doc.data() as RetryJob;
      const studentId = typeof data.studentId === "string" ? data.studentId : "";
      const bookId = typeof data.bookId === "string" ? data.bookId : "";
      const lessonId = typeof data.lessonId === "number" ? data.lessonId : 0;
      const audioUrl = typeof data.audioUrl === "string" ? data.audioUrl : "";
      const audioMimeType = typeof data.audioMimeType === "string" ? data.audioMimeType : "audio/webm";
      const retryCount = typeof data.retryCount === "number" ? data.retryCount : 0;
      const recordedDurationSeconds =
        typeof data.recordedDurationSeconds === "number" ? data.recordedDurationSeconds : 0;
      const referenceDurationSeconds =
        typeof data.referenceDurationSeconds === "number" ? data.referenceDurationSeconds : 0;

      if (!studentId || !bookId || !lessonId || !audioUrl) {
        skipped += 1;
        await doc.ref.set(
          {
            status: "failed",
            failedAt: FieldValue.serverTimestamp(),
            lastError: "INVALID_RETRY_JOB_PAYLOAD",
            updatedAt: FieldValue.serverTimestamp(),
          },
          { merge: true }
        );
        continue;
      }

      if (retryCount >= SPEAKING_EVAL_MAX_RETRY_ATTEMPTS) {
        skipped += 1;
        await doc.ref.set(
          {
            status: "failed",
            failedAt: FieldValue.serverTimestamp(),
            lastError: "RETRY_LIMIT_REACHED",
            updatedAt: FieldValue.serverTimestamp(),
          },
          { merge: true }
        );
        continue;
      }

      const formData = new FormData();
      formData.append("audioUrl", audioUrl);
      formData.append("bookId", bookId);
      formData.append("lessonId", String(lessonId));
      formData.append("studentId", studentId);
      formData.append("audioMimeType", audioMimeType);
      if (recordedDurationSeconds > 0) {
        formData.append("recordedDurationSeconds", String(recordedDurationSeconds));
      }
      if (referenceDurationSeconds > 0) {
        formData.append("referenceDurationSeconds", String(referenceDurationSeconds));
      }

      try {
        await fetch(`${request.nextUrl.origin}/api/speaking/evaluate`, {
          method: "POST",
          headers: {
            "x-speaking-eval-retry-secret": retrySecret,
          },
          body: formData,
        });
        dispatched += 1;
      } catch (error) {
        errors.push(error instanceof Error ? error.message : "dispatch failed");
      }
    }

    return NextResponse.json({
      ok: true,
      scanned: jobsSnap.size,
      processed,
      dispatched,
      skipped,
      errors,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unknown retry cron error",
      },
      { status: 500 }
    );
  }
}
