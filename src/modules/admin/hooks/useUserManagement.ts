import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  getUsers,
  getUserById,
  createUser,
  updateUser,
  deleteUser,
  mergeUserData,
  getMergePreview,
  CreateUserData,
  UpdateUserData,
  MergeUserDataResult,
} from "../services/user.service";
import { UserRole } from "@/lib/auth/types";
import toast from "react-hot-toast";

// Query keys
export const userKeys = {
  all: ["users"] as const,
  lists: (options?: {
    page?: number;
    limit?: number;
    role?: UserRole;
    searchKeyword?: string;
    classId?: string;
  }) => [...userKeys.all, "list", options] as const,
  detail: (id: string) => [...userKeys.all, "detail", id] as const,
};

// Get all users with pagination and search
export const useUsers = (options?: {
  page?: number;
  limit?: number;
  role?: UserRole;
  searchKeyword?: string;
  classId?: string;
  enabled?: boolean;
}) => {
  return useQuery({
    queryKey: userKeys.lists(options),
    queryFn: () => getUsers(options),
    enabled: options?.enabled !== false, // Default to true, but can be disabled
    staleTime: 5 * 60 * 1000, // 5 minutes - data is fresh for 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes - keep in cache for 10 minutes after unused
  });
};

// Get user by ID
export const useUser = (userId: string) => {
  return useQuery({
    queryKey: userKeys.detail(userId),
    queryFn: () => getUserById(userId),
    enabled: !!userId,
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
  });
};

// Create user mutation
export const useCreateUser = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: createUser,
    onSuccess: (newUser) => {
      // Invalidate all user queries to ensure filtered/paginated lists refetch correctly
      queryClient.invalidateQueries({
        queryKey: userKeys.all,
        exact: false,
      });

      // Add the new user to the cache
      queryClient.setQueryData(userKeys.detail(newUser.id), newUser);

      toast.success("Tạo người dùng thành công!");
    },
    onError: (error) => {
      console.error("Error creating user:", error);
      toast.error("Tạo người dùng thất bại!");
    },
  });
};

// Update user mutation
export const useUpdateUser = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      userId,
      userData,
    }: {
      userId: string;
      userData: UpdateUserData;
    }) => updateUser(userId, userData),
    onSuccess: (_, { userId }) => {
      // Invalidate specific user detail to refetch updated data
      queryClient.invalidateQueries({ 
        queryKey: userKeys.detail(userId),
        exact: true,
      });

      // Invalidate all user queries so every list variant is refreshed
      queryClient.invalidateQueries({ 
        queryKey: userKeys.all,
        exact: false,
      });

      toast.success("Cập nhật người dùng thành công!");
    },
    onError: (error) => {
      console.error("Error updating user:", error);
      toast.error("Cập nhật người dùng thất bại!");
    },
  });
};

// Delete user mutation
export const useDeleteUser = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: deleteUser,
    onSuccess: (_, userId) => {
      // Remove user from cache immediately
      queryClient.removeQueries({ queryKey: userKeys.detail(userId) });

      // Invalidate all user queries so every list variant is refreshed
      queryClient.invalidateQueries({ 
        queryKey: userKeys.all,
        exact: false,
      });

      toast.success("Xóa người dùng thành công!");
    },
    onError: (error) => {
      console.error("Error deleting user:", error);
      toast.error("Xóa người dùng thất bại!");
    },
  });
};

// Custom hook for user management
export const useUserManagement = (options?: {
  page?: number;
  limit?: number;
  role?: UserRole;
  searchKeyword?: string;
  classId?: string;
  enabled?: boolean;
}) => {
  // Get users with pagination and search
  const { data, isLoading, error, refetch } = useUsers(options);
  const users = data?.data || [];
  const pagination = data?.pagination;

  // Mutations
  const createUserMutation = useCreateUser();
  const updateUserMutation = useUpdateUser();
  const deleteUserMutation = useDeleteUser();

  // CRUD functions
  // Note: No need to refetch - mutations already invalidate queries via onSuccess
  const handleCreateUser = async (userData: CreateUserData) => {
    return createUserMutation.mutateAsync(userData);
  };

  const handleUpdateUser = async (userId: string, userData: UpdateUserData) => {
    return updateUserMutation.mutateAsync({ userId, userData });
  };

  const handleDeleteUser = async (userId: string) => {
    return deleteUserMutation.mutateAsync(userId);
  };

  return {
    // Data
    users,
    pagination,
    isLoading,
    error,
    refetch,

    // CRUD operations
    createUser: handleCreateUser,
    updateUser: handleUpdateUser,
    deleteUser: handleDeleteUser,

    // Mutation states
    isCreating: createUserMutation.isPending,
    isUpdating: updateUserMutation.isPending,
    isDeleting: deleteUserMutation.isPending,
  };
};

// Hook for merging user data
export const useMergeUserData = () => {
  const queryClient = useQueryClient();

  const mergeMutation = useMutation({
    mutationFn: ({
      sourceUserId,
      targetUserId,
    }: {
      sourceUserId: string;
      targetUserId: string;
    }) => mergeUserData(sourceUserId, targetUserId),
    onSuccess: (result: MergeUserDataResult) => {
      if (result.success) {
        // Invalidate all users queries to refresh data after merge
        queryClient.invalidateQueries({ 
          queryKey: userKeys.all,
          exact: false, // Invalidate all user-related queries
        });

        toast.success(
          `Đã backup thành công! Đã chuyển ${Object.values(result.stats).reduce((a, b) => a + b, 0)} bản ghi.`
        );
      } else {
        toast.error(result.error || "Backup thất bại!");
      }
    },
    onError: (error: unknown) => {
      console.error("Error merging user data:", error);
      const errorMessage = error instanceof Error ? error.message : "Backup thất bại!";
      toast.error(errorMessage);
    },
  });

  const previewMutation = useMutation({
    mutationFn: ({
      sourceUserId,
      targetUserId,
    }: {
      sourceUserId: string;
      targetUserId: string;
    }) => getMergePreview(sourceUserId, targetUserId),
  });

  return {
    mergeUserData: mergeMutation.mutateAsync,
    getMergePreview: previewMutation.mutateAsync,
    isMerging: mergeMutation.isPending,
    isPreviewing: previewMutation.isPending,
    previewData: previewMutation.data,
    mergeError: mergeMutation.error,
  };
};
