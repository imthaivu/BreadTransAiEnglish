"use client";

import { useAuth } from "@/lib/auth/context";
import {
  useStudentClasses,
  useTeacherClasses,
  useAllClassesForInbox,
  useClassQuizStoriesMany,
  QUIZ_STORY_WINDOW_HOURS,
} from "@/modules/classes/hooks";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { getBooks } from "@/modules/flashcard/services";
import { usePathname } from "next/navigation";
import { UserRole } from "@/lib/auth/types";
import { classKeys } from "@/modules/admin/hooks/useClassManagement";
import { contentKeys } from "@/modules/admin/hooks/useContentManagement";
import { studentKeys } from "@/modules/admin/hooks/useStudentManagement";
import { teacherKeys } from "@/modules/admin/hooks/useTeacherManagement";
import { getClasses } from "@/modules/admin/services/class.service";
import { getContentTopics, getMusicLibrary } from "@/modules/admin/services/content.service";
import { getStudents } from "@/modules/admin/services/student.service";
import { getTeachers } from "@/modules/admin/services/teacher.service";

const STUDENT_APP_PATHS = [
  "/",
  "/classes",
  "/learn",
  "/stories",
  "/grammar",
  "/profile",
  "/flashcard",
  "/speaking-upload",
  "/ai",
];

function isStudentAppPath(pathname: string | null): boolean {
  if (!pathname) return false;
  return STUDENT_APP_PATHS.some(
    (p) => pathname === p || pathname.startsWith(p + "/")
  );
}

function isAdminPath(pathname: string | null): boolean {
  return !!pathname?.startsWith("/admin");
}

/**
 * Prefetches và giữ warm cache cho shared data theo từng loại user:
 * - Student/Teacher: Home, Lớp học, Stories, Ngữ pháp, Hồ sơ
 * - Admin: Dashboard, Tài khoản, Học sinh, Giáo viên, Bánh mì, Lớp học
 * Tránh fetch thừa khi chuyển tab/page.
 * Toàn lớp (`getAllClasses`) + story mọi lớp đã đăng ký: cache dùng chung Inbox / Profile, không prefetch `getClassMembers` hàng loạt (trùng đọc doc lớp với roster).
 */
export function AppDataProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const { session } = useAuth();
  const userId = session?.user?.id;
  const role = session?.user?.role;
  const isStudent = role === UserRole.STUDENT;
  const isTeacher = role === UserRole.TEACHER;
  const isAdmin = role === UserRole.ADMIN;

  const shouldPrefetchStudentApp = useMemo(
    () =>
      !!userId &&
      isStudentAppPath(pathname) &&
      !pathname?.startsWith("/admin"),
    [userId, pathname]
  );

  const shouldPrefetchAdmin = useMemo(
    () => !!userId && isAdmin && isAdminPath(pathname),
    [userId, isAdmin, pathname]
  );

  // ========== Student/Teacher shared data ==========
  const { data: studentClasses = [] } = useStudentClasses(
    shouldPrefetchStudentApp && isStudent ? userId : undefined
  );
  const { data: teacherClasses = [] } = useTeacherClasses(
    shouldPrefetchStudentApp && isTeacher ? userId : undefined
  );
  const classes = isTeacher ? teacherClasses : studentClasses;
  const enrolledClassIds = useMemo(
    () => classes.map((c) => c.id as string).filter(Boolean),
    [classes]
  );

  useAllClassesForInbox(shouldPrefetchStudentApp && !!userId);

  useClassQuizStoriesMany(
    enrolledClassIds,
    QUIZ_STORY_WINDOW_HOURS,
    shouldPrefetchStudentApp && enrolledClassIds.length > 0
  );

  // Books - shared giữa Từ vựng và Speaking (cả 2 tab trên Home)
  useQuery({
    queryKey: ["books"],
    queryFn: getBooks,
    enabled: shouldPrefetchStudentApp,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    refetchOnMount: false,
  });

  // Prefetch 3 loại nội dung (grammars/movies/music) cho trang /grammar
  useQuery({
    queryKey: contentKeys.list("grammars"),
    queryFn: () => getContentTopics("grammars"),
    enabled: shouldPrefetchStudentApp,
    staleTime: 5 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
  });
  useQuery({
    queryKey: contentKeys.list("movies"),
    queryFn: () => getContentTopics("movies"),
    enabled: shouldPrefetchStudentApp,
    staleTime: 5 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
  });
  useQuery({
    queryKey: contentKeys.musicLibrary(),
    queryFn: getMusicLibrary,
    enabled: shouldPrefetchStudentApp,
    staleTime: 5 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
  });

  // ========== Admin shared data ==========
  useQuery({
    queryKey: classKeys.lists(),
    queryFn: getClasses,
    enabled: shouldPrefetchAdmin,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    refetchOnMount: false,
  });

  useQuery({
    queryKey: studentKeys.list({ page: 1, limit: 10 }),
    queryFn: () => getStudents({ page: 1, limit: 10 }),
    enabled: shouldPrefetchAdmin,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    refetchOnMount: false,
  });

  useQuery({
    queryKey: teacherKeys.lists(),
    queryFn: getTeachers,
    enabled: shouldPrefetchAdmin,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    refetchOnMount: false,
  });

  return <>{children}</>;
}
