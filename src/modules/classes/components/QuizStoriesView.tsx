"use client";

import { IQuizStory } from "../types";
import { useAuth } from "@/lib/auth/context";
import {
  useAddQuizStoryReaction,
  useRemoveQuizStoryReaction,
  useClassMemberPresence,
} from "../hooks";
import { useState, useMemo, useEffect, useLayoutEffect, useRef, useCallback } from "react";
import { SafeImage as Image } from "@/components/ui/SafeImage";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/ui/Modal";
import { ReactionFlyUp } from "@/components/feedback/ReactionFlyUp";
import { FaFire } from "react-icons/fa";
import { FiChevronUp, FiChevronDown } from "react-icons/fi";
import { usePublicUserProfile } from "@/modules/user/hooks";
import { ProfileAvatarLink } from "@/components/ui/ProfileAvatarLink";
import { profilePathForUserId } from "@/utils/profileHref";

const REACTION_TYPES = [
  { type: "wow" as const, icon: "😱", label: "Wow" },
  { type: "heart" as const, icon: "❤️", label: "Tim" },
  { type: "like" as const, icon: "👍", label: "Like" },
  { type: "haha" as const, icon: "😂", label: "Haha" },
];

const AUTO_ADVANCE_MS = 3000; // 3s chuyển story nếu cùng người
const SWIPE_THRESHOLD = 60; // px - lướt dọc TikTok style

const getAccuracyBadgeClass = (accuracy: number): string => {
  if (accuracy >= 95) return "bg-emerald-500/90";
  if (accuracy >= 90) return "bg-blue-500/90";
  if (accuracy >= 80) return "bg-cyan-500/90";
  return "bg-amber-500/90";
};

const formatDayMonth = (value: Date) => {
  const day = String(value.getDate()).padStart(2, "0");
  const month = String(value.getMonth() + 1).padStart(2, "0");
  return `${day}-${month}`;
};

const getSurnameInitial = (fullName?: string) => {
  const normalized = (fullName || "").trim();
  if (!normalized) return "?";
  const firstPart = normalized.split(/\s+/)[0] || normalized;
  return firstPart.charAt(0).toUpperCase();
};

interface QuizStoriesViewProps {
  stories: IQuizStory[];
  classId: string;
  userId?: string;
  links?: { zalo?: string; meet?: string };
  noteProcess?: string;
  onRefetch?: () => void | Promise<unknown>;
}

