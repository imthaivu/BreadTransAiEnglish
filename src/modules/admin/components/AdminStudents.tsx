"use client";

import { Button } from "@/components/ui/Button";
import { IProfile } from "@/types";
import { useState, useEffect } from "react";
import { FiEdit, FiUser, FiCopy, FiShoppingBag } from "react-icons/fi";
import {
  AdminForm,
  AdminFormField,
  AdminModal,
  AdminTable,
  AdminTableColumn,
} from "./common";
import { useStudentManagement } from "../hooks/useStudentManagement";
import { readAchievementsFromUser } from "@/modules/user/services";
import { useAuth } from "@/lib/auth/context";
import { useCreateCurrencyTransaction } from "../hooks/useCurrencyManagement";
import { useClasses } from "../hooks/useClassManagement";
import toast from "react-hot-toast";
import { SafeImage as Image } from "@/components/ui/SafeImage";
import { getStorageBucket } from "@/lib/firebase/client";
import { ref, uploadBytes, getDownloadURL, deleteObject, listAll } from "firebase/storage";
import { UpdateStudentData } from "../services/student.service";
import { compressAndResizeImage } from "@/utils/image";
import { ImageCropModal } from "@/components/ui/ImageCropModal";
import { BankInfoDisplay } from "@/components/profile/BankInfoDisplay";

type StudentWithExtras = IProfile & {
  phone?: string;
  address?: string;
  addressDetail?: string;
  totalBanhRan?: number;
  streakCount?: number;
  parentEmail?: string;
  parentPhone?: string;
  grade?: string;
  school?: string;
  avatarUrl?: string;
  note?: string;
  achievements?: string;
  isSelfClaimed?: boolean;
  bankQrUrl?: string;
  bankName?: string;
  bankBin?: string;
  bankAccountNumber?: string;
  bankAccountName?: string;
  speakingAccuracy?: number;
  quizAccuracy?: number;
  countHeart?: number;
  timesVocabXS?: number;
  timesVocab?: number;
  birthYear?: number;
  nextExamDate?: string;
};

// Transaction form data type
type CurrencyTxFormData = {
  type: "add" | "subtract";
  amount: number;
  reason: string;
};

