import { auth, db } from "@/lib/firebase/client";
import { doc, getDoc } from "firebase/firestore";
import type { AiWeeklyUsage, GradeEntry, SpeakingItem, WritingItem, WritingKind } from "./types";

async function requireIdToken(): Promise<string> {
  const user = auth.currentUser;
  if (!user) throw new Error("Vui lòng đăng nhập.");
  return user.getIdToken();
}

async function parseApiError(response: Response, fallback: string): Promise<string> {
  try {
    const data = (await response.json()) as { error?: string };
    if (data?.error) return data.error;
  } catch {
    // ignore
  }
  return fallback;
}

export async function fetchUserAiItems(userId: string): Promise<{
  speaking: SpeakingItem[];
  writing: WritingItem[];
}> {
  const snap = await getDoc(doc(db, "users", userId));
  if (!snap.exists()) return { speaking: [], writing: [] };
  const data = snap.data();
  const speaking = Array.isArray(data.speaking) ? (data.speaking as SpeakingItem[]) : [];
  const writing = Array.isArray(data.writing) ? (data.writing as WritingItem[]) : [];
  return { speaking, writing };
}

export async function fetchAiUsage(): Promise<AiWeeklyUsage> {
  const idToken = await requireIdToken();
  const response = await fetch("/api/ai/usage", {
    method: "GET",
    headers: { Authorization: `Bearer ${idToken}` },
  });
  if (!response.ok) {
    throw new Error(await parseApiError(response, "Không tải được hạn mức AI."));
  }
  return (await response.json()) as AiWeeklyUsage;
}

export async function ocrImage(params: {
  mimeType: string;
  base64: string;
  model?: string;
  targetUserId?: string;
  classId?: string;
}): Promise<string> {
  const idToken = await requireIdToken();
  const response = await fetch("/api/ai/ocr", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify(params),
  });
  if (!response.ok) {
    throw new Error(await parseApiError(response, "OCR thất bại."));
  }
  const data = (await response.json()) as { text?: string };
  if (!data.text?.trim()) throw new Error("Không tìm thấy văn bản trong ảnh.");
  return data.text.trim();
}

export async function generateText(params: {
  prompt: string;
  length?: number;
  targetUserId?: string;
  classId?: string;
}): Promise<{ title: string | null; text: string }> {
  const idToken = await requireIdToken();
  const response = await fetch("/api/ai/text", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify(params),
  });
  if (!response.ok) {
    throw new Error(await parseApiError(response, "Tạo văn bản thất bại."));
  }
  const data = (await response.json()) as { title?: string | null; text?: string };
  if (!data.text?.trim()) throw new Error("Không nhận được văn bản.");
  return { title: data.title ?? null, text: data.text.trim() };
}

export async function createSpeakingItem(params: {
  title: string;
  text: string;
  voice?: string;
  targetUserId?: string;
  classId?: string;
}): Promise<SpeakingItem> {
  const idToken = await requireIdToken();
  const response = await fetch("/api/ai/tts", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify(params),
  });
  if (!response.ok) {
    throw new Error(await parseApiError(response, "Tạo MP3 thất bại."));
  }
  const data = (await response.json()) as { item?: SpeakingItem };
  if (!data.item) throw new Error("Không nhận được bài nói đã lưu.");
  return data.item;
}

export async function gradeSpeakingItem(params: {
  itemId: string;
  audio: File;
  recordedDurationSeconds?: number;
  listenCount?: number;
}): Promise<{ issue: string; gradeEntry: GradeEntry }> {
  const idToken = await requireIdToken();
  const formData = new FormData();
  formData.append("itemId", params.itemId);
  formData.append("audio", params.audio);
  if (params.recordedDurationSeconds != null && params.recordedDurationSeconds > 0) {
    formData.append("recordedDurationSeconds", String(params.recordedDurationSeconds));
  }
  if (params.listenCount != null) {
    formData.append("listenCount", String(params.listenCount));
  }
  const response = await fetch("/api/ai/speaking/grade", {
    method: "POST",
    headers: { Authorization: `Bearer ${idToken}` },
    body: formData,
  });
  if (!response.ok) {
    throw new Error(await parseApiError(response, "Chấm điểm thất bại."));
  }
  const data = (await response.json()) as { issue?: string; gradeEntry?: GradeEntry };
  if (!data.issue || !data.gradeEntry) throw new Error("Không nhận được kết quả chấm.");
  return { issue: data.issue, gradeEntry: data.gradeEntry };
}

