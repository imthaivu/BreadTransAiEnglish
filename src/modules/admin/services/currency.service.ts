import { UserRole } from "@/lib/auth/types";
import { db } from "@/lib/firebase/client";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  updateDoc,
  where,
  increment,
  Timestamp,
  writeBatch,
  serverTimestamp,
  QueryConstraint,
  getCountFromServer,
} from "firebase/firestore";
import { ICurrencyRequest, CurrencyRequestStatus } from "@/types";
import {
  endOfDay,
  startOfDay,
  startOfMonth,
  startOfWeek,
  endOfWeek,
  endOfMonth,
} from "date-fns";

// Collection name
const CURRENCY_COLLECTION = "currency";

// Types for service functions
export interface CreateCurrencyData {
  studentId: string;
  studentName: string;
  userId: string;
  userName: string;
  userRole: UserRole;
  amount: number;
  reason: string;
  type: "add" | "subtract" | "shopee";
  classId?: string; // Optional: class ID where transaction occurred
}

/** Loại nguồn bánh từ game: chơi bằng vé (ranked) hoặc đấu solo PvP. */
export type GameCurrencyMode = "ranked" | "pvp";

/** Thông tin game đính kèm giao dịch (do server award ghi vào). */
export interface GameCurrencyMeta {
  gameId?: string;
  playToken?: string;
  roomId?: string;
  mode?: GameCurrencyMode;
}

// Extended interface for Currency
export interface ICurrency {
  id: string;
  studentId: string;
  studentName: string;
  userId: string;
  userName: string;
  userRole: UserRole;
  amount: number;
  reason: string;
  type: "add" | "subtract" | "shopee";
  classId?: string; // Optional: class ID where transaction occurred
  gameMeta?: GameCurrencyMeta | null; // Có khi giao dịch sinh ra từ game
  createdAt: Date;
  updatedAt: Date;
}

export interface CurrencyStats {
  today: number;
  thisWeek: number;
  thisMonth: number;
}

// Get all currency transactions
export const getCurrencyTransactions = async (): Promise<ICurrency[]> => {
  try {
    const currencyRef = collection(db, CURRENCY_COLLECTION);
    const q = query(currencyRef, orderBy("createdAt", "desc"));
    const querySnapshot = await getDocs(q);

    return querySnapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
      createdAt: doc.data().createdAt?.toDate(),
      updatedAt: doc.data().updatedAt?.toDate(),
    })) as ICurrency[];
  } catch (error) {
    console.error("Error getting currency transactions:", error);
    throw error;
  }
};

export const getCurrencyStats = async (): Promise<CurrencyStats> => {
  try {
    const now = new Date();
    const todayStart = startOfDay(now);
    const todayEnd = endOfDay(now);
    const weekStart = startOfWeek(now, { weekStartsOn: 1 }); // Monday
    const weekEnd = endOfWeek(now, { weekStartsOn: 1 });
    const monthStart = startOfMonth(now);
    const monthEnd = endOfMonth(now);

    const currencyRef = collection(db, CURRENCY_COLLECTION);

    // Create queries for different time ranges
    const todayQuery = query(
      currencyRef,
      where("createdAt", ">=", Timestamp.fromDate(todayStart)),
      where("createdAt", "<=", Timestamp.fromDate(todayEnd))
    );
    const weekQuery = query(
      currencyRef,
      where("createdAt", ">=", Timestamp.fromDate(weekStart)),
      where("createdAt", "<=", Timestamp.fromDate(weekEnd))
    );
    const monthQuery = query(
      currencyRef,
      where("createdAt", ">=", Timestamp.fromDate(monthStart)),
      where("createdAt", "<=", Timestamp.fromDate(monthEnd))
    );

    // Get count for each query
    const [todaySnapshot, weekSnapshot, monthSnapshot] = await Promise.all([
      getCountFromServer(todayQuery),
      getCountFromServer(weekQuery),
      getCountFromServer(monthQuery),
    ]);

    return {
      today: todaySnapshot.data().count,
      thisWeek: weekSnapshot.data().count,
      thisMonth: monthSnapshot.data().count,
    };
  } catch (error) {
    console.error("Error getting currency stats:", error);
    throw error;
  }
};

