"use client";

import type { IClass } from "@/modules/admin";
import { isPresenceOnline, useGlobalPresenceMap } from "@/modules/presence";
import { useMemo } from "react";

export type PeerRow = {
  userId: string;
  name: string;
  avatarUrl?: string;
  role: "teacher" | "student";
  lastSeen: number | null;
  online: boolean;
};

export type PeerPanel = {
  classId: string;
  class: IClass;
  teachers: PeerRow[];
  students: PeerRow[];
  /** Tổng số thành viên đang online (theo global presence) */
  onlineCount: number;
};

function normalizeClassList(classes: IClass[] | null | undefined): IClass[] {
  if (!classes?.length) return [];
  return [...classes].filter((c) => c && (c.id as string));
}

function sortMembersByOnlineThenName(rows: PeerRow[]) {
  return [...rows].sort((a, b) => {
    const oa = a.online ? 1 : 0;
    const ob = b.online ? 1 : 0;
    if (oa !== ob) return ob - oa;
    return a.name.localeCompare(b.name, "vi");
  });
}

/**
 * Toàn bộ students + teachers theo từng lớp; presence (online + lastSeen) đọc
 * từ global RTDB presence. Tên/avatar từ class document.
 */
export function usePeerPresence(
  classes: IClass[] | null | undefined,
  currentUserId: string | undefined
) {
  const stableClasses = useMemo(() => normalizeClassList(classes), [classes]);
  const presenceMap = useGlobalPresenceMap();

  const classPanels: PeerPanel[] = useMemo(() => {
    void currentUserId;

    return stableClasses.map((c) => {
      const classId = String(c.id);

      const teachers: PeerRow[] = (c.teachers ?? []).map((t) => {
        const presence = presenceMap[t.id];
        return {
          userId: t.id,
          name: t.name,
          avatarUrl: t.avatarUrl,
          role: "teacher" as const,
          lastSeen: presence?.lastSeen ?? null,
          online: isPresenceOnline(presence),
        };
      });

      const students: PeerRow[] = (c.students ?? []).map((s) => {
        const presence = presenceMap[s.studentId];
        return {
          userId: s.studentId,
          name: s.name,
          avatarUrl: (s as { avatarUrl?: string }).avatarUrl,
          role: "student" as const,
          lastSeen: presence?.lastSeen ?? null,
          online: isPresenceOnline(presence),
        };
      });

      const allRows = [...teachers, ...students];
      let onlineCount = 0;
      for (const r of allRows) {
        if (r.online) onlineCount += 1;
      }

      return {
        classId,
        class: c,
        teachers: sortMembersByOnlineThenName(teachers),
        students: sortMembersByOnlineThenName(students),
        onlineCount,
      };
    });
  }, [stableClasses, presenceMap, currentUserId]);

  return { classPanels, classCount: stableClasses.length };
}
