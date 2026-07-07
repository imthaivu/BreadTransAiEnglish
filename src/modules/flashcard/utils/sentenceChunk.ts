/**
 * Tiện ích chia câu thành các "miếng" (tile) cho bài ráp câu kiểu Duolingo.
 */

/** Trộn mảng (Fisher-Yates), không thay đổi mảng gốc. */
export function shuffle<T>(arr: T[]): T[] {
  const result = [...arr];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

/**
 * Chia câu thành các miếng liền mạch theo đúng thứ tự gốc.
 *
 * - Số miếng K = phần nguyên của (tổng số từ / 2.5), tối thiểu 1.
 * - Mỗi miếng có `base = floor(W / K)` từ; `remainder` miếng được +1 từ (miếng "dài").
 * - Các miếng dài được đặt ở vị trí ngẫu nhiên (không cố định đầu/cuối/giữa)
 *   để học sinh không đoán mẹo.
 *
 * @returns Mảng miếng theo ĐÚNG thứ tự câu gốc. Ngân hàng từ = shuffle(kết quả).
 */
export function chunkSentence(sentence: string): string[] {
  const words = sentence.trim().split(/\s+/).filter(Boolean);
  const W = words.length;
  if (W === 0) return [];
  if (W <= 3) return words; // câu quá ngắn: mỗi từ là một miếng

  const K = Math.max(1, Math.floor(W / 2.1));
  const base = Math.floor(W / K);
  const remainder = W - base * K;

  const sizes = Array<number>(K).fill(base);
  const longPositions = shuffle(Array.from({ length: K }, (_, i) => i)).slice(
    0,
    remainder
  );
  longPositions.forEach((p) => {
    sizes[p] += 1;
  });

  const tiles: string[] = [];
  let cursor = 0;
  for (const size of sizes) {
    tiles.push(words.slice(cursor, cursor + size).join(" "));
    cursor += size;
  }
  return tiles;
}

/** So khớp chuỗi đã ghép với câu gốc (bỏ qua khoảng trắng thừa, không phân biệt hoa thường). */
export function isSentenceMatch(answer: string, original: string): boolean {
  const normalize = (s: string) =>
    s.trim().replace(/\s+/g, " ").toLowerCase();
  return normalize(answer) === normalize(original);
}
