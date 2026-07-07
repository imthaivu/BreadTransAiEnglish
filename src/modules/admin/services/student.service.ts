import { db, auth } from "@/lib/firebase/client";
import { IProfile, IStudent, IPaginatedResponse } from "@/types";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  updateDoc,
  where,
  QueryConstraint,
} from "firebase/firestore";
import { syncMemberAvatarInClasses } from "@/modules/classes/api/member-avatar";

// Collection name
const STUDENTS_COLLECTION = "users";

// Types for service functions
export interface CreateStudentData {
  displayName: string;
  phone: string;
  avatarUrl?: string;
  classIds?: string[];
  parentPhone?: string;
  grade?: string;
  school?: string;
  address?: string;
  birthYear?: number;
  nextExamDate?: string;
}

export interface UpdateStudentData {
  displayName?: string;
  phone?: string;
  avatarUrl?: string;
  classIds?: string[];
  parentPhone?: string;
  address?: string;
  addressDetail?: string;
  streakCount?: number;
  quizAccuracy?: number;
  speakingAccuracy?: number;
  countHeart?: number;
  timesVocabXS?: number;
  timesVocab?: number;
  note?: string;
  achievements?: string;
  isSelfClaimed?: boolean;
  birthYear?: number;
  nextExamDate?: string;
}

// Get all students with pagination and search
export const getStudents = async (
  options?: {
    page?: number;
    limit?: number;
    classId?: string;
    searchKeyword?: string;
  }
): Promise<IPaginatedResponse<IStudent>> => {
  try {
    const {
      page = 1,
      limit: pageLimit = 10,
      classId,
      searchKeyword,
    } = options || {};

    const studentsRef = collection(db, STUDENTS_COLLECTION);
    const queryConstraints: QueryConstraint[] = [
      where("role", "==", "student"),
    ];

    // Special case: "no-class" means students without any class
    const isNoClassFilter = classId === "no-class";

    // If classId is provided (and not "no-class"), filter by classIds array-contains
    // Note: We don't use orderBy on server-side to avoid needing composite indexes
    // All sorting will be done on client-side
    if (classId && !isNoClassFilter) {
      queryConstraints.push(where("classIds", "array-contains", classId));
    } else if (isNoClassFilter) {
      // Query students with empty classIds array on server-side
      // Note: This only matches students with classIds = [], not those without the field
      queryConstraints.push(where("classIds", "==", []));
    }
    // No orderBy - we'll sort on client-side to avoid needing composite indexes

    // Fetch all matching students (for search and total count)
    const q = query(studentsRef, ...queryConstraints);
    const querySnapshot = await getDocs(q);

    let allStudents = querySnapshot.docs.map((doc) => {
      const data = doc.data();
      return {
        id: doc.id,
        ...data,
        createdAt: data.createdAt?.toDate(),
        updatedAt: data.updatedAt?.toDate(),
      };
    }) as IStudent[];

    // For "no-class" filter: also include students without classIds field (undefined/null)
    // Firestore query only matches classIds = [], so we need to also check for missing field
    if (isNoClassFilter) {
      // Query for students without classIds field (field doesn't exist)
      // We need a separate query since Firestore can't query "field doesn't exist" directly
      // But we can filter on client-side for the few cases where classIds is undefined/null
      // The main filtering (classIds = []) is already done on server-side above
      // This client-side filter handles edge cases where classIds field doesn't exist
      allStudents = allStudents.filter((student) => {
        const classIds = student.classIds;
        return !classIds || (Array.isArray(classIds) && classIds.length === 0);
      });
    }

    // Sort by createdAt desc on client side (always sort on client to avoid needing composite indexes)
    allStudents = allStudents.sort((a, b) => {
      const aDate = a.createdAt?.getTime() || 0;
      const bDate = b.createdAt?.getTime() || 0;
      return bDate - aDate; // desc order
    });

    // Apply search filter on server side
    let filteredStudents = allStudents;
    if (searchKeyword && searchKeyword.trim()) {
      const keyword = searchKeyword.toLowerCase().trim();
      filteredStudents = allStudents.filter((student) => {
        const nameMatch = student.displayName
          ?.toLowerCase()
          .includes(keyword) || false;

        const phoneMatch = student.phone?.toLowerCase().includes(keyword) || false;

        return nameMatch || phoneMatch;
      });
    }

    // Calculate pagination
    const total = filteredStudents.length;
    const totalPages = Math.ceil(total / pageLimit);
    const startIndex = (page - 1) * pageLimit;
    const endIndex = startIndex + pageLimit;
    const paginatedStudents = filteredStudents.slice(startIndex, endIndex);

    return {
      data: paginatedStudents,
      pagination: {
        page,
        limit: pageLimit,
        total,
        totalPages,
      },
    };
  } catch (error) {
    console.error("Error getting students:", error);
    throw error;
  }
};

