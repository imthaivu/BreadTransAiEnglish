import {
  collection,
  doc,
  getDocs,
  getDoc,
  updateDoc,
  query,
  where,
  writeBatch,
  QueryConstraint,
} from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { getFirebaseAuth } from "@/lib/firebase/client";
import { IProfile, IPaginatedResponse } from "@/types";
import { UserRole } from "@/lib/auth/types";
import { BookProgress } from "@/modules/flashcard/types";

// Collection name
const USERS_COLLECTION = "users";

// Types for service functions
export interface CreateUserData {
  displayName: string;
  phone: string;
  role: UserRole;
  avatarUrl?: string;
  classIds?: string[];
  canCreateClass?: boolean;
  permissions?: string[];
}

export interface UpdateUserData {
  displayName?: string;
  phone?: string;
  role?: UserRole;
  avatarUrl?: string;
  classIds?: string[];
  canCreateClass?: boolean;
  permissions?: string[];
  loginCount?: number;
}

// Get all users with pagination and search
export const getUsers = async (
  options?: {
    page?: number;
    limit?: number;
    role?: UserRole;
    searchKeyword?: string;
    classId?: string;
  }
): Promise<IPaginatedResponse<IProfile>> => {
  try {
    const {
      page = 1,
      limit: pageLimit = 10,
      role,
      searchKeyword,
      classId,
    } = options || {};

    const usersRef = collection(db, USERS_COLLECTION);
    const queryConstraints: QueryConstraint[] = [];

    // Filter by role - always required for server-side optimization
    // Role must be provided to avoid querying all users
    if (role) {
      queryConstraints.push(where("role", "==", role));
    } else {
      // If no role is provided, throw error to enforce role selection
      throw new Error("Role is required for querying users");
    }

    // Special case: "no-class" means users without any class
    const isNoClassFilter = classId === "no-class";

    // If classId is provided (and not "no-class"), filter by classIds array-contains
    // Note: We don't use orderBy on server-side to avoid needing composite indexes
    // All sorting will be done on client-side
    if (classId && !isNoClassFilter) {
      queryConstraints.push(where("classIds", "array-contains", classId));
    } else if (isNoClassFilter) {
      // Query users with empty classIds array on server-side
      // Note: This only matches users with classIds = [], not those without the field
      queryConstraints.push(where("classIds", "==", []));
    }
    // No orderBy - we'll sort on client-side to avoid needing composite indexes

    // Fetch all matching users (for search and total count)
    const q = query(usersRef, ...queryConstraints);
    const querySnapshot = await getDocs(q);

    let allUsers = querySnapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
      createdAt: doc.data().createdAt?.toDate(),
      updatedAt: doc.data().updatedAt?.toDate(),
    })) as IProfile[];

    // For "no-class" filter: also include users without classIds field (undefined/null)
    // Firestore query only matches classIds = [], so we need to also check for missing field
    if (isNoClassFilter) {
      // Query for users without classIds field (field doesn't exist)
      // We need a separate query since Firestore can't query "field doesn't exist" directly
      // But we can filter on client-side for the few cases where classIds is undefined/null
      // The main filtering (classIds = []) is already done on server-side above
      // This client-side filter handles edge cases where classIds field doesn't exist
      allUsers = allUsers.filter((user) => {
        const classIds = (user as IProfile & { classIds?: string[] }).classIds;
        return !classIds || (Array.isArray(classIds) && classIds.length === 0);
      });
    }

    // Sort by createdAt desc on client side (always sort on client to avoid needing composite indexes)
    allUsers = allUsers.sort((a, b) => {
      const aDate = a.createdAt?.getTime() || 0;
      const bDate = b.createdAt?.getTime() || 0;
      return bDate - aDate; // desc order
    });

    // Apply search filter on client side
    let filteredUsers = allUsers;

    if (searchKeyword && searchKeyword.trim()) {
      const keyword = searchKeyword.toLowerCase().trim();
      filteredUsers = filteredUsers.filter((user) => {
        const nameMatch = user.displayName
          ?.toLowerCase()
          .includes(keyword) || false;

        const phoneMatch = (user as IProfile & { phone?: string }).phone?.toLowerCase().includes(keyword) || false;

        return nameMatch || phoneMatch;
      });
    }

    // Calculate pagination
    const total = filteredUsers.length;
    const totalPages = Math.ceil(total / pageLimit);
    const startIndex = (page - 1) * pageLimit;
    const endIndex = startIndex + pageLimit;
    const paginatedUsers = filteredUsers.slice(startIndex, endIndex);

    return {
      data: paginatedUsers,
      pagination: {
        page,
        limit: pageLimit,
        total,
        totalPages,
      },
    };
  } catch (error) {
    console.error("Error getting users:", error);
    throw error;
  }
};

