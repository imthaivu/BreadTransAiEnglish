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
import { AI_OCR_LIMIT_PER_HOUR } from "@/modules/ai/types";

const OCR_PROMPT =
  "Trích xuất toàn bộ văn bản có trong ảnh này. Chỉ trả về phần text thuần đúng nguyên văn, giữ xuống dòng, không thêm giải thích hay markdown.";

/** Giới hạn base64 an toàn dưới payload ~4.5MB của serverless. */
const OCR_MAX_BASE64_CHARS = 4_000_000;

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAiUser(request);
    if (auth instanceof NextResponse) return auth;
    const { userId, role } = auth;

    const rateLimited = enforceAiRateLimit(request, userId, "ai-ocr", {
      maxAttempts: AI_OCR_LIMIT_PER_HOUR,
      windowMs: 60 * 60 * 1000,
    });
    if (rateLimited) return rateLimited;

    const apiKey = getGeminiApiKey();
    if (!apiKey) return geminiKeyMissingResponse();

    const body = (await request.json()) as {
      mimeType?: string;
      base64?: string;
      model?: string;
      targetUserId?: string;
      classId?: string;
    };

    const target = await resolveAiTargetUser({ userId, role }, body);
    if (target instanceof NextResponse) return target;
    const targetUserId = target.targetUserId;

    const quota = await checkWeeklyAiQuota(targetUserId, target.isSelf ? role : "student");
    if (quota) return quota;

    const mimeType = body.mimeType?.trim() ?? "";
    const base64 = body.base64?.trim() ?? "";
    const override = body.model?.trim();
    const modelOrder = override ? [override] : await getAiDocumentModelOrder();

    if (!mimeType.startsWith("image/")) {
      return NextResponse.json({ error: "File không phải là ảnh." }, { status: 400 });
    }
    if (!base64) {
      return NextResponse.json({ error: "Thiếu dữ liệu ảnh." }, { status: 400 });
    }
    if (base64.length > OCR_MAX_BASE64_CHARS) {
      return NextResponse.json(
        {
          error:
            "Ảnh quá lớn. Vui lòng chọn ảnh nhỏ hơn, chụp lại gần hơn, hoặc để app tự nén trước khi gửi.",
        },
        { status: 413 }
      );
    }

    let result: { text: string; modelUsed: string };
    try {
      result = await generateContentWithFallback({
        apiKey,
        modelOrder,
        parts: [OCR_PROMPT, { inlineData: { mimeType, data: base64 } }],
        allowEmpty: true,
      });
    } catch (e) {
      if (e instanceof AiModelFallbackError) {
        return NextResponse.json(
          { error: "OCR thất bại trên mọi model.", details: e.details },
          { status: 502 }
        );
      }
      throw e;
    }

    if (!result.text) {
      return NextResponse.json({ error: "Không tìm thấy văn bản trong ảnh." }, { status: 422 });
    }

    await recordWeeklyAiUsage(targetUserId);
    return NextResponse.json({ text: result.text, modelUsed: result.modelUsed });
  } catch (error) {
    const message = error instanceof Error ? error.message : "OCR thất bại.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
