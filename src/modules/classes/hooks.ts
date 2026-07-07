"use client";

import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { IClassMember } from "@/types";
import {
  createCurrencyRequest,
  getClassDetails,
  getClassMembers,
  getClassProgressActivities,
  getLessonStudentProgress,
  getStudentClasses,
  getTeacherClasses,
  getAllClasses,
  updateClassLinks,
  getClassQuizResults,
  deleteQuizResults,
  deleteClassQuizResultsByBook,
  getClassActivityData,
  getGrammarTrackingData,
  getClassWatchTrackingData,
  type GetClassWatchTrackingOptions,
} from "./services";
import { getStudentQuizCountsByDate, syncLessonStatusForBook, getClassBookProgress } from "./api/quiz";
import { updateBookProgressWithQuizResult, getLessonWords } from "@/modules/flashcard/services";
import { QuizResult, LessonStatus, BookProgress } from "@/modules/flashcard/types";
import { getUserInfoFromLocalStorage } from "./api/presence";
import {
  isPresenceOnline,
  useGlobalPresenceMap,
  type PresenceMap,
} from "@/modules/presence";
import {
  sendAdmiration,
  subscribeToAdmirations,
  getTodayAdmirationsReceived,
  getAdmirationsReceivedFromTime,
  type IAdmiration,
} from "./api/admiration";
import toast from "react-hot-toast";
import { useAuth } from "@/lib/auth/context";
import type { IClass } from "../admin/type";
import { getTeacherPendingSpeakingEvaluations } from "./api/pending-speaking";

export const teacherClassKeys = {
  all: ["teacherClasses"] as const,
  lists: () => [...teacherClassKeys.all, "list"] as const,
  list: (teacherId: string) =>
    [...teacherClassKeys.lists(), { teacherId }] as const,
  details: () => [...teacherClassKeys.all, "detail"] as const,
  detail: (id: string) => [...teacherClassKeys.details(), id] as const,
  members: (classId: string) =>
    [...teacherClassKeys.detail(classId), "members"] as const,
  progress: (classId: string, bookId?: string, lessonId?: string) =>
    [
      ...teacherClassKeys.detail(classId),
      "progress",
      { bookId, lessonId },
    ] as const,
  studentClasses: (studentId?: string) =>
    [...teacherClassKeys.all, "student", { studentId }] as const,
};

export const pendingSpeakingKeys = {
  all: ["pendingSpeakingEvaluations"] as const,
  teacher: (teacherId: string) =>
    [...pendingSpeakingKeys.all, teacherId] as const,
};

export const useCreateCurrencyRequest = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createCurrencyRequest,
    onSuccess: () => {
      toast.success("YÃªu cáº§u Ä‘Ã£ Ä‘Æ°á»£c gá»­i thÃ nh cÃ´ng! Admin sáº½ xem xÃ©t vÃ  duyá»‡t yÃªu cáº§u.");
      // Invalidate all currency requests queries so admin can see new requests immediately
      queryClient.invalidateQueries({
        predicate: (query) => {
          const key = query.queryKey;
          return (
            Array.isArray(key) &&
            key.length >= 2 &&
            key[0] === "currency" &&
            key[1] === "requests"
          );
        },
      });
    },
    onError: (error: Error | unknown) => {
      console.error("Error creating currency request:", error);
      const errorMessage =
        error instanceof Error ? error.message : "Gá»­i yÃªu cáº§u tháº¥t báº¡i. Vui lÃ²ng thá»­ láº¡i.";
      toast.error(errorMessage);
    },
  });
};

export const useUpdateClassLinks = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: updateClassLinks,
    onSuccess: (_, { classId }) => {
      toast.success("Cáº­p nháº­t liÃªn káº¿t thÃ nh cÃ´ng!");
      queryClient.invalidateQueries({
        queryKey: teacherClassKeys.lists(),
      });
      queryClient.invalidateQueries({
        queryKey: teacherClassKeys.detail(classId),
      });
    },
    onError: (error) => {
      console.error("Error updating class links:", error);
      toast.error("Cáº­p nháº­t liÃªn káº¿t tháº¥t báº¡i.");
    },
  });
};

export const useTeacherClasses = (teacherId: string | undefined) => {
  return useQuery({
    queryKey: teacherClassKeys.list(teacherId!),
    queryFn: () => getTeacherClasses(teacherId!),
    enabled: !!teacherId,
    staleTime: 3 * 60 * 1000, // 3 phÃºt - shared data 5 tab student
    gcTime: 10 * 60 * 1000,
    refetchOnMount: false, // dÃ¹ng cache khi chuyá»ƒn tab
  });
};

