import { GoogleGenerativeAI } from "@google/generative-ai";
import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { adminDb } from "@/lib/firebase/admin";
import {
  enforceAiRateLimit,
  geminiKeyMissingResponse,
  getGeminiApiKey,
  requireAiUser,
} from "@/lib/ai/require-ai-auth";
import { getAiGradeModelOrder } from "@/lib/ai/settings.server";
import { checkWeeklyAiQuota, recordWeeklyAiUsage } from "@/lib/ai/weekly-quota";
import {
  buildSpeakingGradePrompt,
  countWordWrongForScript,
} from "@/lib/speaking/grade-prompt";
import { extractSpeakingScoreFromIssue } from "@/modules/speaking-upload/extractSpeakingScoreFromIssue";
import {
  SPEAKING_ALLOWED_MIME_TYPES,
  SPEAKING_MAX_FILE_BYTES,
  SPEAKING_MIN_FILE_BYTES,
} from "@/modules/speaking-upload/types";
import {
  AI_GRADE_LIMIT_PER_HOUR,
  AI_MIN_LISTEN_COUNT,
  type GradeEntry,
  type SpeakingItem,
} from "@/modules/ai/types";

const SPEAKING_503_MAX_RETRIES = 5;
const SPEAKING_503_RETRY_DELAY_MS = 2000;

function isAllowedMimeType(mime: string | null | undefined): boolean {
  if (!mime) return false;
  const lower = mime.split(";")[0]?.trim().toLowerCase() ?? "";
  return SPEAKING_ALLOWED_MIME_TYPES.includes(lower);
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
    const auth = await requireAiUser(request);
    if (auth instanceof NextResponse) return auth;
    const { userId, role } = auth;

    const rateLimited = enforceAiRateLimit(request, userId, "ai-speaking-grade", {
      maxAttempts: AI_GRADE_LIMIT_PER_HOUR,
      windowMs: 60 * 60 * 1000,
    });
    if (rateLimited) return rateLimited;

    const quota = await checkWeeklyAiQuota(userId, role);
    if (quota) return quota;

    const apiKey = getGeminiApiKey();
    if (!apiKey) return geminiKeyMissingResponse();

    const formData = await request.formData();
    const itemId = (formData.get("itemId") as string | null)?.trim() ?? "";
    const audioFile = formData.get("audio");
    const listenCountRaw = (formData.get("listenCount") as string | null)?.trim() ?? "";
    const listenCount = Number(listenCountRaw);

    if (!itemId) {
      return NextResponse.json({ error: "Thiếu itemId." }, { status: 400 });
    }
    if (!(audioFile instanceof File)) {
      return NextResponse.json({ error: "Thiếu file audio." }, { status: 400 });
    }

    if (Number.isFinite(listenCount) && listenCount < AI_MIN_LISTEN_COUNT) {
      return NextResponse.json(
        { error: `Bạn cần nghe ít nhất ${AI_MIN_LISTEN_COUNT} lần trước khi chấm.` },
        { status: 403 }
      );
    }

    const userRef = adminDb().collection("users").doc(userId);
    const userSnap = await userRef.get();
    const speaking = Array.isArray(userSnap.data()?.speaking)
      ? (userSnap.data()?.speaking as SpeakingItem[])
      : [];
    const item = speaking.find((s) => s.id === itemId);
    if (!item) {
      return NextResponse.json({ error: "Không tìm thấy bài nói." }, { status: 404 });
    }

    const mimeType = audioFile.type || "audio/webm";
    if (!isAllowedMimeType(mimeType)) {
      return NextResponse.json({ error: "Định dạng audio không được hỗ trợ." }, { status: 400 });
    }
    if (audioFile.size > SPEAKING_MAX_FILE_BYTES) {
      return NextResponse.json({ error: "File audio vượt quá dung lượng cho phép." }, { status: 413 });
    }

    const audioBuffer = Buffer.from(await audioFile.arrayBuffer());
    if (audioBuffer.byteLength < SPEAKING_MIN_FILE_BYTES) {
      return NextResponse.json(
        { error: "File audio quá nhỏ hoặc không hợp lệ. Vui lòng ghi âm lại." },
        { status: 400 }
      );
    }

    const script = item.script;
    const countWordWrong = countWordWrongForScript(script);
    const prompt = buildSpeakingGradePrompt(script, countWordWrong);
    const audioBase64 = audioBuffer.toString("base64");

    const genAI = new GoogleGenerativeAI(apiKey);
    const modelOrder = await getAiGradeModelOrder();
    const modelErrors: string[] = [];

    for (const modelName of modelOrder) {
      const model = genAI.getGenerativeModel({ model: modelName });
      for (let attempt = 1; attempt <= SPEAKING_503_MAX_RETRIES; attempt++) {
        try {
          const result = await model.generateContent([
            prompt,
            { inlineData: { data: audioBase64, mimeType } },
          ]);
          const issue = result.response.text().trim();
          if (!issue) throw new Error("empty response");

          const gradeEntry: GradeEntry = {
            id: randomUUID(),
            issue,
            score: extractSpeakingScoreFromIssue(issue),
            at: new Date().toISOString(),
          };

          const updatedSpeaking = speaking.map((s) =>
            s.id === itemId
              ? { ...s, gradeHistory: [...(s.gradeHistory ?? []), gradeEntry] }
              : s
          );

          await userRef.set({ speaking: updatedSpeaking }, { merge: true });

          await recordWeeklyAiUsage(userId);
          return NextResponse.json({
            issue,
            gradeEntry,
            modelUsed: modelName,
          });
        } catch (e) {
          const message = e instanceof Error ? e.message : "Model error";
          if (isOverloadedError(e)) {
            modelErrors.push(`${modelName} (attempt ${attempt}): 503`);
            if (attempt < SPEAKING_503_MAX_RETRIES) {
              await sleep(SPEAKING_503_RETRY_DELAY_MS);
              continue;
            }
            break;
          }
          modelErrors.push(`${modelName}: ${message}`);
          break;
        }
      }
    }

    return NextResponse.json(
      {
        error: "Không có model nào chấm speaking thành công.",
        details: modelErrors,
      },
      { status: 502 }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Chấm điểm thất bại.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
