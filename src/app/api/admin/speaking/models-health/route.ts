import { NextRequest, NextResponse } from "next/server";
import { checkAdminAccess } from "@/lib/auth/server-auth";

type HealthRequestBody = {
  models?: unknown;
};

type ModelHealthResult = {
  model: string;
  ok: boolean;
  durationMs: number;
  errorCode?: number;
  errorStatus?: string;
  errorMessage?: string;
};

// Pattern hợp lệ cho model Gemini: chỉ chữ/số/dấu chấm/gạch ngang/gạch dưới.
// Tránh việc admin (hoặc kẻ chiếm tài khoản admin) inject path lạ vào URL Gemini.
const MODEL_NAME_REGEX = /^[a-zA-Z0-9._-]+$/;
const MODEL_NAME_MAX_LENGTH = 64;
const MAX_MODELS_PER_REQUEST = 10;

function parseModelList(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const unique: string[] = [];
  for (const item of raw) {
    if (typeof item !== "string") continue;
    const model = item.trim();
    if (!model) continue;
    if (model.length > MODEL_NAME_MAX_LENGTH) continue;
    if (!MODEL_NAME_REGEX.test(model)) continue;
    if (unique.includes(model)) continue;
    unique.push(model);
    if (unique.length >= MAX_MODELS_PER_REQUEST) break;
  }
  return unique;
}

async function testModelHealth(model: string, apiKey: string): Promise<ModelHealthResult> {
  const start = Date.now();
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${apiKey}`;
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: "hi" }] }],
        generationConfig: { maxOutputTokens: 5 },
      }),
    });
    const durationMs = Date.now() - start;

    if (response.ok) {
      return { model, ok: true, durationMs };
    }

    const data = (await response.json().catch(() => ({}))) as {
      error?: { code?: number; status?: string; message?: string };
    };
    return {
      model,
      ok: false,
      durationMs,
      errorCode: data.error?.code ?? response.status,
      errorStatus: data.error?.status ?? "ERROR",
      errorMessage: data.error?.message ?? "Không xác định",
    };
  } catch (error) {
    return {
      model,
      ok: false,
      durationMs: Date.now() - start,
      errorStatus: "NETWORK_ERROR",
      errorMessage: error instanceof Error ? error.message : "Network error",
    };
  }
}

export async function POST(request: NextRequest) {
  try {
    const adminCheck = await checkAdminAccess(request);
    if (!adminCheck.authorized) {
      return NextResponse.json(
        { error: adminCheck.error ?? "Unauthorized" },
        { status: adminCheck.error === "Unauthorized" ? 401 : 403 }
      );
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "Thiếu GEMINI_API_KEY trong môi trường." }, { status: 500 });
    }

    const body = (await request.json()) as HealthRequestBody;
    const models = parseModelList(body.models);
    if (models.length === 0) {
      return NextResponse.json({ error: "Danh sách model rỗng." }, { status: 400 });
    }

    const results = await Promise.all(models.map((model) => testModelHealth(model, apiKey)));
    return NextResponse.json({ results });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Lỗi không xác định khi test model health.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