// Get currency transactions for a specific day
export const getCurrencyTransactionsByDate = async (
  forDate: Date,
  classId?: string,
  transactionType?: "subtract" | "shopee" | "add"
): Promise<ICurrency[]> => {
  try {
    // Only query when classId is provided
    if (!classId) {
      return [];
    }

    const dayStart = new Date(forDate);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(forDate);
    dayEnd.setHours(23, 59, 59, 999);

    const startTs = Timestamp.fromDate(dayStart);
    const endTs = Timestamp.fromDate(dayEnd);

    const currencyRef = collection(db, CURRENCY_COLLECTION);
    
    // Build query with required classId filter
    const queryConstraints: QueryConstraint[] = [
      where("createdAt", ">=", startTs),
      where("createdAt", "<=", endTs),
      where("classId", "==", classId),
    ];
    
    // Filter by transaction type on server-side
    if (transactionType) {
      queryConstraints.push(where("type", "==", transactionType));
    }
    
    queryConstraints.push(orderBy("createdAt", "desc"));
    
    const q = query(currencyRef, ...queryConstraints);
    const querySnapshot = await getDocs(q);

    const transactions = querySnapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
      createdAt: doc.data().createdAt?.toDate(),
      updatedAt: doc.data().updatedAt?.toDate(),
    })) as ICurrency[];

    return transactions;
  } catch (error) {
    console.error("Error getting currency transactions by date:", error);
    throw error;
  }
};

// Get currency transactions for current month
export const getCurrencyTransactionsByMonth = async (
  forDate: Date,
  classId?: string,
  transactionType?: "subtract" | "shopee" | "add"
): Promise<ICurrency[]> => {
  try {
    // Only query when classId is provided
    if (!classId) {
      return [];
    }

    const monthStart = startOfMonth(forDate);
    monthStart.setHours(0, 0, 0, 0);
    const monthEnd = endOfMonth(forDate);
    monthEnd.setHours(23, 59, 59, 999);

    const startTs = Timestamp.fromDate(monthStart);
    const endTs = Timestamp.fromDate(monthEnd);

    const currencyRef = collection(db, CURRENCY_COLLECTION);
    
    // Build query with required classId filter
    const queryConstraints: QueryConstraint[] = [
      where("createdAt", ">=", startTs),
      where("createdAt", "<=", endTs),
      where("classId", "==", classId),
    ];
    
    // Filter by transaction type on server-side
    if (transactionType) {
      queryConstraints.push(where("type", "==", transactionType));
    }
    
    queryConstraints.push(orderBy("createdAt", "desc"));
    
    const q = query(currencyRef, ...queryConstraints);
    const querySnapshot = await getDocs(q);

    const transactions = querySnapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
      createdAt: doc.data().createdAt?.toDate(),
      updatedAt: doc.data().updatedAt?.toDate(),
    })) as ICurrency[];

    return transactions;
  } catch (error) {
    console.error("Error getting currency transactions by month:", error);
    throw error;
  }
};

/**
 * Lấy các giao dịch bánh sinh ra từ GAME (đấu PvP hoặc chơi bằng vé).
 * Các giao dịch này có classId = null nên không hiện ở ledger lớp; lọc theo gameMeta.
 * Truy vấn theo khoảng thời gian (ngày/tháng) rồi lọc gameMeta phía client để
 * tránh phải tạo composite index cho field lồng nhau.
 */
