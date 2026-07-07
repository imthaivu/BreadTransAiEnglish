"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { UserRole } from "@/lib/auth/types";
import { classKeys } from "./useClassManagement";
import { studentKeys } from "./useStudentManagement";
import { teacherKeys } from "./useTeacherManagement";
import { userKeys } from "./useUserManagement";
import { getClasses } from "../services/class.service";
import { getStudents } from "../services/student.service";
import { getTeachers } from "../services/teacher.service";
import { getUsers } from "../services/user.service";

/**
 * Hook to prefetch common admin data
 * This improves performance by loading data into cache before it's needed
 * 
 * @param options - Options for what to prefetch
 */
export function useAdminPrefetch(options?: {
  prefetchClasses?: boolean;
  prefetchStudents?: boolean;
  prefetchTeachers?: boolean;
  prefetchUsers?: boolean;
}) {
  const queryClient = useQueryClient();
  const {
    prefetchClasses = true,
    prefetchStudents = true,
    prefetchTeachers = true,
    prefetchUsers = false, // Users list is large, only prefetch if needed
  } = options || {};

  useEffect(() => {
    // Prefetch classes (used in multiple admin pages)
    if (prefetchClasses) {
      queryClient.prefetchQuery({
        queryKey: classKeys.lists(),
        queryFn: getClasses,
        staleTime: 5 * 60 * 1000, // 5 minutes
        gcTime: 10 * 60 * 1000, // 10 minutes
      });
    }

    // Prefetch students list (first page, used in dropdowns)
    if (prefetchStudents) {
      queryClient.prefetchQuery({
        queryKey: studentKeys.list({ page: 1, limit: 10 }),
        queryFn: () => getStudents({ page: 1, limit: 10 }),
        staleTime: 5 * 60 * 1000, // 5 minutes
        gcTime: 10 * 60 * 1000, // 10 minutes
      });
    }

    // Prefetch teachers (used in multiple admin pages)
    if (prefetchTeachers) {
      queryClient.prefetchQuery({
        queryKey: teacherKeys.lists(),
        queryFn: getTeachers,
        staleTime: 5 * 60 * 1000, // 5 minutes
        gcTime: 10 * 60 * 1000, // 10 minutes
      });
    }

    // Prefetch users (only if explicitly requested, as it can be large)
    // Note: Role is now required, so we prefetch students as the most common case
    if (prefetchUsers) {
      queryClient.prefetchQuery({
        queryKey: userKeys.lists({ page: 1, limit: 10, role: UserRole.STUDENT }),
        queryFn: () => getUsers({ page: 1, limit: 10, role: UserRole.STUDENT }),
        staleTime: 5 * 60 * 1000, // 5 minutes
        gcTime: 10 * 60 * 1000, // 10 minutes
      });
    }
  }, [queryClient, prefetchClasses, prefetchStudents, prefetchTeachers, prefetchUsers]);
}

