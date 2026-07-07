import { NextRequest, NextResponse } from "next/server";
import { checkTeacherOrAdminAccess } from "@/lib/auth/server-auth";
import { adminStorage } from "@/lib/firebase/admin";

interface DeleteMovieStorageBody {
  extraPaths?: string[];
}

/**
 * Xóa toàn bộ file Storage của 1 phim: `movies/{movieId}/` + các path bổ sung
 * (ví dụ thumbnail upload sai ID trước khi sửa luồng tạo phim).
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ movieId: string }> }
) {
  try {
    const accessCheck = await checkTeacherOrAdminAccess(request);
    if (!accessCheck.authorized) {
      return NextResponse.json(
        { error: accessCheck.error ?? "Unauthorized" },
        { status: accessCheck.error === "Unauthorized" ? 401 : 403 }
      );
    }

    const { movieId } = await params;
    const trimmedId = movieId?.trim();
    if (!trimmedId) {
      return NextResponse.json({ error: "movieId is required" }, { status: 400 });
    }

    let extraPaths: string[] = [];
    try {
      const body = (await request.json()) as DeleteMovieStorageBody;
      if (Array.isArray(body.extraPaths)) {
        extraPaths = body.extraPaths
          .map((p) => String(p).trim())
          .filter((p) => p.length > 0);
      }
    } catch {
      /* body optional */
    }

    const bucket = adminStorage().bucket();
    const prefix = `movies/${trimmedId}/`;
    const [prefixFiles] = await bucket.getFiles({ prefix });

    const pathsToDelete = new Set<string>(
      prefixFiles.map((file) => file.name)
    );

    for (const path of extraPaths) {
      if (!path.startsWith("movies/")) continue;
      if (path.startsWith(prefix)) continue;
      pathsToDelete.add(path);
    }

    if (pathsToDelete.size === 0) {
      return NextResponse.json({ deletedCount: 0 });
    }

    await Promise.all(
      [...pathsToDelete].map(async (name) => {
        try {
          await bucket.file(name).delete();
        } catch (err) {
          const code = (err as { code?: number })?.code;
          if (code !== 404) throw err;
        }
      })
    );

    return NextResponse.json({ deletedCount: pathsToDelete.size });
  } catch (error) {
    console.error("[delete-movie-storage] Error:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Internal Server Error",
      },
      { status: 500 }
    );
  }
}