export const getGameCurrencyTransactions = async (
  forDate: Date,
  filterType: "day" | "month" = "day",
  gameId?: string,
  mode?: GameCurrencyMode
): Promise<ICurrency[]> => {
  try {
    const start =
      filterType === "month" ? startOfMonth(forDate) : new Date(forDate);
    const end = filterType === "month" ? endOfMonth(forDate) : new Date(forDate);
    start.setHours(0, 0, 0, 0);
    end.setHours(23, 59, 59, 999);

    const currencyRef = collection(db, CURRENCY_COLLECTION);
    const q = query(
      currencyRef,
      where("createdAt", ">=", Timestamp.fromDate(start)),
      where("createdAt", "<=", Timestamp.fromDate(end)),
      orderBy("createdAt", "desc")
    );
    const querySnapshot = await getDocs(q);

    const all = querySnapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
      createdAt: doc.data().createdAt?.toDate(),
      updatedAt: doc.data().updatedAt?.toDate(),
    })) as ICurrency[];

    return all.filter((t) => {
      const gm = t.gameMeta;
      if (!gm || !gm.mode) return false;
      if (mode && gm.mode !== mode) return false;
      if (gameId && gm.gameId !== gameId) return false;
      return true;
    });
  } catch (error) {
    console.error("Error getting game currency transactions:", error);
    throw error;
  }
};

// Get currency transactions by student
export const getCurrencyTransactionsByStudent = async (
  studentId: string
): Promise<ICurrency[]> => {
  try {
    const currencyRef = collection(db, CURRENCY_COLLECTION);
    const q = query(
      currencyRef,
      where("studentId", "==", studentId),
      orderBy("createdAt", "desc")
    );
    const querySnapshot = await getDocs(q);

    return querySnapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
      createdAt: doc.data().createdAt?.toDate(),
      updatedAt: doc.data().updatedAt?.toDate(),
    })) as ICurrency[];
  } catch (error) {
    console.error("Error getting currency transactions by student:", error);
    throw error;
  }
};

// Get currency transaction by ID
export const getCurrencyTransactionById = async (
  transactionId: string
): Promise<ICurrency | null> => {
  try {
    const transactionRef = doc(db, CURRENCY_COLLECTION, transactionId);
    const transactionSnap = await getDoc(transactionRef);

    if (transactionSnap.exists()) {
      return {
        id: transactionSnap.id,
        ...transactionSnap.data(),
        createdAt: transactionSnap.data().createdAt?.toDate(),
        updatedAt: transactionSnap.data().updatedAt?.toDate(),
      } as ICurrency;
    }
    return null;
  } catch (error) {
    console.error("Error getting currency transaction:", error);
    throw error;
  }
};

// Create new currency transaction
export const createCurrencyTransaction = async (
  transactionData: CreateCurrencyData
): Promise<ICurrency> => {
  try {
    const currencyRef = collection(db, CURRENCY_COLLECTION);
    const now = new Date();

    // Check if trying to subtract more than available balance (for subtract and shopee types)
    if (transactionData.type === "subtract" || transactionData.type === "shopee") {
      const studentRef = doc(db, "users", transactionData.studentId);
      const studentSnap = await getDoc(studentRef);

      if (studentSnap.exists()) {
        const studentData = studentSnap.data();
        const currentBalance = studentData.totalBanhRan || 0;

        if (currentBalance < transactionData.amount) {
          throw new Error(
            `Không thể trừ ${transactionData.amount} bánh mì. Số dư hiện tại chỉ có ${currentBalance} bánh mì.`
          );
        }
      }
    }

    const newTransaction = {
      ...transactionData,
      createdAt: now,
      updatedAt: now,
    };

    const docRef = await addDoc(currencyRef, newTransaction);

    // Update student's totalBanhRan
    const studentRef = doc(db, "users", transactionData.studentId);
    const amountToUpdate =
      transactionData.type === "add"
        ? transactionData.amount
        : -transactionData.amount;

    await updateDoc(studentRef, {
      totalBanhRan: increment(amountToUpdate),
      updatedAt: now,
    });

    return {
      id: docRef.id,
      ...newTransaction,
    } as ICurrency;
  } catch (error) {
    console.error("Error creating currency transaction:", error);
    throw error;
  }
};

// Delete currency transaction
export const deleteCurrencyTransaction = async (
  transactionId: string
): Promise<boolean> => {
  try {
    const transactionRef = doc(db, CURRENCY_COLLECTION, transactionId);
    const now = new Date();

    // Get transaction data before deleting
    const transactionSnap = await getDoc(transactionRef);
    const transactionData = transactionSnap.data() as ICurrency;

    // Delete transaction
    await deleteDoc(transactionRef);

    // Revert student's totalBanhRan
    const studentRef = doc(db, "users", transactionData.studentId);
    const amountToRevert =
      transactionData.type === "add"
        ? -transactionData.amount
        : transactionData.amount; // For both subtract and shopee, revert by adding back

    await updateDoc(studentRef, {
      totalBanhRan: increment(amountToRevert),
      updatedAt: now,
    });

    return true;
  } catch (error) {
    console.error("Error deleting currency transaction:", error);
    throw error;
  }
};