// Get user by ID
export const getUserById = async (userId: string): Promise<IProfile | null> => {
  try {
    const userRef = doc(db, USERS_COLLECTION, userId);
    const userSnap = await getDoc(userRef);

    if (userSnap.exists()) {
      return {
        id: userSnap.id,
        ...userSnap.data(),
        createdAt: userSnap.data().createdAt?.toDate(),
        updatedAt: userSnap.data().updatedAt?.toDate(),
      } as IProfile;
    }
    return null;
  } catch (error) {
    console.error("Error getting user:", error);
    throw error;
  }
};

// Create new user
// DEPRECATED: Không cho phép tạo user từ client-side
// Tất cả việc tạo user phải qua API /api/admin/users/create (chỉ admin mới có quyền)
export const createUser = async (
  userData: CreateUserData
): Promise<IProfile> => {
  void userData;
  throw new Error("Không được phép tạo tài khoản từ client-side. Vui lòng sử dụng API /api/admin/users/create (chỉ admin mới có quyền).");
};

// Update user
export const updateUser = async (
  userId: string,
  userData: UpdateUserData
): Promise<boolean> => {
  try {
    // If role is being updated, use API endpoint to ensure sessionToken is handled correctly
    if (userData.role !== undefined) {
      // Get Firebase ID token for authentication
      const auth = getFirebaseAuth();
      const currentUser = auth.currentUser;

      if (!currentUser) {
        throw new Error("Bạn cần đăng nhập để thực hiện thao tác này.");
      }

      const idToken = await currentUser.getIdToken();

      const response = await fetch(`/api/admin/users/${encodeURIComponent(userId)}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${idToken}`,
        },
        body: JSON.stringify(userData),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || "Cập nhật người dùng thất bại.");
      }

      return true;
    }

    // For non-role updates, use direct Firestore update
    const userRef = doc(db, USERS_COLLECTION, userId);
    const cleanedEntries = Object.entries(userData).filter(
      ([, value]) => value !== undefined && value !== ""
    );
    const cleaned = Object.fromEntries(cleanedEntries);
    if (Object.keys(cleaned).length === 0) return true;
    await updateDoc(userRef, {
      ...cleaned,
      updatedAt: new Date(),
    });
    return true;
  } catch (error) {
    console.error("Error updating user:", error);
    throw error;
  }
};