/** Pending speaking â€” derived tá»« pendingEvaluations trÃªn class docs (Ä‘Ã£ fetch). */
export function useTeacherPendingSpeakingEvaluations(classes: IClass[] | undefined) {
  return useMemo(
    () => getTeacherPendingSpeakingEvaluations(classes),
    [classes]
  );
}

export const useStudentClasses = (studentId: string | undefined) => {
  return useQuery({
    queryKey: teacherClassKeys.studentClasses(studentId),
    queryFn: () => getStudentClasses(studentId!),
    enabled: !!studentId,
    staleTime: 3 * 60 * 1000, // 3 phÃºt - shared data 5 tab student
    gcTime: 10 * 60 * 1000,
    refetchOnMount: false, // dÃ¹ng cache khi chuyá»ƒn tab
  });
};

/** Giá»‘ng full tab Stories: toÃ n bá»™ lá»›p trong há»‡ thá»‘ng â€” inbox online / thÃ nh viÃªn. */
export const allClassesInboxKeys = {
  all: ["allClasses", "inbox"] as const,
};

export const useAllClassesForInbox = (enabled: boolean) => {
  return useQuery({
    queryKey: allClassesInboxKeys.all,
    queryFn: () => getAllClasses(),
    enabled,
    staleTime: 3 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    refetchOnMount: false,
  });
};

export const useClassDetails = (classId: string, teacherId: string, options?: { enabled?: boolean }) => {
  return useQuery({
    queryKey: teacherClassKeys.detail(classId),
    queryFn: () => getClassDetails(classId, teacherId),
    enabled: options?.enabled !== false && !!classId && !!teacherId,
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes - class details don't change frequently
    gcTime: 10 * 60 * 1000, // Keep in cache for 10 minutes
  });
};

export const useClassMembers = (classId: string, options?: { enabled?: boolean }) => {
  return useQuery({
    queryKey: teacherClassKeys.members(classId),
    queryFn: () => getClassMembers(classId),
    enabled: options?.enabled !== false && !!classId,
    staleTime: 10 * 60 * 1000, // Cache for 10 minutes - members don't change frequently (tá»‘i Æ°u: tÄƒng cache time)
    gcTime: 30 * 60 * 1000, // Keep in cache for 30 minutes (tá»‘i Æ°u: giá»¯ cache lÃ¢u hÆ¡n)
  });
};

/**
 * Hook to fetch all progress activities for a specific class.
 */
export const useClassProgress = (
  classId: string,
  bookId: string,
  lessonId: string
) => {
  const queryClient = useQueryClient();
  return useQuery({
    queryKey: ["classProgress", classId, bookId, lessonId],
    queryFn: () => {
      const cachedMembers = queryClient.getQueryData<IClassMember[]>(
        teacherClassKeys.members(classId)
      );
      // Reuse classBookProgress cache khi cÃ¹ng sÃ¡ch (tá»« Báº£ng Quiz) - trÃ¡nh fetch láº¡i
      const bookProgressQueryKey = ["classBookProgress", classId, bookId];
      const cachedBookProgress = queryClient.getQueryData<Map<string, BookProgress>>(
        bookProgressQueryKey
      );
      return getClassProgressActivities(
        classId,
        bookId,
        lessonId,
        cachedMembers,
        cachedBookProgress ?? undefined
      );
    },
    enabled: !!classId && !!bookId && !!lessonId,
    staleTime: 2 * 60 * 1000, // 2 phÃºt - dÃ¹ng chung cache vá»›i classBookProgress
  });
};

/**
 * Hook to fetch aggregated progress for all students in a class for a specific lesson.
 */
export const useLessonStudentProgress = (
  classId: string,
  bookId: string,
  lessonId: string
) => {
  const queryClient = useQueryClient();
  return useQuery({
    queryKey: teacherClassKeys.progress(classId, bookId, lessonId),
    queryFn: () => {
      // Try to get members from cache to avoid redundant query
      const cachedMembers = queryClient.getQueryData<IClassMember[]>(
        teacherClassKeys.members(classId)
      );
      return getLessonStudentProgress(classId, bookId, lessonId, cachedMembers);
    },
    enabled: !!classId && !!bookId && !!lessonId,
  });
};

/**
 * Hook to fetch quiz results for a class in a specific book
 * @param dateFilter - Optional date to filter results. If null/undefined, returns all results.
 */