// Get student balance (sum of all transactions)
export const getStudentBalance = async (studentId: string): Promise<number> => {
  try {
    const transactions = await getCurrencyTransactionsByStudent(studentId);
    return transactions.reduce((balance, transaction) => {
      return transaction.type === "add"
        ? balance + transaction.amount
        : balance - transaction.amount;
    }, 0);
  } catch (error) {
    console.error("Error getting student balance:", error);
    throw error;
  }
};

// =============================================
// CURRENCY REQUESTS
// =============================================

export const getCurrencyRequests = async (
  status?: CurrencyRequestStatus,
  forDate?: Date
): Promise<ICurrencyRequest[]> => {
  const requestsCol = collection(db, "currencyRequests");
  let q;

  if (forDate) {
    const dayStart = new Date(forDate);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(forDate);
    dayEnd.setHours(23, 59, 59, 999);

    const startTs = Timestamp.fromDate(dayStart);
    const endTs = Timestamp.fromDate(dayEnd);

    if (status) {
      q = query(
        requestsCol,
        where("status", "==", status),
        where("createdAt", ">=", startTs),
        where("createdAt", "<=", endTs),
        orderBy("createdAt", "desc")
      );
    } else {
      q = query(
        requestsCol,
        where("createdAt", ">=", startTs),
        where("createdAt", "<=", endTs),
        orderBy("createdAt", "desc")
      );
    }
  } else if (status) {
    q = query(
      requestsCol,
      where("status", "==", status),
      orderBy("createdAt", "desc")
    );
  } else {
    q = query(requestsCol, orderBy("createdAt", "desc"));
  }

  const snapshot = await getDocs(q);
  return snapshot.docs.map((doc) => {
    const data = doc.data();
    return {
      id: doc.id,
      ...data,
      createdAt: (data.createdAt as Timestamp)?.toDate(),
      reviewedAt: (data.reviewedAt as Timestamp)?.toDate(),
    } as ICurrencyRequest;
  });
};

export const updateCurrencyRequestStatus = async ({
  requestId,
  status,
  adminId,
  adminName,
}: {
  requestId: string;
  status: "approved" | "rejected";
  adminId: string;
  adminName: string;
}) => {
  const requestRef = doc(db, "currencyRequests", requestId);
  const batch = writeBatch(db);

  const requestSnap = await getDoc(requestRef);
  if (!requestSnap.exists()) {
    throw new Error("Không tìm thấy yêu cầu.");
  }
  const requestData = requestSnap.data();

  if (requestData.status !== "pending") {
    throw new Error("Yêu cầu này đã được xử lý.");
  }

  // 1. Update the request document
  batch.update(requestRef, {
    status: status,
    reviewedBy: adminId,
    reviewedAt: serverTimestamp(),
  });

  // 2. If approved, create a currency transaction and update student balance
  if (status === "approved") {
    const studentRef = doc(db, "users", requestData.studentId);
    const currencyCol = collection(db, CURRENCY_COLLECTION);
    const newTransactionRef = doc(currencyCol);

    const transactionData: Omit<ICurrency, "id" | "createdAt" | "updatedAt"> = {
      studentId: requestData.studentId,
      studentName: requestData.studentName,
      userId: adminId,
      userName: adminName,
      userRole: UserRole.ADMIN,
      amount: Math.abs(requestData.amount),
      reason: `[Được duyệt] ${requestData.reason}`,
      type: requestData.amount > 0 ? "add" : "subtract",
    };

    batch.set(newTransactionRef, {
      ...transactionData,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    batch.update(studentRef, {
      totalBanhRan: increment(requestData.amount),
    });
  }

  await batch.commit();
};