// Get student by ID
export const getStudentById = async (
  studentId: string
): Promise<IProfile | null> => {
  try {
    const studentRef = doc(db, STUDENTS_COLLECTION, studentId);
    const studentSnap = await getDoc(studentRef);

    if (studentSnap.exists()) {
      const data = studentSnap.data();
      return {
        id: studentSnap.id,
        ...data,
        createdAt: data.createdAt?.toDate(),
        updatedAt: data.updatedAt?.toDate(),
      } as IProfile;
    }
    return null;
  } catch (error) {
    console.error("Error getting student:", error);
    throw error;
  }
};

// Create new student
export const createStudent = async (
  studentData: CreateStudentData
): Promise<IProfile> => {
  try {
    const studentsRef = collection(db, STUDENTS_COLLECTION);
    const now = new Date();

    const newStudent = {
      ...studentData,
      role: "student",
      createdAt: now,
      updatedAt: now,
    };

    const docRef = await addDoc(studentsRef, newStudent);

    return {
      id: docRef.id,
      ...newStudent,
    } as IProfile;
  } catch (error) {
    console.error("Error creating student:", error);
    throw error;
  }
};

// Update student
export const updateStudent = async (
  studentId: string,
  studentData: UpdateStudentData
): Promise<boolean> => {
  try {
    // Fields that should allow empty strings (to clear/delete content)
    const textFields = ['note', 'address', 'addressDetail', 'phone', 'parentPhone', 'nextExamDate'];
    const cleanedEntries = Object.entries(studentData).filter(
      ([key, value]) => {
        // Always include text fields even if empty string (to allow clearing)
        if (textFields.includes(key)) {
          return value !== undefined;
        }
        // For other fields, filter out undefined and empty strings
        return value !== undefined && value !== "";
      }
    );
    const cleaned = Object.fromEntries(cleanedEntries);
    if (Object.keys(cleaned).length === 0) return true; // Nothing to update

    // If phone is not being updated, we can direct update firestore 
    // This allows teachers to update student stats without admin APIs
    if (cleaned.phone === undefined) {
      const studentRef = doc(db, STUDENTS_COLLECTION, studentId);
      await updateDoc(studentRef, {
        ...cleaned,
        updatedAt: new Date()
      });
      if (cleaned.avatarUrl) {
        await syncMemberAvatarInClasses({
          memberId: studentId,
          avatarUrl: cleaned.avatarUrl,
        });
      }
      return true;
    }

    // Use API route instead of direct Firestore update doc to ensure sync with Auth
    const currentUser = auth.currentUser;
    if (!currentUser) throw new Error("Chưa đăng nhập");
    const idToken = await currentUser.getIdToken();

    const response = await fetch(`/api/admin/users/${studentId}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${idToken}`,
      },
      body: JSON.stringify(cleaned),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || "Cập nhật học sinh thất bại");
    }

    if (cleaned.avatarUrl) {
      await syncMemberAvatarInClasses({
        memberId: studentId,
        avatarUrl: cleaned.avatarUrl,
      });
    }

    return true;
  } catch (error) {
    console.error("Error updating student:", error);
    throw error;
  }
};

// Delete student
export const deleteStudent = async (studentId: string): Promise<boolean> => {
  try {
    const studentRef = doc(db, STUDENTS_COLLECTION, studentId);
    await deleteDoc(studentRef);
    return true;
  } catch (error) {
    console.error("Error deleting student:", error);
    throw error;
  }
};