export const useClassQuizResults = (
  classId: string,
  bookId: string,
  dateFilter?: Date | null
) => {
  const queryClient = useQueryClient();
  const dateKey = dateFilter
    ? dateFilter.toISOString().split("T")[0]
    : "all-time";
  return useQuery({
    queryKey: ["classQuizResults", classId, bookId, dateKey],
    queryFn: async () => {
      // Try to get members from cache to avoid redundant query
      const cachedMembers = queryClient.getQueryData<IClassMember[]>(
        teacherClassKeys.members(classId)
      );
      // Check if classBookProgress is being refetched or invalidated
      // If so, don't use cached data to ensure we get fresh data
      const bookProgressQueryKey = ["classBookProgress", classId, bookId];
      const bookProgressQueryState = queryClient.getQueryState(bookProgressQueryKey);
      const isBookProgressStale = bookProgressQueryState?.isInvalidated ||
        bookProgressQueryState?.dataUpdatedAt === undefined;

      // Only use cached bookProgress if it's not stale
      const cachedBookProgress = !isBookProgressStale
        ? queryClient.getQueryData<Map<string, BookProgress>>(bookProgressQueryKey)
        : undefined;

      return getClassQuizResults(classId, bookId, dateFilter, cachedMembers, cachedBookProgress);
    },
    enabled: !!classId && !!bookId,
  });
};

/**
 * Hook to delete quiz results
 */
export const useDeleteQuizResults = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: deleteQuizResults,
    onSuccess: async (_, quizResultIds) => {
      toast.success(`ÄÃ£ xÃ³a ${quizResultIds.length} bÃ i quiz thÃ nh cÃ´ng!`);

      // Remove cached classBookProgress to force fresh fetch
      // This ensures classQuizResults will get fresh data
      queryClient.removeQueries({
        queryKey: ["classBookProgress"],
      });

      // Remove cached classQuizResults to force fresh fetch
      queryClient.removeQueries({
        queryKey: ["classQuizResults"],
      });

      // Invalidate and refetch all related queries
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ["classBookProgress"],
          refetchType: 'active',
        }),
        queryClient.invalidateQueries({
          queryKey: ["classQuizResults"],
          refetchType: 'active',
        }),
        queryClient.invalidateQueries({
          predicate: (query) => {
            const key = query.queryKey;
            return (
              Array.isArray(key) &&
              (key[0] === "classProgress" ||
                key[0] === "completedLessons" ||
                key[0] === "lessonStatuses" ||
                (key.includes("progress") && key[0] !== "classBookProgress" && key[0] !== "classQuizResults"))
            );
          },
          refetchType: 'active',
        }),
      ]);
    },
    onError: (error) => {
      console.error("Error deleting quiz results:", error);
      toast.error("XÃ³a bÃ i quiz tháº¥t báº¡i. Vui lÃ²ng thá»­ láº¡i.");
    },
  });
};

/**
 * Hook to delete all quiz results for a class in a specific book
 */
export const useDeleteClassQuizResultsByBook = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ classId, bookId }: { classId: string; bookId: string }) =>
      deleteClassQuizResultsByBook(classId, bookId),
    onSuccess: (_, { classId, bookId }) => {
      toast.success("ÄÃ£ xÃ³a táº¥t cáº£ bÃ i quiz trong sÃ¡ch nÃ y thÃ nh cÃ´ng!");
      // Invalidate all related queries including lessonStatus and completedLessons
      queryClient.invalidateQueries({
        predicate: (query) => {
          const key = query.queryKey;
          return (
            Array.isArray(key) &&
            (key[0] === "classQuizResults" ||
              key[0] === "completedLessons" ||
              key[0] === "lessonStatuses" ||
              (key[0] === "classProgress" && key[2] === bookId) ||
              key.includes("progress"))
          );
        },
      });
      // Invalidate specific query
      queryClient.invalidateQueries({
        queryKey: ["classQuizResults", classId, bookId],
      });
    },
    onError: (error) => {
      console.error("Error deleting quiz results by book:", error);
      toast.error("XÃ³a bÃ i quiz tháº¥t báº¡i. Vui lÃ²ng thá»­ láº¡i.");
    },
  });
};

/**
 * Hook to sync lessonStatus with quiz results for a class and book
 * Useful for cleaning up data when lessonStatus.isCompleted = true but no quiz results exist
 */
export const useSyncLessonStatusForBook = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ classId, bookId }: { classId: string; bookId: string }) =>
      syncLessonStatusForBook(classId, bookId),
    onSuccess: (result, { bookId }) => {
      toast.success(
        `ÄÃ£ Ä‘á»“ng bá»™ ${result.updated} tráº¡ng thÃ¡i bÃ i há»c thÃ nh cÃ´ng!`
      );
      // Invalidate all related queries
      queryClient.invalidateQueries({
        predicate: (query) => {
          const key = query.queryKey;
          return (
            Array.isArray(key) &&
            (key[0] === "completedLessons" ||
              key[0] === "lessonStatuses" ||
              (key[0] === "classProgress" && key[2] === bookId) ||
              key.includes("progress"))
          );
        },
      });
    },
    onError: (error) => {
      console.error("Error syncing lesson status:", error);
      toast.error("Äá»“ng bá»™ tráº¡ng thÃ¡i bÃ i há»c tháº¥t báº¡i. Vui lÃ²ng thá»­ láº¡i.");
    },
  });
};