export function QuizStoriesView({
  stories,
  classId,
  userId,
  links,
  noteProcess,
  onRefetch,
}: QuizStoriesViewProps) {
  const router = useRouter();
  const { session } = useAuth();
  const currentUserId = session?.user?.id;
  const currentUserName = session?.user?.name || "";
  const { mutate: addReaction } = useAddQuizStoryReaction();
  const { mutate: removeReaction } = useRemoveQuizStoryReaction();
  const [currentUserIndex, setCurrentUserIndex] = useState(0);
  const [currentStoryIndexes, setCurrentStoryIndexes] = useState<Record<string, number>>({});
  const [profileModalUserId, setProfileModalUserId] = useState<string | null>(
    null
  );
  const { isOnline } = useClassMemberPresence(classId);
  const lastTapRef = useRef<number>(0);
  const lastTapSource = useRef<"touch" | "mouse" | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isJumpingFromClone, setIsJumpingFromClone] = useState(false);
  const [optimisticReactions, setOptimisticReactions] = useState<Record<string, { reactionCounts: Record<string, number>; userReactionsMap: Record<string, string> }>>({});

  const { data: viewedProfile, isLoading: profileLoading } = usePublicUserProfile(profileModalUserId);

  const userOrderRef = useRef<string[]>([]);

  const filteredStories = useMemo(() => {
    if (stories.length === 0 || !classId) return [];
    return stories.filter((story) => story.classId === classId);
  }, [stories, classId]);

  const allStoriesOrdered = useMemo(() => {
    if (filteredStories.length === 0) return [];
    const getStoryInteractionCount = (story: IQuizStory) => {
      const counts = story.reactionCounts;
      if (!counts) return 0;
      return (counts.wow || 0) + (counts.heart || 0) + (counts.like || 0) + (counts.haha || 0);
    };

    const storiesByUser = new Map<string, IQuizStory[]>();
    filteredStories.forEach((story) => {
      // Chỉ lấy các bài mà user hiện tại chưa từng donate/react.
      if (currentUserId && (story.donatedUsers || []).includes(currentUserId)) {
        return;
      }
      if (!storiesByUser.has(story.userId)) {
        storiesByUser.set(story.userId, []);
      }
      storiesByUser.get(story.userId)!.push(story);
    });

    storiesByUser.forEach((userStories) => {
      userStories.sort((a, b) => {
        const interactionDiff = getStoryInteractionCount(a) - getStoryInteractionCount(b);
        if (interactionDiff !== 0) return interactionDiff;

        const timeA = new Date(a.lastSaveStory || a.createdAt).getTime();
        const timeB = new Date(b.lastSaveStory || b.createdAt).getTime();
        return timeB - timeA;
      });
    });

    const getUserSum = (uid: string) => {
      const uStories = storiesByUser.get(uid);
      if (!uStories) return 0;
      return uStories.reduce((acc, s) => acc + getStoryInteractionCount(s), 0);
    };

    const currentUsers = Array.from(storiesByUser.keys());
    // Update ref with current active users
    userOrderRef.current = currentUsers;

    // Sort all users ascending by sum of bread
    userOrderRef.current.sort((uidA, uidB) => getUserSum(uidA) - getUserSum(uidB));

    const orderedStories: IQuizStory[] = [];
    if (userId && storiesByUser.has(userId)) {
      orderedStories.push(...storiesByUser.get(userId)!);
    }

    for (const uid of userOrderRef.current) {
      if (uid === userId) continue;
      orderedStories.push(...storiesByUser.get(uid)!);
    }

    return orderedStories;
  }, [filteredStories, userId, currentUserId]);

  const storiesWithOptimistic = useMemo(() => {
    return allStoriesOrdered.map((s) => {
      const opt = optimisticReactions[s.id];
      if (!opt) return s;

      const serverUserReaction = s.userReactionsMap?.[currentUserId || ""] || undefined;
      const optimisticUserReaction = opt.userReactionsMap?.[currentUserId || ""] || undefined;

      if (serverUserReaction === optimisticUserReaction) {
        return s;
      }

      return {
        ...s,
        reactionCounts: opt.reactionCounts,
        userReactionsMap: opt.userReactionsMap as IQuizStory["userReactionsMap"]
      };
    });
  }, [allStoriesOrdered, optimisticReactions, currentUserId]);

  const allUserGroups = useMemo(() => {
    if (storiesWithOptimistic.length === 0) return [];

    // Group by userId based on order
    const groups: { userId: string; userStories: IQuizStory[] }[] = [];
    const groupMap = new Map<string, IQuizStory[]>();

    // Note: storiesWithOptimistic is already ordered by userOrderRef via allStoriesOrdered
    for (const story of storiesWithOptimistic) {
      if (!groupMap.has(story.userId)) {
        const arr: IQuizStory[] = [];
        groupMap.set(story.userId, arr);
        groups.push({ userId: story.userId, userStories: arr });
      }
      groupMap.get(story.userId)!.push(story);
    }

    return groups;
  }, [storiesWithOptimistic]);

  const userCount = allUserGroups.length;
  // Duplicate for seamless vertical scroll clone
  const allUsersDisplay = useMemo(() => {
    if (userCount <= 1) return allUserGroups;
    return [...allUserGroups, allUserGroups[0]];
  }, [allUserGroups, userCount]);

  const isOnClone = userCount > 1 && currentUserIndex >= userCount;
  const TRANSITION_MS = 400;

  useEffect(() => {
    if (isOnClone) {
      const t = setTimeout(() => {
        setIsJumpingFromClone(true);
        setCurrentUserIndex(0);
      }, TRANSITION_MS);
      return () => clearTimeout(t);
    }
  }, [isOnClone]);

  useEffect(() => {
    if (isJumpingFromClone) {
      const t = requestAnimationFrame(() => setIsJumpingFromClone(false));
      return () => cancelAnimationFrame(t);
    }
  }, [isJumpingFromClone]);

  // useEffect(() => {
  //   setOptimisticReactions({});
  // }, [stories]);

  const currentStoryIdRef = useRef<string | null>(null);
  const prevStoriesRef = useRef(allStoriesOrdered);
  const prevUserIdRef = useRef(userId);
  const [hasInitialized, setHasInitialized] = useState(false);

  useLayoutEffect(() => {
    let listChanged = prevStoriesRef.current !== allStoriesOrdered;
    let newIndex = currentUserIndex;
    let shouldSetIndex = false;

    if (userId !== prevUserIdRef.current) {
      prevUserIdRef.current = userId;
      const startIndex = allUserGroups.findIndex((g) => g.userId === userId);
      newIndex = Math.max(0, startIndex);
      shouldSetIndex = true;
    } else if (!hasInitialized && allUserGroups.length > 0) {
      const startIndex = userId ? allUserGroups.findIndex((g) => g.userId === userId) : 0;
      newIndex = Math.max(0, startIndex);
      shouldSetIndex = true;
      setHasInitialized(true);
    } else if (listChanged && currentStoryIdRef.current) {
      // Find which user group contains this story id
      const foundGroupIndex = allUserGroups.findIndex(g => g.userStories.some(s => s.id === currentStoryIdRef.current));
      if (foundGroupIndex >= 0 && foundGroupIndex !== currentUserIndex) {
        newIndex = foundGroupIndex;
        shouldSetIndex = true;
      }
    }

    if (shouldSetIndex) {
      setCurrentUserIndex(newIndex);
      const group = allUserGroups[newIndex];
      if (group && group.userStories[currentStoryIndexes[group.userId] || 0]) {
        currentStoryIdRef.current = group.userStories[currentStoryIndexes[group.userId] || 0].id;
      }
    } else if (!listChanged) {
      const group = allUserGroups[currentUserIndex];
      if (group && group.userStories[currentStoryIndexes[group.userId] || 0]) {
        currentStoryIdRef.current = group.userStories[currentStoryIndexes[group.userId] || 0].id;
      }
    }

    prevStoriesRef.current = allStoriesOrdered;
  }, [allStoriesOrdered, currentUserIndex, userId, hasInitialized, allUserGroups, currentStoryIndexes]);

  const prevUserIndexForStoryReset = useRef(currentUserIndex);

  // Đảm bảo mỗi khi chuyển sang học sinh khác (thông qua Swipe, phím mũi tên, clone scroll, v.v.),
  // thì học sinh đó sẽ bắt đầu lại từ story đầu tiên của họ (vị trí 0).
  useEffect(() => {
    const group = allUsersDisplay[currentUserIndex];
    if (group && prevUserIndexForStoryReset.current !== currentUserIndex) {
      prevUserIndexForStoryReset.current = currentUserIndex;
      setCurrentStoryIndexes(prev => {
        if (prev[group.userId] !== 0) {
          return { ...prev, [group.userId]: 0 };
        }
        return prev;
      });
    }
  }, [currentUserIndex, allUsersDisplay]);

  const measureHeight = useCallback(() => {
    const el = containerRef.current;
    if (el && el.offsetHeight > 0) setSlideHeight(el.offsetHeight);
  }, []);

  useLayoutEffect(() => {
    measureHeight();
  }, [measureHeight, allStoriesOrdered.length]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(measureHeight);
    ro.observe(el);
    return () => ro.disconnect();
  }, [measureHeight]);

  const currentUserGroup = allUsersDisplay[Math.min(currentUserIndex, allUsersDisplay.length - 1)];
  const currentSubIndex = currentUserGroup ? (currentStoryIndexes[currentUserGroup.userId] || 0) : 0;
  const currentStory = currentUserGroup?.userStories[currentSubIndex];

  const triggerReactionFly = useCallback((reactionType: "like" | "heart" | "wow" | "haha", x: number, y: number) => {
    const r = REACTION_TYPES.find((t) => t.type === reactionType);
    if (r) setReactionFly({ icon: r.icon, x, y, key: Date.now() });
  }, []);

  const handleReaction = useCallback(
    (reactionType: "like" | "heart" | "wow" | "haha", event?: { clientX: number; clientY: number }) => {
      const actualGroup = allUsersDisplay[Math.min(currentUserIndex, allUsersDisplay.length - 1)];
      const actualSubIndex = actualGroup ? (currentStoryIndexes[actualGroup.userId] || 0) : 0;
      const actualStory = actualGroup?.userStories[actualSubIndex];
      const targetClassId = actualStory?.classId || classId;
      if (!currentUserId || !actualStory || !actualStory.userId || !targetClassId)
        return;
      const existingReaction = actualStory.userReactionsMap?.[currentUserId];
      if (existingReaction) {
        if (existingReaction === reactionType) {
          setOptimisticReactions((prev) => {
            const base = prev[actualStory.id] || { reactionCounts: { ...actualStory.reactionCounts }, userReactionsMap: { ...actualStory.userReactionsMap } };
            const type = existingReaction;
            const counts = { ...base.reactionCounts, [type]: Math.max(0, (base.reactionCounts[type] || 0) - 1) };
            const map = { ...base.userReactionsMap };
            delete map[currentUserId];
            return { ...prev, [actualStory.id]: { reactionCounts: counts, userReactionsMap: map } };
          });
          removeReaction({
            classId: targetClassId,
            ownerUserId: actualStory.userId,
            storyId: actualStory.id,
            reactingUserId: currentUserId,
          });
        } else {
          if (event) triggerReactionFly(reactionType, event.clientX, event.clientY);
          setOptimisticReactions((prev) => {
            const base = prev[actualStory.id] || { reactionCounts: { ...actualStory.reactionCounts }, userReactionsMap: { ...actualStory.userReactionsMap } };
            const counts = { ...base.reactionCounts };
            counts[existingReaction] = Math.max(0, (counts[existingReaction] || 0) - 1);
            counts[reactionType] = (counts[reactionType] || 0) + 1;
            const map = { ...base.userReactionsMap, [currentUserId]: reactionType };
            return { ...prev, [actualStory.id]: { reactionCounts: counts, userReactionsMap: map } };
          });
          addReaction({
            classId: targetClassId,
            ownerUserId: actualStory.userId,
            storyId: actualStory.id,
            reaction: {
              userId: currentUserId,
              userName: currentUserName,
              reactionType,
            },
            suppressToast: true,
          });
        }
      } else {
        if (event) triggerReactionFly(reactionType, event.clientX, event.clientY);
        setOptimisticReactions((prev) => {
          const base = prev[actualStory.id] || { reactionCounts: { ...actualStory.reactionCounts }, userReactionsMap: { ...actualStory.userReactionsMap } };
          const counts = { ...base.reactionCounts, [reactionType]: (base.reactionCounts[reactionType] || 0) + 1 };
          const map = { ...base.userReactionsMap, [currentUserId]: reactionType };
          return { ...prev, [actualStory.id]: { reactionCounts: counts, userReactionsMap: map } };
        });
        addReaction({
          classId: targetClassId,
          ownerUserId: actualStory.userId,
          storyId: actualStory.id,
          reaction: {
            userId: currentUserId,
            userName: currentUserName,
            reactionType,
          },
          suppressToast: true,
        });
      }
    },
    [
      currentUserId,
      allUsersDisplay,
      currentUserIndex,
      currentStoryIndexes,
      classId,
      currentUserName,
      addReaction,
      removeReaction,
      triggerReactionFly,
    ]
  );

  const lastTapPos = useRef({ x: 0, y: 0 });

  const handleDoubleTapWow = useCallback(() => {
    const actualGroup = allUsersDisplay[Math.min(currentUserIndex, allUsersDisplay.length - 1)];
    const actualSubIndex = actualGroup ? (currentStoryIndexes[actualGroup.userId] || 0) : 0;
    const actualStory = actualGroup?.userStories[actualSubIndex];
    if (!currentUserId || !actualStory) return;
    if (actualStory.userReactionsMap?.[currentUserId] === "wow") return;
    const { x, y } = lastTapPos.current;
    triggerReactionFly("wow", x, y);
    handleReaction("wow");
  }, [currentUserId, allUsersDisplay, currentUserIndex, currentStoryIndexes, handleReaction, triggerReactionFly]);

  const handleTap = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if ((e.target as HTMLElement).closest("[data-no-navigate]")) return;
      lastTapPos.current = { x: e.clientX, y: e.clientY };
      const now = Date.now();
      const timeSinceLastTap = now - lastTapRef.current;
      if (timeSinceLastTap < 300 && timeSinceLastTap > 0 && lastTapSource.current === "mouse") {
        lastTapRef.current = 0;
        lastTapSource.current = null;
        handleDoubleTapWow();
        return;
      }
      lastTapRef.current = now;
      lastTapSource.current = "mouse";
    },
    [handleDoubleTapWow]
  );

  // --- Logic View --- //
  // Add these back
  const [progress, setProgress] = useState(100);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const isDragging = useRef(false);
  const [slideHeight, setSlideHeight] = useState(400);
  const [reactionFly, setReactionFly] = useState<{ icon: string; x: number; y: number; key: number } | null>(null);

  const touchStartX = useRef<number>(0);
  const touchStartY = useRef<number>(0);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if ((e.target as HTMLElement).closest("[data-no-navigate]")) return;
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
    isDragging.current = true;
    setDragOffset({ x: 0, y: 0 });
  }, []);

  const handleTouchMove = useCallback(
    (e: React.TouchEvent) => {
      if (!isDragging.current || (e.target as HTMLElement).closest("[data-no-navigate]")) return;
      if (e.cancelable) e.preventDefault();

      const touch = e.touches[0];
      const deltaX = touch.clientX - touchStartX.current;
      const deltaY = touch.clientY - touchStartY.current;

      const isHorizontalSwipe = Math.abs(deltaX) > Math.abs(deltaY);

      if (isHorizontalSwipe) {
        // Horizontal scrolling for stories of same user
        const group = allUsersDisplay[currentUserIndex];
        if (!group || group.userStories.length <= 1) return;

        const maxDrag = window.innerWidth * 0.5;
        let rubber = Math.abs(deltaX) > maxDrag ? maxDrag * Math.sign(deltaX) + (deltaX - maxDrag * Math.sign(deltaX)) * 0.3 : deltaX;

        const curSub = currentStoryIndexes[group.userId] || 0;
        if ((curSub <= 0 && deltaX > 0) || (curSub >= group.userStories.length - 1 && deltaX < 0)) rubber *= 0.4;

        setDragOffset({ x: rubber, y: 0 });
      } else {
        // Vertical scrolling for users
        const n = allUserGroups.length;
        if (n <= 1) return;
        const height = containerRef.current?.offsetHeight ?? 400;
        const maxDrag = height * 0.5;
        let rubber = Math.abs(deltaY) > maxDrag ? maxDrag * Math.sign(deltaY) + (deltaY - maxDrag * Math.sign(deltaY)) * 0.3 : deltaY;
        if (currentUserIndex <= 0 && deltaY > 0) rubber *= 0.4;
        setDragOffset({ x: 0, y: rubber });
      }
    },
    [allUserGroups.length, currentUserIndex, allUsersDisplay, currentStoryIndexes]
  );

  const handleTouchEnd = useCallback(
    (e: React.TouchEvent) => {
      if ((e.target as HTMLElement).closest("[data-no-navigate]")) return;
      const touch = e.changedTouches?.[0];
      if (!touch) {
        isDragging.current = false;
        setDragOffset({ x: 0, y: 0 });
        return;
      }
      const deltaX = touch.clientX - touchStartX.current;
      const deltaY = touch.clientY - touchStartY.current;
      isDragging.current = false;

      const isHorizontalSwipe = Math.abs(deltaX) > Math.abs(deltaY);
      const isTap = Math.abs(deltaX) < 10 && Math.abs(deltaY) < 10;

      if (!isTap) {
        if (isHorizontalSwipe) {
          const thresholdX = Math.min(SWIPE_THRESHOLD, window.innerWidth * 0.15);
          const group = allUsersDisplay[currentUserIndex];
          if (group && group.userStories.length > 1 && Math.abs(deltaX) > thresholdX) {
            const currentSub = currentStoryIndexes[group.userId] || 0;
            if (deltaX < 0 && currentSub < group.userStories.length - 1) {
              // Next story
              setCurrentStoryIndexes(prev => ({ ...prev, [group.userId]: currentSub + 1 }));
            } else if (deltaX > 0 && currentSub > 0) {
              // Prev story
              setCurrentStoryIndexes(prev => ({ ...prev, [group.userId]: currentSub - 1 }));
            }
          }
        } else {
          const height = containerRef.current?.offsetHeight ?? 400;
          const thresholdY = Math.min(SWIPE_THRESHOLD, height * 0.15);
          const n = allUserGroups.length;
          if (n > 0 && Math.abs(deltaY) > thresholdY) {
            let nextIndex = currentUserIndex;
            if (deltaY < 0) {
              // Next user
              nextIndex = currentUserIndex >= n - 1 ? (n > 1 ? n : currentUserIndex) : currentUserIndex + 1;
            } else {
              // Previous user
              if (currentUserIndex <= 0) {
                onRefetch?.();
              } else {
                nextIndex = currentUserIndex - 1;
              }
            }
            if (nextIndex !== currentUserIndex) {
              setCurrentUserIndex(nextIndex);
              const nextGroup = allUsersDisplay[nextIndex];
              if (nextGroup) {
                setCurrentStoryIndexes(prev => ({ ...prev, [nextGroup.userId]: 0 }));
              }
            }
          }
        }
      }

      setDragOffset({ x: 0, y: 0 });
      lastTapPos.current = { x: touch.clientX, y: touch.clientY };
      const now = Date.now();
      const dt = now - lastTapRef.current;

      if (isTap && dt < 300 && dt > 0 && lastTapSource.current === "touch") {
        lastTapRef.current = 0;
        lastTapSource.current = null;
        handleDoubleTapWow();
        return;
      }
      if (isTap) {
        lastTapRef.current = now;
        lastTapSource.current = "touch";
      }
    },
    [currentUserIndex, allUserGroups.length, handleDoubleTapWow, onRefetch, allUsersDisplay, currentStoryIndexes]
  );

  // Tránh ghost click làm hỏng double-tap trên mobile (passive: false để preventDefault hoạt động)
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onTouchEnd = (e: TouchEvent) => {
      if ((e.target as HTMLElement)?.closest?.("[data-no-navigate]") || (e.target as HTMLElement)?.closest?.("button")) return;
      const touch = e.changedTouches?.[0];
      if (!touch) return;
      const deltaX = touch.clientX - touchStartX.current;
      const deltaY = touch.clientY - touchStartY.current;

      const isTap = Math.abs(deltaX) < 10 && Math.abs(deltaY) < 10;
      if (isTap && e.cancelable) e.preventDefault();
    };
    el.addEventListener("touchend", onTouchEnd, { passive: false, capture: true });
    return () => el.removeEventListener("touchend", onTouchEnd, { capture: true });
  }, []);

  useEffect(() => {
    if (!currentStory?.id || profileModalUserId !== null) {
      setProgress(100);
      return;
    }

    // Auto advance only if next story belongs to same user, else halt at 100
    const group = allUsersDisplay[currentUserIndex];
    if (!group) return;

    const curSub = currentStoryIndexes[group.userId] || 0;
    const hasNextStory = curSub < group.userStories.length - 1;

    setProgress(0);
    const start = Date.now();
    const iv = setInterval(() => {
      const elapsed = Date.now() - start;
      const p = Math.min(100, (elapsed / AUTO_ADVANCE_MS) * 100);
      setProgress(p);

      if (p >= 100) {
        clearInterval(iv);
        if (hasNextStory) {
          setCurrentStoryIndexes(prev => ({ ...prev, [group.userId]: curSub + 1 }));
        }
      }
    }, 50);
    return () => clearInterval(iv);
  }, [currentUserIndex, currentStoryIndexes, currentStory?.id, profileModalUserId, allUsersDisplay]);

  const getPerformanceText = (accuracy: number) => {
    if (accuracy >= 95) return "Xuất Sắc";
    if (accuracy >= 90) return "Giỏi";
    if (accuracy >= 80) return "Khá";
    return "Cần cố gắng";
  };

  const getPerformanceColor = (accuracy: number) => {
    if (accuracy >= 95) return "text-emerald-400";
    if (accuracy >= 90) return "text-blue-400";
    if (accuracy >= 80) return "text-cyan-400";
    return "text-amber-400";
  };

  const classLinksRow = (
    <div className="flex items-center gap-2 overflow-x-auto whitespace-nowrap pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {links?.zalo ? (
        <a
          href={links.zalo}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs flex-shrink-0 border border-gray-700 bg-black/60 text-gray-300 hover:text-white hover:border-gray-500"
        >
          <Image src="/assets/images/zalo.png" alt="Zalo" width={16} height={16} className="h-4 w-4" />
        </a>
      ) : null}
      {links?.meet ? (
        <a
          href={links.meet}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs flex-shrink-0 border border-gray-700 bg-black/60 text-gray-300 hover:text-white hover:border-gray-500"
        >
          <Image src="/assets/images/meet.png" alt="Google Meet" width={16} height={16} className="h-4 w-4" />
        </a>
      ) : null}
      {noteProcess ? (
        <span
          className="inline-flex items-center rounded-lg px-2.5 py-1.5 text-xs font-medium flex-shrink-0 border border-gray-700 bg-black/60 text-gray-200"
          title={noteProcess}
        >
          {noteProcess}
        </span>
      ) : null}
    </div>
  );

  const classLinksHeader = (
    <div className="mb-3">
      <div className="hidden md:grid md:grid-cols-2 md:items-center">
        <div className="justify-self-start flex items-center gap-2">
          {links?.zalo ? (
            <a
              href={links.zalo}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs border border-gray-700 bg-black/60 text-gray-300 hover:text-white hover:border-gray-500"
            >
              <Image src="/assets/images/zalo.png" alt="Zalo" width={16} height={16} className="h-4 w-4" />
              <span>Zalo</span>
            </a>
          ) : null}
          {links?.meet ? (
            <a
              href={links.meet}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs border border-gray-700 bg-black/60 text-gray-300 hover:text-white hover:border-gray-500"
            >
              <Image src="/assets/images/meet.png" alt="Google Meet" width={16} height={16} className="h-4 w-4" />
              <span>Meet</span>
            </a>
          ) : null}
        </div>
        <div className="justify-self-end">
          {noteProcess ? (
            <span
              className="inline-flex max-w-[320px] items-center rounded-lg px-2.5 py-1.5 text-xs font-medium overflow-x-auto whitespace-nowrap [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden border border-gray-700 bg-black/60 text-gray-200"
              title={noteProcess}
            >
              {noteProcess}
            </span>
          ) : <span />}
        </div>
      </div>
    </div>
  );

  if (filteredStories.length === 0 || !currentStory) {
    return (
      <div className="text-center py-12 text-gray-500">
        {classLinksHeader}
        <div>Bạn chưa có story nào trong 7 ngày qua</div>
        <div className="mt-4 md:hidden">{classLinksRow}</div>
      </div>
    );
  }

  const profileStory = profileModalUserId
    ? allStoriesOrdered.find((s) => s.userId === profileModalUserId)
    : null;

  return (
    <>
      {classLinksHeader}
      {reactionFly && (
        <ReactionFlyUp
          key={reactionFly.key}
          icon={reactionFly.icon}
          x={reactionFly.x}
          y={reactionFly.y}
          onComplete={() => setReactionFly(null)}
        />
      )}
      <div
        ref={containerRef}
        className="relative rounded-2xl overflow-hidden bg-black h-[75vh] sm:h-[80vh] max-h-[90vh] flex touch-none min-h-0"
        onClick={handleTap}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={() => {
          isDragging.current = false;
          setDragOffset({ x: 0, y: 0 });
        }}
      >
        {/* Viewport: stack trượt dọc - đẩy hẳn component lên xuống */}
        <div
          className="absolute left-0 right-0 top-0 flex flex-col will-change-transform [backface-visibility:hidden]"
          style={{
            height: allUsersDisplay.length * slideHeight,
            transform: `translate3d(0, ${dragOffset.y !== 0 || isJumpingFromClone ? -currentUserIndex * slideHeight + dragOffset.y : Math.round(-currentUserIndex * slideHeight)}px, 0)`,
            transition: dragOffset.y !== 0 || isJumpingFromClone ? "none" : `transform ${TRANSITION_MS}ms cubic-bezier(0.25, 0.46, 0.45, 0.94)`,
          }}
        >
          {allUsersDisplay.map((group, groupIdx) => {
            const curSubIdx = currentStoryIndexes[group.userId] || 0;
            const isGroupActive = groupIdx === currentUserIndex;
            return (
              <div key={`${group.userId}-${groupIdx}`} className="flex-shrink-0 w-full relative flex overflow-hidden" style={{ height: slideHeight, minHeight: slideHeight }}>
                {/* Horizontal Slider container for inner stories */}
                <div
                  className="absolute left-0 right-0 top-0 bottom-0 flex will-change-transform [backface-visibility:hidden]"
                  style={{
                    width: `${group.userStories.length * 100}%`,
                    transform: `translate3d(calc(${-curSubIdx * (100 / group.userStories.length)}% + ${isGroupActive ? dragOffset.x : 0}px), 0, 0)`,
                    transition: isGroupActive && dragOffset.x !== 0 ? "none" : `transform ${TRANSITION_MS}ms cubic-bezier(0.25, 0.46, 0.45, 0.94)`,
                  }}
                >
                  {group.userStories.map((story, innerIdx) => {
                    const isActiveSlide = isGroupActive && innerIdx === curSubIdx;
                    return (
                      <div
                        key={story.id}
                        className={`relative w-full h-full flex flex-col flex-shrink-0 ${isActiveSlide ? "pointer-events-auto" : "pointer-events-none"}`}
                        style={{ width: `${100 / group.userStories.length}%` }}
                      >
                        {/* Progress bar */}
                          {(() => {
                          if (group.userStories.length <= 1) return null;
                          const isActiveSlide = isGroupActive && innerIdx === curSubIdx;
                          return (
                            <div className="absolute top-0 left-0 right-0 h-1 bg-white/20 z-20 flex gap-0.5 px-1 pt-0.5">
                              {group.userStories.map((s, i) => {
                                const isPast = i < curSubIdx;
                                const isCurrent = i === curSubIdx && isActiveSlide;
                                return (
                                  <div key={s.id} className="flex-1 h-full bg-white/40 rounded-full overflow-hidden">
                                    <div
                                      className="h-full bg-white rounded-full transition-[width] duration-75 ease-linear"
                                      style={{ width: isPast ? "100%" : isCurrent ? `${progress}%` : "0%" }}
                                    />
                                  </div>
                                );
                              })}
                            </div>
                          );
                        })()}

                        {story.avatarUrl ? (
                          <Image
                            src={story.avatarUrl}
                            alt={story.studentName}
                            fill
                            sizes="(max-width: 1024px) 100vw, 960px"
                            className="object-cover opacity-20"
                          />
                        ) : (
                          <div className="absolute inset-0 bg-slate-100 flex items-center justify-center">
                            <span className="text-7xl sm:text-8xl font-black text-slate-400/70">
                              {getSurnameInitial(story.studentName)}
                            </span>
                          </div>
                        )}
                        <div className="absolute inset-0 bg-black/10" />

                        {/* Avatar + Reactions (mỗi slide) */}
                        <div
                          data-no-navigate
                          className="absolute right-3 sm:right-4 bottom-24 sm:bottom-28 z-40 flex flex-col items-center gap-3"
                        >
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              router.push(profilePathForUserId(story.userId, currentUserId));
                            }}
                            className="relative flex-shrink-0 cursor-pointer"
                            aria-label="Xem profile"
                          >
                            <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-full border-2 border-white/80 overflow-hidden bg-slate-700 ring-2 ring-white/20">
                              {story.avatarUrl ? (
                                <Image
                                  src={story.avatarUrl}
                                  alt={story.studentName}
                                  width={64}
                                  height={64}
                                  sizes="(max-width: 640px) 56px, 64px"
                                  className="w-full h-full object-cover"
                                />
                              ) : (
                                <div className="w-full h-full flex items-center justify-center text-white text-xl font-bold">
                                  {getSurnameInitial(story.studentName)}
                                </div>
                              )}
                            </div>
                            {isOnline(story.userId) && (
                              <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-green-500 border-2 border-black rounded-full" />
                            )}
                          </button>

                          {currentUserId && isGroupActive && innerIdx === curSubIdx && (
                            <div className="flex flex-col gap-2">
                              {REACTION_TYPES.map((r) => {
                                const ur = story.userReactionsMap?.[currentUserId];
                                const isActive = ur === r.type;
                                const count = story.reactionCounts?.[r.type as keyof typeof story.reactionCounts] ?? 0;
                                return (
                                  <button
                                    key={r.type}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleReaction(r.type, { clientX: e.clientX, clientY: e.clientY });
                                    }}
                                    className={`flex flex-col items-center gap-0.5 group cursor-pointer`}
                                    title={r.label}
                                  >
                                    <span
                                      className={`text-2xl sm:text-3xl drop-shadow-lg transition-transform active:scale-95 sm:active:scale-90 ${isActive ? "scale-110" : "sm:group-hover:scale-110"
                                        }`}
                                    >
                                      {r.icon}
                                    </span>
                                    <span className="text-[10px] text-white/90 font-medium min-w-[1ch]">{count}</span>
                                  </button>
                                );
                              })}
                            </div>
                          )}
                        </div>

                        {/* Center: Kết quả */}
                        <div className="flex-1 flex items-start justify-center md:justify-start px-4 md:px-6 pt-[20%] md:pt-[10%] pb-6 pr-24 sm:pr-28 md:pr-36 z-10">
                          <div
                            className="rounded-xl bg-white text-black p-4 sm:p-5 w-full max-w-sm border-2 border-black"
                            style={{ boxShadow: "-3px -3px 0 #31d2dd, 3px 3px 0 #df2d51" }}
                          >
                            <div className="relative mb-1 grid grid-cols-2 gap-3 items-start">
                              <div>
                                <p className="text-slate-500 text-[10px] sm:text-xs uppercase tracking-wider mb-1">Điểm / Total</p>
                                <p className="text-xl sm:text-3xl font-extrabold text-slate-900">
                                  {story.score}/{story.totalWords}
                                </p>
                              </div>
                              <div className="text-right">
                                <p className="text-slate-500 text-[10px] sm:text-xs uppercase tracking-wider mb-1">Tỉ lệ</p>
                                <p className={`text-xl sm:text-3xl font-extrabold ${getPerformanceColor(story.accuracy)}`}>
                                  {story.accuracy}%
                                </p>
                              </div>
                              <p
                                className={`absolute left-1/2 top-[60%] -translate-x-1/2 -translate-y-1/2 px-2 text-sm sm:text-base font-semibold text-center ${getPerformanceColor(
                                  story.accuracy
                                )}`}
                              >
                                {getPerformanceText(story.accuracy)}
                              </p>
                            </div>
                          </div>
                        </div>

                        {/* Bottom */}
                        <div className="absolute bottom-4 left-0 right-0 px-4 pr-24 sm:pr-32 z-10">
                          <div className="space-y-1.5">
                            <div className="flex items-end gap-2">
                              <p className="text-white font-semibold text-base sm:text-lg drop-shadow-lg">
                                {story.studentName}
                              </p>
                              
                            </div>
                            <p className="text-white/85 text-sm leading-snug line-clamp-2">
                              <span className="font-medium">
                                {story.bookName || `Sách ${story.bookId}`}
                              </span>
                              <span className="mx-1 text-white/50">-</span>
                              <span>
                                {story.lessonIds?.length
                                  ? story.lessonNames?.length
                                    ? story.lessonNames.join(", ")
                                    : `(${story.lessonIds.join(", ")})`
                                  : "Không có lesson"}
                              </span>
                            </p>
                            <p className="text-[11px] sm:text-xs text-white/60 leading-none">
                              {formatDayMonth(story.lastSaveStory || story.createdAt)}
                            </p>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )
          })}
        </div>

        {/* Mũi tên - overlay laptop */}
        {allStoriesOrdered.length >= 1 && (
          <div className="hidden md:flex absolute right-28 top-1/2 -translate-y-1/2 z-20 flex-col gap-3">
            <button
              onClick={(e) => {
                e.stopPropagation();
                if (currentUserIndex <= 0) return;
                setCurrentUserIndex((i) => i - 1);
              }}
              disabled={currentUserIndex <= 0}
              className="w-10 h-10 rounded-full bg-white/20 hover:bg-white/40 flex items-center justify-center transition-colors disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-white/20"
              aria-label="Story trước"
            >
              <FiChevronUp className="w-6 h-6 text-white" />
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                setCurrentUserIndex((i) => {
                  if (i >= userCount - 1) {
                    if (userCount > 1) return userCount;
                    onRefetch?.();
                    return i;
                  }
                  return i + 1;
                });
              }}
              className="w-10 h-10 rounded-full bg-white/20 hover:bg-white/40 flex items-center justify-center transition-colors"
              aria-label="Story sau"
            >
              <FiChevronDown className="w-6 h-6 text-white" />
            </button>
          </div>
        )}
      </div>
      <div className="mt-3 md:hidden">{classLinksRow}</div>

      {/* Profile modal */}
      <Modal
        open={!!profileModalUserId}
        onClose={() => setProfileModalUserId(null)}
        title={profileStory?.studentName || viewedProfile?.displayName || "Profile"}
        showHeader={true}
        maxWidth="md"
      >
        {profileStory && (
          <div className="py-2">
            <div className="flex flex-col sm:flex-row gap-6">
              <div className="flex flex-col items-center flex-shrink-0">
                <ProfileAvatarLink
                  userId={profileStory.userId}
                  className="w-24 h-24 rounded-full overflow-hidden bg-slate-200"
                  ariaLabel={`Hồ sơ ${profileStory.studentName}`}
                  onClick={() => setProfileModalUserId(null)}
                >
                  {(viewedProfile?.avatarUrl || profileStory.avatarUrl) ? (
                    <Image
                      src={viewedProfile?.avatarUrl || profileStory.avatarUrl || ""}
                      alt={profileStory.studentName}
                      width={96}
                      height={96}
                      sizes="96px"
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-slate-600 text-3xl font-bold">
                      {getSurnameInitial(viewedProfile?.displayName || profileStory.studentName)}
                    </div>
                  )}
                </ProfileAvatarLink>
                <p className="mt-2 text-lg font-semibold text-slate-800">
                  {viewedProfile?.displayName || profileStory.studentName}
                </p>
                {profileStory.userId === currentUserId && (
                  <Link
                    href="/profile"
                    onClick={() => setProfileModalUserId(null)}
                    className="mt-3 px-6 py-2 bg-primary text-white rounded-lg font-medium hover:opacity-90 transition text-sm"
                  >
                    Xem hồ sơ của tôi
                  </Link>
                )}
              </div>

              <div className="flex-1 space-y-4 min-w-0">
                {profileLoading ? (
                  <div className="flex items-center justify-center py-8 text-slate-400">
                    <span className="animate-pulse">Đang tải...</span>
                  </div>
                ) : viewedProfile ? (
                  <>
                    <div>
                      <p className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-1">Streak</p>
                      <div className="flex items-center gap-2">
                        <FaFire className="w-5 h-5 text-orange-500" />
                        <span className="font-semibold text-slate-800">
                          {viewedProfile.streakCount || 0} ngày liên tục
                        </span>
                      </div>
                    </div>

                    <div>
                      <p className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-1">Thành tích</p>
                      {viewedProfile.achievements ? (
                        <p className="text-sm text-slate-800 leading-relaxed whitespace-pre-wrap">
                          {viewedProfile.achievements}
                        </p>
                      ) : (
                        <p className="text-sm text-slate-400">Chưa có</p>
                      )}
                    </div>
                  </>
                ) : (
                  <p className="text-sm text-slate-500 py-4">Không thể tải thông tin hồ sơ</p>
                )}
              </div>
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}
