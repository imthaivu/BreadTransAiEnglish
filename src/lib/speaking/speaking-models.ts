import { adminDb } from "@/lib/firebase/admin";

const FALLBACK_MODEL_NAME = "gemini-2.5-flash";

function parseModelNamesFromSettingsDoc(data: Record<string, unknown> | undefined): string[] {
  if (!data) return [];
  const rawList = data.models;
  if (!Array.isArray(rawList)) return [];
  const normalized: string[] = [];
  for (const item of rawList) {
    if (typeof item !== "string") continue;
    const model = item.trim();
    if (!model || normalized.includes(model)) continue;
    normalized.push(model);
  }
  return normalized;
}

export async function getSpeakingModelOrder(): Promise<string[]> {
  try {
    const settingsSnap = await adminDb().collection("settings").doc("models").get();
    const models = parseModelNamesFromSettingsDoc(
      settingsSnap.exists ? (settingsSnap.data() as Record<string, unknown>) : undefined
    );
    if (models.length > 0) {
      return models;
    }
  } catch {
    // Ignore settings read errors and fallback to default model.
  }
  return [FALLBACK_MODEL_NAME];
}
