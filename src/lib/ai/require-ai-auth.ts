import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth/server-auth";
import { checkIPRateLimit, checkUserRateLimit, type RateLimitConfig } from "@/lib/rate-limit";
import { AI_IP_LIMIT_PER_HOUR } from "@/modules/ai/types";

export async function requireAiUser(request: NextRequest): Promise<
  | { userId: string; role: string }
  | NextResponse
> {
  const session = await getServerSession(request);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return { userId: session.user.id, role: session.user.role ?? "student" };
}

export function enforceAiRateLimit(
  request: NextRequest,
  userId: string,
  prefix: string,
  userConfig: RateLimitConfig
): NextResponse | null {
  const ipLimit = checkIPRateLimit(request, prefix, {
    maxAttempts: AI_IP_LIMIT_PER_HOUR,
    windowMs: 60 * 60 * 1000,
  });
  if (!ipLimit.allowed) {
    return NextResponse.json(
      { error: "Có quá nhiều yêu cầu từ máy của bạn. Vui lòng thử lại sau." },
      { status: 429 }
    );
  }

  const userLimit = checkUserRateLimit(userId, prefix, userConfig);
  if (!userLimit.allowed) {
    return NextResponse.json(
      { error: "Bạn đã gửi quá nhiều yêu cầu trong 1 giờ. Vui lòng thử lại sau." },
      { status: 429 }
    );
  }

  return null;
}

export function getGeminiApiKey(): string | null {
  return process.env.GEMINI_API_KEY?.trim() || null;
}

export function geminiKeyMissingResponse(): NextResponse {
  return NextResponse.json(
    { error: "Thiếu GEMINI_API_KEY trong môi trường." },
    { status: 500 }
  );
}
