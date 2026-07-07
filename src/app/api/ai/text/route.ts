import { NextRequest, NextResponse } from "next/server";
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
} from "@/lib/ai/generate-with-fallback";
import { checkWeeklyAiQuota, recordWeeklyAiUsage } from "@/lib/ai/weekly-quota";
import { resolveAiTargetUser } from "@/lib/ai/resolve-target";
import {
  AI_WRITING_LIMIT_PER_HOUR,
  AI_WRITING_MIN_WORDS,
  AI_WRITING_MAX_WORDS,
  AI_WRITING_DEFAULT_WORDS,
} from "@/modules/ai/types";

function clampWords(value: unknown): number {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return AI_WRITING_DEFAULT_WORDS;
  return Math.max(AI_WRITING_MIN_WORDS, Math.min(AI_WRITING_MAX_WORDS, n));
}

function parseResponse(raw: string): { title: string | null; text: string } {
  const trimmed = raw.trim();
  const titleMatch = trimmed.match(/^TITLE:\s*(.+)$/im);
  const scriptMatch = trimmed.match(/SCRIPT:\s*([\s\S]+)$/im);
  if (scriptMatch) {
    return {
      title: titleMatch ? titleMatch[1].trim().slice(0, 120) : null,
      text: scriptMatch[1].trim(),
    };
  }
  const lines = trimmed.split(/\n/).filter(Boolean);
  if (titleMatch) {
    return { title: titleMatch[1].trim().slice(0, 120), text: trimmed };
  }
  const title = lines[0]?.slice(0, 120) || null;
  return { title, text: trimmed };
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAiUser(request);
    if (auth instanceof NextResponse) return auth;
    const { userId, role } = auth;

    const rateLimited = enforceAiRateLimit(request, userId, "ai-text", {
      maxAttempts: AI_WRITING_LIMIT_PER_HOUR,
      windowMs: 60 * 60 * 1000,
    });
    if (rateLimited) return rateLimited;

    const apiKey = getGeminiApiKey();
    if (!apiKey) return geminiKeyMissingResponse();

    const body = (await request.json()) as {
      prompt?: string;
      length?: number;
      model?: string;
      targetUserId?: string;
      classId?: string;
    };

    const target = await resolveAiTargetUser({ userId, role }, body);
    if (target instanceof NextResponse) return target;
    const targetUserId = target.targetUserId;

    const quota = await checkWeeklyAiQuota(targetUserId, target.isSelf ? role : "student");
    if (quota) return quota;

    const prompt = body.prompt?.trim() ?? "";
    const length = clampWords(body.length);
    const override = body.model?.trim();
    const modelOrder = override ? [override] : await getAiDocumentModelOrder();

    if (!prompt) {
      return NextResponse.json({ error: "Vui lòng nhập chủ đề." }, { status: 400 });
    }

    const instruction = `Viết một đoạn văn tiếng Anh tự nhiên (khoảng ${length} từ) để luyện nói/đọc to theo chủ đề sau.
Chủ đề: ${prompt}
Yêu cầu: dùng câu rõ ràng, dễ phát âm, phù hợp luyện speaking.
Trả về đúng định dạng (không thêm giải thích):
TITLE: (tiêu đề ngắn)
SCRIPT:
(nội dung tiếng Anh)`;

    let generated: { text: string; modelUsed: string };
    try {
      generated = await generateContentWithFallback({
        apiKey,
        modelOrder,
        parts: [instruction],
      });
    } catch (e) {
      if (e instanceof AiModelFallbackError) {
        return NextResponse.json(
          { error: "Không tạo được văn bản trên mọi model.", details: e.details },
          { status: 502 }
        );
      }
      throw e;
    }

    const parsed = parseResponse(generated.text);
    if (!parsed.text) {
      return NextResponse.json({ error: "Không tạo được văn bản." }, { status: 502 });
    }

    await recordWeeklyAiUsage(targetUserId);
    return NextResponse.json({ title: parsed.title, text: parsed.text });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Tạo văn bản thất bại.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
