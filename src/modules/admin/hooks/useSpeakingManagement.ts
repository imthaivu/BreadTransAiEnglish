import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import {
  getTotalSpeakingSubmissions,
  deleteSpeakingAudioFile,
  getAllSpeakingSubmissionsWithFiles,
  deleteAllSpeakingAudioFiles,
} from "../services/speaking.service";

// Query keys
export const speakingKeys = {
  all: ["speaking"] as const,
  total: () => [...speakingKeys.all, "total"] as const,
  allWithFiles: () => [...speakingKeys.all, "allWithFiles"] as const,
};

/**
 * Hook to get total count of speaking submissions with audio files
 */
export const useTotalSpeakingSubmissions = (enabled: boolean = true) => {
  return useQuery({
    queryKey: speakingKeys.total(),
    queryFn: getTotalSpeakingSubmissions,
    staleTime: 5 * 60 * 1000, // 5 minutes - standardized
    gcTime: 10 * 60 * 1000, // 10 minutes
    enabled,
  });
};

/**
 * Hook to get all speaking submissions with files
 */
export const useAllSpeakingSubmissionsWithFiles = () => {
  return useQuery({
    queryKey: speakingKeys.allWithFiles(),
    queryFn: getAllSpeakingSubmissionsWithFiles,
    staleTime: 5 * 60 * 1000, // 5 minutes - standardized
    gcTime: 10 * 60 * 1000, // 10 minutes
  });
};

/**
 * Hook to delete a speaking audio file (keeps the document)
 */
export const useDeleteSpeakingAudio = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ submissionId, fileURL }: { submissionId: string; fileURL: string }) =>
      deleteSpeakingAudioFile(submissionId, fileURL),
    onSuccess: () => {
      // Invalidate queries to refresh counts
      queryClient.invalidateQueries({ 
        queryKey: speakingKeys.total(),
        exact: true,
      });
      queryClient.invalidateQueries({ 
        queryKey: speakingKeys.allWithFiles(),
        exact: true,
      });
      queryClient.invalidateQueries({ 
        queryKey: ["dashboard"],
        exact: false, // Invalidate all dashboard queries
      });
      toast.success("Đã xóa file audio thành công!");
    },
    onError: (error: Error | unknown) => {
      console.error("Error deleting speaking audio:", error);
      const errorMessage =
        error instanceof Error
          ? error.message
          : "Xóa file audio thất bại. Vui lòng thử lại.";
      toast.error(errorMessage);
    },
  });
};

/**
 * Hook to delete all speaking audio files (keeps the documents)
 */
export const useDeleteAllSpeakingAudio = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: deleteAllSpeakingAudioFiles,
    onSuccess: (deletedCount) => {
      // Invalidate queries to refresh counts
      queryClient.invalidateQueries({ 
        queryKey: speakingKeys.total(),
        exact: true,
      });
      queryClient.invalidateQueries({ 
        queryKey: speakingKeys.allWithFiles(),
        exact: true,
      });
      queryClient.invalidateQueries({ 
        queryKey: ["dashboard"],
        exact: false, // Invalidate all dashboard queries
      });
      toast.success(`Đã xóa ${deletedCount} file audio thành công!`);
    },
    onError: (error: Error | unknown) => {
      console.error("Error deleting all speaking audio files:", error);
      const errorMessage =
        error instanceof Error
          ? error.message
          : "Xóa file audio thất bại. Vui lòng thử lại.";
      toast.error(errorMessage);
    },
  });
};

