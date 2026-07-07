"use client";

import { useAuth } from "@/lib/auth/context";
import { RequireAuth, RequireRole } from "@/lib/auth/guard";
import { UserRole } from "@/lib/auth/types";
import { ClassDetail } from "@/modules/classes/components/ClassDetail";
import { useClassMembers, teacherClassKeys } from "@/modules/classes/hooks";
import { useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect } from "react";
import { FiArrowLeft } from "react-icons/fi";

export default function ClassDetailPage() {
  const params = useParams();
  const classId = params.classId as string;
  const { session } = useAuth();
  const queryClient = useQueryClient();
  
  // Prefetch members and class details for faster loading
  useEffect(() => {
    if (classId && session?.user.id) {
      // Prefetch members
      queryClient.prefetchQuery({
        queryKey: teacherClassKeys.members(classId),
        queryFn: async () => {
          const { getClassMembers } = await import("@/modules/classes/services");
          return getClassMembers(classId);
        },
      });
      
      // Prefetch class details
      queryClient.prefetchQuery({
        queryKey: teacherClassKeys.detail(classId),
        queryFn: async () => {
          const { getClassDetails } = await import("@/modules/classes/services");
          return getClassDetails(classId, session.user.id);
        },
      });
    }
  }, [classId, session?.user.id, queryClient]);
  
  const { data: members } = useClassMembers(classId);

  if (
    session?.user.role !== "teacher" &&
    !members?.some((member) => member.id === session?.user.id)
  ) {
    return (
      <main>
        <h1>Bạn không có quyền truy cập trang này</h1>
      </main>
    );
  }

  return (
    <RequireAuth>
      <RequireRole roles={[UserRole.TEACHER]}>
        <main>
          <div className="mb-6">
            <Link
              href="/classes"
              className="inline-flex items-center gap-2 text-muted hover:text-foreground transition-colors"
            >
              <FiArrowLeft />
              <span>Quay lại danh sách lớp</span>
            </Link>
          </div>
          {classId && <ClassDetail classId={classId} />}
        </main>
      </RequireRole>
    </RequireAuth>
  );
}
