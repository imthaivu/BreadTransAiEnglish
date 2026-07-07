import {
  DEFAULT_TTS_MODEL,
  DEFAULT_TTS_VOICE,
  TTS_VOICES,
} from "@/modules/ai/types";

export type AiSettings = {
  ttsModel: string;
  ttsVoice: string;
  /** Model dùng cho OCR + tạo/sửa bài viết (writing) + tạo text. Mỗi dòng 1 model; rỗng = dùng settings/models. */
  documentModels: string[];
  /** Model chấm speaking. Mỗi dòng 1 model; rỗng = dùng settings/models. */
  gradeModels: string[];
};

export const DEFAULT_AI_SETTINGS: AiSettings = {
  ttsModel: DEFAULT_TTS_MODEL,
  ttsVoice: DEFAULT_TTS_VOICE,
  documentModels: [],
  gradeModels: [],
};

function trimModel(value: unknown, fallback: string): string {
  if (typeof value !== "string") return fallback;
  const t = value.trim();
  return t || fallback;
}

function parseModelList(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const item of raw) {
    if (typeof item !== "string") continue;
    const m = item.trim();
    if (!m || out.includes(m)) continue;
    out.push(m);
  }
  return out;
}

function parseSettingsDoc(data: Record<string, unknown> | undefined): AiSettings {
  if (!data) return { ...DEFAULT_AI_SETTINGS };
  const voice = trimModel(data.ttsVoice, DEFAULT_TTS_VOICE);
  const validVoice = (TTS_VOICES as readonly string[]).includes(voice) ? voice : DEFAULT_TTS_VOICE;
  return {
    ttsModel: trimModel(data.ttsModel, DEFAULT_TTS_MODEL),
    ttsVoice: validVoice,
    documentModels: parseModelList(data.documentModels),
    gradeModels: parseModelList(data.gradeModels),
  };
}

export function parseAiSettingsFromFirestore(
  data: Record<string, unknown> | undefined
): AiSettings {
  return parseSettingsDoc(data);
}

export function parseModelsFromText(raw: string): string[] {
  const lines = raw
    .split(/\r?\n/)
    .flatMap((line) => line.split(","))
    .map((line) => line.trim())
    .filter(Boolean);
  const unique: string[] = [];
  for (const model of lines) {
    if (!unique.includes(model)) unique.push(model);
  }
  return unique;
}

/** @deprecated dùng {@link parseModelsFromText}. */
export const parseGradeModelsFromText = parseModelsFromText;

export function aiSettingsToForm(data: AiSettings) {
  return {
    ttsModel: data.ttsModel,
    ttsVoice: data.ttsVoice,
    documentModelsText: data.documentModels.join("\n"),
    gradeModelsText: data.gradeModels.join("\n"),
  };
}

export function formToAiSettings(form: {
  ttsModel: string;
  ttsVoice: string;
  documentModelsText: string;
  gradeModelsText: string;
}): AiSettings {
  const voice = form.ttsVoice.trim() || DEFAULT_TTS_VOICE;
  return {
    ttsModel: form.ttsModel.trim() || DEFAULT_TTS_MODEL,
    ttsVoice: (TTS_VOICES as readonly string[]).includes(voice) ? voice : DEFAULT_TTS_VOICE,
    documentModels: parseModelsFromText(form.documentModelsText),
    gradeModels: parseModelsFromText(form.gradeModelsText),
  };
}
