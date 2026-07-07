import { adminAuth } from "@/lib/firebase/admin";

/** Same rules as `scripts/sync-all-users-role-claims.cjs` */
export function normalizeRoleForClaims(
  role: unknown
): "admin" | "teacher" | "student" {
  if (role === "admin" || role === "teacher" || role === "student") return role;
  return "student";
}

/**
 * Mirrors Firestore `users.role` into Firebase Auth custom claims for server / rules checks.
 * Replaces all custom claims on the user — only `admin` and `teacher` are set.
 */
export async function syncRoleCustomClaims(
  uid: string,
  role: unknown
): Promise<void> {
  const r = normalizeRoleForClaims(role);
  const admin = r === "admin";
  const teacher = r === "teacher";
  await adminAuth().setCustomUserClaims(uid, { admin, teacher });
}