// Delete user (calls API endpoint to delete both Firestore and Auth)
export const deleteUser = async (userId: string): Promise<boolean> => {
  try {
    // Get Firebase ID token for authentication
    const auth = getFirebaseAuth();
    const currentUser = auth.currentUser;

    if (!currentUser) {
      throw new Error("Bạn cần đăng nhập để thực hiện thao tác này.");
    }

    const idToken = await currentUser.getIdToken();

    const response = await fetch(`/api/admin/users/${encodeURIComponent(userId)}`, {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${idToken}`,
      },
    });

    const data = await response.json();

    if (!response.ok || !data.success) {
      throw new Error(data.error || "Xóa người dùng thất bại.");
    }

    return true;
  } catch (error) {
    console.error("Error deleting user:", error);
    throw error;
  }
};


// Interface for merge user data result
export interface MergeUserDataResult {
  success: boolean;
  stats: {
    quizResults: number;
    listeningProgress: number;
    speakingSubmissions: number;
    currencyTransactions: number;
    currencyRequests: number;
    classMembers: number;
    grammarViews: number;
    reviewWords: number;
  };
  error?: string;
}

// Preview data that will be merged
export interface MergePreviewData {
  quizResults: number;
  listeningProgress: number;
  speakingSubmissions: number;
  currencyTransactions: number;
  currencyRequests: number;
  classMembers: number;
  grammarViews: number;
  reviewWords: number;
}

// Get preview of data that will be merged
export const getMergePreview = async (
  sourceUserId: string,
  targetUserId: string
): Promise<MergePreviewData> => {
  void targetUserId;
  try {
    // Count quiz results from userBookProgress
    // Tối ưu: Đọc từ userBookProgress thay vì quizResults collection
    const bookProgressCol = collection(db, "userBookProgress");
    const bookProgressSnapshot = await getDocs(
      query(bookProgressCol, where("userId", "==", sourceUserId))
    );
    // Count từ userBookProgress (gộp quiz, listening, speaking)
    let quizResultsCount = 0;
    let listeningProgressCount = 0;
    let speakingSubmissionsCount = 0;
    bookProgressSnapshot.docs.forEach((docSnap) => {
      const bookProgress = docSnap.data() as BookProgress;
      const lessons = bookProgress.lessons ?? {};
      quizResultsCount += Object.keys(lessons).length;
      Object.values(lessons).forEach((l) => {
        if ((l.listenCount ?? 0) > 0) {
          listeningProgressCount++;
        }
      });
      speakingSubmissionsCount += bookProgress.completedLessonsSpeaking?.length ?? 0;
    });

    // Get counts from other collections
    const [
      currencyTransactions,
      currencyRequests,
    ] = await Promise.all([
      // Currency Transactions
      getDocs(
        query(
          collection(db, "currency"),
          where("studentId", "==", sourceUserId)
        )
      ),
      // Currency Requests
      getDocs(
        query(
          collection(db, "currencyRequests"),
          where("studentId", "==", sourceUserId)
        )
      ),
    ]);

    // Count reviewWords (now stored in localStorage, not accessible from admin)
    // Note: Review words are stored in localStorage per user, so admin cannot access them
    // This will return 0 as review words are client-side only
    let reviewWordsCount = 0;
    try {
      // Try to get from localStorage if available (only works if viewing own account)
      const { getReviewWords } = await import("@/modules/flashcard/services");
      const reviewWords = await getReviewWords(sourceUserId);
      reviewWordsCount = reviewWords.length;
    } catch (e) {
      // If not accessible (different user's localStorage), count is 0
      reviewWordsCount = 0;
    }

    const sourceUser = await getUserById(sourceUserId);
    const classMembersCount = Array.isArray(sourceUser?.classIds)
      ? sourceUser.classIds.filter(Boolean).length
      : 0;

    return {
      quizResults: quizResultsCount,
      listeningProgress: listeningProgressCount,
      speakingSubmissions: speakingSubmissionsCount,
      currencyTransactions: currencyTransactions.size,
      currencyRequests: currencyRequests.size,
      classMembers: classMembersCount,
      grammarViews: 0, // No longer tracked here via grammarViews collection
      reviewWords: reviewWordsCount,
    };
  } catch (error) {
    console.error("Error getting merge preview:", error);
    throw error;
  }
};

// Merge user data from source to target
export const mergeUserData = async (
  sourceUserId: string,
  targetUserId: string
): Promise<MergeUserDataResult> => {
  try {
    // Verify both users exist
    const [sourceUser, targetUser] = await Promise.all([
      getUserById(sourceUserId),
      getUserById(targetUserId),
    ]);

    if (!sourceUser) {
      throw new Error("Không tìm thấy tài khoản nguồn");
    }
    if (!targetUser) {
      throw new Error("Không tìm thấy tài khoản đích");
    }

    const stats = {
      quizResults: 0,
      listeningProgress: 0,
      speakingSubmissions: 0,
      currencyTransactions: 0,
      currencyRequests: 0,
      classMembers: 0,
      grammarViews: 0,
      reviewWords: 0,
    };

    // Use batch writes for atomicity (Firestore batch limit is 500 operations)
    // We'll need to process in batches if needed
    let currentBatch = writeBatch(db);
    let batchCount = 0;
    const BATCH_LIMIT = 500;

    const commitBatch = async () => {
      if (batchCount > 0) {
        await currentBatch.commit();
        currentBatch = writeBatch(db);
        batchCount = 0;
      }
    };

    // 1. Update userBookProgress (thay vì quizResults)
    // Tối ưu: Update userBookProgress thay vì quizResults collection
    const bookProgressCol = collection(db, "userBookProgress");
    const bookProgressSnapshot = await getDocs(
      query(bookProgressCol, where("userId", "==", sourceUserId))
    );
    for (const docSnap of bookProgressSnapshot.docs) {
      if (batchCount >= BATCH_LIMIT) {
        await commitBatch();
      }
      currentBatch.update(docSnap.ref, { userId: targetUserId });
      batchCount++;
      const bookProgress = docSnap.data() as BookProgress;
      if (bookProgress.lessons) {
        stats.quizResults += Object.keys(bookProgress.lessons).length;
        Object.values(bookProgress.lessons).forEach((l) => {
          if ((l.listenCount ?? 0) > 0) {
            stats.listeningProgress++;
          }
        });
      }
      stats.speakingSubmissions += bookProgress.completedLessonsSpeaking?.length ?? 0;
    }

    // 2. Update Currency Transactions
    const currencyTransactionsSnapshot = await getDocs(
      query(
        collection(db, "currency"),
        where("studentId", "==", sourceUserId)
      )
    );
    for (const docSnap of currencyTransactionsSnapshot.docs) {
      if (batchCount >= BATCH_LIMIT) {
        await commitBatch();
      }
      currentBatch.update(docSnap.ref, { studentId: targetUserId });
      batchCount++;
      stats.currencyTransactions++;
    }

    // 5. Update Currency Requests
    const currencyRequestsSnapshot = await getDocs(
      query(
        collection(db, "currencyRequests"),
        where("studentId", "==", sourceUserId)
      )
    );
    for (const docSnap of currencyRequestsSnapshot.docs) {
      if (batchCount >= BATCH_LIMIT) {
        await commitBatch();
      }
      currentBatch.update(docSnap.ref, { studentId: targetUserId });
      batchCount++;
      stats.currencyRequests++;
    }

    // 6. Update Grammar Views
    // Legacy: We no longer migrate grammar views individually as they belong to classes now.
    stats.grammarViews = 0;

    // 7. Backup Review Words (now stored in localStorage)
    // Note: Review words are stored in localStorage per user, so admin cannot backup them
    // when merging different users' accounts. Review words will remain in source user's localStorage.
    // If merging on the same device/browser, we can try to copy from localStorage.
    try {
      const { getReviewWords, batchAddOrUpdateReviewWords } = await import("@/modules/flashcard/services");
      const sourceReviewWords = await getReviewWords(sourceUserId);
      if (sourceReviewWords.length > 0) {
        // Try to copy to target user's localStorage (only works if same browser)
        await batchAddOrUpdateReviewWords(targetUserId, sourceReviewWords);
        stats.reviewWords = sourceReviewWords.length;
      }
    } catch (e) {
      // If not accessible (different user's localStorage), skip review words backup
      console.warn("Cannot backup review words - stored in localStorage:", e);
      stats.reviewWords = 0;
    }

    // 9. Update Class Members (move membership docs to target user)
    const sourceClassIds = Array.isArray(sourceUser.classIds)
      ? sourceUser.classIds.filter(Boolean)
      : [];
    for (const classId of sourceClassIds) {
      const sourceMemberRef = doc(
        db,
        "classes",
        classId,
        "members",
        sourceUserId
      );
      const memberSnap = await getDoc(sourceMemberRef);
      if (!memberSnap.exists()) continue;

      const memberData = memberSnap.data() || {};
      const targetMemberRef = doc(
        db,
        "classes",
        classId,
        "members",
        targetUserId
      );

      // Build updated member data, but exclude undefined values
      // Filter out undefined values from memberData first
      const cleanMemberData: Record<string, unknown> = {};
      Object.keys(memberData).forEach((key) => {
        if (memberData[key] !== undefined) {
          cleanMemberData[key] = memberData[key];
        }
      });

      const updatedMemberData: Record<string, unknown> = {
        ...cleanMemberData,
      };

      // Update fields only if they have values (not undefined)
      if (targetUser.displayName) {
        updatedMemberData.name = targetUser.displayName;
      } else if (cleanMemberData.name !== undefined) {
        updatedMemberData.name = cleanMemberData.name;
      }

      if (targetUser.avatarUrl) {
        updatedMemberData.avatarUrl = targetUser.avatarUrl;
      } else if (cleanMemberData.avatarUrl !== undefined) {
        updatedMemberData.avatarUrl = cleanMemberData.avatarUrl;
      }
      // If both are undefined, don't include avatarUrl field

      const targetPhone = (targetUser as { phone?: string }).phone;
      if (targetPhone) {
        updatedMemberData.phone = targetPhone;
      } else if (cleanMemberData.phone !== undefined) {
        updatedMemberData.phone = cleanMemberData.phone;
      }

      updatedMemberData.role =
        cleanMemberData.role ||
        (targetUser.role === "teacher" ? "teacher" : "student");

      // Final safety check: Remove any undefined values to avoid Firestore errors
      Object.keys(updatedMemberData).forEach((key) => {
        if (updatedMemberData[key] === undefined) {
          delete updatedMemberData[key];
        }
      });

      if (batchCount >= BATCH_LIMIT) {
        await commitBatch();
      }
      currentBatch.set(targetMemberRef, updatedMemberData, { merge: true });
      batchCount++;
      stats.classMembers++;

      if (batchCount >= BATCH_LIMIT) {
        await commitBatch();
      }
      currentBatch.delete(sourceMemberRef);
      batchCount++;
    }

    // 10. Merge user profile data (merge non-empty fields from source to target)
    const targetUserRef = doc(db, USERS_COLLECTION, targetUserId);
    const updates: Record<string, unknown> = {
      updatedAt: new Date(),
    };

    // Merge Streak (keep the higher value)
    if (sourceUser.streakCount !== undefined) {
      const sourceValue = sourceUser.streakCount || 0;
      const targetValue = targetUser.streakCount || 0;
      if (sourceValue > targetValue) {
        updates.streakCount = sourceUser.streakCount;
        updates.lastStreakUpdate = sourceUser.lastStreakUpdate || new Date();
      } else if (targetValue > 0) {
        // Keep target streak if it's higher
        updates.streakCount = targetUser.streakCount;
        updates.lastStreakUpdate = targetUser.lastStreakUpdate || new Date();
      } else if (sourceValue > 0) {
        // Source has streak, target doesn't
        updates.streakCount = sourceUser.streakCount;
        updates.lastStreakUpdate = sourceUser.lastStreakUpdate || new Date();
      }
    }

    // Merge classIds (combine unique class IDs)
    if (sourceUser.classIds && sourceUser.classIds.length > 0) {
      const targetClassIds = targetUser.classIds || [];
      const mergedClassIds = Array.from(new Set([...targetClassIds, ...sourceUser.classIds]));
      updates.classIds = mergedClassIds;
    }

    // Backup phone (only if target doesn't have one - don't overwrite)
    if (!targetUser.phone && sourceUser.phone) {
      updates.phone = sourceUser.phone;
    }

    // Backup address (prefer source if exists)
    if (sourceUser.address) {
      updates.address = sourceUser.address;
    } else if (targetUser.address) {
      updates.address = targetUser.address;
    }

    // Backup addressDetail (prefer source if exists)
    const sourceUserWithAddressDetail = sourceUser as IProfile & { addressDetail?: string };
    const targetUserWithAddressDetail = targetUser as IProfile & { addressDetail?: string };
    if (sourceUserWithAddressDetail.addressDetail) {
      updates.addressDetail = sourceUserWithAddressDetail.addressDetail;
    } else if (targetUserWithAddressDetail.addressDetail) {
      updates.addressDetail = targetUserWithAddressDetail.addressDetail;
    }

    // Backup parentPhone (prefer source if exists)
    if (sourceUser.parentPhone) {
      updates.parentPhone = sourceUser.parentPhone;
    } else if (targetUser.parentPhone) {
      updates.parentPhone = targetUser.parentPhone;
    }

    // Backup avatarUrl (prefer source if exists)
    if (sourceUser.avatarUrl) {
      updates.avatarUrl = sourceUser.avatarUrl;
    } else if (targetUser.avatarUrl) {
      updates.avatarUrl = targetUser.avatarUrl;
    }

    // Backup achievements (Thành tích)
    const sourceAchievements =
      sourceUser.achievements ??
      (sourceUser as IProfile & { noteRank?: string }).noteRank;
    const targetAchievements =
      targetUser.achievements ??
      (targetUser as IProfile & { noteRank?: string }).noteRank;
    if (sourceAchievements) {
      updates.achievements = sourceAchievements;
    } else if (targetAchievements) {
      updates.achievements = targetAchievements;
    }

    // Backup note (Ghi chú)
    const sourceUserWithNote = sourceUser as IProfile & { note?: string };
    const targetUserWithNote = targetUser as IProfile & { note?: string };
    if (sourceUserWithNote.note) {
      updates.note = sourceUserWithNote.note;
    } else if (targetUserWithNote.note) {
      updates.note = targetUserWithNote.note;
    }

    if (Object.keys(updates).length > 1) { // More than just updatedAt
      if (batchCount >= BATCH_LIMIT) {
        await commitBatch();
      }
      currentBatch.update(targetUserRef, updates);
      batchCount++;
    }

    // Commit final batch
    await commitBatch();

    // Reset source user account to default state (all stats = 0)
    const sourceUserRef = doc(db, USERS_COLLECTION, sourceUserId);
    const sourceUserWithExtras = sourceUser as IProfile & {
      addressDetail?: string;
    };
    const resetUpdates: Record<string, unknown> = {
      streakCount: 0,
      lastStreakUpdate: null,
      classIds: [],
      updatedAt: new Date(),
    };

    // Remove optional fields that might have been set
    if (sourceUser.phone) {
      resetUpdates.phone = null;
    }
    if (sourceUser.address) {
      resetUpdates.address = null;
    }
    if (sourceUserWithExtras.addressDetail) {
      resetUpdates.addressDetail = null;
    }
    if (sourceUser.parentPhone) {
      resetUpdates.parentPhone = null;
    }
    if (sourceUser.bankAccount) {
      resetUpdates.bankAccount = null;
    }
    if (sourceUser.avatarUrl) {
      resetUpdates.avatarUrl = null;
    }
    if (sourceAchievements) {
      resetUpdates.achievements = null;
    }
    const sourceUserWithNoteForReset = sourceUser as IProfile & { note?: string };
    if (sourceUserWithNoteForReset.note) {
      resetUpdates.note = null;
    }

    await updateDoc(sourceUserRef, resetUpdates);

    return {
      success: true,
      stats,
    };
  } catch (error: unknown) {
    console.error("Error merging user data:", error);
    const errorMessage = error instanceof Error ? error.message : "Có lỗi xảy ra khi merge dữ liệu";
    return {
      success: false,
      stats: {
        quizResults: 0,
        listeningProgress: 0,
        speakingSubmissions: 0,
        currencyTransactions: 0,
        currencyRequests: 0,
        classMembers: 0,
        grammarViews: 0,
        reviewWords: 0,
      },
      error: errorMessage,
    };
  }
};
