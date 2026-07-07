import { UserRole } from "./types";

export function translateRole(role: UserRole | string | undefined): string {
  if (!role) return "Không xác định";
  switch (role) {
    case "student":
      return "Học sinh";
    case "teacher":
      return "Giáo viên";
    case "admin":
      return "Admin";
    default:
      return role;
  }
}
