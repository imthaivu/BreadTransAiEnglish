import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { requireAiUser } from "@/lib/ai/require-ai-auth";
import { deleteStorageObject } from "@/lib/ai/storage";
import type { SpeakingItem } from "@/modules/ai/types";

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

    const target = speaking.find((s) => s.id === itemId);
    if (!target) {
      return NextResponse.json({ error: "Không tìm thấy bài nói." }, { status: 404 });
    }

    if (target.audioPath) {
      await deleteStorageObject(target.audioPath);
    }

    const updated = speaking.filter((s) => s.id !== itemId);
    await userRef.set({ speaking: updated }, { merge: true });

    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Xóa bài nói thất bại.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
