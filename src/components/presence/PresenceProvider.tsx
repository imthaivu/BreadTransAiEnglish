"use client";

import { useEffect, useRef } from "react";
import { useAuth } from "@/lib/auth/context";
import { usePathname } from "next/navigation";
import { off, onValue } from "firebase/database";
import {
  ACTIVITY_TIMEOUT,
  ACTIVITY_WRITE_THROTTLE_MS,
  WRITE_THROTTLE_MS,
  attachGlobalPresence,
  cancelPresenceOnDisconnect,
  connectedInfoRef,
  learnActivityStore,
  mapPathToActivityTab,
  writeCurrentActivity,
  writePresenceOffline,
  writePresenceOnline,
} from "@/modules/presence";
import type {
  ActivityTabLabel,
  CurrentActivity,
  LearnActivity,
} from "@/modules/presence";

/**
 * Cập nhật presence (online/lastSeen/name) và vị trí hiện tại (currentActivity)
 * của user lên Realtime Database.
 *
 * - Online theo activity: có tương tác gần đây = online; idle quá 3 phút hoặc
 *   mất kết nối (onDisconnect) = offline. Giữ node + lastSeen khi offline.
 * - currentActivity: tab hiện tại (theo pathname) + chi tiết Learn (từ
 *   learnActivityStore do màn Flashcard/Speaking đẩy vào) — realtime.
 * - Chỉ áp dụng cho student và teacher.
 */
export function PresenceProvider({ children }: { children: React.ReactNode }) {
  const { session, profile } = useAuth();
  const pathname = usePathname();
  const userId = session?.user?.id;

  const userRole = profile?.role;
  const isTracked = userRole === "student" || userRole === "teacher";

  // --- Effect 1: online/lastSeen heartbeat + onDisconnect ---
  useEffect(() => {
    if (!userId || !isTracked) return;
    const userName = profile?.displayName || session?.user?.name || "";

    let lastActivity = Date.now();
    let lastWrite = 0;
    let intervalId: NodeJS.Timeout | null = null;
    let activityThrottle: NodeJS.Timeout | null = null;

    const markOnline = (force = false) => {
      const now = Date.now();
      if (!force && now - lastWrite < WRITE_THROTTLE_MS) return;
      lastWrite = now;
      void writePresenceOnline(userId, userName);
    };

    // Khi (re)kết nối Firebase: đăng ký lại onDisconnect + ghi online ngay.
    const connRef = connectedInfoRef();
    const connCb = onValue(connRef, (snap) => {
      if (snap.val() === true) {
        lastActivity = Date.now();
        lastWrite = Date.now();
        void attachGlobalPresence({ uid: userId, name: userName });
      }
    });

    const handleActivity = () => {
      if (document.hidden) return;
      lastActivity = Date.now();
      markOnline();
    };

    const throttledActivity = () => {
      if (activityThrottle) return;
      activityThrottle = setTimeout(() => {
        handleActivity();
        activityThrottle = null;
      }, 5000);
    };

    // Idle check: quá ACTIVITY_TIMEOUT không tương tác → ghi offline (giữ node).
    intervalId = setInterval(() => {
      const idleFor = Date.now() - lastActivity;
      if (idleFor > ACTIVITY_TIMEOUT) {
        void writePresenceOffline(userId);
      } else if (!document.hidden) {
        markOnline();
      }
    }, WRITE_THROTTLE_MS);

    const handleVisibility = () => {
      if (!document.hidden) {
        lastActivity = Date.now();
        markOnline(true);
      }
    };

    const activityEvents = [
      "mousemove",
      "mousedown",
      "keydown",
      "scroll",
      "touchstart",
      "click",
    ];
    activityEvents.forEach((e) =>
      document.addEventListener(e, throttledActivity, { passive: true })
    );
    document.addEventListener("visibilitychange", handleVisibility);
    window.addEventListener("focus", handleVisibility);

    return () => {
      if (intervalId) clearInterval(intervalId);
      if (activityThrottle) clearTimeout(activityThrottle);
      activityEvents.forEach((e) =>
        document.removeEventListener(e, throttledActivity)
      );
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("focus", handleVisibility);
      off(connRef, "value", connCb);
      void cancelPresenceOnDisconnect(userId);
      void writePresenceOffline(userId);
    };
  }, [userId, isTracked, profile?.displayName, session?.user?.name]);

  // --- Effect 2: currentActivity (tab + Learn detail) ---
  useEffect(() => {
    if (!userId || !isTracked) return;
    const tab = mapPathToActivityTab(pathname);
    if (!tab) return;

    let throttle: NodeJS.Timeout | null = null;
    let lastPublish = 0;

    const buildActivity = (
      t: ActivityTabLabel,
      learn: LearnActivity | null
    ): CurrentActivity => {
      if (t === "Learn" && learn) {
        return {
          tab: t,
          updatedAt: 0,
          miniTab: learn.miniTab,
          mode: learn.mode,
          bookName: learn.bookName,
          lessons: learn.lessons,
          pending: learn.pending,
        };
      }
      return { tab: t, updatedAt: 0 };
    };

    const publish = (immediate: boolean) => {
      const learn = tab === "Learn" ? learnActivityStore.getState() : null;
      const activity = buildActivity(tab, learn);
      const now = Date.now();
      if (immediate || now - lastPublish >= ACTIVITY_WRITE_THROTTLE_MS) {
        if (throttle) {
          clearTimeout(throttle);
          throttle = null;
        }
        lastPublish = now;
        void writeCurrentActivity(userId, activity);
      } else if (!throttle) {
        throttle = setTimeout(() => {
          throttle = null;
          lastPublish = Date.now();
          const latestLearn =
            tab === "Learn" ? learnActivityStore.getState() : null;
          void writeCurrentActivity(userId, buildActivity(tab, latestLearn));
        }, ACTIVITY_WRITE_THROTTLE_MS - (now - lastPublish));
      }
    };

    // Ghi ngay khi đổi tab (xoá Learn detail cũ nếu rời Learn).
    publish(true);

    // Theo dõi thay đổi chi tiết Learn khi đang ở tab Learn.
    const unsub =
      tab === "Learn" ? learnActivityStore.subscribe(() => publish(false)) : null;

    return () => {
      if (throttle) clearTimeout(throttle);
      if (unsub) unsub();
    };
  }, [userId, isTracked, pathname]);

  return <>{children}</>;
}
