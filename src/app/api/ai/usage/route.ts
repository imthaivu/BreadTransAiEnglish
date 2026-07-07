import { NextRequest, NextResponse } from "next/server";
import { requireAiUser } from "@/lib/ai/require-ai-auth";
import { getWeeklyAiUsage } from "@/lib/ai/weekly-quota";

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAiUser(request);
    if (auth instanceof NextResponse) return auth;
    const { userId, role } = auth;

    const usage = await getWeeklyAiUsage(userId, role);
    return NextResponse.json(usage);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Không tải được hạn mức AI.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