/**
 * Hook to get quiz result counts by date for students in a class
 * Returns a Map of studentId -> count of quiz results submitted on the specified date
 */
export const useStudentQuizCountsByDate = (
  classId: string,
  targetDate: Date
) => {
  return useQuery({
    queryKey: ["studentQuizCountsByDate", classId, targetDate.toISOString().split("T")[0]],
    queryFn: () => getStudentQuizCountsByDate(classId, targetDate),
    enabled: !!classId,
    staleTime: 1 * 60 * 1000, // 1 minute
  });
};

/**
 * Hook to get BookProgress for all students in a class for a specific book
 */
export const useClassBookProgress = (
  classId: string,
  bookId: string
) => {
  const queryClient = useQueryClient();
  return useQuery({
    queryKey: ["classBookProgress", classId, bookId],
    queryFn: () => {
      // Try to get members from cache to avoid redundant query
      const cachedMembers = queryClient.getQueryData<IClassMember[]>(
        teacherClassKeys.members(classId)
      );
      return getClassBookProgress(classId, bookId, cachedMembers);
    },
    enabled: !!classId && !!bookId,
    staleTime: 2 * 60 * 1000, // 2 minutes
  });
};

/**
 * Hook to fetch class activity data for the last 7 days
 */
export const useClassActivityData = (classId: string) => {
  const queryClient = useQueryClient();
  return useQuery({
    queryKey: ["classActivityData", classId],
    queryFn: () => {
      // Try to get members from cache to avoid redundant query
      const cachedMembers = queryClient.getQueryData<IClassMember[]>(
        teacherClassKeys.members(classId)
      );
      return getClassActivityData(classId, cachedMembers);
    },
    enabled: !!classId,
    staleTime: 2 * 60 * 1000, // 2 minutes
  });
};



/**
 * Hook to fetch grammar tracking data for students in a class for a specific date
 */
export const useGrammarTrackingData = (classId: string, date: Date = new Date()) => {
  const queryClient = useQueryClient();
  return useQuery({
    queryKey: ["grammarTrackingData", classId, date.toISOString().split("T")[0]],
    queryFn: () => {
      const cachedMembers = queryClient.getQueryData<IClassMember[]>(
        teacherClassKeys.members(classId)
      );
      return getGrammarTrackingData(classId, date, cachedMembers);
    },
    enabled: !!classId,
    staleTime: 1 * 60 * 1000,
    refetchInterval: 2 * 60 * 1000,
  });
};

/**
 * Lá»‹ch sá»­ xem tá»« watch_tracking â€” toÃ n thá»i gian hoáº·c lá»c theo ngÃ y / mediaType.
 */
export const useClassWatchTrackingData = (
  classId: string,
  options?: GetClassWatchTrackingOptions
) => {
  const queryClient = useQueryClient();
  const dateKey = options?.date
    ? options.date.toISOString().split("T")[0]
    : "all";
  const mediaKey = options?.mediaType ?? "all";

  return useQuery({
    queryKey: ["classWatchTracking", classId, dateKey, mediaKey],
    queryFn: () => {
      const cachedMembers = queryClient.getQueryData<IClassMember[]>(
        teacherClassKeys.members(classId)
      );
      return getClassWatchTrackingData(classId, options, cachedMembers);
    },
    enabled: !!classId,
    staleTime: 1 * 60 * 1000,
    refetchInterval: 2 * 60 * 1000,
  });
};

/**
 * Hook to mark lessons as done with 95% accuracy for a student
 * Improved: Uses batch processing to avoid Firestore transaction conflicts
 */
