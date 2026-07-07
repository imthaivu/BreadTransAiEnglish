/** Client-side profile URL for a user. */
export function profilePathForUserId(
  targetUserId: string,
  currentUserId?: string | null
): string {
  const tid = (targetUserId || "").trim();
  if (!tid) return "/profile";
  if (currentUserId && tid === currentUserId) return "/profile";
  return `/profile?viewUserId=${encodeURIComponent(tid)}`;
}
