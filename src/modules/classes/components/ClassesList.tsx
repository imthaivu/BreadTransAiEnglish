"use client";

import { useAuth } from "@/lib/auth/context";
import { useState, useEffect, useRef, useMemo } from "react";
import { FiAlertCircle } from "react-icons/fi";
import { getFirebaseAuth } from "@/lib/firebase/client";
import toast from "react-hot-toast";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import {
  useClassQuizStories,
  useTeacherClasses,
  useTeacherPendingSpeakingEvaluations,
  QUIZ_STORY_WINDOW_HOURS,
} from "../hooks";
import { getPendingCountByClass } from "../api/pending-speaking";
import { addQuizStoryReaction } from "../api/quiz-story";
import { useBooks } from "@/modules/flashcard/hooks";
import { Button } from "@/components/ui/Button";
import {
  ClassDetailTabContent,
  CLASS_DETAIL_TABS,
  type ClassDetailTab,
} from "./ClassDetail";
import { ClassProvider } from "../context/ClassContext";
import { PendingEvaluationModal } from "./PendingEvaluationModal";

export function TeacherClassesList() {
  const { session } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const {
    data: classes,
    isPending,
    error,
  } = useTeacherClasses(session?.user?.id || "");
  const [selectedClassId, setSelectedClassId] = useState<string | null>(
    () => searchParams.get("classId") || null
  );
  const [activeTab, setActiveTab] = useState<ClassDetailTab>(() => {
    const urlTab = searchParams.get("tab");
    if (!urlTab) return "members";
    const isValidTab = CLASS_DETAIL_TABS.some((tab) => tab.id === urlTab);
    return isValidTab ? (urlTab as ClassDetailTab) : "members";
  });

  const effectiveClassId = selectedClassId || classes?.[0]?.id || null;

  const pendingItems = useTeacherPendingSpeakingEvaluations(classes);
  const { data: books = [] } = useBooks();
  const [pendingModalOpen, setPendingModalOpen] = useState(false);
  const hasAutoOpenedRef = useRef(false);

  useEffect(() => {
    if (isPending || hasAutoOpenedRef.current) return;
    if (pendingItems.length > 0) {
      setPendingModalOpen(true);
      hasAutoOpenedRef.current = true;
    }
  }, [isPending, pendingItems.length]);

  const pendingCountByClass = useMemo(() => {
    const map = new Map<string, number>();
    if (!classes) return map;
    for (const c of classes) {
      map.set(c.id, getPendingCountByClass(classes, c.id));
    }
    return map;
  }, [classes]);

  useEffect(() => {
    const urlClassId = searchParams.get("classId");
    const urlTab = searchParams.get("tab");
    const nextClassId = urlClassId || null;
    const isValidTab = urlTab ? CLASS_DETAIL_TABS.some((tab) => tab.id === urlTab) : false;
    const nextTab = isValidTab ? (urlTab as ClassDetailTab) : "members";

    setSelectedClassId((prev) => (prev === nextClassId ? prev : nextClassId));
    setActiveTab((prev) => (prev === nextTab ? prev : nextTab));
  }, [searchParams]);

  useEffect(() => {
    if (!classes || classes.length === 0) return;

    const classIds = new Set<string>(classes.map((c) => c.id));
    const validClassId = effectiveClassId && classIds.has(effectiveClassId) ? effectiveClassId : classes[0].id;
    const validTab = CLASS_DETAIL_TABS.some((tab) => tab.id === activeTab) ? activeTab : "members";

    const currentClassId = searchParams.get("classId");
    const currentTab = searchParams.get("tab");

    if (currentClassId === validClassId && currentTab === validTab) return;

    const nextParams = new URLSearchParams(searchParams.toString());
    nextParams.set("classId", validClassId);
    nextParams.set("tab", validTab);
    router.replace(`${pathname}?${nextParams.toString()}`, { scroll: false });
  }, [activeTab, classes, effectiveClassId, pathname, router, searchParams]);


  // Tự động thả TIM tất cả story HS trong lớp giáo viên đang mở (mỗi lần đổi lớp).
  // Bỏ qua các story đã được giáo viên react trước đó để tránh gửi trùng.
  const queryClient = useQueryClient();
  const teacherUserId = session?.user?.id;
  const teacherUserName = session?.user?.name || "";
  const { data: activeClassStories = [] } = useClassQuizStories(
    effectiveClassId || undefined,
    QUIZ_STORY_WINDOW_HOURS
  );
  const autoHeartedStoryIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!effectiveClassId || !teacherUserId) return;
    if (activeClassStories.length === 0) return;

    const targets = activeClassStories.filter((story) => {
      if (story.classId !== effectiveClassId) return false;
      if (story.userId === teacherUserId) return false;
      if (autoHeartedStoryIdsRef.current.has(story.id)) return false;
      if (story.userReactionsMap?.[teacherUserId]) {
        // Đã từng react rồi → đánh dấu để không thử lại trong session này
        autoHeartedStoryIdsRef.current.add(story.id);
        return false;
      }
      return true;
    });

    if (targets.length === 0) return;

    for (const story of targets) {
      autoHeartedStoryIdsRef.current.add(story.id);
    }

    let cancelled = false;
    (async () => {
      for (const story of targets) {
        if (cancelled) return;
        try {
          await addQuizStoryReaction(effectiveClassId, story.userId, story.id, {
            userId: teacherUserId,
            userName: teacherUserName,
            reactionType: "heart",
          });
        } catch (err) {
          console.error("[TeacherClassesList] auto-heart failed", err);
        }
      }
      if (!cancelled) {
        queryClient.invalidateQueries({
          queryKey: ["classQuizStories", effectiveClassId, QUIZ_STORY_WINDOW_HOURS],
        });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    effectiveClassId,
    activeClassStories,
    teacherUserId,
    teacherUserName,
    queryClient,
  ]);

  // Tự động cleanup speaking_submissions + toast khi giáo viên mở tab Bảng Speaking
  useEffect(() => {
    if (activeTab !== "overall") return;
    const role = session?.user?.role;
    if (role !== "teacher" && role !== "admin") return;

    if (role === "teacher") {
      toast("Storage chỉ giữ 3 ngày gần nhất", { icon: "🗑️" });
    }

    const runCleanup = async () => {
      try {
        const auth = getFirebaseAuth();
        const user = auth.currentUser;
        if (!user) return;
        const idToken = await user.getIdToken();
        await fetch("/api/admin/storage/cleanup-speaking-submissions", {
          method: "POST",
          headers: { Authorization: `Bearer ${idToken}` },
        });
      } catch {
        // Bỏ qua lỗi - cleanup chạy nền
      }
    };
    runCleanup();
  }, [activeTab, session?.user?.role]);

  if (isPending) {
    return (
      <div className="space-y-4">
        {[...Array(3)].map((_, i) => (
          <div
            key={i}
            className="bg-white dark:bg-gray-800 p-4 border border-border rounded-lg shadow-sm animate-pulse"
          >
            <div className="flex items-center">
              <div className="w-12 h-12 rounded-full bg-gray-200 dark:bg-gray-700 mr-4"></div>
              <div className="space-y-2">
                <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-48"></div>
                <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-32"></div>
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 text-red-700 p-4 rounded-lg flex items-center">
        <FiAlertCircle className="w-5 h-5 mr-3" />
        <p>Đã có lỗi xảy ra khi tải danh sách lớp học.</p>
      </div>
    );
  }

  if (!classes || classes.length === 0) {
    return <p className="text-muted">Bạn chưa có lớp học nào.</p>;
  }

  return (
    <>
      {pendingItems.length > 0 && (
        <div className="mb-3 flex justify-end">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setPendingModalOpen(true)}
            className="gap-2 border-orange-300 text-orange-700 hover:bg-orange-50"
          >
            Chưa chấm
            <span className="inline-flex min-w-[1.25rem] items-center justify-center rounded-full bg-red-500 px-1.5 py-0.5 text-[10px] font-bold text-white">
              {pendingItems.length}
            </span>
          </Button>
        </div>
      )}

      <PendingEvaluationModal
        open={pendingModalOpen}
        onClose={() => setPendingModalOpen(false)}
        items={pendingItems}
        isLoading={isPending}
        books={books}
      />

      {/* Top tab: lớp học */}
      <div className="bg-white rounded-lg border border-gray-200 shadow-sm mb-4 overflow-hidden">
        <div className="flex border-b border-gray-200 overflow-x-auto scrollbar-hide">
          <div className="flex flex-1 min-w-0 w-full">
            {classes.map((c) => {
              const isActive = effectiveClassId === c.id;
              const pendingCount = pendingCountByClass.get(c.id) ?? 0;
              return (
                <button
                  key={c.id}
                  onClick={() => setSelectedClassId(c.id)}
                  className={`flex flex-1 min-w-0 items-center justify-center gap-2 px-4 sm:px-6 py-3 text-sm font-medium transition-all duration-200 whitespace-nowrap relative ${isActive
                      ? "text-primary bg-primary/10"
                      : "text-gray-600 hover:text-primary hover:bg-gray-50"
                    }`}
                >
                  <span className="font-medium">{c.name}</span>
                  {pendingCount > 0 && (
                    <span className="inline-flex min-w-[1.125rem] items-center justify-center rounded-full bg-red-500 px-1 py-0.5 text-[10px] font-bold leading-none text-white">
                      {pendingCount}
                    </span>
                  )}
                  {isActive && (
                    <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary" />
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* 5 chức năng tương ứng */}
      {effectiveClassId && (
        <>
          <div className="bg-white rounded-lg border border-gray-200 shadow-sm mb-6 overflow-hidden">
            <div className="flex border-b border-gray-200 overflow-x-auto scrollbar-hide">
              <div className="flex min-w-max w-full">
                {CLASS_DETAIL_TABS.map((tab) => {
                  const isActive = activeTab === tab.id;
                  return (
                    <button
                      key={tab.id}
                      onClick={() => setActiveTab(tab.id)}
                      className={`flex items-center justify-center gap-2 px-4 sm:px-6 py-3 text-sm font-medium transition-all duration-200 whitespace-nowrap flex-1 min-w-0 relative ${isActive
                          ? "text-primary bg-primary/10"
                          : "text-gray-600 hover:text-primary hover:bg-gray-50"
                        }`}
                    >
                      <span className={`transition-colors ${isActive ? "text-primary" : "text-gray-400"}`}>
                        {tab.icon}
                      </span>
                      <span className="sm:inline">{tab.label}</span>
                      {isActive && (
                        <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary" />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="container mx-auto">
            <ClassProvider classId={effectiveClassId}>
              <ClassDetailTabContent
                activeTab={activeTab}
              />
            </ClassProvider>
          </div>
        </>
      )}
    </>
  );
}

