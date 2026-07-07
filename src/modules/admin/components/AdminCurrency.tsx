"use client";

import { Button } from "@/components/ui/Button";
import { useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { SafeImage as Image } from "@/components/ui/SafeImage";
import {
  FiDollarSign,
  FiMinus,
  FiPlus,
  FiTrash2,
  FiRefreshCw,
  FiX,
} from "react-icons/fi";
import { FaGamepad } from "react-icons/fa";
import { LuSwords, LuTicket } from "react-icons/lu";
import {
  useCurrencyManagement,
  useCurrencyTransactions,
  useGameCurrencyTransactions,
} from "../hooks/useCurrencyManagement";
import { useClasses } from "../hooks/useClassManagement";
import { ICurrency, GameCurrencyMode } from "../services/currency.service";
import { AdminModal, AdminTable, AdminTableColumn } from "./common";

const GAME_LABELS: Record<string, string> = {
  "flappy-bird": "Flappy Bird",
  "shell-game": "Tìm bóng",
  caro: "Cờ Caro",
  "sky-high": "Sky High",
  "sliding-puzzle": "Sliding 3x3",
};
const GAME_OPTIONS = Object.entries(GAME_LABELS);
const gameLabel = (id?: string) => (id ? GAME_LABELS[id] ?? id : "—");

type CurrencySource = "class" | "game";

export default function AdminCurrency() {
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [selectedTransaction, setSelectedTransaction] =
    useState<ICurrency | null>(null);

  // Date filter for transactions (default today)
  const [dateStr, setDateStr] = useState<string>("");
  const [monthStr, setMonthStr] = useState<string>("");
  const [filterType, setFilterType] = useState<"day" | "month">("day");
  // Frontend filters
  const [transactionTypeFilter, setTransactionTypeFilter] = useState<
    "subtract" | "add"
  >("add");
  const [selectedClassId, setSelectedClassId] = useState<string>("none"); // "none" = chưa chọn

  // Nguồn dữ liệu: theo lớp (giáo viên cộng/trừ) hoặc từ game (PvP / chơi vé)
  const [source, setSource] = useState<CurrencySource>("class");
  const [gameFilter, setGameFilter] = useState<string>("all");
  const [modeFilter, setModeFilter] = useState<"all" | GameCurrencyMode>("all");

  // Initialize dateStr to today on mount
  useEffect(() => {
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, "0");
    const dd = String(today.getDate()).padStart(2, "0");
    setDateStr(`${yyyy}-${mm}-${dd}`);

    // Initialize monthStr to current month
    setMonthStr(`${yyyy}-${mm}`);
  }, []);

  // Update dateStr when filterType changes to day (reset to today if empty)
  useEffect(() => {
    if (filterType === "day" && !dateStr) {
      const today = new Date();
      const yyyy = today.getFullYear();
      const mm = String(today.getMonth() + 1).padStart(2, "0");
      const dd = String(today.getDate()).padStart(2, "0");
      setDateStr(`${yyyy}-${mm}-${dd}`);
    }
  }, [filterType, dateStr]);

  // Update monthStr when filterType changes to month
  useEffect(() => {
    if (filterType === "month") {
      if (!monthStr) {
        if (dateStr) {
          const date = new Date(`${dateStr}T00:00:00`);
          const yyyy = date.getFullYear();
          const mm = String(date.getMonth() + 1).padStart(2, "0");
          setMonthStr(`${yyyy}-${mm}`);
        } else {
          const today = new Date();
          const yyyy = today.getFullYear();
          const mm = String(today.getMonth() + 1).padStart(2, "0");
          setMonthStr(`${yyyy}-${mm}`);
        }
      }
    }
  }, [filterType, monthStr, dateStr]);

  const forDate = useMemo(() => {
    if (filterType === "day" && dateStr) {
      return new Date(`${dateStr}T00:00:00`);
    } else if (filterType === "month" && monthStr) {
      return new Date(`${monthStr}-01T00:00:00`);
    }
    return undefined;
  }, [dateStr, monthStr, filterType]);

  // Use the currency management mutations
  const currencyManagement = useCurrencyManagement();
  const { deleteTransaction, isDeleting } =
    currencyManagement || {
      deleteTransaction: async () => {},
      isDeleting: false,
    };

  // Lazy load classes only when needed (when dropdown is opened)
  const [loadClasses, setLoadClasses] = useState(false);
  const { data: classes = [] } = useClasses(loadClasses);

  const isGameSource = source === "game";

  // Nguồn theo lớp (server-side filter theo lớp + loại giao dịch)
  const classQuery = useCurrencyTransactions(
    forDate,
    selectedClassId === "none" ? undefined : selectedClassId,
    !isGameSource && selectedClassId !== "none" && !!selectedClassId,
    filterType,
    transactionTypeFilter
  );

  // Nguồn từ game (PvP / chơi vé), lọc theo trò chơi và loại
  const gameQuery = useGameCurrencyTransactions(
    forDate,
    filterType,
    gameFilter === "all" ? undefined : gameFilter,
    modeFilter === "all" ? undefined : modeFilter,
    isGameSource
  );

  const activeQuery = isGameSource ? gameQuery : classQuery;
  const {
    data: transactions = [],
    isLoading,
    error,
    refetch,
  } = activeQuery || {
    data: [],
    isLoading: false,
    error: null,
    refetch: () => Promise.resolve(),
  };

  const filteredTransactions = transactions || [];

  const totalAdded = useMemo(
    () =>
      filteredTransactions.reduce(
        (sum, t) => (t.type === "add" ? sum + t.amount : sum),
        0
      ),
    [filteredTransactions]
  );

  const handleDeleteTransaction = async () => {
    if (!selectedTransaction) return;

    try {
      await deleteTransaction(selectedTransaction.id);
      setIsDeleteModalOpen(false);
      setSelectedTransaction(null);
    } catch (error) {
      console.error("Error deleting transaction:", error);
    }
  };

  const openDeleteModal = (transaction: ICurrency) => {
    setSelectedTransaction(transaction);
    setIsDeleteModalOpen(true);
  };

  const closeDeleteModal = () => {
    setSelectedTransaction(null);
    setIsDeleteModalOpen(false);
  };

  // Table columns configuration
  const columns: AdminTableColumn<ICurrency>[] = [
    {
      key: "student",
      title: "Học sinh",
      render: (_, transaction) => (
        <div className="flex items-center min-w-0">
          <div className="flex-shrink-0 h-8 w-8 sm:h-10 sm:w-10">
            <div
              className={`h-8 w-8 sm:h-10 sm:w-10 rounded-full flex items-center justify-center ${
                isGameSource ? "bg-amber-100" : "bg-green-100"
              }`}
            >
              {isGameSource ? (
                <FaGamepad className="w-4 h-4 sm:w-5 sm:h-5 text-amber-600" />
              ) : (
                <FiDollarSign className="w-4 h-4 sm:w-5 sm:h-5 text-green-600" />
              )}
            </div>
          </div>
          <div className="ml-2 sm:ml-4 min-w-0 flex-1">
            <div className="text-xs sm:text-sm md:text-base font-medium text-gray-900 truncate">
              {transaction.studentName}
            </div>
            {/* Mobile: nguồn game hiện trò + loại, nguồn lớp hiện người thực hiện */}
            <div className="md:hidden mt-1 text-xs text-gray-400">
              {isGameSource
                ? `${gameLabel(transaction.gameMeta?.gameId)} · ${
                    transaction.gameMeta?.mode === "pvp" ? "PvP" : "Vé"
                  }`
                : transaction.userName || "Không rõ"}
            </div>
            <div className="md:hidden mt-0.5 text-xs text-gray-400">
              {transaction.createdAt.toLocaleDateString("vi-VN")}
            </div>
            <div className="sm:hidden mt-1 text-xs text-gray-600 truncate">
              {transaction.reason}
            </div>
          </div>
        </div>
      ),
    },
    ...(isGameSource
      ? ([
          {
            key: "game",
            title: "Trò chơi",
            className: "hidden md:table-cell",
            render: (_, transaction) => (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">
                <FaGamepad className="h-3.5 w-3.5 text-slate-400" />
                {gameLabel(transaction.gameMeta?.gameId)}
              </span>
            ),
          },
          {
            key: "mode",
            title: "Loại",
            render: (_, transaction) => {
              const isPvp = transaction.gameMeta?.mode === "pvp";
              return (
                <span
                  className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-bold ${
                    isPvp
                      ? "bg-indigo-100 text-indigo-700"
                      : "bg-amber-100 text-amber-700"
                  }`}
                >
                  {isPvp ? (
                    <LuSwords className="h-3.5 w-3.5" />
                  ) : (
                    <LuTicket className="h-3.5 w-3.5" />
                  )}
                  {isPvp ? "PvP" : "Vé"}
                </span>
              );
            },
          },
        ] as AdminTableColumn<ICurrency>[])
      : ([
          {
            key: "admin",
            title: "Người thực hiện",
            className: "hidden md:table-cell",
            render: (_, transaction) => (
              <div>
                <div className="text-sm md:text-base font-medium text-gray-900">
                  {transaction.userName || "Không rõ"}
                </div>
                <div className="text-sm md:text-base text-gray-500">
                  {transaction.userRole || "Không rõ"}
                </div>
              </div>
            ),
          },
        ] as AdminTableColumn<ICurrency>[])),
    {
      key: "amount",
      title: "Số lượng",
      render: (_, transaction) => {
        const isAdd = transaction.type === "add";
        return (
          <div className="flex items-center gap-1.5">
            {isAdd ? (
              <FiPlus className="w-4 h-4 text-green-600" />
            ) : (
              <FiMinus className="w-4 h-4 text-red-600" />
            )}
            <span className="text-xs sm:text-sm md:text-base font-medium text-gray-900">
              {transaction.amount}
            </span>
            <Image
              src="/assets/images/dorayaki.png"
              alt="bánh mì"
              width={20}
              height={20}
              className="object-contain"
            />
          </div>
        );
      },
    },
    {
      key: "reason",
      title: "Lý do",
      className: "hidden sm:table-cell",
      render: (_, transaction) => (
        <span className="text-sm md:text-base text-gray-900 truncate max-w-xs">
          {transaction.reason}
        </span>
      ),
    },
    {
      key: "date",
      title: "Ngày",
      className: "hidden md:table-cell",
      render: (_, transaction) => (
        <span className="text-sm md:text-base text-gray-500">
          {transaction.createdAt.toLocaleDateString("vi-VN")}
        </span>
      ),
    },
    {
      key: "actions",
      title: "Thao tác",
      render: (_, transaction) => (
        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="sm"
            className="flex items-center gap-1 text-red-600 hover:text-red-700 px-2 py-1"
            onClick={(e) => {
              e.stopPropagation();
              openDeleteModal(transaction);
            }}
            title="Xóa"
          >
            <FiTrash2 className="w-3.5 h-3.5" />
          </Button>
        </div>
      ),
    },
  ];

  // Khi nguồn theo lớp mà chưa chọn lớp thì hiện hướng dẫn thay cho bảng.
  const needPickClass = !isGameSource && selectedClassId === "none";
  const hasGameFilter = gameFilter !== "all" || modeFilter !== "all";

  return (
    <div className="space-y-3 sm:space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-3 mb-4">
        <h1 className="text-xl sm:text-2xl font-bold text-gray-900 flex items-center gap-2">
          Bánh mì
        </h1>
      </div>

      {/* Filters Card */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-3 sm:p-4">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-end gap-2 sm:gap-3">
          {/* Nguồn dữ liệu */}
          <div className="flex flex-row gap-2 sm:contents">
            <div className="flex-1 sm:flex-initial sm:min-w-[130px]">
              <label className="block text-xs text-gray-600 mb-1">Nguồn</label>
              <select
                className="w-full px-2 sm:px-3 py-1.5 border border-gray-300 rounded-md text-xs sm:text-sm focus:ring-2 focus:ring-primary focus:border-primary"
                value={source}
                onChange={(e) => setSource(e.target.value as CurrencySource)}
              >
                <option value="class">Theo lớp</option>
                <option value="game">Từ game</option>
              </select>
            </div>

            {/* Theo lớp: chọn lớp; Từ game: chọn trò chơi */}
            {isGameSource ? (
              <div className="flex-1 sm:flex-initial sm:min-w-[150px]">
                <label className="block text-xs text-gray-600 mb-1">
                  Trò chơi
                </label>
                <select
                  className="w-full px-2 sm:px-3 py-1.5 border border-gray-300 rounded-md text-xs sm:text-sm focus:ring-2 focus:ring-primary focus:border-primary"
                  value={gameFilter}
                  onChange={(e) => setGameFilter(e.target.value)}
                >
                  <option value="all">Tất cả trò</option>
                  {GAME_OPTIONS.map(([id, label]) => (
                    <option key={id} value={id}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              <div className="flex-1 sm:flex-initial sm:min-w-[150px]">
                <label className="block text-xs text-gray-600 mb-1">
                  Lớp học
                </label>
                <select
                  className="w-full px-2 sm:px-3 py-1.5 border border-gray-300 rounded-md text-xs sm:text-sm focus:ring-2 focus:ring-primary focus:border-primary"
                  value={selectedClassId}
                  onFocus={() => setLoadClasses(true)}
                  onChange={(e) => {
                    const value = e.target.value;
                    setSelectedClassId(value);
                    if (value && value !== "none") {
                      setLoadClasses(true);
                    }
                  }}
                >
                  <option value="none">Chưa chọn lớp</option>
                  {classes.map((classItem) => (
                    <option key={classItem.id} value={classItem.id}>
                      {classItem.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {/* Loại giao dịch (lớp) / Loại game (game) */}
          <div className="flex flex-row gap-2 sm:contents">
            {isGameSource ? (
              <div className="flex-1 sm:flex-initial sm:min-w-[140px]">
                <label className="block text-xs text-gray-600 mb-1">Loại</label>
                <select
                  className="w-full px-2 sm:px-3 py-1.5 border border-gray-300 rounded-md text-xs sm:text-sm focus:ring-2 focus:ring-primary focus:border-primary"
                  value={modeFilter}
                  onChange={(e) =>
                    setModeFilter(e.target.value as typeof modeFilter)
                  }
                >
                  <option value="all">PvP &amp; Vé</option>
                  <option value="pvp">Đấu PvP</option>
                  <option value="ranked">Chơi bằng vé</option>
                </select>
              </div>
            ) : (
              <div className="flex-1 sm:hidden">
                <label className="block text-xs text-gray-600 mb-1">
                  Loại giao dịch
                </label>
                <select
                  className="w-full px-2 py-1.5 border border-gray-300 rounded-md text-xs focus:ring-2 focus:ring-primary focus:border-primary"
                  value={transactionTypeFilter}
                  onChange={(e) =>
                    setTransactionTypeFilter(
                      e.target.value as typeof transactionTypeFilter
                    )
                  }
                >
                  <option value="add">Cộng</option>
                  <option value="subtract">Trừ</option>
                </select>
              </div>
            )}
          </div>

          {/* Thời gian + Ngày/Tháng */}
          <div className="flex flex-row gap-2 sm:contents">
            <div className="flex-1 sm:flex-initial sm:min-w-[120px]">
              <label className="block text-xs text-gray-600 mb-1">
                Thời gian
              </label>
              <select
                className="w-full px-2 sm:px-3 py-1.5 border border-gray-300 rounded-md text-xs sm:text-sm focus:ring-2 focus:ring-primary focus:border-primary"
                value={filterType}
                onChange={(e) =>
                  setFilterType(e.target.value as "day" | "month")
                }
              >
                <option value="day">Ngày</option>
                <option value="month">Tháng</option>
              </select>
            </div>

            {filterType === "day" ? (
              <div className="flex-1 sm:flex-initial sm:min-w-[150px]">
                <label className="block text-xs text-gray-600 mb-1">Ngày</label>
                <input
                  type="date"
                  value={dateStr}
                  onChange={(e) => setDateStr(e.target.value)}
                  className="w-full px-2 sm:px-3 py-1.5 border border-gray-300 rounded-md text-xs sm:text-sm focus:ring-2 focus:ring-primary focus:border-primary"
                />
              </div>
            ) : (
              <div className="flex-1 sm:flex-initial sm:min-w-[150px]">
                <label className="block text-xs text-gray-600 mb-1">Tháng</label>
                <input
                  type="month"
                  value={monthStr}
                  onChange={(e) => setMonthStr(e.target.value)}
                  className="w-full px-2 sm:px-3 py-1.5 border border-gray-300 rounded-md text-xs sm:text-sm focus:ring-2 focus:ring-primary focus:border-primary"
                />
              </div>
            )}
          </div>

          {/* Loại giao dịch theo lớp (desktop) */}
          {!isGameSource && (
            <div className="hidden sm:block sm:flex-initial sm:min-w-[180px]">
              <label className="block text-xs text-gray-600 mb-1">
                Loại giao dịch
              </label>
              <select
                className="w-full px-2 sm:px-3 py-1.5 border border-gray-300 rounded-md text-xs sm:text-sm focus:ring-2 focus:ring-primary focus:border-primary"
                value={transactionTypeFilter}
                onChange={(e) =>
                  setTransactionTypeFilter(
                    e.target.value as typeof transactionTypeFilter
                  )
                }
              >
                <option value="add">Cộng</option>
                <option value="subtract">Trừ</option>
              </select>
            </div>
          )}

          {/* Actions */}
          <div className="flex flex-row gap-2 sm:contents">
            <div className="flex items-end gap-1.5 sm:flex-initial sm:ml-auto">
              <Button
                variant="outline"
                size="sm"
                onClick={async () => {
                  try {
                    if (refetch) {
                      await refetch();
                    }
                    toast.success("Đã làm mới dữ liệu");
                  } catch (error) {
                    console.error("Error refreshing:", error);
                  }
                }}
                className="px-2 py-1.5 text-white bg-primary hover:bg-primary/90"
                title="Làm mới"
              >
                <FiRefreshCw
                  className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`}
                />
              </Button>
              {((isGameSource && hasGameFilter) ||
                (!isGameSource &&
                  (transactionTypeFilter !== "add" ||
                    selectedClassId !== "none"))) && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    if (isGameSource) {
                      setGameFilter("all");
                      setModeFilter("all");
                    } else {
                      setTransactionTypeFilter("add");
                      setSelectedClassId("none");
                    }
                  }}
                  className="px-2 py-1.5 text-red-600 hover:text-red-700"
                  title="Xóa bộ lọc"
                >
                  <FiX className="w-4 h-4" />
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Error State */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3">
          <p className="text-sm text-red-800">
            {error instanceof Error ? error.message : "Có lỗi xảy ra"}
          </p>
        </div>
      )}

      {/* Transactions Count and Table */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
        <div className="px-3 sm:px-4 py-2 border-b border-gray-200 flex items-center justify-between gap-2">
          <p className="text-xs sm:text-sm text-gray-600">
            {needPickClass ? (
              <span className="text-gray-500 italic">
                Vui lòng chọn lớp học để xem giao dịch
              </span>
            ) : (
              <>
                Tổng:{" "}
                <span className="font-bold text-primary">
                  {filteredTransactions.length}
                </span>{" "}
                giao dịch
              </>
            )}
          </p>
          {isGameSource && !needPickClass && (
            <p className="flex items-center gap-1 text-xs sm:text-sm text-gray-600">
              Đã thưởng:{" "}
              <span className="font-bold text-green-600">{totalAdded}</span>
              <Image
                src="/assets/images/dorayaki.png"
                alt="bánh mì"
                width={16}
                height={16}
                className="object-contain"
              />
            </p>
          )}
        </div>
        <div className="overflow-x-auto">
          {needPickClass ? (
            <div className="p-8 text-center text-gray-500">
              <p className="text-sm flex items-center justify-center gap-1">
                Chọn lớp học từ dropdown phía trên để xem giao dịch{" "}
                <Image
                  src="/assets/images/dorayaki.png"
                  alt="bánh mì"
                  width={16}
                  height={16}
                  className="object-contain"
                />
              </p>
            </div>
          ) : (
            <AdminTable
              columns={columns}
              data={filteredTransactions}
              loading={isLoading}
              emptyMessage="Không có giao dịch nào"
              showCheckbox={false}
            />
          )}
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      {selectedTransaction && (
        <AdminModal
          isOpen={isDeleteModalOpen}
          onClose={closeDeleteModal}
          title="Xác nhận xóa"
          size="sm"
        >
          <div className="space-y-4">
            <p className="text-sm text-gray-600">
              <span className="text-blue-600 font-medium">
                {selectedTransaction.studentName}
              </span>{" "}
              — {selectedTransaction.reason}. Xóa?
            </p>
            <div className="flex justify-end space-x-2">
              <Button variant="outline" onClick={closeDeleteModal}>
                Hủy
              </Button>
              <Button
                onClick={handleDeleteTransaction}
                disabled={isDeleting}
                variant="warning"
              >
                {isDeleting ? "Đang xóa..." : "Xóa"}
              </Button>
            </div>
          </div>
        </AdminModal>
      )}
    </div>
  );
}
