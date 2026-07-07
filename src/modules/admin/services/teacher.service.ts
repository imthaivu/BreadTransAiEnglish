import { db, auth } from "@/lib/firebase/client";
import { IProfile } from "@/types";
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  updateDoc,
  where,
} from "firebase/firestore";
import { syncMemberAvatarInClasses } from "@/modules/classes/api/member-avatar";

// Collection name
const USERS_COLLECTION = "users";

// Types for service functions
export interface CreateTeacherData {
  displayName: string;
  phone: string;
  avatarUrl?: string;
  classIds?: string[];
  address?: string;
  specialization?: string;
  experience?: number;
}

export interface UpdateTeacherData {
  displayName?: string;
  phone?: string;
  avatarUrl?: string;
  classIds?: string[];
  address?: string;
  specialization?: string;
  experience?: number;
  note?: string;
}

// Get all teachers
export const getTeachers = async (): Promise<IProfile[]> => {
  try {
    const usersRef = collection(db, USERS_COLLECTION);
    // Only filter by role = "teacher" to avoid requiring a composite index
    const q = query(usersRef, where("role", "==", "teacher"));
    const querySnapshot = await getDocs(q);

    return querySnapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
      createdAt: doc.data().createdAt?.toDate(),
      updatedAt: doc.data().updatedAt?.toDate(),
    })) as IProfile[];
  } catch (error) {
    console.error("Error getting teachers:", error);
    throw error;
  }
};

// Get teacher by ID
export const getTeacherById = async (
  teacherId: string
): Promise<IProfile | null> => {
  try {
    const teacherRef = doc(db, USERS_COLLECTION, teacherId);
    const teacherSnap = await getDoc(teacherRef);

    if (teacherSnap.exists()) {
      return {
        id: teacherSnap.id,
        ...teacherSnap.data(),
        createdAt: teacherSnap.data().createdAt?.toDate(),
        updatedAt: teacherSnap.data().updatedAt?.toDate(),
      } as IProfile;
    }
    return null;
  } catch (error) {
    console.error("Error getting teacher:", error);
    throw error;
  }
};

// Create new teacher
// DEPRECATED: Không cho phép tạo teacher từ client-side
// Tất cả việc tạo user (bao gồm teacher) phải qua API /api/admin/users/create (chỉ admin mới có quyền)
export const createTeacher = async (
  teacherData: CreateTeacherData
): Promise<IProfile> => {
  void teacherData;
  throw new Error("Không được phép tạo giáo viên từ client-side. Vui lòng sử dụng API /api/admin/users/create (chỉ admin mới có quyền).");
};

// Update teacher
export const updateTeacher = async (
  teacherId: string,
  teacherData: UpdateTeacherData
): Promise<boolean> => {
  try {
    const cleanedEntries = Object.entries(teacherData).filter(
      ([, value]) => value !== undefined && value !== ""
    );
    const cleaned = Object.fromEntries(cleanedEntries);
    if (Object.keys(cleaned).length === 0) return true; // Nothing to update

    // If phone is not being updated, keep direct Firestore update.
    // This allows non-admin teacher profile updates without requiring admin APIs.
    if (cleaned.phone === undefined) {
      const teacherRef = doc(db, USERS_COLLECTION, teacherId);
      await updateDoc(teacherRef, {
        ...cleaned,
        updatedAt: new Date(),
      });
    } else {
      // Use admin API when phone changes so Firebase Auth email/phone-login mapping stays in sync.
      const currentUser = auth.currentUser;
      if (!currentUser) throw new Error("Chưa đăng nhập");
      const idToken = await currentUser.getIdToken();

      const response = await fetch(`/api/admin/users/${teacherId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify(cleaned),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Cập nhật giáo viên thất bại");
      }
    }

    if (cleaned.avatarUrl) {
      await syncMemberAvatarInClasses({
        memberId: teacherId,
        avatarUrl: cleaned.avatarUrl,
      });
    }
    return true;
  } catch (error) {
    console.error("Error updating teacher:", error);
    throw error;
  }
};

// Delete teacher
export const deleteTeacher = async (teacherId: string): Promise<boolean> => {
  try {
    const teacherRef = doc(db, USERS_COLLECTION, teacherId);
    await deleteDoc(teacherRef);
    return true;
  } catch (error) {
    console.error("Error deleting teacher:", error);
    throw error;
  }
};
