import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { requireAiUser } from "@/lib/ai/require-ai-auth";
import type { WritingItem } from "@/modules/ai/types";

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
    const writing = Array.isArray(userSnap.data()?.writing)
      ? (userSnap.data()?.writing as WritingItem[])
      : [];

    if (!writing.some((w) => w.id === itemId)) {
      return NextResponse.json({ error: "Không tìm thấy bài viết." }, { status: 404 });
    }

    const updated = writing.filter((w) => w.id !== itemId);
    await userRef.set({ writing: updated }, { merge: true });

    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Xóa bài viết thất bại.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
