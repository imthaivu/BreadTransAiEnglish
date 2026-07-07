import { NextRequest, NextResponse } from "next/server";
import { adminStorage } from "@/lib/firebase/admin";
import { checkTeacherOrAdminAccess } from "@/lib/auth/server-auth";

/**
 * Xóa tất cả folder speaking_submissions của quá khứ, chỉ giữ folder hôm kia, hôm qua và hôm nay.
 * Format folder: speaking_submissions/DD-MM-YYYY/ (giống services.ts)
 * Cho phép teacher và admin gọi.
 */
export async function POST(request: NextRequest) {
  try {
    const accessCheck = await checkTeacherOrAdminAccess(request);

    if (!accessCheck.authorized) {
      return NextResponse.json(
        { success: false, error: accessCheck.error ?? "Unauthorized" },
        { status: accessCheck.error === "Unauthorized" ? 401 : 403 }
      );
    }

    const bucket = adminStorage().bucket();
    const [files] = await bucket.getFiles({
      prefix: "speaking_submissions/",
    });

    // Format ngày giống services.ts: D-MM-YYYY hoặc DD-MM-YYYY
    const formatDate = (d: Date) =>
      `${d.getDate()}-${String(d.getMonth() + 1).padStart(2, "0")}-${d.getFullYear()}`;
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const dayBeforeYesterday = new Date(today);
    dayBeforeYesterday.setDate(dayBeforeYesterday.getDate() - 2);
    const keepPrefixes = [
      `speaking_submissions/${formatDate(today)}/`,
      `speaking_submissions/${formatDate(yesterday)}/`,
      `speaking_submissions/${formatDate(dayBeforeYesterday)}/`,
    ];

    const filesToDelete = files.filter(
      (file) => !keepPrefixes.some((prefix) => file.name.startsWith(prefix))
    );

    if (filesToDelete.length === 0) {
      return NextResponse.json({
        success: true,
        deletedCount: 0,
        message: "Không có folder quá khứ cần xóa.",
      });
    }

    await Promise.all(filesToDelete.map((file) => file.delete()));

    return NextResponse.json({
      success: true,
      deletedCount: filesToDelete.length,
      message: `Đã xóa ${filesToDelete.length} file từ các folder quá khứ. Giữ lại folder hôm kia, hôm qua và hôm nay.`,
    });
  } catch (error) {
    console.error("[Cleanup Speaking Submissions] Error:", error);
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error ? error.message : "Lỗi khi xóa folder quá khứ.",
      },
      { status: 500 }
    );
  }
}
