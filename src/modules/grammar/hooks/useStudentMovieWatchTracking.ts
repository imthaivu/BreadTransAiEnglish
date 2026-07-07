"use client";

import { getStudentWatchTrackingViews } from "@/modules/classes/services";
import { useQuery } from "@tanstack/react-query";

export const studentMovieWatchTrackingKey = (userId: string) =>
  ["studentWatchTracking", userId, "movie"] as const;

export function useStudentMovieWatchTracking(userId: string | undefined) {
  return useQuery({
    queryKey: studentMovieWatchTrackingKey(userId ?? ""),
    queryFn: () => getStudentWatchTrackingViews(userId!, { mediaType: "movie" }),
    enabled: !!userId,
    staleTime: 30 * 1000,
  });
}
