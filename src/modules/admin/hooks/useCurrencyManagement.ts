import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import {
  CreateCurrencyData,
  ICurrency,
  createCurrencyTransaction,
  deleteCurrencyTransaction,
  getCurrencyRequests,
  getCurrencyStats,
  getCurrencyTransactionById,
  getCurrencyTransactions,
  getCurrencyTransactionsByDate,
  getCurrencyTransactionsByMonth,
  getCurrencyTransactionsByStudent,
  getGameCurrencyTransactions,
  type GameCurrencyMode,
  getStudentBalance,
  updateCurrencyRequestStatus,
} from "../services/currency.service";
import { studentKeys } from "./useStudentManagement";
import { CurrencyRequestStatus } from "@/types";

// Query keys
export const currencyKeys = {
  all: ["currency"] as const,
  lists: () => [...currencyKeys.all, "list"] as const,
  detail: (id: string) => [...currencyKeys.all, "detail", id] as const,
  byStudent: (studentId: string) =>
    [...currencyKeys.all, "student", studentId] as const,
  balance: (studentId: string) =>
    [...currencyKeys.all, "balance", studentId] as const,
  requests: (status?: CurrencyRequestStatus) =>
    [...currencyKeys.all, "requests", { status }] as const,
  stats: () => [...currencyKeys.all, "stats"] as const,
};

// Get all currency transactions
export const useCurrencyTransactions = (
  forDate?: Date,
  classId?: string,
  enabled: boolean = true,
  filterType: "day" | "month" = "day",
  transactionType: "subtract" | "shopee" | "add" = "add"
) => {
  return useQuery({
    queryKey: [...currencyKeys.lists(), { forDate: forDate?.toDateString?.(), classId, filterType, transactionType }],
    queryFn: () => {
      if (!forDate) {
        return getCurrencyTransactions();
      }
      if (filterType === "month") {
        return getCurrencyTransactionsByMonth(forDate, classId, transactionType);
      }
      return getCurrencyTransactionsByDate(forDate, classId, transactionType);
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
    enabled, // Only fetch when enabled is true
  });
};

// Giao dịch bánh sinh ra từ game (PvP / chơi bằng vé)
export const useGameCurrencyTransactions = (
  forDate?: Date,
  filterType: "day" | "month" = "day",
  gameId?: string,
  mode?: GameCurrencyMode,
  enabled: boolean = true
) => {
  return useQuery({
    queryKey: [
      ...currencyKeys.all,
      "game",
      { forDate: forDate?.toDateString?.(), filterType, gameId, mode },
    ],
    queryFn: () =>
      forDate
        ? getGameCurrencyTransactions(forDate, filterType, gameId, mode)
        : Promise.resolve([]),
    enabled: enabled && !!forDate,
    staleTime: 60 * 1000,
    gcTime: 5 * 60 * 1000,
  });
};

export const useCurrencyStats = (enabled: boolean = true) => {
  return useQuery({
    queryKey: currencyKeys.stats(),
    queryFn: getCurrencyStats,
    enabled, // Only fetch when enabled
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
  });
};

// Get currency transactions by student
export const useCurrencyTransactionsByStudent = (studentId: string) => {
  return useQuery({
    queryKey: currencyKeys.byStudent(studentId),
    queryFn: () => getCurrencyTransactionsByStudent(studentId),
    enabled: !!studentId,
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
  });
};

// Get currency transaction by ID
export const useCurrencyTransaction = (transactionId: string) => {
  return useQuery({
    queryKey: currencyKeys.detail(transactionId),
    queryFn: () => getCurrencyTransactionById(transactionId),
    enabled: !!transactionId,
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
  });
};

// Get student balance
export const useStudentBalance = (studentId: string) => {
  return useQuery({
    queryKey: currencyKeys.balance(studentId),
    queryFn: () => getStudentBalance(studentId),
    enabled: !!studentId,
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
  });
};

// =============================================
// REQUESTS HOOKS
// =============================================

export const useCurrencyRequests = (
  status?: CurrencyRequestStatus,
  forDate?: Date
) => {
  return useQuery({
    queryKey: [
      ...currencyKeys.requests(status),
      { forDate: forDate?.toDateString?.() },
    ],
    queryFn: () => getCurrencyRequests(status, forDate),
    staleTime: 1 * 60 * 1000, // 1 minute - requests change frequently
    gcTime: 5 * 60 * 1000, // 5 minutes
  });
};

export const useUpdateCurrencyRequestStatus = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: updateCurrencyRequestStatus,
    onSuccess: () => {
      // Invalidate all request status queries
      queryClient.invalidateQueries({
        queryKey: currencyKeys.requests(),
        exact: false, // Invalidate all request queries regardless of status
      });
      
      // Invalidate currency lists
      queryClient.invalidateQueries({ 
        queryKey: currencyKeys.lists(),
        exact: false,
      });
      
      // Invalidate students list to update balances
      queryClient.invalidateQueries({ 
        queryKey: studentKeys.lists(),
        exact: false,
      });
      
      // Invalidate all balance queries (invalidate by prefix)
      queryClient.invalidateQueries({ 
        queryKey: [...currencyKeys.all, "balance"],
        exact: false,
      });

      toast.success("Yêu cầu đã được cập nhật.");
    },
    onError: (error) => {
      console.error("Error updating currency request:", error);
      toast.error(error.message || "Cập nhật yêu cầu thất bại.");
    },
  });
};