export const useMarkLessonsAsDone = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      userId,
      bookId,
      lessonIds,
      onProgress,
    }: {
      userId: string;
      bookId: string;
      lessonIds: number[];
      onProgress?: (processed: number, total: number) => void;
    }) => {
      // Get words for all lessons to calculate totalWords
      const allWords = await getLessonWords(bookId, lessonIds);

      // Group words by lesson
      const wordsByLesson = new Map<number, number>();
      lessonIds.forEach((lessonId) => {
        const words = allWords.filter((w) => w.lesson === lessonId);
        wordsByLesson.set(lessonId, words.length);
      });

      // Filter out lessons with no words
      const validLessonIds = lessonIds.filter((lessonId) => {
        const totalWords = wordsByLesson.get(lessonId) || 0;
        if (totalWords === 0) {
          console.warn(`No words found for lesson ${lessonId}, skipping`);
          return false;
        }
        return true;
      });

      if (validLessonIds.length === 0) {
        throw new Error("KhÃ´ng cÃ³ bÃ i nÃ o há»£p lá»‡ Ä‘á»ƒ Ä‘Ã¡nh dáº¥u");
      }

      // Batch processing: process 5 lessons at a time to avoid transaction conflicts
      const BATCH_SIZE = 5;
      const totalLessons = validLessonIds.length;
      let processedCount = 0;
      const failedLessons: number[] = [];
      const maxRetries = 2;

      // Process in batches
      for (let i = 0; i < validLessonIds.length; i += BATCH_SIZE) {
        const batch = validLessonIds.slice(i, i + BATCH_SIZE);

        // Process batch sequentially to avoid conflicts
        for (const lessonId of batch) {
          let retryCount = 0;
          let success = false;

          while (retryCount <= maxRetries && !success) {
            try {
              const totalWords = wordsByLesson.get(lessonId) || 0;
              const accuracy = 95;
              const score = Math.round(totalWords * 0.95);

              const resultData: Omit<QuizResult, "lastAttempt"> = {
                userId,
                bookId,
                lessonId,
                accuracy,
                score,
                totalWords,
              };

              const statusData: Omit<LessonStatus, "lastAttempt"> = {
                userId,
                bookId,
                lessonId,
                lastAccuracy: accuracy,
              };

              await updateBookProgressWithQuizResult(resultData, statusData);
              success = true;
              processedCount++;

              // Report progress
              if (onProgress) {
                onProgress(processedCount, totalLessons);
              }

              // Small delay between lessons to reduce load
              if (i + batch.indexOf(lessonId) < validLessonIds.length - 1) {
                await new Promise((resolve) => setTimeout(resolve, 100));
              }
            } catch (error) {
              retryCount++;
              if (retryCount > maxRetries) {
                console.error(`Failed to mark lesson ${lessonId} after ${maxRetries} retries:`, error);
                failedLessons.push(lessonId);
                processedCount++;
                if (onProgress) {
                  onProgress(processedCount, totalLessons);
                }
              } else {
                // Exponential backoff for retries
                await new Promise((resolve) => setTimeout(resolve, 200 * retryCount));
              }
            }
          }
        }

        // Small delay between batches
        if (i + BATCH_SIZE < validLessonIds.length) {
          await new Promise((resolve) => setTimeout(resolve, 200));
        }
      }

      if (failedLessons.length > 0) {
        throw new Error(
          `ÄÃ£ Ä‘Ã¡nh dáº¥u ${totalLessons - failedLessons.length}/${totalLessons} bÃ i. ` +
          `Tháº¥t báº¡i: ${failedLessons.join(", ")}`
        );
      }

      return {
        count: totalLessons,
        failed: failedLessons.length,
      };
    },
    onSuccess: (result) => {
      if (result.failed > 0) {
        toast.error(
          `ÄÃ£ Ä‘Ã¡nh dáº¥u ${result.count - result.failed}/${result.count} bÃ i. ` +
          `CÃ³ ${result.failed} bÃ i tháº¥t báº¡i.`
        );
      } else {
        toast.success(`ÄÃ£ Ä‘Ã¡nh dáº¥u ${result.count} bÃ i lÃ  Ä‘Ã£ lÃ m vá»›i 95%!`);
      }
      // Invalidate all related queries
      queryClient.invalidateQueries({
        predicate: (query) => {
          const key = query.queryKey;
          return (
            Array.isArray(key) &&
            (key[0] === "classBookProgress" ||
              key[0] === "classQuizResults" ||
              key[0] === "completedLessons" ||
              key[0] === "lessonStatuses" ||
              key.includes("progress"))
          );
        },
      });
    },
    onError: (error) => {
      console.error("Error marking lessons as done:", error);
      const errorMessage = error instanceof Error ? error.message : "ÄÃ¡nh dáº¥u bÃ i tháº¥t báº¡i. Vui lÃ²ng thá»­ láº¡i.";
      toast.error(errorMessage);
    },
  });
};

/**
 * Hook tráº£ vá» tráº¡ng thÃ¡i online cho danh sÃ¡ch há»c sinh.
 * Online láº¥y tá»« global presence (RTDB) â€” `studentIds`/`classId` chá»‰ giá»¯ cho
 * tÆ°Æ¡ng thÃ­ch chá»¯ kÃ½ cÅ©.
 */
export const useStudentPresence = (
  studentIds: string[],
  classId: string
) => {
  void studentIds;
  void classId;
  const presenceMap = useGlobalPresenceMap();

  const isOnline = useCallback(
    (studentId: string): boolean => isPresenceOnline(presenceMap[studentId]),
    [presenceMap]
  );

  return { presenceMap, isOnline };
};

