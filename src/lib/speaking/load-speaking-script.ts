import fs from "fs/promises";
import path from "path";

type ScriptItem = {
  id: number;
  title: string;
  script: string;
};

/**
 * Đọc script bài nói từ `data/speaking-scripts/` (chỉ dùng trên server).
 */
export async function loadSpeakingScriptForLesson(
  bookId: string,
  lessonId: number
): Promise<string> {
  if (!/^\d+$/.test(bookId)) {
    throw new Error("bookId không hợp lệ.");
  }
  if (!Number.isFinite(lessonId) || lessonId <= 0) {
    throw new Error("lessonId không hợp lệ.");
  }

  const root = process.cwd();
  const dir = path.resolve(root, "data", "speaking-scripts");
  const filePath = path.resolve(dir, `book_${bookId}.json`);
  const relative = path.relative(dir, filePath);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error("Đường dẫn script không hợp lệ.");
  }

  // Backward-compatible fallback: in case some environments still keep
  // scripts under public/data/scripts (or data folder is missing in container).
  const legacyFilePath = path.resolve(root, "public", "data", "scripts", `book_${bookId}.json`);
  const legacyRelative = path.relative(path.resolve(root, "public", "data", "scripts"), legacyFilePath);
  if (legacyRelative.startsWith("..") || path.isAbsolute(legacyRelative)) {
    throw new Error("Đường dẫn script cũ không hợp lệ.");
  }

  let raw = "";
  try {
    raw = await fs.readFile(filePath, "utf-8");
  } catch (error) {
    const isMissingPrimary =
      error instanceof Error &&
      "code" in error &&
      (error as NodeJS.ErrnoException).code === "ENOENT";
    if (!isMissingPrimary) {
      throw error;
    }

    try {
      raw = await fs.readFile(legacyFilePath, "utf-8");
    } catch (legacyError) {
      const isMissingLegacy =
        legacyError instanceof Error &&
        "code" in legacyError &&
        (legacyError as NodeJS.ErrnoException).code === "ENOENT";
      if (isMissingLegacy) {
        throw new Error(`Không có script cho sách ${bookId}.`);
      }
      throw legacyError;
    }
  }

  const scripts = JSON.parse(raw) as ScriptItem[];
  const matched = scripts.find((item) => item.id === lessonId);
  const text = matched?.script?.trim();
  if (!text) {
    throw new Error(`Không tìm thấy script cho bài ${lessonId}.`);
  }
  return text;
}
