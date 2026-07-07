import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { adminDb } from "@/lib/firebase/admin";
import {
  enforceAiRateLimit,
  geminiKeyMissingResponse,
  getGeminiApiKey,
  requireAiUser,
} from "@/lib/ai/require-ai-auth";
import { getAiDocumentModelOrder } from "@/lib/ai/settings.server";
import {
  AiModelFallbackError,
  generateContentWithFallback,
  type GeminiContentPart,
} from "@/lib/ai/generate-with-fallback";
import { checkWeeklyAiQuota, recordWeeklyAiUsage } from "@/lib/ai/weekly-quota";
import { resolveAiTargetUser } from "@/lib/ai/resolve-target";
import {
  AI_WRITING_MAX,
  AI_WRITING_LIMIT_PER_HOUR,
  AI_WRITING_MIN_WORDS,
  AI_WRITING_MAX_WORDS,
  AI_WRITING_DEFAULT_WORDS,
  type WritingItem,
  type WritingKind,
} from "@/modules/ai/types";

function clampWords(value: unknown): number {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return AI_WRITING_DEFAULT_WORDS;
  return Math.max(AI_WRITING_MIN_WORDS, Math.min(AI_WRITING_MAX_WORDS, n));
}

const KIND_HINT: Record<WritingKind, string> = {
  paragraph: "một đoạn văn tiếng Anh mạch lạc",
  essay: "một bài văn tiếng Anh có mở bài, thân bài, kết bài",
};

function parseWritingResponse(raw: string): { title: string; script: string } {
  const trimmed = raw.trim();
  const titleMatch = trimmed.match(/^TITLE:\s*(.+)$/im);
  const scriptMatch = trimmed.match(/SCRIPT:\s*([\s\S]+)$/im);
  if (titleMatch && scriptMatch) {
    return {
      title: titleMatch[1].trim().slice(0, 120),
      script: scriptMatch[1].trim(),
    };
  }
  const lines = trimmed.split(/\n/).filter(Boolean);
  const title = lines[0]?.slice(0, 120) || "Bài viết";
  const script = lines.length > 1 ? lines.slice(1).join("\n").trim() : trimmed;
  return { title, script };
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAiUser(request);
    if (auth instanceof NextResponse) return auth;
    const { userId, role } = auth;

    const rateLimited = enforceAiRateLimit(request, userId, "ai-writing", {
      maxAttempts: AI_WRITING_LIMIT_PER_HOUR,
      windowMs: 60 * 60 * 1000,
    });
    if (rateLimited) return rateLimited;

    const body = (await request.json()) as {
      prompt?: string;
      kind?: WritingKind;
      length?: number;
      imageBase64?: string;
      imageMimeType?: string;
      model?: string;
      targetUserId?: string;
      classId?: string;
      title?: string;
      script?: string;
    };

    const target = await resolveAiTargetUser({ userId, role }, body);
    if (target instanceof NextResponse) return target;
    const targetUserId = target.targetUserId;

    const prompt = body.prompt?.trim() ?? "";
    const kind: WritingKind = body.kind === "essay" ? "essay" : "paragraph";
    const length = clampWords(body.length);
    const providedScript = body.script?.trim();

    const userRef = adminDb().collection("users").doc(targetUserId);
    const userSnap = await userRef.get();
    const existingWriting = Array.isArray(userSnap.data()?.writing)
      ? (userSnap.data()?.writing as WritingItem[])
      : [];

    if (existingWriting.length >= AI_WRITING_MAX) {
      return NextResponse.json(
        { error: `Đã đạt tối đa ${AI_WRITING_MAX} bài viết.` },
        { status: 409 }
      );
    }

    // Bài đã soạn sẵn: lưu trực tiếp văn bản, không gọi AI nên không trừ hạn mức tuần.
    if (providedScript) {
      const item: WritingItem = {
        id: randomUUID(),
        title: body.title?.trim().slice(0, 120) || "Bài viết",
        script: providedScript,
        kind,
        length,
        prompt: prompt || undefined,
        createdAt: new Date().toISOString(),
      };
      await userRef.set(
        { writing: [item, ...existingWriting].slice(0, AI_WRITING_MAX) },
        { merge: true }
      );
      return NextResponse.json({ item });
    }

    const apiKey = getGeminiApiKey();
    if (!apiKey) return geminiKeyMissingResponse();

    const quota = await checkWeeklyAiQuota(targetUserId, target.isSelf ? role : "student");
    if (quota) return quota;

    const override = body.model?.trim();
    const modelOrder = override ? [override] : await getAiDocumentModelOrder();
    const imageBase64 = body.imageBase64?.trim();
    const imageMimeType = body.imageMimeType?.trim();

    if (!prompt && !imageBase64) {
      return NextResponse.json({ error: "Vui lòng nhập chủ đề hoặc tải ảnh gợi ý." }, { status: 400 });
    }

    const instruction = `Viết ${KIND_HINT[kind]} (khoảng ${length} từ) theo chủ đề sau.
Chủ đề: ${prompt || "(dựa vào ảnh đính kèm nếu có)"}
Trả về đúng định dạng:
TITLE: (tiêu đề ngắn bằng tiếng Anh hoặc Việt)
SCRIPT:
(nội dung bài viết tiếng Anh, không thêm giải thích)`;

    const parts: GeminiContentPart[] = [instruction];
    if (imageBase64 && imageMimeType?.startsWith("image/")) {
      parts.push({ inlineData: { mimeType: imageMimeType, data: imageBase64 } });
    }

    let generated: { text: string; modelUsed: string };
    try {
      generated = await generateContentWithFallback({ apiKey, modelOrder, parts });
    } catch (e) {
      if (e instanceof AiModelFallbackError) {
        return NextResponse.json(
          { error: "Không tạo được bài viết trên mọi model.", details: e.details },
          { status: 502 }
        );
      }
      throw e;
    }

    const parsed = parseWritingResponse(generated.text);
    const item: WritingItem = {
      id: randomUUID(),
      title: parsed.title,
      script: parsed.script,
      kind,
      length,
      prompt: prompt || undefined,
      createdAt: new Date().toISOString(),
    };

    await userRef.set(
      { writing: [item, ...existingWriting].slice(0, AI_WRITING_MAX) },
      { merge: true }
    );

    await recordWeeklyAiUsage(targetUserId);
    return NextResponse.json({ item, modelUsed: generated.modelUsed });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Tạo bài viết thất bại.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
