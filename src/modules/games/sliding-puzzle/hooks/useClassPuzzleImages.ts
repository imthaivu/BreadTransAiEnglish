"use client";

import { useAuth } from "@/lib/auth/context";
import {
  useClassMembers,
  useStudentClasses,
  useTeacherClasses,
} from "@/modules/classes/hooks";
import { useMemo } from "react";

export interface ClassPuzzleImage {
  id: string;
  name: string;
  url: string;
}

/**
 * Gom avatar của các thành viên trong (lớp đầu tiên của) user hiện tại để dùng
 * làm thư viện ảnh cho Sliding Puzzle. Ưu tiên học sinh, fallback giáo viên
 * nếu lớp chỉ có giáo viên (hiếm).
 */
export function useClassPuzzleImages(): {
  images: ClassPuzzleImage[];
  isLoading: boolean;
} {
  const { profile } = useAuth();

  const isTeacher = profile?.role === "teacher";
  const studentClasses = useStudentClasses(
    !isTeacher ? profile?.uid : undefined
  );
  const teacherClasses = useTeacherClasses(
    isTeacher ? profile?.uid : undefined
  );

  const firstClassId = useMemo(() => {
    const classes = isTeacher ? teacherClasses.data : studentClasses.data;
    return classes?.[0]?.id ?? "";
  }, [isTeacher, studentClasses.data, teacherClasses.data]);

  const membersQuery = useClassMembers(firstClassId, {
    enabled: !!firstClassId,
  });

  const images = useMemo<ClassPuzzleImage[]>(() => {
    const members = membersQuery.data ?? [];
    const students = members
      .filter((m) => m.avatarUrl && m.role === "student")
      .map<ClassPuzzleImage>((m) => ({
        id: m.id,
        name: m.name,
        url: m.avatarUrl as string,
      }));
    if (students.length > 0) return students;
    return members
      .filter((m) => m.avatarUrl)
      .map<ClassPuzzleImage>((m) => ({
        id: m.id,
        name: m.name,
        url: m.avatarUrl as string,
      }));
  }, [membersQuery.data]);

  const isLoading =
    studentClasses.isLoading || teacherClasses.isLoading || membersQuery.isLoading;

  return { images, isLoading };
}
