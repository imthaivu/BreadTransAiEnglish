/**
 * Kiểu gọi tắt Việt Nam: chữ cái đầu của cụm áp chót + "." + tên cuối.
 * Vd. "Bảo Long" → "B.Long", "Nguyễn Văn An" → "V.An". Một cụm thì giữ nguyên.
 */
export function vietnameseShortDisplayName(fullName: string): string {
  const t = fullName.trim();
  if (!t) return "?";
  const parts = t.split(/\s+/).filter(Boolean);
  if (parts.length < 2) return parts[0] ?? t;

  const beforeLast = parts[parts.length - 2]!;
  const last = parts[parts.length - 1]!;
  const initialChar = Array.from(beforeLast)[0];
  const initial = initialChar
    ? initialChar.toLocaleUpperCase("vi-VN")
    : "?";
  const lastChars = Array.from(last);
  const lastDisplay =
    lastChars.length === 0
      ? last
      : lastChars[0]!.toLocaleUpperCase("vi-VN") + lastChars.slice(1).join("");
  return `${initial}.${lastDisplay}`;
}
