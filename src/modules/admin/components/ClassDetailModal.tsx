"use client";

import { Button } from "@/components/ui/Button";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import { IClass, IClassTeacher } from "@/modules/admin/type";
import { IClassMember, IProfile, IStudent } from "@/types";
import { useEffect, useState, useRef, useMemo } from "react";
import toast from "react-hot-toast";
import {
  FiChevronDown,
  FiPlus,
  FiSave,
  FiTrash2,
  FiPhone,
  FiUser,
  FiCalendar,
} from "react-icons/fi";
import {
  useAddStudentToClass,
  useClassMembers,
  useRemoveMemberFromClass,
  useUpdateClass,
  useUpdateClassMember,
} from "../hooks/useClassManagement";
import {
  useStudent,
  useStudents,
  useUpdateStudent,
} from "../hooks/useStudentManagement";
import {
  useTeachers,
} from "../hooks/useTeacherManagement";
import { UpdateStudentData } from "../services/student.service";
import {
  AdminForm,
  AdminFormField,
  PasteButton,
} from "./common";
import AdminModal from "./common/AdminModal";
import { SafeImage as Image } from "@/components/ui/SafeImage";
import { ProfileAvatarLink } from "@/components/ui/ProfileAvatarLink";

interface ClassDetailModalProps {
  classItem: IClass;
  isOpen: boolean;
  onClose: () => void;
}

