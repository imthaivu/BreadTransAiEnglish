import { useQuery } from "@tanstack/react-query";
import {
  getDashboardStats,
  getDashboardActivityOnly,
  getDashboardDeepUsersClasses,
  getDashboardDeepBookProgress,
  getDashboardAttendanceInsights,
  getNewUsersThisMonth,
  getTotalClasses,
  getTotalTeachers,
  getTotalStudents,
} from "../services/dashboard.service";

// Query keys
export const dashboardKeys = {
  all: ["dashboard"] as const,
  stats: (range: "week" | "month") =>
    [...dashboardKeys.all, "stats", { range }] as const,
  activity: () => [...dashboardKeys.all, "activity"] as const,
  deepUsersClasses: () => [...dashboardKeys.all, "deepUsersClasses"] as const,
  deepBookProgress: () => [...dashboardKeys.all, "deepBookProgress"] as const,
  attendance: () => [...dashboardKeys.all, "attendance"] as const,
  newUsers: () => [...dashboardKeys.all, "newUsers"] as const,
  totalClasses: () => [...dashboardKeys.all, "totalClasses"] as const,
  totalTeachers: () => [...dashboardKeys.all, "totalTeachers"] as const,
  totalStudents: () => [...dashboardKeys.all, "totalStudents"] as const,
};

// Hook to get all dashboard stats (for "Xem tất cả" button)
export const useDashboardStats = (range: "week" | "month" = "week", enabled: boolean = false) => {
  return useQuery({
    queryKey: dashboardKeys.stats(range),
    queryFn: () => getDashboardStats(range),
    enabled, // Only fetch when enabled
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
  });
};

/** Chỉ users + userBookProgress: thống kê nhanh và dữ liệu biểu đồ 7 ngày (không đọc currency). */
export const useDashboardActivity = (enabled: boolean = false) => {
  return useQuery({
    queryKey: dashboardKeys.activity(),
    queryFn: getDashboardActivityOnly,
    enabled,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });
};

/** Quét users + classes (không userBookProgress). */
export const useDashboardDeepUsersClasses = (enabled: boolean = false) => {
  return useQuery({
    queryKey: dashboardKeys.deepUsersClasses(),
    queryFn: getDashboardDeepUsersClasses,
    enabled,
    staleTime: 5 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
  });
};

/** Quét userBookProgress (+ users để map role). */
export const useDashboardDeepBookProgress = (enabled: boolean = false) => {
  return useQuery({
    queryKey: dashboardKeys.deepBookProgress(),
    queryFn: getDashboardDeepBookProgress,
    enabled,
    staleTime: 5 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
  });
};

/** classAttendance · tháng hiện tại (giờ VN). */
export const useDashboardAttendanceInsight = (enabled: boolean = false) => {
  return useQuery({
    queryKey: dashboardKeys.attendance(),
    queryFn: getDashboardAttendanceInsights,
    enabled,
    staleTime: 5 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
  });
};

// Individual stat hooks
export const useNewUsersThisMonth = (enabled: boolean = false) => {
  return useQuery({
    queryKey: dashboardKeys.newUsers(),
    queryFn: getNewUsersThisMonth,
    enabled,
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
  });
};

export const useTotalClasses = (enabled: boolean = false) => {
  return useQuery({
    queryKey: dashboardKeys.totalClasses(),
    queryFn: getTotalClasses,
    enabled,
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
  });
};

export const useTotalTeachers = (enabled: boolean = false) => {
  return useQuery({
    queryKey: dashboardKeys.totalTeachers(),
    queryFn: getTotalTeachers,
    enabled,
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
  });
};

export const useTotalStudents = (enabled: boolean = false) => {
  return useQuery({
    queryKey: dashboardKeys.totalStudents(),
    queryFn: getTotalStudents,
    enabled,
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
  });
};

