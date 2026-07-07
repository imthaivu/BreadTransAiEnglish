/**
 * Gom tên/avatar từ `teachers[]` + `students[]` trên doc lớp (cùng nguồn inbox / full lớp).
 * Một map duy nhất để tránh lặp logic giữa profile, inbox, v.v.
 */
export type ClassDocLikeForRoster = {
  teachers?: Array<{ id: string; name?: string; avatarUrl?: string }>;
  students?: Array<{ studentId: string; name?: string; avatarUrl?: string }>;
};

export function buildRosterDisplayMapFromClasses(
  classes: ClassDocLikeForRoster[] | null | undefined
): Map<string, { name: string; avatarUrl?: string }> {
  const m = new Map<string, { name: string; avatarUrl?: string }>();
  const put = (userId: string, name: string, avatarUrl?: string) => {
    if (!userId) return;
    const prev = m.get(userId);
    const nextName = name?.trim() || prev?.name || "Học sinh";
    const nextAvatar = avatarUrl || prev?.avatarUrl || "";
    m.set(userId, { name: nextName, avatarUrl: nextAvatar });
  };
  if (!classes?.length) return m;
  for (const c of classes) {
    const teachers = Array.isArray(c.teachers) ? c.teachers : [];
    for (const t of teachers) {
      put(t.id, t.name || "Giáo viên", t.avatarUrl);
    }
    const students = Array.isArray(c.students) ? c.students : [];
    for (const s of students) {
      put(s.studentId, s.name || "Học sinh", s.avatarUrl);
    }
  }
  return m;
}