// Sub-component for managing teachers
function TeacherManager({
  classItem,
  teacherIds,
  onTeacherIdsChange,
  teachers,
  isLoadingTeachers,
}: {
  classItem: IClass;
  teacherIds: string[];
  onTeacherIdsChange: (ids: string[]) => void;
  teachers: IProfile[];
  isLoadingTeachers: boolean;
}) {
  const { data: members = [] } = useClassMembers(
    classItem.id as unknown as string
  );
  const { mutateAsync: updateClass, isPending: isUpdating } = useUpdateClass();
  const { mutateAsync: removeMember, isPending: isRemoving } =
    useRemoveMemberFromClass();

  const [teacherDropdownOpen, setTeacherDropdownOpen] = useState(false);
  const teacherDropdownRef = useRef<HTMLDivElement>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [teacherToDelete, setTeacherToDelete] = useState<IClassMember | null>(
    null
  );

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (teacherDropdownRef.current && !teacherDropdownRef.current.contains(event.target as Node)) {
        setTeacherDropdownOpen(false);
      }
    };

    if (teacherDropdownOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [teacherDropdownOpen]);

  // Filter out teachers already in the class
  const availableTeachers = useMemo(() => {
    return teachers.filter(
      (teacher) => !teacherIds.includes(teacher.id)
    );
  }, [teachers, teacherIds]);

  const handleToggleTeacher = async (teacherId: string) => {
    try {
      const newTeacherIds = [...teacherIds, teacherId];
      const newTeachers: IClassTeacher[] = teachers
        .filter((t) => newTeacherIds.includes(t.id))
        .map((t) => {
          const teacherWithImage = t as IProfile & { image?: string };
          return {
            id: t.id,
            name: t.displayName || t.phone || "N/A",
            avatarUrl: t.avatarUrl || teacherWithImage.image || "",
            phone: (t as unknown as { phone?: string }).phone || "",
          };
        });

      await updateClass({
        classId: classItem.id as unknown as string,
        classData: {
          teachers: newTeachers,
        },
      });
      onTeacherIdsChange(newTeacherIds);
      toast.success("Đã thêm giáo viên vào lớp");
    } catch (error) {
      toast.error("Thêm giáo viên thất bại. Vui lòng thử lại.");
    }
  };

  const teacherMembers = members.filter((m) => m.role === "teacher");

  return (
    <div className="space-y-3 sm:space-y-4">
      <h4 className="text-sm sm:text-base font-medium">Thêm giáo viên</h4>
      <div className="space-y-2">
        <div className="relative" ref={teacherDropdownRef}>
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              setTeacherDropdownOpen(!teacherDropdownOpen);
            }}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-left text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary flex items-center justify-between"
          >
            <span className="text-gray-700">
              {availableTeachers.length === 0
                ? "Không còn giáo viên nào để thêm"
                : "Chọn giáo viên để thêm vào lớp..."}
            </span>
            <FiChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${teacherDropdownOpen ? "rotate-180" : ""}`} />
          </button>
          
          {teacherDropdownOpen && (
            <div className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg max-h-60 overflow-y-auto">
              {isLoadingTeachers ? (
                <div className="p-3 text-sm text-gray-500">Đang tải...</div>
              ) : availableTeachers.length === 0 ? (
                <div className="p-3 text-sm text-gray-500">Không còn giáo viên nào để thêm</div>
              ) : (
                <div className="p-2">
                  {availableTeachers.map((t) => {
                    const teacherWithImage = t as IProfile & { image?: string };
                    const teacherAvatar = t.avatarUrl || teacherWithImage.image || "";
                    return (
                      <label
                        key={t.id}
                        className="flex items-center gap-3 p-2 rounded-lg cursor-pointer hover:bg-gray-50"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleToggleTeacher(t.id);
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={false}
                          onChange={() => handleToggleTeacher(t.id)}
                          className="w-4 h-4 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500"
                          onClick={(e) => e.stopPropagation()}
                        />
                        <div className="relative h-8 w-8 flex-shrink-0">
                          {teacherAvatar ? (
                            <Image
                              src={teacherAvatar}
                              alt={t.displayName || t.email || "teacher"}
                              className="rounded-full object-cover"
                              fill
                              sizes="32px"
                            />
                          ) : (
                            <div className="h-8 w-8 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-semibold">
                              {(t.displayName || t.email || "?").charAt(0).toUpperCase()}
                            </div>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium text-gray-900">
                            {t.displayName || t.email || "N/A"}
                          </div>
                          {t.phone && (
                            <div className="text-xs text-gray-500 truncate">
                              {t.phone}
                            </div>
                          )}
                        </div>
                      </label>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <div>
        <h4 className="text-sm sm:text-base font-medium mb-2">
          Danh sách giáo viên ({teacherMembers.length})
        </h4>
        {teacherMembers.length === 0 ? (
          <p className="text-sm text-gray-500">Chưa có giáo viên nào</p>
        ) : (
          <div className="space-y-2">
            {teacherMembers.map((member: IClassMember) => (
              <div
                key={member.id}
                className="flex items-center justify-between p-2 rounded-lg border border-gray-200 hover:bg-gray-50"
              >
                <div className="min-w-0 flex-1 flex items-center gap-2">
                  <ProfileAvatarLink
                    userId={member.id}
                    className="relative h-8 w-8 flex-shrink-0 rounded-full overflow-hidden"
                    ariaLabel={`Hồ sơ ${member.name}`}
                  >
                    {member.avatarUrl ? (
                      <Image
                        src={member.avatarUrl}
                        alt={member.name}
                        className="rounded-full object-cover"
                        fill
                        sizes="32px"
                      />
                    ) : (
                      <div className="h-8 w-8 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-semibold">
                        {(member.name || "?").charAt(0).toUpperCase()}
                      </div>
                    )}
                  </ProfileAvatarLink>
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-gray-900 truncate">
                      {member.name}
                    </div>
                    {member.phone && (
                      <div className="text-xs text-gray-500 truncate">
                        {member.phone}
                      </div>
                    )}
                  </div>
                </div>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => {
                    setTeacherToDelete(member);
                    setConfirmOpen(true);
                  }}
                  disabled={isRemoving || isUpdating}
                  aria-label="Xóa"
                  title="Xóa"
                  className="text-red-600 hover:text-red-700 hover:bg-red-50 flex-shrink-0 ml-2"
                >
                  <FiTrash2 />
                </Button>
              </div>
            ))}
          </div>
        )}
        <ConfirmDialog
          isOpen={confirmOpen}
          onClose={() => setConfirmOpen(false)}
          onConfirm={async () => {
            if (!teacherToDelete) return;
            try {
              // Remove from teachers[] array
              await removeMember({
                classId: classItem.id as unknown as string,
                memberId: teacherToDelete.id,
              });
              // Update class teachers
              const newTeacherIds = teacherIds.filter(id => id !== teacherToDelete.id);
              const updatedTeachers: IClassTeacher[] = teachers
                .filter((t) => newTeacherIds.includes(t.id))
                .map((t) => {
                  const teacherWithImage = t as IProfile & { image?: string };
                  return {
                    id: t.id,
                    name: t.displayName || t.phone || "N/A",
                    avatarUrl: t.avatarUrl || teacherWithImage.image || "",
                    phone: (t as unknown as { phone?: string }).phone || "",
                  };
                });

              await updateClass({
                classId: classItem.id as unknown as string,
                classData: {
                  teachers: updatedTeachers,
                },
              });
              onTeacherIdsChange(newTeacherIds);
              toast.success("Đã xóa giáo viên khỏi lớp");
              setTeacherToDelete(null);
            } catch (error) {
              toast.error("Xóa giáo viên thất bại. Vui lòng thử lại.");
            }
          }}
          title="Xác nhận xóa giáo viên"
          message={`Bạn có chắc muốn xóa "${
            teacherToDelete?.name || "giáo viên"
          }" khỏi lớp?`}
          confirmText="Xóa"
          cancelText="Hủy"
          confirmVariant="warning"
        />
      </div>
    </div>
  );
}