/**
 * Hook tráº£ vá» presence cho thÃ nh viÃªn lá»›p (students + teachers).
 * Äá»c tá»« global presence map (RTDB `/presence`).
 */
export const useClassMemberPresence = (
  classId: string,
  options?: { enabled?: boolean }
): { presenceMap: PresenceMap; isOnline: (memberId: string) => boolean } => {
  void classId;
  const fullMap = useGlobalPresenceMap();
  const enabled = options?.enabled ?? true;

  const presenceMap = enabled ? fullMap : EMPTY_PRESENCE_MAP;

  const isOnline = useCallback(
    (memberId: string): boolean =>
      enabled ? isPresenceOnline(presenceMap[memberId]) : false,
    [presenceMap, enabled]
  );

  return { presenceMap, isOnline };
};

const EMPTY_PRESENCE_MAP: PresenceMap = {};

/**
 * Hook to send admiration to another student
 */
export const useSendAdmiration = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: sendAdmiration,
    onSuccess: (_, variables) => {
      const reactionIcon = getReactionIcon(variables.reactionType);
      toast.success(`ÄÃ£ gá»­i ${reactionIcon} tá»›i ${variables.toStudentName}`);
      // Invalidate currency balance for recipient
      queryClient.invalidateQueries({
        queryKey: ["currency", "balance", variables.toStudentId],
      });
    },
    onError: (error: Error | unknown) => {
      console.error("Error sending admiration:", error);
      const errorMessage =
        error instanceof Error
          ? error.message
          : "Gá»­i ngÆ°á»¡ng má»™ tháº¥t báº¡i. Vui lÃ²ng thá»­ láº¡i.";
      toast.error(errorMessage);
    },
  });
};

/**
 * Helper function to get reaction icon (exported for use in AdmirationParticleEffect)
 */
export function getReactionIcon(reactionType?: string): string {
  const icons: Record<string, string> = {
    dislike: "ðŸ‘Ž",
    haha: "ðŸ˜‚",
    like: "ðŸ‘",
    heart: "â¤ï¸",
    wow: "ðŸ˜±",
  };
  return icons[reactionType || ""] || "â¤ï¸";
}

const RECORDING_FLAG_KEY = "__breadtransRecordingActive";

function isRecordingActiveNow(): boolean {
  if (typeof window === "undefined") return false;
  const win = window as Window & { [RECORDING_FLAG_KEY]?: boolean };
  return Boolean(win[RECORDING_FLAG_KEY]);
}

function isAnyAudioPlayingNow(): boolean {
  if (typeof document === "undefined") return false;
  const audioElements = document.querySelectorAll("audio");
  for (const audio of audioElements) {
    if (!audio.paused && !audio.ended) {
      return true;
    }
  }
  return false;
}

function isMediaInteractionActiveNow(): boolean {
  return isRecordingActiveNow() || isAnyAudioPlayingNow();
}

/**
 * Hook to subscribe to admirations received by a student
 * Returns the latest admiration for notification
 */
export const useAdmirationNotifications = (studentId: string | undefined) => {
  const [latestAdmiration, setLatestAdmiration] = useState<IAdmiration | null>(null);
  const previousAdmirationIdsRef = useRef<Set<string>>(new Set());
  const { refetchProfile } = useAuth();

  useEffect(() => {
    if (!studentId) {
      setLatestAdmiration(null);
      return;
    }

    const pendingTimeouts: ReturnType<typeof setTimeout>[] = [];
    let isInitialLoad = true;

    const unsubscribe = subscribeToAdmirations(studentId, (admirations) => {
      if (isInitialLoad) {
        isInitialLoad = false;
        // Store initial admiration IDs
        previousAdmirationIdsRef.current = new Set(
          admirations.map((a) => a.id)
        );
        return;
      }

      // Find new admirations (not in previous set)
      const newAdmirations = admirations.filter(
        (a) => !previousAdmirationIdsRef.current.has(a.id)
      );

      if (newAdmirations.length > 0) {
        // Get the most recent one
        const latest = newAdmirations[0];

        // Always show admiration icon effect, including speaking screens.
        setLatestAdmiration(latest);

        const reactionIcon = getReactionIcon(latest.reactionType);
        const isSpeakingGrade = latest.type === "speakingGrade";
        const message = isSpeakingGrade
          ? `${latest.fromStudentName} cháº¥m bÃ i nÃ³i ${reactionIcon}`
          : `${latest.fromStudentName} ${reactionIcon} báº¡n`;

        const sound = new Audio("/sounds/it-xu.mp3");
        sound.play().catch(() => {});
        sound.addEventListener("ended", () => sound.remove());
        sound.addEventListener("error", () => sound.remove());

        // Get avatar from localStorage for toast
        const userInfo = getUserInfoFromLocalStorage(latest.fromStudentId);
        const senderAvatarUrl = userInfo?.avatarUrl || "";
        const senderDisplayName = userInfo?.name || latest.fromStudentName;
        const senderInitial = senderDisplayName.charAt(0).toUpperCase();

        // Create custom icon with avatar using React.createElement
        const customIcon = senderAvatarUrl ? (
          React.createElement(
            "div",
            { className: "relative h-8 w-8 rounded-full overflow-hidden ring-1 ring-white shadow-sm" },
            React.createElement("img", {
              src: senderAvatarUrl,
              alt: senderDisplayName,
              className: "w-full h-full object-cover",
            })
          )
        ) : (
          React.createElement(
            "div",
            { className: "h-8 w-8 rounded-full flex items-center justify-center text-xs font-bold ring-1 ring-white shadow-sm bg-gradient-to-br from-gray-100 to-gray-200 text-gray-700" },
            senderInitial
          )
        );

        toast.success(message, {
          icon: customIcon,
          duration: 5000,
        });

        pendingTimeouts.push(
          setTimeout(() => {
            setLatestAdmiration(null);
          }, 5000)
        );
      }

      // Update previous IDs
      previousAdmirationIdsRef.current = new Set(
        admirations.map((a) => a.id)
      );
    });

    return () => {
      pendingTimeouts.forEach(clearTimeout);
      unsubscribe();
    };
  }, [studentId, refetchProfile]);

  return latestAdmiration;
};

