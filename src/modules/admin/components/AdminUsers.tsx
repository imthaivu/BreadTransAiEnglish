"use client";

import { Button } from "@/components/ui/Button";
import { IProfile } from "@/types";
import { motion } from "framer-motion";
import { useState, useEffect } from "react";
import { FiTrash2, FiUser, FiLoader, FiUserPlus, FiPhone, FiKey } from "react-icons/fi";
import { AddressSelector } from "@/components/ui/AddressSelector";
import {
  AdminModal,
  AdminTableColumn,
  PasteButton,
  PasteInput,
} from "./common";
import { useUserManagement, userKeys } from "../hooks/useUserManagement";
import { useClasses } from "../hooks/useClassManagement";
import { UserRole } from "@/lib/auth/types";
import toast from "react-hot-toast";
import Pagination from "@/components/ui/Pagination";
import { useQueryClient } from "@tanstack/react-query";
import { getFirebaseAuth } from "@/lib/firebase/client";
import { calculateCurrentGrade } from "@/utils/grade";

// Helper function to get Firebase ID token for API authentication
async function getAuthToken(): Promise<string> {
  const auth = getFirebaseAuth();
  const currentUser = auth.currentUser;

  if (!currentUser) {
    throw new Error("Bạn cần đăng nhập để thực hiện thao tác này.");
  }

  return await currentUser.getIdToken();
}

type UserWithOptionalPhone = IProfile & {
  phone?: string;
  parentPhone?: string;
  loginCount?: number;
};

const SUGGESTED_PASSWORD = "123456";