// Sub-component for managing students
function StudentManager({
  classItem,
}: {
  classItem: IClass;
  onOpenStudent: (member: IClassMember) => void;
}) {
  const { data: members = [] } = useClassMembers(
    classItem.id as unknown as string
  );
  const { mutateAsync: addStudent, isPending: isAdding } =
    useAddStudentToClass();
  const { mutateAsync: removeMember, isPending: isRemoving } =
    useRemoveMemberFromClass();

  const [selectedStudentId, setSelectedStudentId] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [memberToDelete, setMemberToDelete] = useState<IClassMember | null>(
    null
  );
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [loadStudents, setLoadStudents] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setDropdownOpen(false);
      }
    };

    if (dropdownOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [dropdownOpen]);

  // Fetch students without a class - only when dropdown is opened
  const {
    data: studentsData,
    isLoading: isLoadingStudents,
    refetch: refetchNoClassStudents,
  } = useStudents({
    page: 1,
    limit: 1000, // Fetch many students without class
    classId: "no-class", // Students without any class
    enabled: loadStudents, // Only fetch when needed
  });
  
  const allStudents = useMemo(() => studentsData?.data || [], [studentsData?.data]);
  
  // Filter out students already in the class
  const memberIds = useMemo(() => new Set(members.map((m) => m.id)), [members]);
  const availableStudents = useMemo(() => {
    return allStudents.filter(
      (student) => !memberIds.has(student.id)
    );
  }, [allStudents, memberIds]);

  const handleAddStudent = async () => {
    if (!selectedStudentId) {
      toast.error("Vui lòng chọn một học sinh");
      return;
    }
    try {
      await addStudent({
        classId: classItem.id as unknown as string,
        studentId: selectedStudentId,
      });
      toast.success("Đã thêm học sinh vào lớp");
      setSelectedStudentId("");
    } catch (error) {
      toast.error("Thêm học sinh thất bại. Vui lòng thử lại.");
    }
  };

  return (
    <div className="space-y-3 sm:space-y-4">
      <h4 className="text-sm sm:text-base font-medium">Thêm học sinh</h4>
      <div className="space-y-2">
        <div className="relative" ref={dropdownRef}>
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              const nextOpen = !dropdownOpen;
              setDropdownOpen(nextOpen);
              if (nextOpen) {
                if (!loadStudents) {
                  setLoadStudents(true);
                } else {
                  void refetchNoClassStudents();
                }
              }
            }}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-left text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary flex items-center justify-between"
          >
            <span className="text-gray-700">
              {selectedStudentId
                ? allStudents.find((s: IStudent) => s.id === selectedStudentId)?.displayName || 
                  allStudents.find((s: IStudent) => s.id === selectedStudentId)?.phone ||
                  "Đã chọn học sinh"
                : availableStudents.length === 0
                ? "Không còn học sinh nào chưa có lớp"
                : "Chọn học sinh chưa có lớp..."}
            </span>
            <FiChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${dropdownOpen ? "rotate-180" : ""}`} />
          </button>
          
          {dropdownOpen && (
            <div className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg max-h-60 overflow-y-auto">
              {isLoadingStudents ? (
                <div className="p-3 text-sm text-gray-500">Đang tải...</div>
              ) : availableStudents.length === 0 ? (
                <div className="p-3 text-sm text-gray-500">Không còn học sinh nào chưa có lớp</div>
              ) : (
                <div className="p-2">
                  {availableStudents.map((student: IStudent) => {
                    const isSelected = selectedStudentId === student.id;
                    return (
                      <label
                        key={student.id}
                        className={`flex items-center gap-3 p-2 rounded-lg cursor-pointer transition-colors ${
                          isSelected
                            ? "bg-primary/10 border-primary/30"
                            : "hover:bg-gray-50"
                        }`}
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedStudentId(student.id);
                          setDropdownOpen(false);
                        }}
                      >
                        <input
                          type="radio"
                          name="student-select"
                          checked={isSelected}
                          onChange={() => {
                            setSelectedStudentId(student.id);
                            setDropdownOpen(false);
                          }}
                          className="w-4 h-4 text-primary border-gray-300 focus:ring-primary"
                          onClick={(e) => e.stopPropagation()}
                        />
                        <div className="relative h-8 w-8 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-semibold flex-shrink-0 overflow-hidden">
                          {student.avatarUrl ? (
                            <Image
                              src={student.avatarUrl}
                              alt={student.displayName || student.phone || "student"}
                              className="rounded-full object-cover"
                              fill
                              sizes="32px"
                            />
                          ) : (
                            (student.displayName || student.phone || "?")
                              .charAt(0)
                              .toUpperCase()
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium text-gray-900 truncate">
                            {student.displayName || "Chưa có tên"}
                          </div>
                          {student.phone && (
                            <div className="text-xs text-gray-500 truncate">
                              {student.phone}
                            </div>
                          )}
                        </div>
                      </label>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
        
        <Button
          onClick={handleAddStudent}
          disabled={isAdding || !selectedStudentId}
          className="w-full"
        >
          <FiPlus className="mr-2" />
          {isAdding ? "Đang thêm..." : "Thêm"}
        </Button>
      </div>

      <div>
        <h4 className="text-sm sm:text-base font-medium mb-2">
          Danh sách học sinh ({members.filter((m) => m.role !== "teacher").length})
        </h4>
        {(() => {
          const students = members.filter((m) => m.role !== "teacher");
          return students.length === 0 ? (
            <p className="text-sm text-gray-500">Chưa có học sinh nào</p>
          ) : (
            <div className="space-y-2">
              {students.map((member: IClassMember) => (
                <div
                  key={member.id}
                  className="flex items-center justify-between p-2 rounded-lg border border-gray-200 hover:bg-gray-50"
                >
                  <div className="min-w-0 flex-1 flex items-center gap-2">
                    <ProfileAvatarLink
                      userId={member.id}
                      className="relative h-8 w-8 flex-shrink-0 rounded-full overflow-hidden"
                      ariaLabel={`Hồ sơ ${member.name}`}
                    >
                      {member.avatarUrl ? (
                        <Image
                          src={member.avatarUrl}
                          alt={member.name}
                          className="rounded-full object-cover"
                          fill
                          sizes="32px"
                        />
                      ) : (
                        <div className="h-8 w-8 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-semibold">
                          {(member.name || "?").charAt(0).toUpperCase()}
                        </div>
                      )}
                    </ProfileAvatarLink>
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-gray-900 truncate">
                        {member.name}
                      </div>
                      {member.phone && (
                        <div className="text-xs text-gray-500 truncate mt-1">
                          {member.phone}
                        </div>
                      )}
                    </div>
                  </div>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => {
                      setMemberToDelete(member);
                      setConfirmOpen(true);
                    }}
                    disabled={isRemoving}
                    aria-label="Xóa"
                    title="Xóa"
                    className="text-red-600 hover:text-red-700 hover:bg-red-50 flex-shrink-0 ml-2"
                  >
                    <FiTrash2 />
                  </Button>
                </div>
              ))}
            </div>
          );
        })()}
        <ConfirmDialog
          isOpen={confirmOpen}
          onClose={() => setConfirmOpen(false)}
          onConfirm={async () => {
            if (!memberToDelete) return;
            await removeMember({
              classId: classItem.id as unknown as string,
              memberId: memberToDelete.id,
            });
            toast.success("Đã xóa thành viên khỏi lớp");
            setMemberToDelete(null);
          }}
          title="Xác nhận xóa thành viên"
          message={`Bạn có chắc muốn xóa "${
            memberToDelete?.name || "thành viên"
          }" khỏi lớp?`}
          confirmText="Xóa"
          cancelText="Hủy"
          confirmVariant="warning"
        />
      </div>
    </div>
  );
}