// Create currency transaction mutation
export const useCreateCurrencyTransaction = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: createCurrencyTransaction,
    onSuccess: (newTransaction) => {
      // Add the new transaction to the cache immediately
      queryClient.setQueryData(
        currencyKeys.detail(newTransaction.id),
        newTransaction
      );

      // Invalidate currency transactions lists (all variants)
      queryClient.invalidateQueries({ 
        queryKey: currencyKeys.lists(),
        exact: false,
      });

      // Invalidate student-specific queries
      queryClient.invalidateQueries({
        queryKey: currencyKeys.byStudent(newTransaction.studentId),
        exact: true,
      });
      queryClient.invalidateQueries({
        queryKey: currencyKeys.balance(newTransaction.studentId),
        exact: true,
      });

      // Invalidate students list to update totalBanhRan
      queryClient.invalidateQueries({ 
        queryKey: studentKeys.lists(),
        exact: false,
      });
      
      // Invalidate specific student detail to update totalBanhRan
      queryClient.invalidateQueries({
        queryKey: studentKeys.detail(newTransaction.studentId),
        exact: true,
      });

      // Show appropriate message based on transaction type
      if (newTransaction.type === "subtract") {
        toast.success("Trừ bánh mì thành công!");
      } else if (newTransaction.type === "add") {
        toast.success("Thêm bánh mì thành công!");
      } else if (newTransaction.type === "shopee") {
        toast.success("Thanh toán Shopee thành công!");
      } else {
        toast.success("Giao dịch thành công!");
      }
    },
    onError: (error) => {
      console.error("Error creating currency transaction:", error);
      // Try to get type from error context if available, otherwise use generic message
      const errorMessage = error.message || "Giao dịch thất bại!";
      toast.error(errorMessage);
    },
  });
};

// Delete currency transaction mutation
export const useDeleteCurrencyTransaction = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: deleteCurrencyTransaction,
    onSuccess: (_, transactionId) => {
      // Get transaction from cache before removing to get studentId
      const transaction = queryClient.getQueryData<ICurrency>(
        currencyKeys.detail(transactionId)
      );
      const studentId = transaction?.studentId;

      // Remove transaction from cache immediately
      queryClient.removeQueries({
        queryKey: currencyKeys.detail(transactionId),
        exact: true,
      });

      // Invalidate currency transactions lists (all variants)
      queryClient.invalidateQueries({ 
        queryKey: currencyKeys.lists(),
        exact: false,
      });

      // Invalidate students list to update totalBanhRan
      queryClient.invalidateQueries({ 
        queryKey: studentKeys.lists(),
        exact: false,
      });
      
      // Invalidate specific student detail and related queries if we have the studentId
      if (studentId) {
        queryClient.invalidateQueries({
          queryKey: studentKeys.detail(studentId),
          exact: true,
        });
        queryClient.invalidateQueries({
          queryKey: currencyKeys.byStudent(studentId),
          exact: true,
        });
        queryClient.invalidateQueries({
          queryKey: currencyKeys.balance(studentId),
          exact: true,
        });
      }

      toast.success("Xóa bánh mì thành công!");
    },
    onError: (error) => {
      console.error("Error deleting currency transaction:", error);
      toast.error("Xóa bánh mì thất bại!");
    },
  });
};

// Custom hook for currency management
export const useCurrencyManagement = () => {
  // Get currency transactions
  const {
    data: transactions = [],
    isLoading,
    error,
  } = useCurrencyTransactions();

  // Mutations
  const createTransactionMutation = useCreateCurrencyTransaction();
  const deleteTransactionMutation = useDeleteCurrencyTransaction();

  // CRUD functions
  const handleCreateTransaction = async (
    transactionData: CreateCurrencyData
  ) => {
    return createTransactionMutation.mutateAsync(transactionData);
  };

  const handleDeleteTransaction = async (transactionId: string) => {
    return deleteTransactionMutation.mutateAsync(transactionId);
  };

  return {
    // Data
    transactions,
    isLoading,
    error,

    // CRUD operations
    createTransaction: handleCreateTransaction,
    deleteTransaction: handleDeleteTransaction,

    // Mutation states
    isCreating: createTransactionMutation.isPending,
    isDeleting: deleteTransactionMutation.isPending,
  };
};
