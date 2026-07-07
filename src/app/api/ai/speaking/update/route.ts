import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { adminDb } from "@/lib/firebase/admin";
import {
  enforceAiRateLimit,
  geminiKeyMissingResponse,
  getGeminiApiKey,
  requireAiUser,
} from "@/lib/ai/require-ai-auth";
import { getAiSettings } from "@/lib/ai/settings.server";
import { checkWeeklyAiQuota, recordWeeklyAiUsage } from "@/lib/ai/weekly-quota";
import { deleteStorageObject, uploadMp3ToStorage } from "@/lib/ai/storage";
import { pcmToMp3Buffer, parseSampleRateFromMime } from "@/lib/audio/pcm-to-mp3";
import { AI_TTS_LIMIT_PER_HOUR, type SpeakingItem } from "@/modules/ai/types";

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAiUser(request);
    if (auth instanceof NextResponse) return auth;
    const { userId, role } = auth;

    const body = (await request.json()) as {
      itemId?: string;
      title?: string;
      text?: string;
      voice?: string;
      model?: string;
    };

    const itemId = body.itemId?.trim() ?? "";
    if (!itemId) {
      return NextResponse.json({ error: "Thiếu itemId." }, { status: 400 });
    }

    const userRef = adminDb().collection("users").doc(userId);
    const userSnap = await userRef.get();
    const speaking = Array.isArray(userSnap.data()?.speaking)
      ? (userSnap.data()?.speaking as SpeakingItem[])
      : [];

    const index = speaking.findIndex((s) => s.id === itemId);
    if (index < 0) {
      return NextResponse.json({ error: "Không tìm thấy bài nói." }, { status: 404 });
    }
    const current = speaking[index];

    const newTitle = body.title?.trim() || current.title;
    const newText = body.text?.trim() ?? current.script;
    const aiSettings = await getAiSettings();
    const newVoice = current.voice || aiSettings.ttsVoice;

    if (!newText) {
      return NextResponse.json({ error: "Vui lòng nhập văn bản." }, { status: 400 });
    }
    if (newText.length > 8000) {
      return NextResponse.json({ error: "Văn bản quá dài (tối đa 8000 ký tự)." }, { status: 400 });
    }

    const needRegen = newText !== current.script || newVoice !== current.voice;

    let nextItem: SpeakingItem;

    if (!needRegen) {
      nextItem = { ...current, title: newTitle };
    } else {
      const rateLimited = enforceAiRateLimit(request, userId, "ai-tts", {
        maxAttempts: AI_TTS_LIMIT_PER_HOUR,
        windowMs: 60 * 60 * 1000,
      });
      if (rateLimited) return rateLimited;

      const quota = await checkWeeklyAiQuota(userId, role);
      if (quota) return quota;

      const apiKey = getGeminiApiKey();
      if (!apiKey) return geminiKeyMissingResponse();

      const model = body.model?.trim() || aiSettings.ttsModel;
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
      const geminiBody = {
        contents: [{ parts: [{ text: newText }] }],
        generationConfig: {
          responseModalities: ["AUDIO"],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: newVoice },
            },
          },
        },
      };

      const geminiRes = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(geminiBody),
      });

      const geminiData = (await geminiRes.json()) as {
        error?: { message?: string };
        candidates?: Array<{ content?: { parts?: Array<{ inlineData?: { mimeType?: string; data?: string } }> } }>;
      };

      if (!geminiRes.ok) {
        throw new Error(geminiData?.error?.message || `Gemini TTS HTTP ${geminiRes.status}`);
      }

      const parts = geminiData.candidates?.[0]?.content?.parts ?? [];
      const audioPart = parts.find((p) => p.inlineData?.data);
      if (!audioPart?.inlineData?.data) {
        return NextResponse.json({ error: "API không trả về dữ liệu âm thanh." }, { status: 502 });
      }

      const pcm = Buffer.from(audioPart.inlineData.data, "base64");
      const mime = audioPart.inlineData.mimeType ?? "audio/L16;codec=pcm;rate=24000";
      const sampleRate = parseSampleRateFromMime(mime);
      const mp3Buffer = await pcmToMp3Buffer(pcm, sampleRate);

      const storagePath = `ai_speaking/${userId}/${randomUUID()}.mp3`;
      const { downloadUrl, audioPath } = await uploadMp3ToStorage(storagePath, mp3Buffer);

      if (current.audioPath && current.audioPath !== audioPath) {
        await deleteStorageObject(current.audioPath);
      }

      nextItem = {
        ...current,
        title: newTitle,
        script: newText,
        audioUrl: downloadUrl,
        audioPath,
        voice: newVoice,
        listenCount: 0,
      };
    }

    const updated = [...speaking];
    updated[index] = nextItem;
    await userRef.set({ speaking: updated }, { merge: true });

    if (needRegen) {
      await recordWeeklyAiUsage(userId);
    }
    return NextResponse.json({ item: nextItem });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Cập nhật bài nói thất bại.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
