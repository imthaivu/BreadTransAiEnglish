import { adminDb } from "@/lib/firebase/admin";
import { getSpeakingModelOrder } from "@/lib/speaking/speaking-models";
import {
  DEFAULT_AI_SETTINGS,
  parseAiSettingsFromFirestore,
  type AiSettings,
} from "@/lib/ai/settings.shared";

export async function getAiSettings(): Promise<AiSettings> {
  try {
    const snap = await adminDb().collection("settings").doc("ai").get();
    return parseAiSettingsFromFirestore(
      snap.exists ? (snap.data() as Record<string, unknown>) : undefined
    );
  } catch {
    return { ...DEFAULT_AI_SETTINGS };
  }
}

/** Model chấm speaking trên /ai — ưu tiên settings/ai.gradeModels, rồi settings/models. */
export async function getAiGradeModelOrder(): Promise<string[]> {
  const ai = await getAiSettings();
  if (ai.gradeModels.length > 0) return ai.gradeModels;
  return getSpeakingModelOrder();
}

/** Model cho OCR + writing + tạo text — ưu tiên settings/ai.documentModels, rồi settings/models. */
export async function getAiDocumentModelOrder(): Promise<string[]> {
  const ai = await getAiSettings();
  if (ai.documentModels.length > 0) return ai.documentModels;
  return getSpeakingModelOrder();
}
