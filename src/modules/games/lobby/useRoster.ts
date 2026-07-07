"use client";

import { useAuth } from "@/lib/auth/context";
import {
  teacherClassKeys,
  useAllClassesForInbox,
  useClassMembers,
  useStudentClasses,
  useTeacherClasses,
} from "@/modules/classes/hooks";
import { getClassMembers } from "@/modules/classes/services";
import {
  isPresenceOnline,
  useGlobalPresenceMap,
  type PresenceMap,
} from "@/modules/presence";
import { useQueries } from "@tanstack/react-query";
import { useMemo } from "react";

const EMPTY_CLASS_LIST: { id: string; students?: { studentId?: string; name?: string; avatarUrl?: string }[] }[] = [];

export interface RosterEntry {
  id: string;
  name: string;
  avatarUrl: string | null;
  role: "student" | "teacher";
  online: boolean;
}

function isUserOnline(presenceMap: PresenceMap, userId: string): boolean {
  return isPresenceOnline(presenceMap[userId]);
}

/**
 * Playable contacts for game invitations, with live online status.
 * Students: full own-class roster (online + offline) plus online students
 * from every other class. Teachers: all students across classes they teach.
 * The current user is excluded.
 */
export function useRoster(): { roster: RosterEntry[]; isLoading: boolean } {
  const { profile } = useAuth();
  const isTeacher = profile?.role === "teacher";

  const studentClasses = useStudentClasses(
    !isTeacher ? profile?.uid : undefined
  );
  const teacherClasses = useTeacherClasses(
    isTeacher ? profile?.uid : undefined
  );
  const { data: allClasses = EMPTY_CLASS_LIST, isLoading: allClassesLoading } =
    useAllClassesForInbox(!isTeacher && !!profile?.uid);

  const ownClassId = useMemo(() => {
    if (isTeacher) return "";
    return studentClasses.data?.[0]?.id ?? "";
  }, [isTeacher, studentClasses.data]);

  const teacherClassIds = useMemo(
    () =>
      (teacherClasses.data ?? [])
        .map((c) => c.id)
        .filter(Boolean)
        .sort(),
    [teacherClasses.data]
  );

  const ownClassMembersQuery = useClassMembers(ownClassId, {
    enabled: !isTeacher && !!ownClassId,
  });

  const teacherMembersQueries = useQueries({
    queries: teacherClassIds.map((classId) => ({
      queryKey: teacherClassKeys.members(classId),
      queryFn: () => getClassMembers(classId),
      enabled: isTeacher && !!classId,
      staleTime: 10 * 60 * 1000,
      gcTime: 30 * 60 * 1000,
    })),
  });

  const presenceMap = useGlobalPresenceMap();

  const roster = useMemo<RosterEntry[]>(() => {
    const memberById = new Map<string, RosterEntry>();

    if (isTeacher) {
      for (const query of teacherMembersQueries) {
        for (const member of query.data ?? []) {
          if (member.id === profile?.uid) continue;
          if (member.role !== "student") continue;
          if (!memberById.has(member.id)) {
            memberById.set(member.id, {
              id: member.id,
              name: member.name,
              avatarUrl: member.avatarUrl ?? null,
              role: member.role,
              online: isUserOnline(presenceMap, member.id),
            });
          }
        }
      }
      return Array.from(memberById.values()).sort(
        (a, b) => Number(b.online) - Number(a.online)
      );
    }

    // Cùng lớp: avatar + tên từ Firestore class members.
    for (const member of ownClassMembersQuery.data ?? []) {
      if (member.id === profile?.uid) continue;
      memberById.set(member.id, {
        id: member.id,
        name: member.name,
        avatarUrl: member.avatarUrl ?? null,
        role: member.role,
        online: isUserOnline(presenceMap, member.id),
      });
    }

    // Khác lớp: chỉ hiện khi đang online; tên từ presence, KHÔNG avatar.
    for (const cls of allClasses) {
      const classId = String(cls.id);
      if (!classId || classId === ownClassId) continue;

      for (const student of cls.students ?? []) {
        if (!student.studentId || student.studentId === profile?.uid) continue;
        if (memberById.has(student.studentId)) continue;
        if (!isUserOnline(presenceMap, student.studentId)) continue;

        memberById.set(student.studentId, {
          id: student.studentId,
          name: presenceMap[student.studentId]?.name || student.name || "Học sinh",
          avatarUrl: null,
          role: "student",
          online: true,
        });
      }
    }

    return Array.from(memberById.values()).sort(
      (a, b) => Number(b.online) - Number(a.online)
    );
  }, [
    isTeacher,
    teacherMembersQueries,
    ownClassMembersQuery.data,
    allClasses,
    ownClassId,
    presenceMap,
    profile?.uid,
  ]);

  const isLoading = isTeacher
    ? teacherClasses.isLoading ||
      (teacherClassIds.length > 0 &&
        teacherMembersQueries.some((q) => q.isLoading))
    : studentClasses.isLoading ||
      allClassesLoading ||
      (!!ownClassId && ownClassMembersQuery.isLoading);

  return { roster, isLoading };
}
