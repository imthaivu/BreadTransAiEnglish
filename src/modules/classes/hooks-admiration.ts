"use client";

import { useEffect, useState } from "react";
import type { IAdmiration } from "./api/admiration";
import { getAdmirationsReceivedFromTime } from "./api/admiration";

function getDateKey(date: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function getLast7DaysKeys(): string[] {
  const keys: string[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    keys.push(getDateKey(d));
  }
  return keys;
}

function cleanupOldNotifications(studentId: string) {
  if (typeof window === "undefined") return;
  const prefix = `admirationNotifications_${studentId}_`;
  const keep = new Set(getLast7DaysKeys());
  const toRemove: string[] = [];
  for (let i = 0; i < window.localStorage.length; i++) {
    const key = window.localStorage.key(i);
    if (key && key.startsWith(prefix)) {
      const dateKey = key.replace(prefix, "");
      if (!keep.has(dateKey)) toRemove.push(key);
    }
  }
  toRemove.forEach((k) => window.localStorage.removeItem(k));
}

function loadLast7DaysFromLocalStorage(studentId: string): {
  admirations: IAdmiration[];
  lastCreatedAt: Date | null;
} {
  if (typeof window === "undefined") return { admirations: [], lastCreatedAt: null };
  const prefix = `admirationNotifications_${studentId}_`;
  const dateKeys = getLast7DaysKeys();
  const all: IAdmiration[] = [];
  let latestCreatedAt: Date | null = null;

  for (const dk of dateKeys) {
    const raw = window.localStorage.getItem(`${prefix}${dk}`);
    if (!raw) continue;
    try {
      const parsed = JSON.parse(raw) as {
        admirations: IAdmiration[];
        lastCreatedAt?: string;
        lastSavedTime?: string;
      };
      const list = (parsed.admirations || []).map((a) => ({
        ...a,
        createdAt: new Date((a as unknown as { createdAt: string | Date }).createdAt),
      }));
      all.push(...list);
      const cursorISO =
        parsed.lastCreatedAt ??
        parsed.lastSavedTime ??
        (list[0]?.createdAt ? list[0].createdAt.toISOString() : undefined);
      if (cursorISO) {
        const t = new Date(cursorISO);
        if (!latestCreatedAt || t > latestCreatedAt) latestCreatedAt = t;
      }
    } catch {
      /* ignore */
    }
  }

  const unique = all.filter((a, idx, self) => idx === self.findIndex((x) => x.id === a.id));
  unique.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  const newest = unique[0]?.createdAt ?? null;
  if (newest && (!latestCreatedAt || newest > latestCreatedAt)) latestCreatedAt = newest;
  return { admirations: unique, lastCreatedAt: latestCreatedAt };
}

function saveGroupedByDate(studentId: string, admirations: IAdmiration[]) {
  if (typeof window === "undefined") return;
  const last7 = new Set(getLast7DaysKeys());
  const byDate = new Map<string, IAdmiration[]>();
  admirations.forEach((a) => {
    const dk = getDateKey(a.createdAt);
    if (!last7.has(dk)) return;
    if (!byDate.has(dk)) byDate.set(dk, []);
    byDate.get(dk)!.push(a);
  });
  const newestCreatedAt = admirations[0]?.createdAt ?? new Date();
  for (const dk of last7) {
    const list = byDate.get(dk);
    if (!list || list.length === 0) continue;
    window.localStorage.setItem(
      `admirationNotifications_${studentId}_${dk}`,
      JSON.stringify({ admirations: list, lastCreatedAt: newestCreatedAt.toISOString() })
    );
  }
}

export function useAdmirationsReceived(studentId: string | undefined) {
  const [items, setItems] = useState<IAdmiration[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!studentId) {
      setItems([]);
      return;
    }

    cleanupOldNotifications(studentId);
    const { admirations, lastCreatedAt } = loadLast7DaysFromLocalStorage(studentId);
    setItems(admirations);

    let cancelled = false;
    (async () => {
      setIsLoading(true);
      try {
        const todayDateKey = getDateKey();
        const todayStart = new Date(todayDateKey + "T00:00:00+07:00");
        const now = new Date();
        const fetchFromTime = lastCreatedAt
          ? new Date(Math.max(lastCreatedAt.getTime(), todayStart.getTime()))
          : todayStart;

        if (fetchFromTime >= now) {
          if (!cancelled) setIsLoading(false);
          return;
        }

        const newOnes = await getAdmirationsReceivedFromTime(studentId, fetchFromTime);
        if (cancelled) return;
        if (newOnes.length === 0) return;

        const merged = [...newOnes, ...admirations];
        const unique = merged.filter((a, idx, self) => idx === self.findIndex((x) => x.id === a.id));
        unique.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
        setItems(unique);
        saveGroupedByDate(studentId, unique);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [studentId]);

  return { items, isLoading };
}
