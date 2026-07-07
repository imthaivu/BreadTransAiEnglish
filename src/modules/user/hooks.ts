import { useMutation, useQuery } from "@tanstack/react-query";
import { updateStudentStreak, getPublicUserProfile } from "./services";

export const usePublicUserProfile = (userId: string | null) => {
  return useQuery({
    queryKey: ["publicUserProfile", userId],
    queryFn: () => getPublicUserProfile(userId!),
    enabled: !!userId,
    staleTime: 2 * 60 * 1000,
  });
};

export const useUpdateStudentStreak = () => {
  return useMutation({
    mutationFn: updateStudentStreak,
    onError: (error) => {
      console.error("Failed to update streak:", error);
      // We don't show a toast here to avoid bothering the user
      // with a non-critical background task failure.
    },
  });
};
