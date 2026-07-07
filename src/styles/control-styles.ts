/**
 * Shared control styles for Vocabulary (flashcard) and Speaking modules.
 * Ensures consistent button/select sizes on laptop; mobile layout unchanged.
 */
export const controlStyles = {
  /** Base height and font for all controls */
  base: "h-10 md:h-12 text-sm md:text-base font-medium",
  /** Select (Chọn sách, Chọn chế độ) - full width in grid, larger on PC */
  select: "w-full px-3 py-2 md:px-4 md:py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent disabled:bg-gray-100 disabled:cursor-not-allowed transition-all",
  /** Action buttons (Chọn bài, Bắt đầu) - full width in grid, larger on PC */
  button: "w-full justify-center px-4 py-2 md:px-5 md:py-2.5",
} as const;