export async function generateWritingItem(params: {
  prompt: string;
  kind: WritingKind;
  length: number;
  imageBase64?: string;
  imageMimeType?: string;
  targetUserId?: string;
  classId?: string;
}): Promise<WritingItem> {
  const idToken = await requireIdToken();
  const response = await fetch("/api/ai/writing/generate", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify(params),
  });
  if (!response.ok) {
    throw new Error(await parseApiError(response, "Tạo bài thất bại."));
  }
  const data = (await response.json()) as { item?: WritingItem };
  if (!data.item) throw new Error("Không nhận được bài viết đã lưu.");
  return data.item;
}

export async function saveWritingItem(params: {
  title: string;
  script: string;
  kind: WritingKind;
  length: number;
  prompt?: string;
  targetUserId?: string;
  classId?: string;
}): Promise<WritingItem> {
  const idToken = await requireIdToken();
  const response = await fetch("/api/ai/writing/generate", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify(params),
  });
  if (!response.ok) {
    throw new Error(await parseApiError(response, "Lưu bài viết thất bại."));
  }
  const data = (await response.json()) as { item?: WritingItem };
  if (!data.item) throw new Error("Không nhận được bài viết đã lưu.");
  return data.item;
}

export async function updateWritingItem(params: {
  itemId: string;
  mode: "manual" | "ai";
  title?: string;
  script?: string;
  kind?: WritingKind;
  length?: number;
  instruction?: string;
}): Promise<WritingItem> {
  const idToken = await requireIdToken();
  const response = await fetch("/api/ai/writing/update", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify(params),
  });
  if (!response.ok) {
    throw new Error(await parseApiError(response, "Cập nhật bài viết thất bại."));
  }
  const data = (await response.json()) as { item?: WritingItem };
  if (!data.item) throw new Error("Không nhận được bài viết đã cập nhật.");
  return data.item;
}

export async function updateSpeakingItem(params: {
  itemId: string;
  title?: string;
  text?: string;
  voice?: string;
}): Promise<SpeakingItem> {
  const idToken = await requireIdToken();
  const response = await fetch("/api/ai/speaking/update", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify(params),
  });
  if (!response.ok) {
    throw new Error(await parseApiError(response, "Cập nhật bài nói thất bại."));
  }
  const data = (await response.json()) as { item?: SpeakingItem };
  if (!data.item) throw new Error("Không nhận được bài nói đã cập nhật.");
  return data.item;
}

export async function recordSpeakingListen(itemId: string): Promise<number> {
  const idToken = await requireIdToken();
  const response = await fetch("/api/ai/speaking/listen", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify({ itemId }),
  });
  if (!response.ok) {
    throw new Error(await parseApiError(response, "Lưu số lần nghe thất bại."));
  }
  const data = (await response.json()) as { listenCount?: number };
  return data.listenCount ?? 0;
}

export async function deleteSpeakingItem(itemId: string): Promise<void> {
  const idToken = await requireIdToken();
  const response = await fetch("/api/ai/speaking/delete", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify({ itemId }),
  });
  if (!response.ok) {
    throw new Error(await parseApiError(response, "Xóa bài nói thất bại."));
  }
}

export async function deleteWritingItem(itemId: string): Promise<void> {
  const idToken = await requireIdToken();
  const response = await fetch("/api/ai/writing/delete", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify({ itemId }),
  });
  if (!response.ok) {
    throw new Error(await parseApiError(response, "Xóa bài viết thất bại."));
  }
}
