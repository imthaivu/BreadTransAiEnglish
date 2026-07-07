import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { requireAiUser } from "@/lib/ai/require-ai-auth";
import { AI_MIN_LISTEN_COUNT, type SpeakingItem } from "@/modules/ai/types";

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAiUser(request);
    if (auth instanceof NextResponse) return auth;
    const { userId } = auth;

    const body = (await request.json()) as { itemId?: string };
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
    const nextCount = Math.min((current.listenCount ?? 0) + 1, AI_MIN_LISTEN_COUNT);

    if (nextCount !== current.listenCount) {
      const updated = [...speaking];
      updated[index] = { ...current, listenCount: nextCount };
      await userRef.set({ speaking: updated }, { merge: true });
    }

    return NextResponse.json({ listenCount: nextCount });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Lưu số lần nghe thất bại.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
