export type StreamlineImageVariant = "a" | "b" | "c";

/** URL ảnh bài Streamline (book 1–4): `book{N}/{lesson}{variant}.jpeg` */
export function getStreamlineLessonImageUrl(
  bookId: number,
  lessonId: number,
  variant: StreamlineImageVariant
): string {
  return `/assets/streamline_images/book${bookId}/${lessonId}${variant}.jpeg`;
}

/** URL ảnh script Streamline (book 1–4): `book{N}/{lesson}c.jpeg` */
export function getStreamlineScriptImageUrl(
  bookId: number,
  lessonId: number
): string {
  return getStreamlineLessonImageUrl(bookId, lessonId, "c");
}
