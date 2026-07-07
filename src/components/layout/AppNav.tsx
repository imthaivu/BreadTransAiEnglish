"use client";

import { SidebarHeader } from "@/components/layout/SidebarHeader";
import {
  SIDEBAR_NAV_ICON_SIZE,
  SIDEBAR_NAV_ITEM_ACTIVE_CLASS,
  SIDEBAR_NAV_ITEM_INACTIVE_CLASS,
} from "@/constants/sidebar.constants";
import { APP_NAV_ITEMS } from "@/constants/app-nav.constant";
import { useAuth } from "@/lib/auth/context";
import {
  useHomeStoriesDarkMode,
  useMovieImmersive,
  useImmersiveLight,
} from "@/lib/homeUiStore";
import { SIDEBAR_WIDTH } from "@/constants/layout";
import { SafeImage as Image } from "@/components/ui/SafeImage";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { FiSettings } from "react-icons/fi";
import { cn } from "@/utils";
import { useQuery } from "@tanstack/react-query";
import { doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { getUnreadAdmirationsCountSince } from "@/modules/classes/api/admiration";
import { getLastSeenInboxMs } from "@/utils/lastSeenInboxs";
import { LEARN_LAST_BOOK_KEY } from "@/lib/learn-selection";

const ADMIN_NAV_ITEM = { href: "/admin", label: "Admin", icon: FiSettings };
const BOTTOM_NAV_HEIGHT = 64;
const LAST_LEARN_QUERY_KEY = "breadtrans.lastLearnQuery";
const LAST_TEACHER_CLASSES_QUERY_KEY = "breadtrans.lastTeacherClassesQuery";

export { BOTTOM_NAV_HEIGHT, SIDEBAR_WIDTH };

export default function AppNav() {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isHydrated, setIsHydrated] = useState(false);
  const isViewingOtherProfile = pathname === "/profile" && !!searchParams.get("viewUserId");
  const { session, profile } = useAuth();
  const isStoriesActive = useHomeStoriesDarkMode();
  const isMovieImmersive = useMovieImmersive();
  const isImmersiveLight = useImmersiveLight();
  const isLoggedIn = !!session?.user?.id;
  // Sidebar/bottom nav chỉ chuyển dark mode khi đang ở tab Stories trên Home.
  const isHomeDarkNav = isLoggedIn && pathname === "/" && isStoriesActive;
  const avatarUrl = profile?.avatarUrl || session?.user?.image || null;
  const isAdmin = (session?.user?.role ?? profile?.role) === "admin";
  const isStudent = (session?.user?.role ?? profile?.role) === "student";
  const isTeacher = (session?.user?.role ?? profile?.role) === "teacher";
  const userId = session?.user?.id || "";
  const [learnBookId, setLearnBookId] = useState<string | null>(null);
  const [inboxLastSeenMs, setInboxLastSeenMs] = useState(0);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const readAndSync = () => {
      try {
        setLearnBookId(localStorage.getItem(LEARN_LAST_BOOK_KEY) ?? null);
        if (userId) {
          setInboxLastSeenMs(getLastSeenInboxMs(userId));
        }
      } catch {
        // ignore localStorage errors
      }
    };

    readAndSync();
    const intervalId = window.setInterval(readAndSync, 2000);
    const onInboxSeen = () => readAndSync();
    window.addEventListener("breadtrans-lastSeenInboxs", onInboxSeen);
    return () => {
      window.removeEventListener("breadtrans-lastSeenInboxs", onInboxSeen);
      window.clearInterval(intervalId);
    };
  }, [userId]);

  useEffect(() => {
    setIsHydrated(true);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;

    if (pathname.startsWith("/learn")) {
      const learnParams = new URLSearchParams();
      const learnTab = searchParams.get("tab");
      if (learnTab) learnParams.set("tab", learnTab);
      localStorage.setItem(LAST_LEARN_QUERY_KEY, learnParams.toString());
    }

    if (pathname.startsWith("/classes/teacher")) {
      const classParams = new URLSearchParams();
      const classId = searchParams.get("classId");
      const classTab = searchParams.get("tab");
      if (classId) classParams.set("classId", classId);
      if (classTab) classParams.set("tab", classTab);
      localStorage.setItem(
        LAST_TEACHER_CLASSES_QUERY_KEY,
        classParams.toString()
      );
    }
  }, [pathname, searchParams]);

  const effectiveBookId = learnBookId;

  const {
    data: vocabProgressForBadge,
    isLoading: isLoadingVocabBadge,
  } = useQuery<{
    needQuizs: number[];
    completedLessons: number[];
  }>({
    queryKey: [
      "completedLessons",
      userId,
      effectiveBookId,
      "navNeedQuizRemaining",
    ],
    enabled: !!userId && !!effectiveBookId,
    staleTime: 10_000,
    queryFn: async () => {
      if (!effectiveBookId) return { needQuizs: [], completedLessons: [] };
      const ref = doc(db, "userBookProgress", `${userId}_${effectiveBookId}`);
      const snap = await getDoc(ref);
      if (!snap.exists()) return { needQuizs: [], completedLessons: [] };
      const data = snap.data() as {
        needQuizs?: number[];
        completedLessons?: number[];
      };
      return {
        needQuizs: (data.needQuizs ?? []) as number[],
        completedLessons: (data.completedLessons ?? []) as number[],
      };
    },
  });

  const {
    data: speakingProgressForBadge,
    isLoading: isLoadingSpeakingBadge,
  } = useQuery<{
    needSpeakings: number[];
    completedLessonsSpeaking: number[];
  }>({
    queryKey: [
      "completedLessonsSpeaking",
      userId,
      effectiveBookId,
      "navNeedSpeakingRemaining",
    ],
    enabled: !!userId && !!effectiveBookId,
    staleTime: 10_000,
    queryFn: async () => {
      if (!effectiveBookId)
        return { needSpeakings: [], completedLessonsSpeaking: [] };
      const ref = doc(db, "userBookProgress", `${userId}_${effectiveBookId}`);
      const snap = await getDoc(ref);
      if (!snap.exists())
        return { needSpeakings: [], completedLessonsSpeaking: [] };
      const data = snap.data() as {
        needSpeakings?: number[];
        completedLessonsSpeaking?: number[];
      };
      return {
        needSpeakings: (data.needSpeakings ?? []) as number[],
        completedLessonsSpeaking: (data.completedLessonsSpeaking ?? []) as number[],
      };
    },
  });

  const remainingVocabCount = useMemo(() => {
    const needQuizs = vocabProgressForBadge?.needQuizs ?? [];
    const completedSet = new Set(vocabProgressForBadge?.completedLessons ?? []);
    return needQuizs.filter((lessonId) => !completedSet.has(lessonId)).length;
  }, [vocabProgressForBadge]);

  const remainingSpeakingCount = useMemo(() => {
    const needSpeakings = speakingProgressForBadge?.needSpeakings ?? [];
    const completedSet = new Set(
      speakingProgressForBadge?.completedLessonsSpeaking ?? []
    );
    return needSpeakings.filter((lessonId) => !completedSet.has(lessonId)).length;
  }, [speakingProgressForBadge]);

  const learnBadgeCount =
    !isLoggedIn
      ? 0
      : isLoadingVocabBadge || isLoadingSpeakingBadge
        ? remainingVocabCount + remainingSpeakingCount
        : remainingVocabCount + remainingSpeakingCount;

  const { data: inboxUnreadCount = 0 } = useQuery({
    queryKey: ["navInboxUnread", userId, inboxLastSeenMs],
    queryFn: () => getUnreadAdmirationsCountSince(userId, inboxLastSeenMs),
    enabled: !!userId && isLoggedIn && !isTeacher,
    staleTime: 5_000,
    refetchInterval: 15_000,
  });

  const inboxBadgeLabel =
    inboxUnreadCount > 99 ? "99+" : inboxUnreadCount > 0 ? String(inboxUnreadCount) : "";

  const navItems = useMemo(() => {
    const withoutClasses = APP_NAV_ITEMS.filter((item) => item.href !== "/classes");

    if (!isLoggedIn) {
      return withoutClasses;
    }
    if (isAdmin) {
      const base = withoutClasses;
      return [...base, ADMIN_NAV_ITEM];
    }
    if (isStudent) {
      return withoutClasses;
    }
    if (isTeacher) {
      const rest = APP_NAV_ITEMS.filter(
        (item) => item.href !== "/classes" && item.href !== "/ai"
      );
      const classesItem = APP_NAV_ITEMS.find((item) => item.href === "/classes");
      if (!classesItem) return [...APP_NAV_ITEMS];
      const learnIdx = rest.findIndex((item) => item.href === "/learn");
      if (learnIdx === -1) return [...rest, classesItem];
      return [
        ...rest.slice(0, learnIdx + 1),
        classesItem,
        ...rest.slice(learnIdx + 1),
      ];
    }
    return [...APP_NAV_ITEMS];
  }, [isAdmin, isLoggedIn, isStudent, isTeacher]);

  const shouldShowNav = useMemo(() => {
    if (!pathname) return false;
    if (pathname.startsWith("/admin")) return false;
    return true;
  }, [pathname]);

  /** Luôn về /profile sạch (không query) bằng client navigation để tránh cảm giác reload. */
  const goToOwnProfile = useCallback(() => {
    router.replace("/profile");
  }, [router]);

  // Prevent SSR/client mismatch when auth state resolves only on client.
  if (!isHydrated || !shouldShowNav || isMovieImmersive || isImmersiveLight)
    return null;

  const getNavItemState = (href: string) => {
    if (href === "/profile" && isViewingOtherProfile) return false;
    const isHomeActive =
      pathname === "/" ||
      pathname.startsWith("/flashcard") ||
      pathname.startsWith("/speaking-upload");
    return href === "/"
      ? isHomeActive
      : pathname === href || pathname.startsWith(href + "/");
  };

  const linkClass = (href: string) => {
    const isActive = getNavItemState(href);
    const activeClass = isHomeDarkNav
      ? "text-blue-400"
      : SIDEBAR_NAV_ITEM_ACTIVE_CLASS;
    const inactiveClass = isHomeDarkNav
      ? "text-gray-300 hover:text-white"
      : SIDEBAR_NAV_ITEM_INACTIVE_CLASS;
    return cn(
      "flex flex-col md:flex-row items-center justify-center md:justify-start gap-1 md:gap-3",
      "w-full px-3 py-2 rounded-lg transition-all duration-200",
      "md:min-h-12 md:h-12 md:px-4 md:py-3",
      isActive ? activeClass : inactiveClass
    );
  };

  const getNavHref = (href: string) => {
    if (href === "/learn") {
      const savedLearnQuery = localStorage.getItem(LAST_LEARN_QUERY_KEY) || "";
      return savedLearnQuery ? `/learn?${savedLearnQuery}` : "/learn";
    }

    if (href === "/classes" && isTeacher) {
      const savedClassQuery =
        localStorage.getItem(LAST_TEACHER_CLASSES_QUERY_KEY) || "";
      return savedClassQuery
        ? `/classes/teacher?${savedClassQuery}`
        : "/classes/teacher";
    }

    return href;
  };

  return (
    <>
      {/* Desktop: Left Sidebar - kích thước giống AdminSidebar */}
      <aside
        className={`hidden md:flex flex-col fixed left-0 bottom-0 z-20 ${isHomeDarkNav ? "bg-black border-r border-gray-800 shadow-none" : "bg-white border-r border-gray-200 shadow-sm"} ${isLoggedIn ? "top-0" : "top-16"}`}
        style={{ width: SIDEBAR_WIDTH }}
      >
        {isLoggedIn && <SidebarHeader />}
        <nav className="flex flex-col gap-1 p-2 flex-1 overflow-auto pt-4">
          {navItems.map(({ href, label, icon: Icon }) => {
            const isProfile = href === "/profile";
            const showAvatar = isProfile && isLoggedIn && avatarUrl;
            const isActive = getNavItemState(href);
            const isLearn = href === "/learn";
            const isHome = href === "/";
            const showLearnBadge = isLearn && learnBadgeCount > 0;
            const showHomeBadge = isHome && !!inboxBadgeLabel;
            const navInner = (
              <>
                {showAvatar ? (
                  <div className={cn(SIDEBAR_NAV_ICON_SIZE, "flex-shrink-0 rounded-full overflow-hidden ring-2 ring-gray-200")}>
                    <Image
                      src={avatarUrl}
                      alt=""
                      width={24}
                      height={24}
                      sizes="24px"
                      className="w-full h-full object-cover"
                    />
                  </div>
                ) : (
                  <div className="relative flex items-center justify-center flex-shrink-0">
                    <Icon
                      className={cn(
                        SIDEBAR_NAV_ICON_SIZE,
                        isHomeDarkNav
                          ? isActive
                            ? "text-blue-400"
                            : "text-gray-400"
                          : isActive
                            ? "text-primary"
                            : "text-gray-500"
                      )}
                    />
                    {showLearnBadge ? (
                      <span className="absolute -top-2 -right-20 min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center border-2 border-white/90">
                        {learnBadgeCount}
                      </span>
                    ) : null}
                    {showHomeBadge ? (
                      <span className="absolute -top-2 -right-20 min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center border-2 border-white/90">
                        {inboxBadgeLabel}
                      </span>
                    ) : null}
                  </div>
                )}
                <span
                  className={cn(
                    "text-sm md:text-base font-medium hidden md:inline truncate min-w-0",
                    isHomeDarkNav
                      ? isActive
                        ? "text-blue-400"
                        : "text-gray-200"
                      : isActive
                        ? "text-primary"
                        : "text-gray-700"
                  )}
                >
                  {label}
                </span>
              </>
            );

            if (isProfile) {
              return (
                <button
                  key={href}
                  type="button"
                  title={label}
                  onClick={goToOwnProfile}
                  className={cn(linkClass(href), "text-left w-full bg-transparent border-0 cursor-pointer")}
                >
                  {navInner}
                </button>
              );
            }

            return (
              <Link
                key={href}
                href={getNavHref(href)}
                className={linkClass(href)}
                title={label}
              >
                {navInner}
              </Link>
            );
          })}
        </nav>
      </aside>

      {/* Mobile: Bottom Tab Bar */}
      <nav
        className={cn(
          "app-mobile-bottom-nav md:hidden fixed bottom-0 left-0 right-0 z-40 pb-[env(safe-area-inset-bottom)]",
          isHomeDarkNav
            ? "bg-black border-t border-gray-800 shadow-none"
            : "bg-white border-t border-gray-200 shadow-[0_-4px_12px_rgba(0,0,0,0.08)]"
        )}
        style={{ minHeight: BOTTOM_NAV_HEIGHT }}
      >
        <div className="flex items-center justify-around h-full px-1 pt-1">
          {navItems.map(({ href, label, icon: Icon }) => {
            const isProfile = href === "/profile";
            const showAvatar = isProfile && isLoggedIn && avatarUrl;
            const isActive = getNavItemState(href);
            const isLearn = href === "/learn";
            const isHome = href === "/";
            const showLearnBadge = isLearn && learnBadgeCount > 0;
            const showHomeBadge = isHome && !!inboxBadgeLabel;
            const navInnerMobile = (
              <>
                {showAvatar ? (
                  <div className="w-5 h-5 flex-shrink-0 rounded-full overflow-hidden ring-2 ring-gray-200">
                    <Image
                      src={avatarUrl}
                      alt=""
                      width={20}
                      height={20}
                      sizes="20px"
                      className="w-full h-full object-cover"
                    />
                  </div>
                ) : (
                  <div className="relative flex items-center justify-center flex-shrink-0">
                    <Icon
                      className={cn(
                        "w-5 h-5",
                        isHomeDarkNav
                          ? isActive
                            ? "text-blue-400"
                            : "text-gray-400"
                          : isActive
                            ? "text-primary"
                            : "text-gray-500"
                      )}
                    />
                    {showLearnBadge ? (
                      <span className="absolute -top-2 -right-4 min-w-[16px] h-[16px] px-1 rounded-full bg-red-500 text-white text-[9px] font-bold flex items-center justify-center border-2 border-white/90">
                        {learnBadgeCount}
                      </span>
                    ) : null}
                    {showHomeBadge ? (
                      <span className="absolute -top-2 -right-4 min-w-[16px] h-[16px] px-1 rounded-full bg-red-500 text-white text-[9px] font-bold flex items-center justify-center border-2 border-white/90">
                        {inboxBadgeLabel}
                      </span>
                    ) : null}
                  </div>
                )}
                <span
                  className={cn(
                    "text-[10px] font-medium",
                    isHomeDarkNav
                      ? isActive
                        ? "text-blue-400"
                        : "text-gray-300"
                      : isActive
                        ? "text-primary"
                        : "text-gray-600"
                  )}
                >
                  {label}
                </span>
              </>
            );

            if (isProfile) {
              return (
                <button
                  key={href}
                  type="button"
                  title={label}
                  onClick={goToOwnProfile}
                  className={cn(linkClass(href), "bg-transparent border-0 cursor-pointer touch-manipulation")}
                >
                  {navInnerMobile}
                </button>
              );
            }

            return (
              <Link
                key={href}
                href={getNavHref(href)}
                className={linkClass(href)}
              >
                {navInnerMobile}
              </Link>
            );
          })}
        </div>
      </nav>
    </>
  );
}