export function ClassDetailModal({
  classItem,
  isOpen,
  onClose,
}: ClassDetailModalProps) {
  const { mutateAsync: updateClass, isPending: isSaving } = useUpdateClass();
  const { data: teachers = [], isLoading: isLoadingTeachers } = useTeachers();
  const { mutateAsync: updateStudent, isPending: isUpdatingStudent } =
    useUpdateStudent();
  const { mutateAsync: updateClassMember } = useUpdateClassMember();

  const [name, setName] = useState<string>(classItem.name);
  const [teacherIds, setTeacherIds] = useState<string[]>(
    classItem.teachers?.map(t => t.id) || []
  );
  const [zaloLink, setZaloLink] = useState<string>(classItem.links?.zalo || "");
  const [meetLink, setMeetLink] = useState<string>(classItem.links?.meet || "");
  const [, setNoteProcess] = useState<string>(classItem.noteProcess || "");

  // Unified student modal state
  const [activeStudent, setActiveStudent] = useState<IClassMember | null>(null);
  const { data: activeStudentProfile } = useStudent(activeStudent?.id || "");
  const [, setMemberStatus] = useState<"active" | "inactive">(
    "active"
  );

  // Memoize teacher IDs from classItem to avoid dependency array size changes
  const classItemTeacherIds = useMemo(() => {
    return classItem.teachers?.map(t => t.id) || [];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classItem.teachers ? JSON.stringify(classItem.teachers.map(t => t.id).sort()) : '']);

  // Use stringified version to avoid array size changes in dependency
  const classItemTeacherIdsStr = JSON.stringify(classItemTeacherIds.sort());
  
  useEffect(() => {
    setName(classItem.name);
    setTeacherIds(classItemTeacherIds);
    setZaloLink(classItem.links?.zalo || "");
    setMeetLink(classItem.links?.meet || "");
    setNoteProcess(classItem.noteProcess || "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classItem.id, classItem.name, classItemTeacherIdsStr, classItem.links?.zalo, classItem.links?.meet, classItem.noteProcess]);

  // Auto-remove invalid teachers when teachers list changes
  // Use stable string reference to avoid dependency array size changes
  const validTeachersIdsStr = JSON.stringify(teachers.map(t => t.id).sort());
  
  useEffect(() => {
    if (teachers.length > 0 && teacherIds.length > 0) {
      const validTeacherIds = teachers.map(t => t.id);
      const invalidIds = teacherIds.filter(id => !validTeacherIds.includes(id));
      
      if (invalidIds.length > 0) {
        // Auto-remove invalid teacher IDs
        setTeacherIds(prev => prev.filter(id => validTeacherIds.includes(id)));
        toast(`Đã tự động loại bỏ ${invalidIds.length} giáo viên không hợp lệ`, { icon: "ℹ️" });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [validTeachersIdsStr]); // Use stable string reference instead of teachers array

  useEffect(() => {
    if (activeStudent) {
      setMemberStatus(activeStudent.status as "active" | "inactive");
    }
  }, [activeStudent]);


  const handleSaveClass = async () => {
    if (!name) {
      toast.error("Vui lòng nhập Tên lớp");
      return;
    }
    
    // Auto-filter out invalid teacher IDs before saving
    const validTeacherIds = teachers.map(t => t.id);
    const filteredTeacherIds = teacherIds.filter(id => validTeacherIds.includes(id));
    
    if (filteredTeacherIds.length === 0) {
      toast.error("Vui lòng chọn ít nhất một giáo viên hợp lệ");
      return;
    }
    
    // Update teacherIds if some were filtered out
    if (filteredTeacherIds.length !== teacherIds.length) {
      setTeacherIds(filteredTeacherIds);
      const removedCount = teacherIds.length - filteredTeacherIds.length;
      toast(`Đã tự động loại bỏ ${removedCount} giáo viên không hợp lệ`, { icon: "ℹ️" });
    }
    
    // Get selected teachers from filtered IDs
    const validSelectedTeachers: IClassTeacher[] = teachers
      .filter((t) => filteredTeacherIds.includes(t.id))
      .map((t) => {
        const teacherWithImage = t as IProfile & { image?: string };
        return {
          id: t.id,
          name: t.displayName || t.email || "N/A",
          avatarUrl: t.avatarUrl || teacherWithImage.image || "",
          phone: (t as unknown as { phone?: string }).phone || "",
        };
      });
    
    await updateClass({
      classId: classItem.id as unknown as string,
      classData: {
        name,
        zaloLink,
        meetLink,
        teachers: validSelectedTeachers,
      },
    });
    toast.success("Đã lưu thay đổi lớp học");
  };

  const studentFormFields: AdminFormField[] = [
    {
      name: "displayName",
      label: "Tên",
      type: "text",
      required: true,
    },
    {
      name: "email",
      label: "Email",
      type: "email",
      required: true,
    },
    { name: "phone", label: "Số điện thoại", type: "text" },
  ];

  return (
    <AdminModal
      isOpen={isOpen}
      onClose={onClose}
      title={`Chi tiết lớp`}
      size="xl"
    >
      <div className="space-y-4">
        {/* Edit Form */}
        <div className="space-y-4">
            {/* Tên lớp, Link Zalo, Link Meet - Same row */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {/* Tên lớp */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Tên lớp <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <input
                    type="text"
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 pr-11 text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Nhập tên lớp"
                  />
                  <PasteButton onPaste={setName} trimOnPaste />
                </div>
              </div>

              {/* Link Zalo */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Link Zalo
                </label>
                <div className="relative">
                  <input
                    type="url"
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 pr-11 text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
                    value={zaloLink}
                    onChange={(e) => setZaloLink(e.target.value)}
                    placeholder="https://zalo.me/..."
                  />
                  <PasteButton onPaste={setZaloLink} trimOnPaste />
                </div>
              </div>

              {/* Link Meet */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Link Meet
                </label>
                <div className="relative">
                  <input
                    type="url"
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 pr-11 text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
                    value={meetLink}
                    onChange={(e) => setMeetLink(e.target.value)}
                    placeholder="https://meet.google.com/..."
                  />
                  <PasteButton onPaste={setMeetLink} trimOnPaste />
                </div>
              </div>
            </div>

            {/* Save Button */}
            <div className="flex justify-end">
              <Button 
                onClick={handleSaveClass} 
                disabled={isSaving}
              >
                <FiSave className="mr-2" />
                {isSaving ? "Đang lưu..." : "Lưu"}
              </Button>
            </div>

            {/* Thêm giáo viên và học sinh */}
            <div className="pt-6 border-t border-gray-200">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Giáo viên - Bên trái */}
                <div>
                  <TeacherManager
                    classItem={classItem}
                    teacherIds={teacherIds}
                    onTeacherIdsChange={setTeacherIds}
                    teachers={teachers}
                    isLoadingTeachers={isLoadingTeachers}
                  />
                </div>
                
                {/* Học sinh - Bên phải */}
                <div>
                  <StudentManager
                    classItem={classItem}
                    onOpenStudent={(member) => setActiveStudent(member)}
                  />
                </div>
              </div>
            </div>
        </div>
      </div>

      {/* Unified Student Detail/Edit Modal */}
      {activeStudent && (() => {
        const student = activeStudent; // TypeScript narrowing
        return (
          <AdminModal
              isOpen={!!student}
              onClose={() => setActiveStudent(null)}
              title="Chi tiết / Sửa học sinh"
              size="2xl"
            >
              {/* Profile header */}
              <div className="flex items-center gap-3 sm:gap-4 mb-3 sm:mb-4 p-2 sm:p-3 rounded-lg bg-gray-50 border border-gray-200">
                <ProfileAvatarLink
                  userId={student.id}
                  className="relative h-10 w-10 sm:h-12 sm:w-12 flex-shrink-0 rounded-full overflow-hidden"
                  ariaLabel={`Hồ sơ ${student.name}`}
                >
                  {(student.avatarUrl && (
                    <Image
                      src={student.avatarUrl}
                      alt={student.name}
                      className="rounded-full object-cover"
                      fill
                      sizes="(max-width: 640px) 40px, 48px"
                    />
                  )) || (
                    <div className="h-12 w-12 rounded-full  bg-primary/10 text-primary flex items-center justify-center text-sm font-semibold">
                      {(student.name || student.phone || "?")
                        .charAt(0)
                        .toUpperCase()}
                    </div>
                  )}
                </ProfileAvatarLink>
                <div className="min-w-0">
                  <div className="text-base font-semibold text-gray-900 truncate">
                    {student.name}
                  </div>
                </div>
                <div className="ml-auto flex items-center gap-2">
                  <span className="inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-gray-100 text-gray-700">
                    {student.role.toUpperCase()}
                  </span>
                  <span
                    className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                      student.status === "active"
                        ? "bg-green-100 text-green-800"
                        : "bg-red-100 text-red-800"
                    }`}
                  >
                    {student.status === "active" ? "Hoạt động" : "Tạm dừng"}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
                {/* Details (from member doc) */}
                <div className="space-y-2 sm:space-y-3 p-3 sm:p-4 rounded-lg border border-gray-200 bg-white">
                  <h4 className="text-sm sm:text-base font-semibold mb-1">Thông tin chi tiết</h4>
                  <div className="text-xs sm:text-sm space-y-1.5 sm:space-y-2">
                    <div className="flex items-center gap-2">
                      <FiUser className="text-primary" />
                      <span className="font-medium">Tên:</span>
                      <span className="text-gray-700">{student.name}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <FiPhone className="text-gray-500" />
                      <span className="font-medium">Số điện thoại:</span>
                      <span className="text-gray-700">
                        {student.phone || "(chưa có)"}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <FiUser className="text-primary" />
                      <span className="font-medium">Vai trò:</span>
                      <span className="text-gray-700">{student.role}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <FiCalendar className="text-gray-500" />
                      <span className="font-medium">Tham gia lúc:</span>
                      <span className="text-gray-700">
                        {student.joinedAt?.toLocaleString?.("vi-VN")}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Edit form (user profile) */}
                <div className="p-3 sm:p-4 rounded-lg border border-gray-200 bg-white">
                  <h4 className="text-sm sm:text-base font-semibold mb-2">Sửa thông tin</h4>
                  <AdminForm
                    fields={studentFormFields}
                    defaultValues={
                      {
                        displayName:
                          (activeStudentProfile as IStudent | undefined)
                            ?.displayName ||
                          student.name ||
                          "",
                        phone:
                          (activeStudentProfile as IStudent | undefined)?.phone ||
                          student.phone ||
                          "",
                      } as Record<string, unknown>
                    }
                    onSubmit={async (data: UpdateStudentData) => {
                      if (!student) return;
                      // Update user profile
                      await updateStudent({
                        studentId: student.id,
                        studentData: data,
                      });
                      // Best-effort sync denormalized member fields
                      await updateClassMember({
                        classId: classItem.id as unknown as string,
                        memberId: student.id,
                        data: {
                          name: (data.displayName as string) || student.name,
                          phone: (data.phone as string) || student.phone,
                        },
                      });
                      toast.success("Đã lưu thông tin học sinh");
                      setActiveStudent(null);
                    }}
                    isLoading={isUpdatingStudent}
                    onCancel={() => setActiveStudent(null)}
                    submitText="Lưu"
                  />
                </div>
              </div>
            </AdminModal>
        );
      })()}
    </AdminModal>
  );
}