export default function AdminUsers() {
  const queryClient = useQueryClient();
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<IProfile | null>(null);

  // Reset password modal state
  const [isResetPasswordModalOpen, setIsResetPasswordModalOpen] = useState(false);
  const [resetPasswordUser, setResetPasswordUser] = useState<IProfile | null>(null);
  const [newPassword, setNewPassword] = useState(SUGGESTED_PASSWORD);
  const [isResettingPassword, setIsResettingPassword] = useState(false);

  // Create user modal state
  const [isCreateUserModalOpen, setIsCreateUserModalOpen] = useState(false);
  const [createRole, setCreateRole] = useState<UserRole>(UserRole.STUDENT);
  const [createDisplayName, setCreateDisplayName] = useState(""); // Họ tên của bé
  const [createPhone, setCreatePhone] = useState(""); // SĐT zalo của bé (optional)
  const [createParentPhone, setCreateParentPhone] = useState(""); // SĐT zalo của PH
  const [createAddress, setCreateAddress] = useState(""); // Địa chỉ
  const [createAddressDetail, setCreateAddressDetail] = useState(""); // Địa chỉ chi tiết
  const [createBirthYear, setCreateBirthYear] = useState<string>(""); // Năm sinh học sinh
  const [, setCreatePassword] = useState(SUGGESTED_PASSWORD); // Password
  const [isCreatingUser, setIsCreatingUser] = useState(false);
  const [createError, setCreateError] = useState("");

  // Filters and pagination
  const [roleFilter, setRoleFilter] = useState<UserRole | "none">("none"); // "none" = chưa chọn
  const [classIdFilter, setClassIdFilter] = useState<string>("none"); // "none" = chưa chọn
  const [currentPage, setCurrentPage] = useState(1);
  const [pageLimit] = useState(10);

  // Fetch classes for dropdown
  const { data: classes = [], isLoading: isLoadingClasses } = useClasses();

  // Use the user management hook with pagination
  // Only fetch when a role is selected (not "none")
  // Role is always required for server-side filtering optimization
  // For students, also require classId to be selected (not "none")
  // For teacher/admin, query immediately when role is selected
  const shouldFetch =
    roleFilter !== "none" &&
    (roleFilter !== "student" || classIdFilter !== "none");

  const {
    users,
    pagination,
    isLoading,
    error,
    updateUser,
    deleteUser,
    isDeleting,
    isUpdating,
  } = useUserManagement({
    page: currentPage,
    limit: pageLimit,
    role: roleFilter !== "none" ? roleFilter : undefined,
    classId: roleFilter === "student" && classIdFilter !== "none" ? classIdFilter : undefined,
    enabled: shouldFetch, // Student: only fetch when class is selected. Teacher/Admin: fetch immediately when role is selected
  });

  // Reset to page 1 when role filter or class filter changes
  useEffect(() => {
    setCurrentPage(1);
  }, [roleFilter, classIdFilter]);

  // Reset classId filter when role filter changes
  useEffect(() => {
    if (roleFilter !== "student") {
      setClassIdFilter("none");
    }
  }, [roleFilter]);

  // Handle page change
  const handlePageChange = (page: number) => {
    setCurrentPage(page);
  };

  const handleLoginCountSave = async (userId: string, rawValue: string, currentCount: number) => {
    const parsed = rawValue.trim() === "" ? 0 : Number.parseInt(rawValue, 10);
    if (!Number.isFinite(parsed) || parsed < 0) {
      toast.error("Số lần đăng nhập phải là số nguyên ≥ 0.");
      return;
    }
    if (parsed === currentCount) return;

    try {
      await updateUser(userId, { loginCount: parsed });
    } catch (err) {
      console.error("Error updating login count:", err);
      toast.error("Cập nhật số lần đăng nhập thất bại.");
    }
  };

  // Normalize phone number - lưu dạng bình thường (0901234567)
  const normalizePhone = (phone: string): string => {
    let cleaned = phone.replace(/\D/g, "");

    // Handle Vietnamese phone numbers - chuyển về dạng 0xxxxxxxxx
    if (cleaned.startsWith("84") && cleaned.length === 11) {
      cleaned = "0" + cleaned.substring(2);
    }
    // Đảm bảo bắt đầu bằng 0 và có 10 chữ số
    if (cleaned.startsWith("0") && cleaned.length === 10) {
      return cleaned;
    }

    return cleaned;
  };

  // Handle create user
  const handleCreateUser = async () => {
    // Validate required fields
    if (!createDisplayName.trim()) {
      setCreateError("Nhập họ tên.");
      return;
    }

    let normalizedParentPhone = "";
    let normalizedPhone = "";

    if (createRole === UserRole.STUDENT) {
      // Require Parent Phone for student account
      if (!createParentPhone.trim()) {
        setCreateError("Nhập số điện thoại phụ huynh.");
        return;
      }

      normalizedParentPhone = normalizePhone(createParentPhone);
      if (!/^0[1-9][0-9]{8}$/.test(normalizedParentPhone)) {
        setCreateError("SĐT phụ huynh không hợp lệ. Nhập 10 số (VD: 0901234567).");
        return;
      }

      // Optional student phone, fallback to parent phone
      normalizedPhone = normalizedParentPhone;
      if (createPhone.trim()) {
        normalizedPhone = normalizePhone(createPhone);
        if (!/^0[1-9][0-9]{8}$/.test(normalizedPhone)) {
          setCreateError("SĐT học sinh không hợp lệ. Nhập 10 số (VD: 0901234567).");
          return;
        }
      }
    } else {
      // Teacher account always requires teacher phone
      if (!createPhone.trim()) {
        setCreateError("Nhập số điện thoại giáo viên.");
        return;
      }
      normalizedPhone = normalizePhone(createPhone);
      if (!/^0[1-9][0-9]{8}$/.test(normalizedPhone)) {
        setCreateError("SĐT giáo viên không hợp lệ. Nhập 10 số (VD: 0901234567).");
        return;
      }
    }

    setIsCreatingUser(true);
    setCreateError("");

    try {
      // Get Firebase ID token for authentication
      const auth = getFirebaseAuth();
      const currentUser = auth.currentUser;

      if (!currentUser) {
        throw new Error("Bạn cần đăng nhập để tạo tài khoản.");
      }

      const idToken = await currentUser.getIdToken();

      const parsedBirthYear =
        createRole === UserRole.STUDENT && createBirthYear.trim()
          ? Number(createBirthYear)
          : null;

      const response = await fetch("/api/admin/users/create", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          displayName: createDisplayName.trim(),
          role: createRole,
          phone: normalizedPhone, // SĐT dùng để đăng nhập
          parentPhone:
            createRole === UserRole.STUDENT ? normalizedParentPhone || null : null,
          address: createAddress.trim() || null, // Địa chỉ (optional)
          addressDetail: createAddressDetail.trim() || null, // Địa chỉ chi tiết (optional)
          birthYear: parsedBirthYear,
          password: SUGGESTED_PASSWORD, // Tự động dùng mật khẩu mặc định
        }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || "Tạo thất bại.");
      }

      toast.success("Tạo tài khoản thành công!");
      setIsCreateUserModalOpen(false);
      setCreateRole(UserRole.STUDENT);
      setCreateDisplayName("");
      setCreatePhone("");
      setCreateParentPhone("");
      setCreateAddress("");
      setCreateAddressDetail("");
      setCreateBirthYear("");
      setCreatePassword(SUGGESTED_PASSWORD);
      setCreateError("");
      // Invalidate all user queries so current filtered list refetches immediately
      queryClient.invalidateQueries({
        queryKey: userKeys.all,
        exact: false,
      });
    } catch (error) {
      console.error("Error creating user:", error);
      const errorMessage = error instanceof Error ? error.message : "Tạo thất bại. Thử lại.";
      setCreateError(errorMessage);
    } finally {
      setIsCreatingUser(false);
    }
  };

  const openCreateUserModal = () => {
    setCreateRole(UserRole.STUDENT);
    setCreateDisplayName("");
    setCreatePhone("");
    setCreateParentPhone("");
    setCreateAddress("");
    setCreateAddressDetail("");
    setCreateBirthYear("");
    setCreatePassword(SUGGESTED_PASSWORD);
    setCreateError("");
    setIsCreateUserModalOpen(true);
  };

  const closeCreateUserModal = () => {
    setIsCreateUserModalOpen(false);
    setCreateRole(UserRole.STUDENT);
    setCreateDisplayName("");
    setCreatePhone("");
    setCreateParentPhone("");
    setCreateAddress("");
    setCreateAddressDetail("");
    setCreateBirthYear("");
    setCreatePassword(SUGGESTED_PASSWORD);
    setCreateError("");
  };

  const handleDeleteUser = async () => {
    if (!selectedUser) return;

    try {
      await deleteUser(selectedUser.id);
      setIsDeleteModalOpen(false);
      setSelectedUser(null);
      // Mutation invalidates queries; force refetch current list immediately
      queryClient.invalidateQueries({
        queryKey: userKeys.all,
        exact: false,
      });
    } catch (error) {
      console.error("Error deleting user:", error);
    }
  };

  const openDeleteModal = (user: IProfile) => {
    setSelectedUser(user);
    setIsDeleteModalOpen(true);
  };

  const closeDeleteModal = () => {
    setSelectedUser(null);
    setIsDeleteModalOpen(false);
  };

  // Reset password handlers
  const openResetPasswordModal = (user: IProfile) => {
    setResetPasswordUser(user);
    setNewPassword(SUGGESTED_PASSWORD);
    setIsResetPasswordModalOpen(true);
  };

  const closeResetPasswordModal = () => {
    setResetPasswordUser(null);
    setNewPassword(SUGGESTED_PASSWORD);
    setIsResetPasswordModalOpen(false);
  };

  const handleResetPassword = async () => {
    if (!resetPasswordUser || !newPassword.trim()) {
      toast.error("Nhập mật khẩu mới.");
      return;
    }

    // Validate password: 6-8 characters
    if (!/^.{6,8}$/.test(newPassword)) {
      toast.error("Mật khẩu 6-8 ký tự.");
      return;
    }

    setIsResettingPassword(true);
    try {
      const userWithPhone = resetPasswordUser as UserWithOptionalPhone;
      const userPhone = userWithPhone.phone;

      // Tất cả tài khoản đều dùng phone, không còn Gmail account
      // Nếu có số điện thoại, có thể reset password
      if (userPhone && userPhone.trim()) {
        const normalizedPhone = normalizePhone(userPhone);

        // Validate phone number
        if (!/^0[1-9][0-9]{8}$/.test(normalizedPhone)) {
          toast.error("SĐT không hợp lệ.");
          setIsResettingPassword(false);
          return;
        }

        // Reset password cho tài khoản hiện tại
        const resetToken = await getAuthToken();
        const response = await fetch(`/api/admin/users/${encodeURIComponent(resetPasswordUser.id)}/reset-password`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${resetToken}`,
          },
          body: JSON.stringify({ newPassword }),
        });

        const data = await response.json();

        if (!response.ok || !data.success) {
          throw new Error(data.error || "Reset mật khẩu thất bại.");
        }

        toast.success("Reset mật khẩu thành công! Tài khoản đã được tự động mở khóa.");
        closeResetPasswordModal();
        // Invalidate queries instead of refetch
        queryClient.invalidateQueries({ queryKey: userKeys.lists() });
      } else {
        // Tài khoản không phải Gmail hoặc không có số điện thoại, chỉ reset password
        const resetToken = await getAuthToken();
        const response = await fetch(`/api/admin/users/${encodeURIComponent(resetPasswordUser.id)}/reset-password`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${resetToken}`,
          },
          body: JSON.stringify({ newPassword }),
        });

        const data = await response.json();

        if (!response.ok || !data.success) {
          throw new Error(data.error || "Reset mật khẩu thất bại.");
        }

        toast.success("Reset mật khẩu thành công! Tài khoản đã được tự động mở khóa.");
        closeResetPasswordModal();
        // Invalidate queries instead of refetch
        queryClient.invalidateQueries({ queryKey: userKeys.lists() });
      }
    } catch (error) {
      console.error("Error resetting password:", error);
      const errorMessage = error instanceof Error ? error.message : "Reset mật khẩu thất bại. Thử lại.";
      toast.error(errorMessage, { id: "reset-password" });
    } finally {
      setIsResettingPassword(false);
    }
  };

  // Table columns configuration
  const columns: AdminTableColumn<IProfile>[] = [
    {
      key: "user",
      title: "Người dùng",
      render: (_, user) => (
        <div className="flex items-center">
          <div className="flex-shrink-0 h-10 w-10">
            <div className="h-10 w-10 rounded-full  bg-primary/10 flex items-center justify-center">
              <FiUser className="w-5 h-5 text-primary" />
            </div>
          </div>
          <div className="ml-4">
            <div className="text-sm md:text-base font-medium text-gray-900">
              {user.displayName || "Chưa có tên"}
            </div>
          </div>
        </div>
      ),
    },
    {
      key: "role",
      title: "Vai trò",
      render: (_, user) => {
        return (
          <div className="flex items-center gap-2">
            <span
              className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${user.role === "admin"
                  ? "bg-red-100 text-red-800"
                  : user.role === "teacher"
                    ? " bg-primary/10 text-primary"
                    : "bg-green-100 text-green-800"
                }`}
            >
              {user.role === "admin"
                ? "Admin"
                : user.role === "teacher"
                  ? "Giáo viên"
                  : "Học sinh"}
            </span>
          </div>
        );
      },
    },
    {
      key: "phone",
      title: "Số điện thoại",
      render: (_, user) => {
        const userWithPhone = user as UserWithOptionalPhone;
        const studentPhone = userWithPhone.phone;
        const parentPhone = userWithPhone.parentPhone;

        return (
          <div className="flex flex-col gap-0.5">
            {studentPhone && (
              <div className="flex items-center gap-1">
                <span className="text-xs font-medium text-gray-500 w-6">HS:</span>
                <span className="text-sm md:text-base text-gray-900">{studentPhone}</span>
              </div>
            )}
            {parentPhone && (
              <div className="flex items-center gap-1">
                <span className="text-xs font-medium text-gray-500 w-6">PH:</span>
                <span className="text-sm md:text-base text-gray-500">{parentPhone}</span>
              </div>
            )}
            {!studentPhone && !parentPhone && (
              <span className="text-sm md:text-base text-gray-500">Chưa có</span>
            )}
          </div>
        );
      },
    },
    {
      key: "loginCount",
      title: "Đăng nhập",
      render: (_, user) => {
        const u = user as UserWithOptionalPhone;
        const currentCount = u.loginCount ?? 0;
        return (
          <div className="flex items-center gap-1">
            <input
              type="number"
              min={0}
              step={1}
              defaultValue={currentCount}
              key={`${user.id}-${currentCount}`}
              disabled={isUpdating}
              onClick={(e) => e.stopPropagation()}
              onBlur={(e) => handleLoginCountSave(user.id, e.target.value, currentCount)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.currentTarget.blur();
                }
              }}
              className="w-16 px-2 py-1 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary disabled:bg-gray-100"
              aria-label={`Số lần đăng nhập của ${user.displayName || "người dùng"}`}
            />
            <span className="text-sm text-gray-500">lần</span>
          </div>
        );
      },
    },
    {
      key: "actions",
      title: "Thao tác",
      render: (_, user) => {
        const userWithPhone = user as UserWithOptionalPhone;
        const userPhone = userWithPhone.phone;
        // Tất cả tài khoản đều dùng phone
        const isPhoneAccount = !!userPhone;

        return (
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
            <select
              value={user.role}
              onChange={async (e) => {
                const newRole = e.target.value as UserRole;
                try {
                  await updateUser(user.id, {
                    displayName: user.displayName || "",
                    role: newRole,
                    phone: userPhone,
                  });
                  toast.success(`Đã chuyển ${user.displayName || userPhone || "Người dùng"} sang ${newRole === "admin" ? "Admin" : newRole === "teacher" ? "Giáo viên" : newRole === "student" ? "Học sinh" : "Vãng lai"}`);
                } catch (error) {
                  console.error("Error updating user role:", error);
                  toast.error("Chuyển vai trò thất bại. Vui lòng thử lại.");
                }
              }}
              className="px-2 py-1.5 text-xs border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary w-full sm:w-auto"
              onClick={(e) => e.stopPropagation()}
            >
              <option value="admin">Admin</option>
              <option value="teacher">Giáo viên</option>
              <option value="student">Học sinh</option>
            </select>
            <div className="flex items-center gap-1">
              {isPhoneAccount && (
                <Button
                  variant="outline"
                  size="sm"
                  className="flex items-center gap-1 text-purple-600 hover:text-purple-700 px-2 py-1"
                  onClick={(e) => {
                    e.stopPropagation();
                    openResetPasswordModal(user);
                  }}
                  title="Đặt lại mật khẩu cho người dùng"
                >
                  <FiKey className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Reset</span>
                </Button>
              )}
              <Button
                variant="outline"
                size="sm"
                className="flex items-center gap-1 text-red-600 hover:text-red-700 px-2 py-1"
                onClick={(e) => {
                  e.stopPropagation();
                  openDeleteModal(user);
                }}
                title="Xóa tài khoản"
              >
                <FiTrash2 className="w-3.5 h-3.5" />
              </Button>
            </div>
          </div>
        );
      },
    },
  ];


  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col gap-3 sm:gap-4"
      >
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900">
            Tài khoản
          </h1>
        </div>

        {/* Controls - Role/Class filters + Create button, 50-50 layout */}
        <div className="flex flex-row items-stretch gap-2 p-3 sm:p-4 bg-gray-50 rounded-lg border border-gray-200">
          <div className="flex gap-2 w-1/2 min-w-0">
            <select
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value as UserRole | "none")}
              className="flex-1 min-w-0 px-2 sm:px-4 py-1.5 sm:py-2 border border-gray-300 rounded-lg bg-white focus:ring-2 focus:ring-primary focus:border-primary text-xs sm:text-sm"
            >
              <option value="none">Chưa chọn role</option>
              <option value={UserRole.ADMIN}>Admin</option>
              <option value={UserRole.TEACHER}>Giáo viên</option>
              <option value={UserRole.STUDENT}>Học sinh</option>
            </select>
            {roleFilter === "student" && (
              <select
                value={classIdFilter}
                onChange={(e) => setClassIdFilter(e.target.value)}
                className="flex-1 min-w-0 px-2 sm:px-4 py-1.5 sm:py-2 border border-gray-300 rounded-lg bg-white focus:ring-2 focus:ring-primary focus:border-primary text-xs sm:text-sm"
                disabled={isLoadingClasses}
              >
                <option value="none">Chưa chọn lớp</option>
                <option value="no-class">Chưa có lớp</option>
                {classes.map((classItem) => (
                  <option key={classItem.id} value={classItem.id}>
                    {classItem.name}
                  </option>
                ))}
              </select>
            )}
          </div>
          <Button
            onClick={openCreateUserModal}
            className="flex items-center justify-center gap-1.5 sm:gap-2 px-2 sm:px-4 py-2 w-1/2 min-w-0 text-sm"
            title="Tạo tài khoản"
            size="sm"
          >
            <FiUserPlus className="w-4 h-4" />
            <span className="hidden sm:inline">Tạo tài khoản</span>
          </Button>
        </div>
      </motion.div>

      {/* Error State */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <div className="flex">
            <div className="ml-3">
              <h3 className="text-sm md:text-base font-medium text-red-800">
                Lỗi tải dữ liệu
              </h3>
              <div className="mt-2 text-sm md:text-base text-red-700">
                <p>{error.message || "Thử lại sau"}</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Users Table - Desktop */}
      <div className="hidden md:block bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                {columns.map((col) => (
                  <th
                    key={col.key}
                    className="px-4 md:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                  >
                    {col.title}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {roleFilter === "none" ? (
                <tr>
                  <td colSpan={columns.length} className="px-6 py-4 text-center text-gray-500">
                    Vui lòng chọn role để xem người dùng
                  </td>
                </tr>
              ) : roleFilter === "student" && classIdFilter === "none" ? (
                <tr>
                  <td colSpan={columns.length} className="px-6 py-4 text-center text-gray-500">
                    Vui lòng chọn lớp để xem học sinh
                  </td>
                </tr>
              ) : isLoading ? (
                <tr>
                  <td colSpan={columns.length} className="px-6 py-4 text-center">
                    <div className="flex justify-center items-center">
                      <FiLoader className="animate-spin h-5 w-5 text-primary" />
                      <span className="ml-2 text-gray-600">Đang tải</span>
                    </div>
                  </td>
                </tr>
              ) : users.length === 0 ? (
                <tr>
                  <td colSpan={columns.length} className="px-6 py-4 text-center text-gray-500">
                    {roleFilter === "student" && classIdFilter === "no-class"
                      ? "Không có học sinh nào chưa có lớp"
                      : roleFilter === "student" && classIdFilter !== "none"
                        ? "Lớp này chưa có học sinh nào"
                        : "Không có dữ liệu"}
                  </td>
                </tr>
              ) : (
                users.map((user, index) => {
                  return (
                    <tr
                      key={user.id}
                      className="hover:bg-gray-50 transition-colors"
                    >
                      {columns.map((col) => {
                        const userWithPhone = user as UserWithOptionalPhone;
                        const value = userWithPhone[col.key as keyof UserWithOptionalPhone];
                        return (
                          <td
                            key={col.key}
                            className="px-4 md:px-6 py-3 whitespace-nowrap text-sm text-gray-900"
                          >
                            {col.render ? col.render(value, user, index) : value}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Users Cards - Mobile */}
      <div className="md:hidden space-y-2">
        {roleFilter === "none" ? (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 text-center text-gray-500 text-sm">
            Vui lòng chọn role để xem người dùng
          </div>
        ) : roleFilter === "student" && classIdFilter === "none" ? (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 text-center text-gray-500 text-sm">
            Vui lòng chọn lớp để xem học sinh
          </div>
        ) : isLoading ? (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 text-center">
            <FiLoader className="animate-spin h-5 w-5 text-primary mx-auto" />
          </div>
        ) : users.length === 0 ? (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 text-center text-gray-500 text-sm">
            {roleFilter === "student" && classIdFilter === "no-class"
              ? "Không có học sinh nào chưa có lớp"
              : roleFilter === "student" && classIdFilter !== "none"
                ? "Lớp này chưa có học sinh nào"
                : "Không có người dùng nào"}
          </div>
        ) : (
          users.map((user) => {
            const userWithPhone = user as UserWithOptionalPhone;
            const userPhone = userWithPhone.phone;
            // Tất cả tài khoản đều dùng phone
            const isPhoneAccount = !!userPhone;

            return (
              <div
                key={user.id}
                className="bg-white rounded-lg shadow-sm border border-gray-200 p-2"
              >
                <div className="flex items-center gap-2">
                  {/* Avatar */}
                  <div className="flex-shrink-0 h-8 w-8">
                    <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
                      <FiUser className="w-4 h-4 text-primary" />
                    </div>
                  </div>

                  {/* Name & Role Badge */}
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-gray-900 truncate">
                      {user.displayName || "Chưa có tên"}
                    </div>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <span
                        className={`inline-flex px-1.5 py-0.5 text-[10px] font-semibold rounded-full ${user.role === "admin"
                            ? "bg-red-100 text-red-800"
                            : user.role === "teacher"
                              ? "bg-primary/10 text-primary"
                              : user.role === "student"
                                ? "bg-green-100 text-green-800"
                                : "bg-gray-100 text-gray-800"
                          }`}
                      >
                        {user.role === "admin"
                          ? "A"
                          : user.role === "teacher"
                            ? "GV"
                            : user.role === "student"
                              ? "HS"
                              : "V"}
                      </span>
                      <span className="text-xs text-gray-500 truncate flex items-center gap-1 flex-wrap">
                        {userWithPhone.phone && <span>HS: {userWithPhone.phone}</span>}
                        {userWithPhone.parentPhone && <span>PH: {userWithPhone.parentPhone}</span>}
                        {!userWithPhone.phone && !userWithPhone.parentPhone && (
                          <span>Chưa có SĐT</span>
                        )}
                        <span className="inline-flex items-center gap-0.5">
                          ·
                          <input
                            type="number"
                            min={0}
                            step={1}
                            defaultValue={userWithPhone.loginCount ?? 0}
                            key={`${user.id}-mobile-${userWithPhone.loginCount ?? 0}`}
                            disabled={isUpdating}
                            onClick={(e) => e.stopPropagation()}
                            onBlur={(e) =>
                              handleLoginCountSave(
                                user.id,
                                e.target.value,
                                userWithPhone.loginCount ?? 0
                              )
                            }
                            onKeyDown={(e) => {
                              if (e.key === "Enter") e.currentTarget.blur();
                            }}
                            className="w-12 px-1 py-0.5 text-xs border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-primary disabled:bg-gray-100"
                            aria-label="Số lần đăng nhập"
                          />
                          lần ĐN
                        </span>
                      </span>
                    </div>
                  </div>

                  {/* Actions - Icons Only */}
                  <div className="flex items-center gap-1">
                    <select
                      value={user.role}
                      onChange={async (e) => {
                        const newRole = e.target.value as UserRole;
                        try {
                          await updateUser(user.id, {
                            role: newRole,
                          });
                          toast.success(`Đã chuyển ${user.displayName || userPhone || "Người dùng"} sang ${newRole === "admin" ? "Admin" : newRole === "teacher" ? "Giáo viên" : newRole === "student" ? "Học sinh" : "Vãng lai"}`);
                        } catch (error) {
                          console.error("Error updating user role:", error);
                          toast.error("Chuyển vai trò thất bại. Thử lại.");
                        }
                      }}
                      className="px-1.5 py-1 text-xs border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-primary"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <option value="admin">A</option>
                      <option value="teacher">GV</option>
                      <option value="student">HS</option>
                    </select>

                    {isPhoneAccount && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="p-1.5 text-purple-600 hover:text-purple-700 hover:bg-purple-50"
                        onClick={() => openResetPasswordModal(user)}
                        title="Đặt lại mật khẩu"
                      >
                        <FiKey className="w-3.5 h-3.5" />
                      </Button>
                    )}

                    <Button
                      variant="outline"
                      size="sm"
                      className="p-1.5 text-red-600 hover:text-red-700 hover:bg-red-50"
                      onClick={() => openDeleteModal(user)}
                      title="Xóa tài khoản"
                    >
                      <FiTrash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Pagination */}
      {pagination && pagination.totalPages > 0 && (
        <div className="mt-4 flex flex-col sm:flex-row items-center justify-between gap-3 sm:gap-4">
          <div className="text-xs sm:text-sm text-gray-600 text-center sm:text-left">
            Hiển thị{" "}
            <span className="font-medium">
              {(pagination.page - 1) * pagination.limit + 1}
            </span>{" "}
            đến{" "}
            <span className="font-medium">
              {Math.min(
                pagination.page * pagination.limit,
                pagination.total
              )}
            </span>{" "}
            trong tổng số <span className="font-medium">{pagination.total}</span>{" "}
            người dùng
          </div>
          <Pagination
            currentPage={pagination.page}
            totalPages={pagination.totalPages}
            onPageChange={handlePageChange}
          />
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {selectedUser && (
        <AdminModal
          isOpen={isDeleteModalOpen}
          onClose={closeDeleteModal}
          title="Xác nhận xóa"
          subtitle={selectedUser.displayName || (selectedUser as UserWithOptionalPhone).phone || "Người dùng"}
          size="sm"
        >
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={closeDeleteModal} disabled={isDeleting}>
              Hủy
            </Button>
            <Button
              onClick={handleDeleteUser}
              disabled={isDeleting}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              {isDeleting ? (
                <>
                  <FiLoader className="w-4 h-4 animate-spin mr-2" />
                  Đang xóa...
                </>
              ) : (
                "Xóa"
              )}
            </Button>
          </div>
        </AdminModal>
      )}

      {/* Reset Password Modal */}
      {resetPasswordUser && (
        <AdminModal
          isOpen={isResetPasswordModalOpen}
          onClose={closeResetPasswordModal}
          title="Reset mật khẩu"
          subtitle={resetPasswordUser.displayName || (resetPasswordUser as UserWithOptionalPhone).phone || "Người dùng"}
          size="sm"
        >
          <div className="space-y-4">
            <div className="relative">
              <input
                type="text"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder={`Mật khẩu mới (6-8 ký tự)`}
                className="w-full px-4 py-2 pr-11 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary text-sm"
                disabled={isResettingPassword}
              />
              <PasteButton
                onPaste={setNewPassword}
                trimOnPaste
                disabled={isResettingPassword}
              />
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={closeResetPasswordModal} disabled={isResettingPassword}>
                Hủy
              </Button>
              <Button
                onClick={handleResetPassword}
                disabled={!newPassword.trim() || isResettingPassword}
              >
                {isResettingPassword ? (
                  <>
                    <FiLoader className="w-4 h-4 animate-spin mr-2" />
                    Đang reset...
                  </>
                ) : (
                  "Reset"
                )}
              </Button>
            </div>
          </div>
        </AdminModal>
      )}

      {/* Create User Modal */}
      <AdminModal
        isOpen={isCreateUserModalOpen}
        onClose={closeCreateUserModal}
        title="Tạo tài khoản"
        size="lg"
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleCreateUser();
          }}
          className="space-y-4"
        >
          {createError && (
            <div className="bg-red-50 border-l-4 border-red-400 p-4 rounded-md">
              <div className="flex">
                <div className="flex-shrink-0">
                  <svg className="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                  </svg>
                </div>
                <div className="ml-3">
                  <p className="text-sm text-red-700">{createError}</p>
                </div>
              </div>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Loại tài khoản <span className="text-red-500">*</span>
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => {
                  setCreateRole(UserRole.STUDENT);
                  setCreateError("");
                }}
                disabled={isCreatingUser}
                className={`px-3 py-2 text-sm rounded-lg border transition-colors ${createRole === UserRole.STUDENT
                    ? "bg-primary/10 border-primary text-primary font-medium"
                    : "bg-white border-gray-300 text-gray-700 hover:bg-gray-50"
                  } disabled:opacity-50 disabled:cursor-not-allowed`}
              >
                Học sinh
              </button>
              <button
                type="button"
                onClick={() => {
                  setCreateRole(UserRole.TEACHER);
                  setCreateError("");
                }}
                disabled={isCreatingUser}
                className={`px-3 py-2 text-sm rounded-lg border transition-colors ${createRole === UserRole.TEACHER
                    ? "bg-primary/10 border-primary text-primary font-medium"
                    : "bg-white border-gray-300 text-gray-700 hover:bg-gray-50"
                  } disabled:opacity-50 disabled:cursor-not-allowed`}
              >
                Giáo viên
              </button>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {createRole === UserRole.STUDENT ? "Họ tên học sinh" : "Họ tên giáo viên"}{" "}
              <span className="text-red-500">*</span>
            </label>
            <PasteInput
              type="text"
              value={createDisplayName}
              onValueChange={(v) => {
                setCreateDisplayName(v);
                setCreateError("");
              }}
              placeholder="Nhập họ tên"
              required
              disabled={isCreatingUser}
              trimOnPaste
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {createRole === UserRole.STUDENT && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  SĐT phụ huynh <span className="text-red-500">*</span>
                </label>
                <PasteInput
                  type="text"
                  value={createParentPhone}
                  onValueChange={(v) => {
                    setCreateParentPhone(v);
                    setCreateError("");
                  }}
                  placeholder="0901234567"
                  leftSlot={<FiPhone className="h-5 w-5" />}
                  required
                  disabled={isCreatingUser}
                  trimOnPaste
                />
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {createRole === UserRole.STUDENT
                  ? "SĐT học sinh (để trống = lấy SĐT phụ huynh)"
                  : "SĐT giáo viên"}{" "}
                {createRole === UserRole.TEACHER && (
                  <span className="text-red-500">*</span>
                )}
              </label>
              <PasteInput
                type="text"
                value={createPhone}
                onValueChange={(v) => {
                  setCreatePhone(v);
                  setCreateError("");
                }}
                placeholder="0901234567"
                leftSlot={<FiPhone className="h-5 w-5" />}
                required={createRole === UserRole.TEACHER}
                disabled={isCreatingUser}
                trimOnPaste
              />
            </div>
          </div>


          {createRole === UserRole.STUDENT && (() => {
            const currentYear = new Date().getFullYear();
            const yearOptions: number[] = [];
            for (let y = currentYear; y >= currentYear - 20; y--) {
              yearOptions.push(y);
            }
            const parsedYear = createBirthYear ? Number(createBirthYear) : null;
            const previewGrade = parsedYear ? calculateCurrentGrade(parsedYear) : null;
            return (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Năm sinh
                </label>
                <div className="flex items-center gap-2">
                  <select
                    value={createBirthYear}
                    onChange={(e) => {
                      setCreateBirthYear(e.target.value);
                      setCreateError("");
                    }}
                    disabled={isCreatingUser}
                    className="flex-1 min-w-0 px-3 py-2 border border-gray-300 rounded-lg bg-white focus:ring-2 focus:ring-primary focus:border-primary text-sm"
                  >
                    <option value="">-- Chọn năm sinh --</option>
                    {yearOptions.map((y) => (
                      <option key={y} value={y}>
                        {y}
                      </option>
                    ))}
                  </select>
                  <span className="text-sm text-gray-600 whitespace-nowrap min-w-[80px]">
                    {previewGrade ? `Lớp ${previewGrade}` : "Lớp —"}
                  </span>
                </div>
                <p className="mt-1 text-xs text-gray-500">
                  Tự động tính lớp theo năm học (mốc tháng 8).
                </p>
              </div>
            );
          })()}

          <div>
            <AddressSelector
              value={createAddress}
              onChange={(address) => {
                setCreateAddress(address);
                setCreateError("");
              }}
              label="Địa chỉ"
              className=""
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Địa chỉ chi tiết
            </label>
            <PasteInput
              type="text"
              value={createAddressDetail}
              onValueChange={(v) => {
                setCreateAddressDetail(v);
                setCreateError("");
              }}
              placeholder="Số nhà, tên đường..."
              disabled={isCreatingUser}
              trimOnPaste
            />
          </div>

          <div className="flex justify-end gap-2 pt-4 border-t border-gray-200">
            <Button variant="outline" onClick={closeCreateUserModal} disabled={isCreatingUser}>
              Hủy
            </Button>
            <Button
              type="submit"
              disabled={
                isCreatingUser ||
                !createDisplayName.trim() ||
                (createRole === UserRole.STUDENT
                  ? !createParentPhone.trim()
                  : !createPhone.trim())
              }
            >
              {isCreatingUser ? (
                <>
                  <FiLoader className="w-4 h-4 animate-spin mr-2" />
                  Đang tạo...
                </>
              ) : (
                "Tạo tài khoản"
              )}
            </Button>
          </div>
        </form>
      </AdminModal>
    </div>
  );
}
