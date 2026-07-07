// Tiện ích tính lớp hiện tại theo năm sinh
// Quy ước năm học Việt Nam: bắt đầu từ tháng 8 hàng năm.
// Ví dụ: học sinh sinh 2012
//   - Trước tháng 8/2026 (năm học 2025-2026) -> lớp 8
//   - Từ tháng 8/2026 trở đi (năm học 2026-2027) -> lớp 9

const SCHOOL_YEAR_START_MONTH = 8; // tháng 8

/**
 * Trả về năm bắt đầu của năm học hiện tại (ví dụ 2025 ứng với năm học 2025-2026).
 */
export function getSchoolYearStart(refDate: Date = new Date()): number {
  const year = refDate.getFullYear();
  const month = refDate.getMonth() + 1; // 1-12
  return month >= SCHOOL_YEAR_START_MONTH ? year : year - 1;
}

/**
 * Tính lớp hiện tại (1 - 12) từ năm sinh.
 * Học sinh vào lớp 1 năm sinh + 6 (theo quy định Việt Nam).
 * Trả về null nếu lớp không nằm trong khoảng 1-12 hoặc năm sinh không hợp lệ.
 */
export function calculateCurrentGrade(
  birthYear: number | null | undefined,
  refDate: Date = new Date()
): number | null {
  if (!birthYear || !Number.isFinite(birthYear)) return null;
  const schoolYearStart = getSchoolYearStart(refDate);
  const grade = schoolYearStart - birthYear - 5;
  if (grade < 1 || grade > 12) return null;
  return grade;
}

/**
 * Hiển thị nhãn lớp, fallback "—" nếu không tính được.
 */
export function formatGradeLabel(
  birthYear: number | null | undefined,
  refDate: Date = new Date()
): string {
  const grade = calculateCurrentGrade(birthYear, refDate);
  if (grade == null) return "—";
  return `Lớp ${grade}`;
}

/**
 * Validate năm sinh: phải là số 4 chữ số trong khoảng hợp lệ.
 */
export function isValidBirthYear(year: number | null | undefined): year is number {
  if (!year || !Number.isFinite(year)) return false;
  const now = new Date().getFullYear();
  return year >= 1990 && year <= now;
}
