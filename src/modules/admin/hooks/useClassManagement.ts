import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  getClasses,
  getClassById,
  createClass,
  updateClass,
  deleteClass,
  addStudentToClass,
  removeMemberFromClass,
  getClassMembers,
  updateClassMember,
  syncClassMembers,
  UpdateClassData,
} from "../services/class.service";
import toast from "react-hot-toast";
import { IClassMember } from "@/types";
import { studentKeys } from "./useStudentManagement";
import { teacherClassKeys } from "@/modules/classes/hooks";

// --- QUERY KEYS ---
export const classKeys = {
  all: ["classes"] as const,
  lists: () => [...classKeys.all, "list"] as const,
  detail: (id: string) => [...classKeys.all, "detail", id] as const,
  members: (classId: string) =>
    [...classKeys.detail(classId), "members"] as const,
};

// --- QUERY HOOKS ---
export const useClasses = (enabled: boolean = true) => {
  return useQuery({
    queryKey: classKeys.lists(),
    queryFn: getClasses,
    enabled, // Only fetch when enabled
    staleTime: 5 * 60 * 1000, // 5 minutes - cache classes to avoid unnecessary refetches
    gcTime: 10 * 60 * 1000, // 10 minutes - keep in cache for 10 minutes after unused
  });
};

export const useClass = (classId: string) => {
  return useQuery({
    queryKey: classKeys.detail(classId),
    queryFn: () => getClassById(classId),
    enabled: !!classId,
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
  });
};

export const useClassMembers = (classId: string) => {
  return useQuery({
    queryKey: classKeys.members(classId),
    queryFn: () => getClassMembers(classId),
    enabled: !!classId,
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
  });
};

// --- MUTATION HOOKS ---

export const useCreateClass = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createClass,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: classKeys.lists() });
      toast.success("Tạo lớp học thành công!");
    },
    onError: (error) => {
      toast.error(`Tạo lớp học thất bại: ${error.message}`);
    },
  });
};

export const useUpdateClass = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      classId,
      classData,
    }: {
      classId: string;
      classData: UpdateClassData;
    }) => updateClass(classId, classData),
    onSuccess: (_, { classId }) => {
      queryClient.invalidateQueries({ queryKey: classKeys.lists() });
      queryClient.invalidateQueries({ queryKey: classKeys.detail(classId) });
      toast.success("Cập nhật lớp học thành công!");
    },
    onError: (error) => {
      toast.error(`Cập nhật thất bại: ${error.message}`);
    },
  });
};

export const useDeleteClass = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: deleteClass,
    onSuccess: (_, classId) => {
      queryClient.invalidateQueries({ queryKey: classKeys.lists() });
      queryClient.removeQueries({ queryKey: classKeys.detail(classId) });
      toast.success("Xóa lớp học thành công!");
    },
    onError: (error) => {
      toast.error(`Xóa thất bại: ${error.message}`);
    },
  });
};

export const useAddStudentToClass = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      classId,
      studentId,
    }: {
      classId: string;
      studentId: string;
    }) => addStudentToClass(classId, studentId),
    onSuccess: (_, { classId, studentId }) => {
      queryClient.invalidateQueries({ queryKey: classKeys.lists() });
      queryClient.invalidateQueries({ queryKey: classKeys.members(classId) });
      queryClient.invalidateQueries({ queryKey: classKeys.detail(classId) }); // To update studentCount
      // "Học sinh chưa có lớp" filter (Admin → chi tiết lớp) uses useStudents({ classId: "no-class" })
      queryClient.invalidateQueries({
        queryKey: studentKeys.all,
        exact: false,
      });
      queryClient.invalidateQueries({
        queryKey: teacherClassKeys.studentClasses(studentId),
      });
      queryClient.invalidateQueries({
        predicate: (query) => {
          const key = query.queryKey;
          return (
            Array.isArray(key) &&
            key.length >= 4 &&
            key[0] === "teacherClasses" &&
            key[1] === "detail" &&
            key[2] === classId &&
            key[3] === "members"
          );
        },
      });
      toast.success("Thêm học sinh thành công!");
    },
    onError: (error) => {
      toast.error(`Thêm thất bại: ${error.message}`);
    },
  });
};

export const useRemoveMemberFromClass = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      classId,
      memberId,
    }: {
      classId: string;
      memberId: string;
    }) => removeMemberFromClass(classId, memberId),
    onSuccess: (_, { classId, memberId }) => {
      queryClient.invalidateQueries({ queryKey: classKeys.lists() });
      queryClient.invalidateQueries({ queryKey: classKeys.members(classId) });
      queryClient.invalidateQueries({ queryKey: classKeys.detail(classId) }); // To update studentCount
      queryClient.invalidateQueries({
        queryKey: studentKeys.all,
        exact: false,
      });
      queryClient.invalidateQueries({
        queryKey: teacherClassKeys.studentClasses(memberId),
      });
      queryClient.invalidateQueries({
        predicate: (query) => {
          const key = query.queryKey;
          return (
            Array.isArray(key) &&
            key.length >= 4 &&
            key[0] === "teacherClasses" &&
            key[1] === "detail" &&
            key[2] === classId &&
            key[3] === "members"
          );
        },
      });
      toast.success("Xóa thành viên thành công!");
    },
    onError: (error) => {
      toast.error(`Xóa thất bại: ${error.message}`);
    },
  });
};

export const useUpdateClassMember = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      classId,
      memberId,
      data,
    }: {
      classId: string;
      memberId: string;
      data: Partial<IClassMember>;
    }) => updateClassMember(classId, memberId, data),
    onSuccess: (_, { classId }) => {
      // Invalidate admin class members query
      queryClient.invalidateQueries({ queryKey: classKeys.members(classId) });
      
      // Invalidate teacher/student class members query (used in MembersList.tsx)
      // The query key structure is: ["teacherClasses", "detail", classId, "members"]
      queryClient.invalidateQueries({
        predicate: (query) => {
          const key = query.queryKey;
          return (
            Array.isArray(key) &&
            key.length >= 4 &&
            key[0] === "teacherClasses" &&
            key[1] === "detail" &&
            key[2] === classId &&
            key[3] === "members"
          );
        },
      });
      
      toast.success("Cập nhật thành viên thành công!");
    },
    onError: (error) => {
      toast.error(`Cập nhật thất bại: ${error.message}`);
    },
  });
};

export const useSyncClassMembers = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (classId: string) => syncClassMembers(classId),
    onSuccess: (_, classId) => {
      // Invalidate admin class members query
      queryClient.invalidateQueries({ queryKey: classKeys.members(classId) });
      
      // Invalidate teacher/student class members query (used in ClassDetail.tsx)
      // The query key structure is: ["teacherClasses", "detail", classId, "members"]
      queryClient.invalidateQueries({
        predicate: (query) => {
          const key = query.queryKey;
          return (
            Array.isArray(key) &&
            key.length >= 4 &&
            key[0] === "teacherClasses" &&
            key[1] === "detail" &&
            key[2] === classId &&
            key[3] === "members"
          );
        },
      });
      
      toast.success("Đồng bộ thông tin thành viên thành công!");
    },
    onError: (error) => {
      toast.error(`Đồng bộ thất bại: ${error.message}`);
    },
  });
};
