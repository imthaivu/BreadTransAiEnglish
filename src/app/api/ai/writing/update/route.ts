import { NextRequest, NextResponse } from "next/server";
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
} from "@/lib/ai/generate-with-fallback";
import { checkWeeklyAiQuota, recordWeeklyAiUsage } from "@/lib/ai/weekly-quota";
import {
  AI_WRITING_LIMIT_PER_HOUR,
  AI_WRITING_MIN_WORDS,
  AI_WRITING_MAX_WORDS,
  AI_WRITING_DEFAULT_WORDS,
  type WritingItem,
  type WritingKind,
} from "@/modules/ai/types";

function clampWords(value: unknown, fallback: number): number {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return fallback;
  return Math.max(AI_WRITING_MIN_WORDS, Math.min(AI_WRITING_MAX_WORDS, n));
}

function parseWritingResponse(raw: string): { title: string | null; script: string } {
  const trimmed = raw.trim();
  const titleMatch = trimmed.match(/^TITLE:\s*(.+)$/im);
  const scriptMatch = trimmed.match(/SCRIPT:\s*([\s\S]+)$/im);
  if (scriptMatch) {
    return {
      title: titleMatch ? titleMatch[1].trim().slice(0, 120) : null,
      script: scriptMatch[1].trim(),
    };
  }
  return { title: null, script: trimmed };
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAiUser(request);
    if (auth instanceof NextResponse) return auth;
    const { userId, role } = auth;

    const body = (await request.json()) as {
      itemId?: string;
      mode?: "manual" | "ai";
      title?: string;
      script?: string;
      kind?: WritingKind;
      length?: number;
      instruction?: string;
      model?: string;
    };

    const itemId = body.itemId?.trim() ?? "";
    if (!itemId) {
      return NextResponse.json({ error: "Thiếu itemId." }, { status: 400 });
    }

    const userRef = adminDb().collection("users").doc(userId);
    const userSnap = await userRef.get();
    const writing = Array.isArray(userSnap.data()?.writing)
      ? (userSnap.data()?.writing as WritingItem[])
      : [];

    const index = writing.findIndex((w) => w.id === itemId);
    if (index < 0) {
      return NextResponse.json({ error: "Không tìm thấy bài viết." }, { status: 404 });
    }
    const current = writing[index];

    const mode = body.mode === "ai" ? "ai" : "manual";
    let nextItem: WritingItem;

    if (mode === "ai") {
      const rateLimited = enforceAiRateLimit(request, userId, "ai-writing", {
        maxAttempts: AI_WRITING_LIMIT_PER_HOUR,
        windowMs: 60 * 60 * 1000,
      });
      if (rateLimited) return rateLimited;

      const quota = await checkWeeklyAiQuota(userId, role);
      if (quota) return quota;

      const apiKey = getGeminiApiKey();
      if (!apiKey) return geminiKeyMissingResponse();

      const instruction = body.instruction?.trim() ?? "";
      if (!instruction) {
        return NextResponse.json({ error: "Vui lòng nhập yêu cầu chỉnh sửa." }, { status: 400 });
      }

      const kind: WritingKind = body.kind === "essay" || body.kind === "paragraph" ? body.kind : current.kind;
      const length = clampWords(body.length, current.length ?? AI_WRITING_DEFAULT_WORDS);
      const baseScript = (body.script ?? current.script ?? "").trim();

      const override = body.model?.trim();
      const modelOrder = override ? [override] : await getAiDocumentModelOrder();

      const prompt = `Bạn là trợ lý viết tiếng Anh. Chỉnh sửa lại bài viết dưới đây theo yêu cầu của người dùng.
Yêu cầu: ${instruction}
Mục tiêu độ dài: khoảng ${length} từ.

--- BÀI VIẾT HIỆN TẠI ---
${baseScript || "(trống)"}
--- HẾT ---

Trả về đúng định dạng (không thêm giải thích):
TITLE: (tiêu đề ngắn, giữ nguyên nếu không cần đổi)
SCRIPT:
(nội dung bài viết tiếng Anh sau khi chỉnh sửa)`;

      let generated: { text: string; modelUsed: string };
      try {
        generated = await generateContentWithFallback({
          apiKey,
          modelOrder,
          parts: [prompt],
        });
      } catch (e) {
        if (e instanceof AiModelFallbackError) {
          return NextResponse.json(
            { error: "Không chỉnh sửa được bài viết trên mọi model.", details: e.details },
            { status: 502 }
          );
        }
        throw e;
      }

      const parsed = parseWritingResponse(generated.text);
      nextItem = {
        ...current,
        title: parsed.title || current.title,
        script: parsed.script,
        kind,
        length,
      };
    } else {
      const title = body.title?.trim();
      const script = body.script?.trim();
      const kind: WritingKind | undefined =
        body.kind === "essay" || body.kind === "paragraph" ? body.kind : undefined;

      if (script != null && !script) {
        return NextResponse.json({ error: "Nội dung không được để trống." }, { status: 400 });
      }

      nextItem = {
        ...current,
        title: title || current.title,
        script: script ?? current.script,
        kind: kind ?? current.kind,
        length:
          body.length != null ? clampWords(body.length, current.length) : current.length,
      };
    }

    const updated = [...writing];
    updated[index] = nextItem;
    await userRef.set({ writing: updated }, { merge: true });

    if (mode === "ai") {
      await recordWeeklyAiUsage(userId);
    }
    return NextResponse.json({ item: nextItem });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Cập nhật bài viết thất bại.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
