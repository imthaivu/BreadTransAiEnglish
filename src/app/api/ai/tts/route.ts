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
import { resolveAiTargetUser } from "@/lib/ai/resolve-target";
import { uploadMp3ToStorage } from "@/lib/ai/storage";
import { pcmToMp3Buffer, parseSampleRateFromMime } from "@/lib/audio/pcm-to-mp3";
import {
  AI_SPEAKING_MAX,
  AI_TTS_LIMIT_PER_HOUR,
  type SpeakingItem,
} from "@/modules/ai/types";

function buildFirebaseDownloadUrlFromInline(part: {
  inlineData?: { mimeType?: string; data?: string };
}): { pcm: Buffer; mime: string } | null {
  const inline = part.inlineData;
  if (!inline?.data) return null;
  return {
    pcm: Buffer.from(inline.data, "base64"),
    mime: inline.mimeType ?? "audio/L16;codec=pcm;rate=24000",
  };
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAiUser(request);
    if (auth instanceof NextResponse) return auth;
    const { userId, role } = auth;

    const rateLimited = enforceAiRateLimit(request, userId, "ai-tts", {
      maxAttempts: AI_TTS_LIMIT_PER_HOUR,
      windowMs: 60 * 60 * 1000,
    });
    if (rateLimited) return rateLimited;

    const apiKey = getGeminiApiKey();
    if (!apiKey) return geminiKeyMissingResponse();

    const body = (await request.json()) as {
      title?: string;
      text?: string;
      voice?: string;
      model?: string;
      targetUserId?: string;
      classId?: string;
    };

    const target = await resolveAiTargetUser({ userId, role }, body);
    if (target instanceof NextResponse) return target;
    const targetUserId = target.targetUserId;

    const quota = await checkWeeklyAiQuota(targetUserId, target.isSelf ? role : "student");
    if (quota) return quota;

    const title = body.title?.trim() || "Bài nói";
    const text = body.text?.trim() ?? "";
    const aiSettings = await getAiSettings();
    const voice = aiSettings.ttsVoice;
    const model = body.model?.trim() || aiSettings.ttsModel;

    if (!text) {
      return NextResponse.json({ error: "Vui lòng nhập văn bản." }, { status: 400 });
    }
    if (text.length > 8000) {
      return NextResponse.json({ error: "Văn bản quá dài (tối đa 8000 ký tự)." }, { status: 400 });
    }

    const userRef = adminDb().collection("users").doc(targetUserId);
    const userSnap = await userRef.get();
    const existingSpeaking = Array.isArray(userSnap.data()?.speaking)
      ? (userSnap.data()?.speaking as SpeakingItem[])
      : [];

    if (existingSpeaking.length >= AI_SPEAKING_MAX) {
      return NextResponse.json(
        { error: `Đã đạt tối đa ${AI_SPEAKING_MAX} bài nói.` },
        { status: 409 }
      );
    }

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
    const geminiBody = {
      contents: [{ parts: [{ text }] }],
      generationConfig: {
        responseModalities: ["AUDIO"],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName: voice },
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
    const parsed = audioPart ? buildFirebaseDownloadUrlFromInline(audioPart) : null;
    if (!parsed) {
      return NextResponse.json({ error: "API không trả về dữ liệu âm thanh." }, { status: 502 });
    }

    const sampleRate = parseSampleRateFromMime(parsed.mime);
    const mp3Buffer = await pcmToMp3Buffer(parsed.pcm, sampleRate);

    const itemId = randomUUID();
    const storagePath = `ai_speaking/${targetUserId}/${itemId}.mp3`;
    const { downloadUrl, audioPath } = await uploadMp3ToStorage(storagePath, mp3Buffer);

    const createdAt = new Date().toISOString();
    const item: SpeakingItem = {
      id: itemId,
      title,
      script: text,
      audioUrl: downloadUrl,
      audioPath,
      voice,
      createdAt,
      gradeHistory: [],
    };

    await userRef.set(
      { speaking: [item, ...existingSpeaking].slice(0, AI_SPEAKING_MAX) },
      { merge: true }
    );

    await recordWeeklyAiUsage(targetUserId);
    return NextResponse.json({ item, modelUsed: model });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Tạo MP3 thất bại.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