/**
 * Hook to get today's admirations received by a student
 * Only queries when enabled (e.g., when modal is open)
 * Uses localStorage to cache and only query new admirations
 */
/**
 * Get date key in YYYY-MM-DD format (Vietnam timezone)
 */
function getDateKey(date: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

/**
 * Get date keys for last 7 days
 */
function getLast7DaysKeys(): string[] {
  const keys: string[] = [];
  for (let i = 0; i < 7; i++) {
    const date = new Date();
    date.setDate(date.getDate() - i);
    keys.push(getDateKey(date));
  }
  return keys;
}

/**
 * Cleanup localStorage: remove data older than 7 days (FIFO)
 */
function cleanupOldNotifications(studentId: string) {
  if (typeof window === "undefined") return;

  try {
    const last7DaysKeys = getLast7DaysKeys();
    const prefix = `admirationNotifications_${studentId}_`;

    // Remove all keys that are not in the last 7 days
    const keysToRemove: string[] = [];
    for (let i = 0; i < window.localStorage.length; i++) {
      const key = window.localStorage.key(i);
      if (key && key.startsWith(prefix)) {
        const dateKey = key.replace(prefix, "");
        if (!last7DaysKeys.includes(dateKey)) {
          keysToRemove.push(key);
        }
      }
    }

    keysToRemove.forEach((key) => {
      window.localStorage.removeItem(key);
    });
  } catch (error) {
    console.error("Error cleaning up old notifications:", error);
  }
}

/**
 * Load all notifications from last 7 days from localStorage
 */
function loadLast7DaysNotifications(studentId: string): {
  admirations: IAdmiration[];
  lastCreatedAt: Date | null;
} {
  if (typeof window === "undefined") {
    return { admirations: [], lastCreatedAt: null };
  }

  try {
    const last7DaysKeys = getLast7DaysKeys();
    const prefix = `admirationNotifications_${studentId}_`;
    const allAdmirations: IAdmiration[] = [];
    let latestCreatedAt: Date | null = null;

    // Load from all 7 days
    for (const dateKey of last7DaysKeys) {
      const storageKey = `${prefix}${dateKey}`;
      const stored = window.localStorage.getItem(storageKey);

      if (stored) {
        try {
          const parsed = JSON.parse(stored) as {
            admirations: IAdmiration[];
            lastCreatedAt?: string;
            // backward compat
            lastSavedTime?: string;
          };

          const admirations = parsed.admirations.map((a) => ({
            ...a,
            createdAt: new Date(a.createdAt),
          }));

          allAdmirations.push(...admirations);

          const cursorISO =
            parsed.lastCreatedAt ??
            parsed.lastSavedTime ??
            (admirations[0]?.createdAt ? admirations[0].createdAt.toISOString() : undefined);
          if (cursorISO) {
            const t = new Date(cursorISO);
            if (!latestCreatedAt || t > latestCreatedAt) {
              latestCreatedAt = t;
            }
          }
        } catch (error) {
          console.error(`Error parsing stored data for ${dateKey}:`, error);
        }
      }
    }

    // Remove duplicates by id and sort by createdAt desc
    const unique = allAdmirations.filter(
      (admiration, index, self) =>
        index === self.findIndex((a) => a.id === admiration.id)
    );
    unique.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

    return {
      admirations: unique,
      lastCreatedAt: latestCreatedAt ?? unique[0]?.createdAt ?? null,
    };
  } catch (error) {
    console.error("Error loading last 7 days notifications:", error);
    return { admirations: [], lastCreatedAt: null };
  }
}

export const useTodayAdmirationsReceived = (
  studentId: string | undefined,
  enabled: boolean = false
) => {
  const [cachedAdmirations, setCachedAdmirations] = useState<IAdmiration[]>([]);
  const [, setLastCreatedAt] = useState<Date | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);

  // Load from localStorage on mount or when studentId changes
  useEffect(() => {
    if (!studentId || typeof window === "undefined") {
      setCachedAdmirations([]);
      setLastCreatedAt(null);
      setIsInitialized(true);
      return;
    }

    // Cleanup old data first
    cleanupOldNotifications(studentId);

    // Load all notifications from last 7 days
    const { admirations, lastCreatedAt: savedCreatedAt } =
      loadLast7DaysNotifications(studentId);

    setCachedAdmirations(admirations);
    setLastCreatedAt(savedCreatedAt);
    setIsInitialized(true);
  }, [studentId]);

  const queryResult = useQuery({
    queryKey: ["todayAdmirationsReceived", studentId],
    queryFn: async () => {
      if (!studentId || typeof window === "undefined") return [];

      // Read lastSavedTime directly from localStorage (from last 7 days)
      const { admirations: savedAdmirations, lastCreatedAt: savedCreatedAt } =
        loadLast7DaysNotifications(studentId);

      // If we have cached data with lastSavedTime, only query new ones
      if (savedCreatedAt && savedAdmirations.length > 0) {
        // Query incrementally across days (not limited to "today only")
        const newAdmirations = await getAdmirationsReceivedFromTime(
          studentId,
          savedCreatedAt
        );

        // If no new admirations, return cached
        if (newAdmirations.length === 0) {
          return savedAdmirations;
        }

        // Merge with cached (new ones first, then cached)
        const merged = [...newAdmirations, ...savedAdmirations];

        // Remove duplicates by id
        const unique = merged.filter(
          (admiration, index, self) =>
            index === self.findIndex((a) => a.id === admiration.id)
        );

        // Sort by createdAt desc
        unique.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

        return unique;
      } else {
        // First time: query all today's admirations
        return await getTodayAdmirationsReceived(studentId);
      }
    },
    enabled: enabled && !!studentId && isInitialized,
    staleTime: 30 * 1000, // 30 seconds
    // Use cached data as initial data to avoid flicker
    initialData: cachedAdmirations.length > 0 ? cachedAdmirations : undefined,
  });

  // Save to localStorage when data changes (only if different from cache)
  useEffect(() => {
    if (!studentId || !queryResult.data || typeof window === "undefined") {
      return;
    }

    // Don't save if it's the same as cache (avoid unnecessary writes)
    if (queryResult.data.length === cachedAdmirations.length &&
      queryResult.data.every((a, i) => a.id === cachedAdmirations[i]?.id)) {
      return;
    }

    try {
      // Cleanup old data first (FIFO: remove older than 7 days)
      cleanupOldNotifications(studentId);

      // Group admirations by date
      const admirationsByDate = new Map<string, IAdmiration[]>();

      queryResult.data.forEach((admiration) => {
        const dateKey = getDateKey(admiration.createdAt);
        if (!admirationsByDate.has(dateKey)) {
          admirationsByDate.set(dateKey, []);
        }
        admirationsByDate.get(dateKey)!.push(admiration);
      });

      // Save each day's data separately
      const newestCreatedAt = queryResult.data[0]?.createdAt ?? new Date();
      const last7DaysKeys = getLast7DaysKeys();

      for (const dateKey of last7DaysKeys) {
        const admirations = admirationsByDate.get(dateKey) || [];
        if (admirations.length > 0) {
          const storageKey = `admirationNotifications_${studentId}_${dateKey}`;
          window.localStorage.setItem(
            storageKey,
            JSON.stringify({
              admirations: admirations,
              lastCreatedAt: newestCreatedAt.toISOString(),
            })
          );
        }
      }

      // Update cache state
      setCachedAdmirations(queryResult.data);
      setLastCreatedAt(newestCreatedAt);
    } catch (error) {
      console.error("Error saving cached admirations:", error);
    }
  }, [queryResult.data, studentId, cachedAdmirations]);

  // Always return cached data first to avoid flicker, then update with query result
  return {
    ...queryResult,
    data: queryResult.data || cachedAdmirations,
    isLoading: queryResult.isLoading && !isInitialized,
  };
};
