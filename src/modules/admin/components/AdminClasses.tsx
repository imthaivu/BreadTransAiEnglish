"use client";

import { Button } from "@/components/ui/Button";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import { useState } from "react";
import { FiEdit, FiPlus, FiTrash2, FiRefreshCw, FiBookOpen } from "react-icons/fi";
import {
  useClasses,
  useCreateClass,
  useDeleteClass,
} from "../hooks/useClassManagement";
import { useTeachers } from "../hooks/useTeacherManagement";
import { ClassStatus, IClass } from "../type";
import { ClassDetailModal } from "./ClassDetailModal";
import {
  AdminForm,
  AdminFormField,
  AdminModal,
  AdminTable,
  AdminTableColumn,
} from "./common";
const NOTE_PREVIEW_LENGTH = 25;

export default function AdminClasses() {
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [, setIsDeleteModalOpen] = useState(false);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [selectedClass, setSelectedClass] = useState<IClass | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [notePreview, setNotePreview] = useState<string | null>(null);

  // Use the new hooks
  const { data: classes = [], isLoading } = useClasses();
  const { mutateAsync: createClass, isPending: isCreating } = useCreateClass();
  const { mutateAsync: deleteClass } = useDeleteClass();

  const { data: teachers = [], isLoading: isLoadingTeachers } = useTeachers();

  const handleCreateClass = async (data: {
    name: string;
    teacherId?: string;
    teacherIds?: string[];
    zaloLink?: string;
    meetLink?: string;
  }) => {
    const teacherIds = data.teacherIds || (data.teacherId ? [data.teacherId] : []);
    await createClass({
      name: data.name,
      status: ClassStatus.ACTIVE,
      teacherIds: teacherIds.length > 0 ? teacherIds : undefined,
      zaloLink: data.zaloLink,
      meetLink: data.meetLink,
    });
    setIsCreateModalOpen(false);
  };

  const handleDeleteClass = async () => {
    if (!selectedClass) return;
    await deleteClass(selectedClass.id);
    setIsDeleteModalOpen(false);
    setSelectedClass(null);
  };

  const openDeleteModal = (classItem: IClass) => {
    setSelectedClass(classItem);
    setConfirmOpen(true);
  };

  const openDetailModal = (classItem: IClass) => {
    setSelectedClass(classItem);
    setIsDetailModalOpen(true);
  };

  const openNoteModal = (note: string) => {
    setNotePreview(note);
  };

  const closeNoteModal = () => {
    setNotePreview(null);
  };

  const closeModal = () => {
    setIsCreateModalOpen(false);
    setIsDeleteModalOpen(false);
    setIsDetailModalOpen(false);
    setSelectedClass(null);
    setNotePreview(null);
  };

  // Table columns configuration
  const columns: AdminTableColumn<IClass>[] = [
    {
      key: "class",
      title: "Lớp học",
      render: (_, classItem) => (
        <div className="flex items-center">
          <div className="relative flex-shrink-0">
            <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
              <FiBookOpen className="w-5 h-5 text-primary" />
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                openDetailModal(classItem);
              }}
              title="Chi tiết/Sửa"
              className="absolute -bottom-1 -right-1 h-5 w-5 p-0 rounded-full bg-white border border-gray-300 shadow-sm hover:bg-gray-50 flex items-center justify-center"
            >
              <FiEdit className="w-3 h-3" />
            </Button>
          </div>
          <div className="ml-4">
            <div className="text-sm md:text-base font-medium text-gray-900">
              {classItem.name}
            </div>
          </div>
        </div>
      ),
    },
    {
      key: "teacher",
      title: "Giáo viên",
      render: (_, classItem) => {
        const teachers = classItem.teachers || [];
        return (
          <div className="text-sm md:text-base text-gray-900">
            {teachers.length === 0 ? (
              <span className="text-gray-400 italic">Chưa có giáo viên</span>
            ) : (
              <div className="space-y-1">
                {teachers.map((teacher, index) => (
                  <div key={teacher.id || index} className="font-medium">
                    {teacher.name}
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      },
    },
    {
      key: "students",
      title: "Số học sinh",
      className: "hidden lg:table-cell",
      render: (_, classItem) => {
        // Use students[] array to get student count
        const studentCount = Array.isArray(classItem.students) ? classItem.students.length : null;
        return (
          <div className="text-sm md:text-base text-gray-900">
            {studentCount !== null ? (
              <span className="font-medium">{studentCount}</span>
            ) : (
              <span className="text-gray-400">-</span>
            )}
          </div>
        );
      },
    },
    {
      key: "noteProcess",
      title: "Ghi chú quá trình",
      render: (_, classItem) => {
        const note = classItem.noteProcess || "";
        const isLong = note.length > NOTE_PREVIEW_LENGTH;
        const preview = isLong ? note.substring(0, NOTE_PREVIEW_LENGTH) + "..." : note;

        return (
          <div className="max-w-xs">
            {note ? (
              <div className="space-y-1">
                <div className="text-sm text-gray-700 break-words">
                  {preview}
                </div>
                {isLong && (
                  <button
                    type="button"
                    onClick={() => openNoteModal(note)}
                    className="text-xs font-medium text-primary hover:underline focus:outline-none"
                  >
                    Xem thêm
                  </button>
                )}
              </div>
            ) : (
              <span className="text-sm text-gray-400 italic">Chưa có ghi chú</span>
            )}
          </div>
        );
      },
    },
    {
      key: "actions",
      title: "Thao tác",
      render: (_, classItem) => (
        <div className="flex flex-wrap gap-2">
          <Button
            className="text-red-600 hover:text-red-700 flex items-center gap-1"
            variant="outline"
            size="sm"
            onClick={() => openDeleteModal(classItem)}
            title="Xóa"
          >
            <FiTrash2 className="w-4 h-4" />
          </Button>
        </div>
      ),
    },
  ];

  // Form fields configuration
  const formFields: AdminFormField[] = [
    { name: "name", label: "Tên lớp học", type: "text", required: true },
    {
      name: "teacherId",
      label: "Giáo viên",
      type: "select",
      required: true,
      options: isLoadingTeachers
        ? [{ value: "", label: "Đang tải..." }]
        : teachers.map((teacher) => ({
            value: teacher.id,
            label: `${teacher.displayName || "Chưa có tên"}${teacher.phone ? ` - ${teacher.phone}` : ""}`,
          })),
    },
    { name: "zaloLink", label: "Link Zalo", type: "text" },
    { name: "meetLink", label: "Link Google Meet", type: "text" },
  ];

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="mb-4">
        <h1 className="text-xl sm:text-2xl font-bold">Lớp học</h1>
      </div>

      {/* Create Button */}
      <div className="bg-white p-3 rounded-lg mb-4">
        <div className="flex flex-col sm:flex-row gap-2 sm:gap-3">
          <Button 
            onClick={() => setIsCreateModalOpen(true)}
            className="flex items-center justify-center gap-1.5 sm:gap-2 px-2 sm:px-3 py-1.5 sm:py-2 whitespace-nowrap"
            size="sm"
          >
            <FiPlus className="w-4 h-4" />
            <span className="hidden sm:inline">Tạo lớp học</span>
            <span className="sm:hidden">Tạo lớp</span>
          </Button>
        </div>
      </div>

      {/* Classes Table - Desktop */}
      <div className="hidden md:block">
        <AdminTable
          columns={columns}
          data={classes}
          loading={isLoading}
        />
      </div>

      {/* Classes Cards - Mobile (compact row-column layout) */}
      <div className="md:hidden space-y-2">
        {isLoading ? (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 text-center">
            <div className="flex justify-center items-center">
              <FiRefreshCw className="animate-spin h-5 w-5 text-primary" />
              <span className="ml-2 text-sm text-gray-600">Đang tải</span>
            </div>
          </div>
        ) : classes.length === 0 ? (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 text-center text-sm text-gray-500">
            Không có dữ liệu
          </div>
        ) : (
          classes.map((classItem) => (
            <div
              key={classItem.id}
              className="bg-white rounded-lg shadow-sm border border-gray-200 p-3"
            >
              {/* Row 1: Icon + Name + Edit + Delete */}
              <div className="flex items-center gap-2">
                <div className="relative flex-shrink-0">
                  <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
                    <FiBookOpen className="w-4 h-4 text-primary" />
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => openDetailModal(classItem)}
                    title="Chi tiết/Sửa"
                    className="absolute -bottom-0.5 -right-0.5 h-4 w-4 p-0 rounded-full bg-white border border-gray-300 shadow-sm hover:bg-gray-50 flex items-center justify-center min-w-0"
                  >
                    <FiEdit className="w-2.5 h-2.5" />
                  </Button>
                </div>
                <h3 className="flex-1 min-w-0 text-sm font-medium text-gray-900 truncate">
                  {classItem.name}
                </h3>
                <Button
                  className="text-red-600 hover:text-red-700 flex-shrink-0 p-1.5 min-w-0"
                  variant="outline"
                  size="sm"
                  onClick={() => openDeleteModal(classItem)}
                  title="Xóa"
                >
                  <FiTrash2 className="w-3.5 h-3.5" />
                </Button>
              </div>

              {/* Row 2: GV | HS (2 cols) */}
              <div className="mt-1.5 grid grid-cols-2 gap-x-3 text-xs">
                <div className="min-w-0">
                  <span className="text-gray-500">GV:</span>{" "}
                  <span className="font-medium text-gray-900 truncate">
                    {classItem.teachers && classItem.teachers.length > 0
                      ? classItem.teachers.map(t => t.name).join(", ")
                      : "-"}
                  </span>
                </div>
                <div>
                  <span className="text-gray-500">HS:</span>{" "}
                  <span className="font-medium text-gray-900">
                    {Array.isArray(classItem.students) ? classItem.students.length : "-"}
                  </span>
                </div>
              </div>

              {/* Row 3: Ghi chú (compact) */}
              <div className="mt-1 text-xs min-w-0">
                <span className="text-gray-500">Ghi chú:</span>{" "}
                {classItem.noteProcess ? (
                  classItem.noteProcess.length > NOTE_PREVIEW_LENGTH ? (
                    <>
                      <span className="text-gray-700">{classItem.noteProcess.substring(0, NOTE_PREVIEW_LENGTH)}...</span>
                      <button
                        type="button"
                        onClick={() => openNoteModal(classItem.noteProcess || "")}
                        className="text-primary hover:underline ml-0.5"
                      >
                        Xem
                      </button>
                    </>
                  ) : (
                    <span className="text-gray-700">{classItem.noteProcess}</span>
                  )
                ) : (
                  <span className="text-gray-400 italic">không có</span>
                )}
              </div>

            </div>
          ))
        )}
      </div>

      {/* Create Modal */}
      <AdminModal
        isOpen={isCreateModalOpen}
        onClose={closeModal}
        title="Tạo lớp học mới"
      >
        <AdminForm
          fields={formFields}
          defaultValues={{
            name: "",
            teacherId: "",
            zaloLink: "",
            meetLink: "",
          }}
          onSubmit={handleCreateClass}
          isLoading={isCreating}
          onCancel={closeModal}
          submitText="Tạo lớp học"
        />
      </AdminModal>

      {/* Delete Confirmation */}
      <ConfirmDialog
        isOpen={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={handleDeleteClass}
        title="Xác nhận xóa"
        message={`Xóa lớp học "${selectedClass?.name || ""}"? Không thể hoàn tác.`}
        confirmText="Xóa"
        cancelText="Hủy"
        confirmVariant="warning"
      />

      {/* Class Detail/Edit Modal */}
      {selectedClass && isDetailModalOpen && (
        <ClassDetailModal
          classItem={selectedClass}
          isOpen={isDetailModalOpen}
          onClose={closeModal}
        />
      )}

      <AdminModal
        isOpen={Boolean(notePreview)}
        onClose={closeNoteModal}
        title="Ghi chú quá trình"
        size="md"
      >
        <div className="text-sm text-gray-700 whitespace-pre-wrap break-words">
          {notePreview}
        </div>
      </AdminModal>
    </div>
  );
}
