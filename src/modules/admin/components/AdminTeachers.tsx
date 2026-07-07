"use client";

import { IProfile } from "@/types";
import { motion } from "framer-motion";
import { useState } from "react";
import { FiEdit, FiUser, FiCopy } from "react-icons/fi";
import { Button } from "@/components/ui/Button";
import { useTeacherManagement } from "../hooks/useTeacherManagement";
import {
  AdminForm,
  AdminFormField,
  AdminModal,
  AdminTable,
  AdminTableColumn,
} from "./common";
import { SafeImage as Image } from "@/components/ui/SafeImage";
import { getStorageBucket } from "@/lib/firebase/client";
import { ref, uploadBytes, getDownloadURL, deleteObject, listAll } from "firebase/storage";
import toast from "react-hot-toast";
import { compressAndResizeImage } from "@/utils/image";

// Extended interface for Teacher
interface ITeacher extends IProfile {
  phone?: string;
  address?: string;
  addressDetail?: string;
  specialization?: string;
  experience?: number;
  note?: string;
}

export default function AdminTeachers() {
  const [isDetailEditOpen, setIsDetailEditOpen] = useState(false);
  const [activeTeacher, setActiveTeacher] = useState<ITeacher | null>(null); // For detail/edit modal
  const [avatarUploading, setAvatarUploading] = useState<string | null>(null);
  const [quickNoteTeacher, setQuickNoteTeacher] = useState<ITeacher | null>(null);
  const [quickNote, setQuickNote] = useState("");
  const [isQuickNoteSaving, setIsQuickNoteSaving] = useState(false);

  // Use the teacher management hook
  const {
    teachers,
    isLoading,
    error,
    updateTeacher,
    isUpdating,
  } = useTeacherManagement();

  const handleUpdateTeacher = async (teacherData: {
    displayName?: string;
    email?: string;
    phone?: string;
    address?: string;
    addressDetail?: string;
    note?: string;
  }) => {
    if (!activeTeacher) return;

    try {
      await updateTeacher(activeTeacher.id, teacherData);
      setIsDetailEditOpen(false);
      setActiveTeacher(null);
    } catch (error) {
      console.error("Error updating teacher:", error);
    }
  };

  const openQuickNoteModal = (teacher: ITeacher) => {
    setQuickNoteTeacher(teacher);
    setQuickNote(teacher.note || "");
  };

  const closeQuickNoteModal = () => {
    setQuickNoteTeacher(null);
    setQuickNote("");
  };

  const handleQuickNoteSave = async () => {
    if (!quickNoteTeacher) return;

    try {
      setIsQuickNoteSaving(true);
      await updateTeacher(quickNoteTeacher.id, { note: quickNote });
      toast.success("Đã cập nhật ghi chú giáo viên");
      closeQuickNoteModal();
    } catch (error) {
      console.error("Error updating teacher note:", error);
      toast.error("Không thể cập nhật ghi chú. Vui lòng thử lại.");
    } finally {
      setIsQuickNoteSaving(false);
    }
  };

  const handleAvatarUpload = async (file: File | null, teacherId: string) => {
    if (!file || !teacherId) return;

    const toastId = toast.loading("Đang xử lý và tải ảnh lên...");
    setAvatarUploading(teacherId);
    try {
      // Compress and resize image before upload
      const compressedFile = await compressAndResizeImage(file, 400, 400, 0.85);
      
      const storage = getStorageBucket();
      
      // Delete all old avatar files in the folder before uploading new one
      const avatarFolderRef = ref(storage, `users/${teacherId}/avatar`);
      try {
        const oldFiles = await listAll(avatarFolderRef);
        if (oldFiles.items.length > 0) {
          const deletePromises = oldFiles.items.map((item) => deleteObject(item));
          await Promise.all(deletePromises);
        }
      } catch (deleteError: unknown) {
        // Ignore errors - folder might not exist or already empty
      }
      
      // Use fixed filename to ensure only one avatar exists (always jpg after compression)
      const path = `users/${teacherId}/avatar/avatar.jpg`;
      const storageRef = ref(storage, path);
      await uploadBytes(storageRef, compressedFile);
      const url = await getDownloadURL(storageRef);
      
      // Use updateTeacher from hook to ensure data refresh
      await updateTeacher(teacherId, {
        avatarUrl: url,
      });
      
      toast.success("Cập nhật ảnh đại diện thành công!", { id: toastId });
      
      // Update active teacher state
      if (activeTeacher?.id === teacherId) {
        setActiveTeacher({ ...activeTeacher, avatarUrl: url });
      }
    } catch (error) {
      console.error(error);
      toast.error("Đã có lỗi xảy ra khi tải ảnh.", { id: toastId });
    } finally {
      setAvatarUploading(null);
    }
  };

  // Table columns configuration
  const columns: AdminTableColumn<ITeacher>[] = [
    {
      key: "teacher",
      title: "Giáo viên",
      render: (_, teacher) => (
        <div className="flex items-center min-w-0">
          <div className="flex-shrink-0 h-8 w-8 sm:h-10 sm:w-10 relative">
            {teacher.avatarUrl ? (
              <Image
                src={teacher.avatarUrl}
                alt={teacher.displayName || "Avatar"}
                width={40}
                height={40}
                sizes="(max-width: 640px) 32px, 40px"
                className="h-8 w-8 sm:h-10 sm:w-10 rounded-full object-cover"
              />
            ) : (
              <div className="h-8 w-8 sm:h-10 sm:w-10 rounded-full  bg-primary/10 flex items-center justify-center">
                <FiUser className="w-4 h-4 sm:w-5 sm:h-5 text-primary" />
              </div>
            )}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setActiveTeacher(teacher);
                setIsDetailEditOpen(true);
              }}
              title="Sửa giáo viên"
              className="absolute -bottom-0.5 -right-0.5 w-4 h-4 sm:w-5 sm:h-5 rounded-full bg-white shadow-md border border-gray-200 flex items-center justify-center hover:bg-gray-50 transition-colors z-10"
            >
              <FiEdit className="w-2 h-2 sm:w-3 sm:h-3 text-gray-600" />
            </button>
          </div>
          <div className="ml-2 sm:ml-4 min-w-0 flex-1">
            <div className="text-xs sm:text-sm md:text-base font-medium text-gray-900 truncate">
              {teacher.displayName || "Chưa có tên"}
            </div>
          </div>
        </div>
      ),
    },
    {
      key: "phone",
      title: "Số điện thoại",
      className: "",
      render: (_, teacher) => (
        <span className="text-sm text-gray-900">
          {teacher.phone || "-"}
        </span>
      ),
    },
    {
      key: "note",
      title: "Ghi chú",
      className: "",
      render: (_, teacher) => (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            openQuickNoteModal(teacher);
          }}
          className="text-left w-full"
          title={teacher.note || "Nhấn để thêm/sửa ghi chú"}
        >
          <span className="text-xs sm:text-sm text-gray-700 truncate inline-block max-w-[250px]">
            {teacher.note && teacher.note.trim().length > 0 ? (
              teacher.note
            ) : (
              <span className="italic text-gray-400">Thêm ghi chú</span>
            )}
          </span>
        </button>
      ),
    },
  ];

  // Form fields configuration
  const editFormFields: AdminFormField[] = [
    {
      name: "displayName",
      label: "Tên hiển thị",
      type: "text",
      required: true,
      validation: {
        required: "Tên hiển thị là bắt buộc",
        minLength: {
          value: 2,
          message: "Tên hiển thị phải có ít nhất 2 ký tự",
        },
      },
    },
    {
      name: "phone",
      label: "Số điện thoại",
      type: "text",
      validation: {
        pattern: {
          value: /^[0-9]{10}$/,
          message: "Số điện thoại phải có 10 chữ số",
        },
      },
    },
    {
      name: "address",
      label: "Địa chỉ",
      type: "address",
    },
    {
      name: "addressDetail",
      label: "Địa chỉ chi tiết",
      type: "text",
      placeholder: "Số nhà, tên đường, tòa nhà, v.v.",
    },
    {
      name: "note",
      label: "Ghi chú",
      type: "textarea",
      rows: 4,
      placeholder: "Nhập ghi chú về giáo viên...",
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center justify-between mb-4"
      >
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900">
            Giáo viên
          </h1>
          
        </div>
      </motion.div>


      {/* Error State */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <div className="flex">
            <div className="ml-3">
              <h3 className="text-sm md:text-base font-medium text-red-800">
                Có lỗi xảy ra khi tải dữ liệu
              </h3>
              <div className="mt-2 text-sm md:text-base text-red-700">
                <p>{error.message || "Vui lòng thử lại sau"}</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Teachers Table */}
      <AdminTable
        columns={columns}
        data={teachers}
        loading={isLoading}
        emptyMessage="Không có giáo viên nào"
        showCheckbox={false}
      />

      {/* Quick Note Edit Modal */}
      {quickNoteTeacher && (
        <AdminModal
          isOpen={!!quickNoteTeacher}
          onClose={closeQuickNoteModal}
          title={`Ghi chú cho ${quickNoteTeacher.displayName || "giáo viên"}`}
          size="md"
        >
          <div className="space-y-4 p-1 sm:p-2">
            <div>
              <label
                htmlFor="teacher-note"
                className="block text-sm font-medium text-gray-700 mb-1"
              >
                Ghi chú
              </label>
              <textarea
                id="teacher-note"
                value={quickNote}
                onChange={(e) => setQuickNote(e.target.value)}
                rows={4}
                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-primary focus:border-primary sm:text-sm"
                placeholder="Nhập ghi chú cho giáo viên..."
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button
                variant="outline"
                type="button"
                onClick={closeQuickNoteModal}
                disabled={isQuickNoteSaving}
              >
                Hủy
              </Button>
              <Button
                type="button"
                onClick={handleQuickNoteSave}
                disabled={isQuickNoteSaving}
              >
                {isQuickNoteSaving ? "Đang lưu..." : "Lưu"}
              </Button>
            </div>
          </div>
        </AdminModal>
      )}

      {/* Unified Detail/Edit Modal */}
      {activeTeacher && (
        <AdminModal
          isOpen={isDetailEditOpen}
          onClose={() => {
            setIsDetailEditOpen(false);
            setActiveTeacher(null);
          }}
          title="Sửa giáo viên"
          size="lg"
        >
          {/* Avatar Section */}
          <div className="flex flex-col items-center mb-4 sm:mb-6">
            <div className="relative">
              {activeTeacher.avatarUrl ? (
                <Image
                  src={activeTeacher.avatarUrl}
                  alt={activeTeacher.displayName || "Avatar"}
                  width={96}
                  height={96}
                  sizes="96px"
                  className="w-24 h-24 rounded-full object-cover"
                />
              ) : (
                <div className="w-24 h-24 rounded-full  bg-primary/10 flex items-center justify-center">
                  <FiUser className="w-12 h-12 text-primary" />
                </div>
              )}
              <button
                type="button"
                onClick={() => {
                  const fileInput = document.getElementById(`avatar-upload-${activeTeacher.id}`) as HTMLInputElement;
                  fileInput?.click();
                }}
                disabled={avatarUploading === activeTeacher.id}
                title="Đổi ảnh đại diện"
                className="absolute -bottom-1 -right-1 px-2 h-6 rounded-full bg-white shadow-md border border-gray-200 flex items-center justify-center hover:bg-gray-50 transition-colors"
              >
                {avatarUploading === activeTeacher.id ? (
                  <div className="w-4 h-4 border-2 border-gray-300 border-t-blue-600 rounded-full animate-spin" />
                ) : (
                  <span className="text-xs font-medium text-blue-400">Đổi</span>
                )}
              </button>
            </div>
            <input
              type="file"
              accept="image/*"
              id={`avatar-upload-${activeTeacher.id}`}
              className="sr-only"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file && activeTeacher.id) {
                  handleAvatarUpload(file, activeTeacher.id);
                }
              }}
            />
            <div className="mt-4 text-sm font-medium text-gray-500 bg-gray-50 px-3 py-1.5 rounded-md border border-gray-200 flex items-center gap-2">
              <span>ID: {activeTeacher.id}</span>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  navigator.clipboard.writeText(activeTeacher.id);
                  toast.success("Đã copy ID");
                }}
                className="text-gray-400 hover:text-gray-600 transition-colors"
                title="Copy ID"
              >
                <FiCopy className="w-4 h-4" />
              </button>
            </div>
          </div>

          <AdminForm
            fields={editFormFields}
            defaultValues={{
              displayName: activeTeacher?.displayName || "",
              phone: activeTeacher?.phone || "",
              address: activeTeacher?.address || "",
              addressDetail: activeTeacher?.addressDetail || "",
              note: activeTeacher?.note || "",
            }}
            onSubmit={async (data) => {
              await handleUpdateTeacher(data);
            }}
            isLoading={isUpdating}
            onCancel={() => {
              setIsDetailEditOpen(false);
              setActiveTeacher(null);
            }}
          />
        </AdminModal>
      )}
    </div>
  );
}