export default function AdminStudents() {
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [isCreateTxModalOpen, setIsCreateTxModalOpen] = useState(false);
  const [isShopeeModalOpen, setIsShopeeModalOpen] = useState(false);
  const [shopeeAmountK, setShopeeAmountK] = useState<string>("");
  const [selectedStudentForShopee, setSelectedStudentForShopee] =
    useState<StudentWithExtras | null>(null);
  const [selectedStudent, setSelectedStudent] =
    useState<StudentWithExtras | null>(null);

  const [isDetailEditOpen, setIsDetailEditOpen] = useState(false);
  const [activeStudent, setActiveStudent] = useState<StudentWithExtras | null>(
    null
  );
  const [avatarUploading, setAvatarUploading] = useState<string | null>(null);
  const [cropModalOpen, setCropModalOpen] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);

  // Filters (theo lớp: load một lần, không phân trang)
  const [selectedClassId, setSelectedClassId] = useState<string>("none"); // "none" = chưa chọn, "no-class" = Chưa có lớp

  // Auth and roles
  const { session, profile } = useAuth();

  // Option to load classes for filter - only fetch when needed (when dropdown is focused)
  const [loadClasses, setLoadClasses] = useState(false);
  const { data: classes = [], isLoading: classesLoading } = useClasses(loadClasses);

  // Lọc theo lớp: getStudents đã lấy toàn bộ match rồi slice — dùng limit lớn để không cắt trang
  const {
    students,
    isLoading,
    error,
    updateStudent,
    deleteStudent,
    isUpdating,
    isDeleting,
  } = useStudentManagement({
    page: 1,
    limit: 10_000,
    classId: selectedClassId === "none" ? undefined : selectedClassId || undefined,
    enabled: selectedClassId !== "none",
  });

  // Sync activeStudent with students list when it updates
  // But don't sync when modal is open to preserve local edits
  useEffect(() => {
    if (activeStudent && !isDetailEditOpen) {
      const updatedStudent = students.find(s => s.id === activeStudent.id);
      if (updatedStudent) {
        setActiveStudent(updatedStudent as StudentWithExtras);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [students, isDetailEditOpen, activeStudent?.id]);

  // Copy to clipboard function
  const copyToClipboard = async (text: string, label: string) => {
    if (!text || text === "-" || text === "(chưa có)") {
      toast.error(`Không có ${label} để copy`);
      return;
    }
    try {
      await navigator.clipboard.writeText(text);
      toast.success(`Đã copy ${label}`);
    } catch (error) {
      console.error("Failed to copy:", error);
      toast.error("Không thể copy");
    }
  };

  // Currency transaction mutation - only fetch mutation, not all transactions
  const { mutateAsync: createTransaction, isPending: isCreating } = useCreateCurrencyTransaction();

  const handleUpdateStudent = async (studentData: {
    displayName?: string;
    email?: string;
    phone?: string;
    address?: string;
    addressDetail?: string;
    parentPhone?: string;
    avatarUrl?: string;
    totalBanhRan?: number | string;
    streakCount?: number | string;
    speakingAccuracy?: number | string;
    quizAccuracy?: number | string;
    countHeart?: number | string;
    timesVocabXS?: number | string;
    timesVocab?: number | string;
    note?: string;
    achievements?: string;
    isSelfClaimed?: boolean;
    birthYear?: number | string;
    nextExamDate?: string;
  }) => {
    const target = activeStudent || selectedStudent;
    if (!target) return;

    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const updateData: any = { ...studentData };

      // Convert totalBanhRan and streakCount to numbers if they are strings
      if (updateData.totalBanhRan !== undefined) {
        updateData.totalBanhRan = typeof updateData.totalBanhRan === 'string'
          ? Number(updateData.totalBanhRan)
          : updateData.totalBanhRan;
      }
      if (updateData.streakCount !== undefined) {
        updateData.streakCount = typeof updateData.streakCount === 'string'
          ? Number(updateData.streakCount)
          : updateData.streakCount;
      }
      if (updateData.speakingAccuracy !== undefined) {
        updateData.speakingAccuracy = typeof updateData.speakingAccuracy === "string"
          ? Number(updateData.speakingAccuracy)
          : updateData.speakingAccuracy;
      }
      if (updateData.quizAccuracy !== undefined) {
        updateData.quizAccuracy = typeof updateData.quizAccuracy === "string"
          ? Number(updateData.quizAccuracy)
          : updateData.quizAccuracy;
      }
      if (updateData.countHeart !== undefined) {
        updateData.countHeart = typeof updateData.countHeart === "string"
          ? Number(updateData.countHeart)
          : updateData.countHeart;
      }
      if (updateData.timesVocabXS !== undefined) {
        updateData.timesVocabXS = typeof updateData.timesVocabXS === "string"
          ? Number(updateData.timesVocabXS)
          : updateData.timesVocabXS;
      }
      if (updateData.timesVocab !== undefined) {
        updateData.timesVocab = typeof updateData.timesVocab === "string"
          ? Number(updateData.timesVocab)
          : updateData.timesVocab;
      }
      if (updateData.birthYear !== undefined) {
        const raw = updateData.birthYear;
        if (raw === "" || raw === null) {
          delete updateData.birthYear;
        } else {
          const n = typeof raw === "string" ? Number(raw) : raw;
          updateData.birthYear = Number.isFinite(n) ? n : undefined;
        }
      }

      await updateStudent(target.id, updateData as UpdateStudentData);
      setIsDetailEditOpen(false);
      setActiveStudent(null);
      setSelectedStudent(null);
    } catch (error) {
      console.error("Error updating student:", error);
    }
  };

  const handleDeleteStudent = async () => {
    if (!selectedStudent) return;

    try {
      await deleteStudent(selectedStudent.id);
      setIsDeleteModalOpen(false);
      setSelectedStudent(null);
    } catch (error) {
      console.error("Error deleting student:", error);
    }
  };

  const handleCreateTransaction = async (
    transactionData: CurrencyTxFormData
  ) => {
    if (!selectedStudent) return;

    if (
      !session?.user?.id ||
      !session?.user?.name ||
      !profile
    ) {
      toast.error("Bạn không có quyền thực hiện hành động này.");
      return;
    }

    try {
      const currentBalance = selectedStudent.totalBanhRan || 0;
      if (
        transactionData.type === "subtract" &&
        currentBalance < transactionData.amount
      ) {
        toast.error(
          `Không thể trừ ${transactionData.amount} bánh mì. Số dư hiện tại chỉ có ${currentBalance} bánh mì.`
        );
        return;
      }

      // Get classId from student (first class if multiple)
      const studentClassId = selectedStudent.classIds && selectedStudent.classIds.length > 0
        ? selectedStudent.classIds[0]
        : undefined;

      await createTransaction({
        studentId: selectedStudent.id,
        studentName:
          selectedStudent.displayName || selectedStudent.phone || "Chưa có tên",
        amount: transactionData.amount,
        reason: transactionData.reason,
        type: transactionData.type,
        userId: session.user.id,
        userName: session.user.name || session.user.phone || "Unknown",
        userRole: profile.role,
        classId: studentClassId,
      });

      setIsCreateTxModalOpen(false);
      setSelectedStudent(null);
    } catch (error) {
      console.error("Error creating transaction:", error);
    }
  };

  const handleShopeePayment = async (amountK: number) => {
    if (!selectedStudentForShopee) return;

    if (
      !session?.user?.id ||
      !session?.user?.name ||
      !profile
    ) {
      toast.error("Bạn không có quyền thực hiện hành động này.");
      return;
    }

    const amountBanh = Math.ceil((amountK * 100) / 15);
    const currentBalance = selectedStudentForShopee.totalBanhRan || 0;

    if (currentBalance < amountBanh) {
      toast.error(
        `Không thể trừ ${amountBanh} bánh mì. Số dư hiện tại chỉ có ${currentBalance} bánh mì.`
      );
      return;
    }

    try {
      const studentClassId =
        selectedStudentForShopee.classIds &&
          selectedStudentForShopee.classIds.length > 0
          ? selectedStudentForShopee.classIds[0]
          : undefined;

      await createTransaction({
        studentId: selectedStudentForShopee.id,
        studentName:
          selectedStudentForShopee.displayName ||
          selectedStudentForShopee.phone ||
          "Chưa có tên",
        amount: amountBanh,
        reason: `Thanh toán Shopee ${amountK}K`,
        type: "shopee",
        userId: session.user.id,
        userName: session.user.name || session.user.phone || "Unknown",
        userRole: profile.role,
        classId: studentClassId,
      });

      setIsShopeeModalOpen(false);
      setSelectedStudentForShopee(null);
      setShopeeAmountK("");
    } catch (error) {
      console.error("Error creating Shopee transaction:", error);
    }
  };

  const closeDeleteModal = () => {
    setSelectedStudent(null);
    setIsDeleteModalOpen(false);
  };

  const handleFileSelect = (file: File | null, studentId: string) => {
    if (!file || !studentId) return;

    // Check authentication and admin role
    if (!session?.user?.id) {
      toast.error("Bạn cần tham gia để upload ảnh.");
      return;
    }

    if (!profile || profile.role !== "admin") {
      toast.error("Chỉ admin mới có quyền upload ảnh cho học sinh.");
      return;
    }

    setSelectedFile(file);
    setSelectedStudentId(studentId);
    setCropModalOpen(true);
  };

  const handleAvatarUpload = async (croppedFile: File) => {
    if (!croppedFile || !selectedStudentId) return;

    const toastId = toast.loading("Đang xử lý và tải ảnh lên...");
    setAvatarUploading(selectedStudentId);
    try {
      // Compress and resize image before upload (400x400, quality 0.85)
      const compressedFile = await compressAndResizeImage(croppedFile, 400, 400, 0.85);

      const storage = getStorageBucket();
      if (!storage) {
        throw new Error("Không thể kết nối với Firebase Storage. Vui lòng kiểm tra cấu hình.");
      }

      // Delete all old avatar files in the folder before uploading new one
      const avatarFolderRef = ref(storage, `users/${selectedStudentId}/avatar`);
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
      const path = `users/${selectedStudentId}/avatar/avatar.jpg`;
      const storageRef = ref(storage, path);

      await uploadBytes(storageRef, compressedFile);
      const url = await getDownloadURL(storageRef);

      // Update active student state immediately (optimistic update)
      if (activeStudent?.id === selectedStudentId) {
        setActiveStudent({ ...activeStudent, avatarUrl: url });
      }

      // Use updateStudent from hook to ensure data refresh
      await updateStudent(selectedStudentId, {
        avatarUrl: url,
      });

      toast.success("Cập nhật ảnh đại diện thành công!", { id: toastId });
    } catch (error) {
      console.error("Avatar upload error:", error);

      // More detailed error messages
      let errorMessage = "Đã có lỗi xảy ra khi tải ảnh.";
      if (error instanceof Error) {
        if (error.message.includes("storage/unauthorized") || error.message.includes("403")) {
          errorMessage = "Không có quyền upload. Vui lòng kiểm tra Firebase Storage rules. Đảm bảo admin có quyền upload vào path users/{userId}/avatar/";
        } else if (error.message.includes("storage/quota-exceeded")) {
          errorMessage = "Storage quota đã hết. Vui lòng liên hệ admin.";
        } else if (error.message.includes("storage/unauthenticated")) {
          errorMessage = "Bạn cần tham gia để upload ảnh.";
        } else if (error.message.includes("network")) {
          errorMessage = "Lỗi kết nối mạng. Vui lòng thử lại.";
        } else {
          errorMessage = error.message || errorMessage;
        }
      }

      toast.error(errorMessage, { id: toastId });
    } finally {
      setAvatarUploading(null);
      setSelectedFile(null);
      setSelectedStudentId(null);
    }
  };

  // Table columns configuration
  const columns: AdminTableColumn<StudentWithExtras>[] = [
    {
      key: "student",
      title: "Học sinh",
      render: (_, student) => (
        <div className="flex items-center min-w-0">
          <div className="flex-shrink-0 h-8 w-8 sm:h-10 sm:w-10 relative">
            <div className="h-8 w-8 sm:h-10 sm:w-10 rounded-full  bg-primary/10 flex items-center justify-center">
              <FiUser className="w-4 h-4 sm:w-5 sm:h-5 text-primary" />
            </div>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setActiveStudent(student);
                setIsDetailEditOpen(true);
              }}
              title="Sửa học sinh"
              className="absolute -bottom-0.5 -right-0.5 w-4 h-4 sm:w-5 sm:h-5 rounded-full bg-white shadow-md border border-gray-200 flex items-center justify-center hover:bg-gray-50 transition-colors z-10"
            >
              <FiEdit className="w-2 h-2 sm:w-3 sm:h-3 text-gray-600" />
            </button>
          </div>
          <div className="ml-2 sm:ml-4 min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <div className="text-xs sm:text-sm md:text-base font-medium text-gray-900 truncate flex-1">
                {student.displayName || "Chưa có tên"}
              </div>
            </div>
          </div>
        </div>
      ),
    },
    {
      key: "phone",
      title: "SĐT Shopee",
      className: "hidden md:table-cell",
      render: (_, student) => {
        const targetPhone = student.isSelfClaimed ? student.phone : (student.parentPhone || student.phone);
        return (
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-900">
              {targetPhone || "-"}
            </span>
          </div>
        );
      },
    },
    {
      key: "address",
      title: "Địa chỉ",
      className: "hidden lg:table-cell",
      render: (_, student) => {
        // Combine address and addressDetail for full address
        const fullAddress = [
          student.address,
          (student as { addressDetail?: string })?.addressDetail
        ].filter(Boolean).join(", ").trim() || "(chưa có)";

        return (
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-sm text-gray-900 truncate flex-1 max-w-[200px]">
              {fullAddress}
            </span>
          </div>
        );
      },
    },
    {
      key: "shopee",
      title: "Shopee",
      render: (_, student) => {
        const fullAddress = [
          student.address,
          (student as { addressDetail?: string })?.addressDetail,
        ]
          .filter(Boolean)
          .join(", ")
          .trim() || "(chưa có)";
        const targetPhone = student.isSelfClaimed ? student.phone : (student.parentPhone || student.phone);
        const allInfo = [
          student.displayName || "Chưa có tên",
          targetPhone || "-",
          fullAddress !== "(chưa có)" ? fullAddress : "-",
        ].join(" | ");

        return (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              copyToClipboard(allInfo, "thông tin học sinh");
              setSelectedStudentForShopee(student);
              setIsShopeeModalOpen(true);
            }}
            title="Thanh toán Shopee (tự động copy thông tin)"
            className="p-3 min-w-[44px] min-h-[44px] flex items-center justify-center text-orange-500 hover:text-orange-600 hover:bg-orange-50 rounded-lg transition-colors"
          >
            <FiShoppingBag className="w-6 h-6" />
          </button>
        );
      },
    },
    {
      key: "totalBanhRan",
      title: "Bánh mì",
      render: (_, student) => (
        <div className="flex items-center gap-1">
          <span className="text-xs sm:text-sm font-medium text-orange-600 whitespace-nowrap">
            {student.totalBanhRan || 0}
          </span>
          <Image
            src="/assets/images/dorayaki.png"
            alt="bánh mì"
            width={20}  // tương đương w-5
            height={20} // tương đương h-5
            className="inline-block sm:w-5 sm:h-5 w-4 h-4"
          />
        </div>
      ),
    },
  ];

  // Edit form fields (full student information)
  const editFormFields: (AdminFormField | AdminFormField[])[] = [
    {
      name: "displayName",
      label: "Tên học sinh",
      type: "text",
      required: true,
      validation: {
        required: "Tên học sinh là bắt buộc",
        minLength: {
          value: 2,
          message: "Tên học sinh phải có ít nhất 2 ký tự",
        },
      },
    },
    [
      {
        name: "parentPhone",
        label: "SDT phụ huynh",
        type: "text",
        placeholder: "0123456789",
        validation: {
          pattern: {
            value: /^[0-9]{10}$/,
            message: "SDT phải có 10 chữ số",
          },
        },
      },
      {
        name: "phone",
        label: "SDT học sinh",
        type: "text",
        placeholder: "0123456789",
        validation: {
          pattern: {
            value: /^[0-9]{10}$/,
            message: "SDT phải có 10 chữ số",
          },
        },
      }
    ],
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
      name: "avatarUrl",
      label: "URL ảnh đại diện",
      type: "text",
      placeholder: "https://example.com/avatar.jpg",
      validation: {
        pattern: {
          value: /^https?:\/\/.+/i,
          message: "URL phải bắt đầu bằng http:// hoặc https://",
        },
      },
    },
    [
      {
        name: "birthYear",
        label: "Năm sinh",
        type: "number",
        placeholder: "Ví dụ: 2012",
        validation: {
          min: {
            value: 1990,
            message: "Năm sinh không hợp lệ",
          },
          max: {
            value: new Date().getFullYear(),
            message: "Năm sinh không thể lớn hơn năm hiện tại",
          },
        },
      },
      {
        name: "nextExamDate",
        label: "Ngày kiểm tra sắp tới",
        type: "date",
      },
    ],
    [
      {
        name: "totalBanhRan",
        label: "Bánh mì",
        type: "number",
        validation: {
          min: {
            value: 0,
            message: "Số lượng bánh mì không thể âm",
          },
        },
      },
      {
        name: "streakCount",
        label: "Streak",
        type: "number",
        validation: {
          min: {
            value: 0,
            message: "Streak không thể âm",
          },
        },
      },
      {
        name: "countHeart",
        label: "countHeart",
        type: "number",
        validation: {
          min: {
            value: 0,
            message: "Không thể âm",
          },
        },
      },
    ],
    [
      {
        name: "quizAccuracy",
        label: "quizAccuracy",
        type: "number",
        validation: {
          min: {
            value: 0,
            message: "Không thể âm",
          },
          max: {
            value: 100,
            message: "Không thể lớn hơn 100",
          },
        },
      },
      {
        name: "speakingAccuracy",
        label: "speakingAccuracy",
        type: "number",
        validation: {
          min: {
            value: 0,
            message: "Không thể âm",
          },
          max: {
            value: 100,
            message: "Không thể lớn hơn 100",
          },
        },
      },
    ],
    [
      {
        name: "timesVocabXS",
        label: "timesVocabXS",
        type: "number",
        validation: {
          min: {
            value: 0,
            message: "Không thể âm",
          },
        },
      },
      {
        name: "timesVocab",
        label: "timesVocab",
        type: "number",
        validation: {
          min: {
            value: 0,
            message: "Không thể âm",
          },
        },
      },
    ],
    {
      name: "note",
      label: "Ghi chú",
      type: "textarea",
      rows: 4,
      placeholder: "Nhập ghi chú về học sinh...",
    },
    {
      name: "achievements",
      label: "Thành tích",
      type: "textarea",
      rows: 4,
      placeholder: "Nhập thành tích học sinh...",
    },
  ];

  // Transaction form fields
  const txFormFields: AdminFormField[] = [
    {
      name: "type",
      label: "Loại",
      type: "select",
      required: true,
      validation: {
        required: "Vui lòng chọn loại",
      },
      options: [
        { value: "add", label: "Cộng bánh mì" },
        { value: "subtract", label: "Trừ bánh mì" },
      ],
    },
    {
      name: "amount",
      label: "Số lượng",
      type: "number",
      required: true,
      validation: {
        required: "Số lượng là bắt buộc",
        min: {
          value: 1,
          message: "Số lượng phải lớn hơn 0",
        },
        max: {
          value: 1000,
          message: "Số lượng không thể quá 1000",
        },
      },
      after: ({ setValue, watch }) => {
        const amount = watch("amount");
        const presets = [1, 2, 3, 5, 10, 15, 20, 25, 30, 40, 50];
        return (
          <div className="mt-2">
            <div className="text-xs text-gray-600 mb-1.5">
              Chọn nhanh:
            </div>
            <div className="flex flex-wrap gap-1.5 sm:gap-2">
              {presets.map((n) => (
                <button
                  key={n}
                  type="button"
                  className={`px-2 sm:px-2.5 py-1 rounded-md border text-xs sm:text-sm transition-colors ${Number(amount) === n
                    ? " bg-primary text-white border-primary"
                    : "bg-white text-gray-700 border-gray-300 hover:bg-gray-50"
                    }`}
                  onClick={() => setValue("amount", n)}
                  aria-label={`Chọn ${n}`}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>
        );
      },
    },
    {
      name: "reason",
      label: "Lý do",
      type: "text",
      required: true,
      validation: {
        required: "Lý do là bắt buộc",
        minLength: {
          value: 2,
          message: "Lý do phải có ít nhất 2 ký tự",
        },
      },
    },
  ];

  return (
    <div className="">
      <div className="mb-4">
        <h1 className="text-xl sm:text-2xl font-bold text-gray-900">
          Học sinh
        </h1>
      </div>


      {/* Filters */}
      <div className="bg-white p-3 rounded-lg mb-4">
        <div className="flex flex-col sm:flex-row gap-2 sm:gap-3">
          <select
            value={selectedClassId}
            onChange={(e) => setSelectedClassId(e.target.value)}
            onFocus={() => {
              if (!loadClasses) setLoadClasses(true);
            }}
            className="w-full sm:w-auto sm:min-w-[200px] px-3 sm:px-4 py-2 border border-gray-300 rounded-lg bg-gray-50 focus:ring-2 focus:ring-primary focus:border-primary text-sm"
          >
            <option value="none">Chưa chọn lớp</option>
            <option value="no-class">Chưa có lớp</option>
            {loadClasses && classesLoading ? (
              <option value="" disabled>Đang tải...</option>
            ) : (
              classes.map((classItem) => (
                <option key={classItem.id} value={classItem.id}>
                  {classItem.name}
                </option>
              ))
            )}
          </select>
        </div>
      </div>

      {/* Error State */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 sm:p-4">
          <h3 className="text-sm font-medium text-red-800">
            Có lỗi xảy ra khi tải dữ liệu
          </h3>
          <p className="mt-1 text-xs sm:text-sm text-red-700">
            {error.message || "Vui lòng thử lại sau"}
          </p>
        </div>
      )}

      {/* Students Table */}
      <AdminTable
        columns={columns}
        data={students as unknown as StudentWithExtras[]}
        loading={isLoading}
        emptyMessage={
          selectedClassId === "none"
            ? "Vui lòng chọn lớp để xem học sinh"
            : selectedClassId === "no-class"
              ? "Không có học sinh nào chưa có lớp"
              : selectedClassId
                ? "Lớp này chưa có học sinh nào"
                : "Chưa có học sinh nào"
        }
        showCheckbox={false}
      />

      {/* Edit Modal */}
      {activeStudent && (
        <AdminModal
          isOpen={isDetailEditOpen}
          onClose={() => {
            setIsDetailEditOpen(false);
            setActiveStudent(null);
          }}
          title="Sửa học sinh"
          size="lg"
        >
          {/* Avatar Section */}
          <div className="flex flex-col items-center mb-4 sm:mb-6">
            <div className="relative">
              {activeStudent.avatarUrl ? (
                <Image
                  src={activeStudent.avatarUrl}
                  alt={activeStudent.displayName || "Avatar"}
                  width={96}
                  height={96}
                  sizes="96px"
                  className="w-24 h-24 rounded-full object-cover"
                />
              ) : (
                <div className="w-24 h-24 rounded-full bg-primary/10 flex items-center justify-center">
                  <FiUser className="w-12 h-12 text-primary" />
                </div>
              )}
              <button
                type="button"
                onClick={() => {
                  const fileInput = document.getElementById(`avatar-upload-${activeStudent.id}`) as HTMLInputElement;
                  fileInput?.click();
                }}
                disabled={avatarUploading === activeStudent.id}
                title="Đổi ảnh đại diện"
                className="absolute -bottom-1 -right-1 px-2 h-6 rounded-full bg-white shadow-md border border-gray-200 flex items-center justify-center hover:bg-gray-50 transition-colors"
              >
                {avatarUploading === activeStudent.id ? (
                  <div className="w-4 h-4 border-2 border-gray-300 border-t-blue-600 rounded-full animate-spin" />
                ) : (
                  <span className="text-xs font-medium text-blue-400">Đổi</span>
                )}
              </button>
            </div>
            <input
              type="file"
              accept="image/*"
              id={`avatar-upload-${activeStudent.id}`}
              className="sr-only"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file && activeStudent.id) {
                  handleFileSelect(file, activeStudent.id);
                  // Reset input so same file can be selected again
                  if (e.target) e.target.value = "";
                }
              }}
            />
            <div className="mt-4 text-sm font-medium text-gray-500 bg-gray-50 px-3 py-1.5 rounded-md border border-gray-200 flex items-center gap-2">
              <span>ID: {activeStudent.id}</span>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  navigator.clipboard.writeText(activeStudent.id);
                  toast.success("Đã copy ID");
                }}
                className="text-gray-400 hover:text-gray-600 transition-colors"
                title="Copy ID"
              >
                <FiCopy className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Image Crop Modal */}
          <ImageCropModal
            open={cropModalOpen}
            onClose={() => {
              setCropModalOpen(false);
              setSelectedFile(null);
              setSelectedStudentId(null);
            }}
            imageFile={selectedFile}
            onCrop={handleAvatarUpload}
            aspectRatio={1}
            outputSize={400}
          />

          <AdminForm
            fields={editFormFields}
            defaultValues={{
              displayName: activeStudent?.displayName || "",
              phone: activeStudent?.phone || "",
              address: activeStudent?.address || "",
              addressDetail: (activeStudent as { addressDetail?: string })?.addressDetail || "",
              parentPhone: activeStudent?.parentPhone || "",
              avatarUrl: activeStudent?.avatarUrl || "",
              birthYear: activeStudent?.birthYear ?? "",
              nextExamDate: activeStudent?.nextExamDate || "",
              totalBanhRan: activeStudent?.totalBanhRan || 0,
              streakCount: activeStudent?.streakCount || 0,
              quizAccuracy: activeStudent?.quizAccuracy ?? 50,
              speakingAccuracy: activeStudent?.speakingAccuracy ?? 50,
              countHeart: activeStudent?.countHeart || 0,
              timesVocabXS: activeStudent?.timesVocabXS || 0,
              timesVocab: activeStudent?.timesVocab || 0,
              note: activeStudent?.note || "",
              achievements:
                readAchievementsFromUser(
                  activeStudent as unknown as Record<string, unknown>
                ) || "",
            }}
            onSubmit={async (data) => {
              await handleUpdateStudent({
                ...data,
              } as {
                displayName?: string;
                email?: string;
                phone?: string;
                address?: string;
                addressDetail?: string;
                parentPhone?: string;
                avatarUrl?: string;
                totalBanhRan?: number | string;
                streakCount?: number | string;
                quizAccuracy?: number | string;
                speakingAccuracy?: number | string;
                countHeart?: number | string;
                timesVocabXS?: number | string;
                timesVocab?: number | string;
                note?: string;
                achievements?: string;
                birthYear?: number | string;
                nextExamDate?: string;
              });
            }}
            isLoading={isUpdating}
            onCancel={() => {
              setIsDetailEditOpen(false);
              setActiveStudent(null);
            }}
          />
        </AdminModal>
      )}

      {/* Delete Confirmation Modal */}
      {selectedStudent && (
        <AdminModal
          isOpen={isDeleteModalOpen}
          onClose={closeDeleteModal}
          title="Xác nhận xóa học sinh"
          subtitle={`Bạn có chắc chắn muốn xóa học sinh "${selectedStudent.displayName}" không? Hành động này không thể hoàn tác.`}
          size="sm"
        >
          <div className="flex flex-col-reverse sm:flex-row justify-end gap-2 sm:gap-2">
            <Button
              variant="outline"
              onClick={closeDeleteModal}
              className="w-full sm:w-auto"
            >
              Hủy
            </Button>
            <Button
              variant="warning"
              onClick={handleDeleteStudent}
              disabled={isDeleting}
              className="w-full sm:w-auto"
            >
              {isDeleting ? "Đang xóa..." : "Xóa"}
            </Button>
          </div>
        </AdminModal>
      )}

      {/* Create Transaction Modal */}
      {selectedStudent && (
        <AdminModal
          isOpen={isCreateTxModalOpen}
          onClose={() => {
            setIsCreateTxModalOpen(false);
            setSelectedStudent(null);
          }}
          title="Tạo giao dịch bánh mì"
          subtitle={
            <span>
              {selectedStudent.displayName || selectedStudent.phone || "Chưa có tên"} — Số dư:{" "}
              {selectedStudent.totalBanhRan || 0}{" "}
              <Image
                src="/assets/images/dorayaki.png"
                alt="bánh mì"
                width={20}
                height={20}
                className="inline-block w-4 h-4 sm:w-5 sm:h-5"
              />
            </span>
          }
          size="md"
        >
          <div className="space-y-4">
            <AdminForm
              fields={txFormFields}
              defaultValues={{ type: "add", amount: 1, reason: "" }}
              onSubmit={async (data: CurrencyTxFormData) => {
                await handleCreateTransaction(data);
              }}
              isLoading={isCreating}
              onCancel={() => {
                setIsCreateTxModalOpen(false);
                setSelectedStudent(null);
              }}
              submitText="Tạo giao dịch"
            />
          </div>
        </AdminModal>
      )}

      {/* Shopee Payment Modal */}
      {selectedStudentForShopee && (
        <AdminModal
          isOpen={isShopeeModalOpen}
          onClose={() => {
            setIsShopeeModalOpen(false);
            setSelectedStudentForShopee(null);
            setShopeeAmountK("");
          }}
          title="Thanh toán Shopee"
          subtitle={<span className="text-green-600">Đã copy thông tin người dùng</span>}
          size="lg"
        >
          <div className="space-y-3">
            <BankInfoDisplay
              info={{
                bankQrUrl: selectedStudentForShopee.bankQrUrl,
                bankName: selectedStudentForShopee.bankName,
                bankBin: selectedStudentForShopee.bankBin,
                bankAccountNumber: selectedStudentForShopee.bankAccountNumber,
                bankAccountName: selectedStudentForShopee.bankAccountName,
              }}
              onCopyAccount={(account) => copyToClipboard(account, "số tài khoản")}
            />
            {(() => {
              const balance = selectedStudentForShopee?.totalBanhRan || 0;
              const maxAllowedK = Math.floor((balance * 15) / 100);
              const sliderMax = Math.min(500, maxAllowedK);
              const currentVal = Math.min(sliderMax, Math.max(0, Number(shopeeAmountK) || 0));
              const clampAndSet = (v: number) => setShopeeAmountK(String(Math.min(sliderMax, Math.max(0, v))));
              const trừ = shopeeAmountK && Number(shopeeAmountK) > 0 ? Math.ceil((Number(shopeeAmountK) * 100) / 15) : 0;
              const còn = Math.max(0, balance - trừ);
              return (
                <>
                  <div className="flex items-center justify-between gap-4">
                    <span className="text-blue-600 font-medium truncate">
                      {selectedStudentForShopee?.displayName || selectedStudentForShopee?.phone || "—"}
                    </span>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <input
                        type="number"
                        min={0}
                        max={sliderMax}
                        value={shopeeAmountK}
                        onChange={(e) => clampAndSet(Number(e.target.value) || 0)}
                        placeholder="0"
                        disabled={sliderMax === 0}
                        className="w-16 text-center text-base font-semibold px-2 py-1 border border-gray-300 rounded focus:ring-2 focus:ring-orange-500 disabled:bg-gray-100"
                      />
                      <span className="text-gray-500">K</span>
                    </div>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={sliderMax}
                    step={1}
                    value={currentVal}
                    onChange={(e) => setShopeeAmountK(e.target.value)}
                    disabled={sliderMax === 0}
                    className="w-full h-2 bg-gray-200 rounded appearance-none cursor-pointer accent-orange-500 disabled:opacity-60"
                  />
                  <div className="flex justify-between text-xs text-gray-400">
                    <span>0</span>
                    <span className={sliderMax < 500 ? "text-red-600 font-medium" : ""}>{sliderMax}K</span>
                  </div>
                  <div className="flex items-center justify-between py-1.5 px-2.5 bg-gray-50 rounded text-sm">
                    <span>{balance}</span>
                    <span className="text-gray-400">→</span>
                    <span className="text-orange-600">−{trừ}</span>
                    <span className="text-gray-400">→</span>
                    <span className="font-medium">{còn} bánh</span>
                  </div>
                </>
              );
            })()}
            <div className="flex gap-2 pt-0.5">
              <Button variant="outline" onClick={() => { setIsShopeeModalOpen(false); setSelectedStudentForShopee(null); setShopeeAmountK(""); }} className="flex-1">
                Hủy
              </Button>
              <Button
                onClick={() => {
                  const balance = selectedStudentForShopee?.totalBanhRan || 0;
                  const maxK = Math.min(500, Math.floor((balance * 15) / 100));
                  const k = Math.min(maxK, Math.max(0, Number(shopeeAmountK) || 0));
                  if (k < 1) { toast.error("Số tiền ≥ 1K"); return; }
                  handleShopeePayment(k);
                }}
                disabled={isCreating || Number(shopeeAmountK || 0) < 1}
                className="flex-1 bg-orange-500 hover:bg-orange-600"
              >
                {isCreating ? "..." : "Thanh toán"}
              </Button>
            </div>
          </div>
        </AdminModal>
      )}
    </div>
  );
}
