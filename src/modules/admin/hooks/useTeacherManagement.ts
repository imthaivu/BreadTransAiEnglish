import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  getTeachers,
  getTeacherById,
  createTeacher,
  updateTeacher,
  deleteTeacher,
  CreateTeacherData,
  UpdateTeacherData,
} from "../services/teacher.service";
import toast from "react-hot-toast";

// Query keys
export const teacherKeys = {
  all: ["teachers"] as const,
  lists: () => [...teacherKeys.all, "list"] as const,
  detail: (id: string) => [...teacherKeys.all, "detail", id] as const,
};

// Get all teachers
export const useTeachers = () => {
  return useQuery({
    queryKey: teacherKeys.lists(),
    queryFn: getTeachers,
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
  });
};

// Get teacher by ID
export const useTeacher = (teacherId: string) => {
  return useQuery({
    queryKey: teacherKeys.detail(teacherId),
    queryFn: () => getTeacherById(teacherId),
    enabled: !!teacherId,
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
  });
};

// Create teacher mutation
export const useCreateTeacher = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: createTeacher,
    onSuccess: (newTeacher) => {
      // Invalidate and refetch teachers list
      queryClient.invalidateQueries({ queryKey: teacherKeys.lists() });

      // Add the new teacher to the cache
      queryClient.setQueryData(teacherKeys.detail(newTeacher.id), newTeacher);

      toast.success("Tạo giáo viên thành công!");
    },
    onError: (error) => {
      console.error("Error creating teacher:", error);
      toast.error("Tạo giáo viên thất bại!");
    },
  });
};

// Update teacher mutation
export const useUpdateTeacher = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      teacherId,
      teacherData,
    }: {
      teacherId: string;
      teacherData: UpdateTeacherData;
    }) => updateTeacher(teacherId, teacherData),
    onSuccess: (_, { teacherId }) => {
      // Invalidate and refetch teachers list
      queryClient.invalidateQueries({ queryKey: teacherKeys.lists() });

      // Invalidate specific teacher detail
      queryClient.invalidateQueries({
        queryKey: teacherKeys.detail(teacherId),
      });

      toast.success("Cập nhật giáo viên thành công!");
    },
    onError: (error) => {
      console.error("Error updating teacher:", error);
      toast.error("Cập nhật giáo viên thất bại!");
    },
  });
};

// Delete teacher mutation
export const useDeleteTeacher = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: deleteTeacher,
    onSuccess: (_, teacherId) => {
      // Invalidate and refetch teachers list
      queryClient.invalidateQueries({ queryKey: teacherKeys.lists() });

      // Remove teacher from cache
      queryClient.removeQueries({ queryKey: teacherKeys.detail(teacherId) });

      toast.success("Xóa giáo viên thành công!");
    },
    onError: (error) => {
      console.error("Error deleting teacher:", error);
      toast.error("Xóa giáo viên thất bại!");
    },
  });
};

// Custom hook for teacher management
export const useTeacherManagement = () => {
  // Get teachers
  const { data: teachers = [], isLoading, error } = useTeachers();

  // Mutations
  const createTeacherMutation = useCreateTeacher();
  const updateTeacherMutation = useUpdateTeacher();
  const deleteTeacherMutation = useDeleteTeacher();

  // CRUD functions
  const handleCreateTeacher = async (teacherData: CreateTeacherData) => {
    return createTeacherMutation.mutateAsync(teacherData);
  };

  const handleUpdateTeacher = async (
    teacherId: string,
    teacherData: UpdateTeacherData
  ) => {
    return updateTeacherMutation.mutateAsync({ teacherId, teacherData });
  };

  const handleDeleteTeacher = async (teacherId: string) => {
    return deleteTeacherMutation.mutateAsync(teacherId);
  };

  return {
    // Data
    teachers,
    isLoading,
    error,

    // CRUD operations
    createTeacher: handleCreateTeacher,
    updateTeacher: handleUpdateTeacher,
    deleteTeacher: handleDeleteTeacher,

    // Mutation states
    isCreating: createTeacherMutation.isPending,
    isUpdating: updateTeacherMutation.isPending,
    isDeleting: deleteTeacherMutation.isPending,
  };
};
