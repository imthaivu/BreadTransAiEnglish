import { GoogleGenerativeAI } from "@google/generative-ai";

const DOC_503_MAX_RETRIES = 5;
const DOC_503_RETRY_DELAY_MS = 2000;

/** Phần nội dung gửi cho Gemini: text hoặc ảnh inline. */
export type GeminiContentPart =
  | string
  | { inlineData: { mimeType: string; data: string } };

export type ModelFallbackResult = {
  text: string;
  modelUsed: string;
};

/** Tất cả model trong danh sách đều thất bại. */
export class AiModelFallbackError extends Error {
  details: string[];
  constructor(message: string, details: string[]) {
    super(message);
    this.name = "AiModelFallbackError";
    this.details = details;
  }
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

/**
 * Thử lần lượt từng model trong `modelOrder`. Với mỗi model, retry tối đa
 * {@link DOC_503_MAX_RETRIES} lần khi gặp lỗi 503/quá tải; nếu vẫn lỗi (hoặc lỗi
 * khác) thì chuyển sang model kế tiếp. Cơ chế giống chấm speaking trên /ai.
 */
export async function generateContentWithFallback(params: {
  apiKey: string;
  modelOrder: string[];
  parts: GeminiContentPart[];
  /** Cho phép kết quả rỗng được coi là thành công (vd OCR ảnh không có chữ). */
  allowEmpty?: boolean;
}): Promise<ModelFallbackResult> {
  const { apiKey, modelOrder, parts, allowEmpty = false } = params;
  const genAI = new GoogleGenerativeAI(apiKey);
  const modelErrors: string[] = [];

  for (const modelName of modelOrder) {
    const model = genAI.getGenerativeModel({ model: modelName });
    for (let attempt = 1; attempt <= DOC_503_MAX_RETRIES; attempt++) {
      try {
        const result = await model.generateContent(parts);
        const text = result.response.text().trim();
        if (!text && !allowEmpty) throw new Error("empty response");
        return { text, modelUsed: modelName };
      } catch (e) {
        const message = e instanceof Error ? e.message : "Model error";
        if (isOverloadedError(e)) {
          modelErrors.push(`${modelName} (attempt ${attempt}): 503`);
          if (attempt < DOC_503_MAX_RETRIES) {
            await sleep(DOC_503_RETRY_DELAY_MS);
            continue;
          }
          break;
        }
        modelErrors.push(`${modelName}: ${message}`);
        break;
      }
    }
  }

  throw new AiModelFallbackError(
    "Không có model nào xử lý thành công.",
    modelErrors
  );
}
