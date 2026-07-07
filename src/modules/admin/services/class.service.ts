import { db } from "@/lib/firebase/client";
import {
  ClassStatus,
  IClass,
  IClassMember,
  IClassTeacher,
} from "@/modules/admin/type";

import {
  arrayRemove,
  arrayUnion,
  collection,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  writeBatch,
} from "firebase/firestore";
import { getUserById } from "./user.service";
import { IProfile, IStudent } from "@/types";

// Collection names
const CLASSES_COLLECTION = "classes";
const USERS_COLLECTION = "users";

// Types for service functions
export interface CreateClassData {
  name: string;
  teacherIds?: string[];
  zaloLink?: string;
  meetLink?: string;
  status?: ClassStatus;
}

export interface UpdateClassData {
  name?: string;
  zaloLink?: string;
  meetLink?: string;
  status?: ClassStatus;
  teachers?: IClassTeacher[];
  noteProcess?: string;
}

// Get all classes
export const getClasses = async (): Promise<IClass[]> => {
  try {
    const classesRef = collection(db, CLASSES_COLLECTION);
    const q = query(classesRef, orderBy("createdAt", "desc"));
    const querySnapshot = await getDocs(q);

    return querySnapshot.docs.map((doc) => {
      const data = doc.data();
      return {
        id: doc.id,
        ...data,
        createdAt: data.createdAt?.toDate(),
        updatedAt: data.updatedAt?.toDate(),
      } as IClass;
    });
  } catch (error) {
    console.error("Error getting classes:", error);
    throw error;
  }
};

// Get class by ID
export const getClassById = async (classId: string): Promise<IClass | null> => {
  try {
    const classRef = doc(db, CLASSES_COLLECTION, classId);
    const classSnap = await getDoc(classRef);

    if (classSnap.exists()) {
      const data = classSnap.data();
      return {
        id: classSnap.id,
        ...data,
        createdAt: data.createdAt?.toDate(),
        updatedAt: data.updatedAt?.toDate(),
      } as IClass;
    }
    return null;
  } catch (error) {
    console.error("Error getting class:", error);
    throw error;
  }
};

// Create new class
export const createClass = async (
  classData: CreateClassData
): Promise<IClass> => {
  const teacherIds = classData.teacherIds || [];
  
  if (teacherIds.length === 0) {
    throw new Error("At least one teacher is required");
  }

  // Fetch all teacher profiles
  const teacherProfiles = await Promise.all(
    teacherIds.map(async (teacherId) => {
      const profile = (await getUserById(teacherId)) as IProfile | null;
      if (!profile) {
        throw new Error(`Teacher with ID ${teacherId} not found`);
      }
      return profile;
    })
  );

  const batch = writeBatch(db);
  const now = serverTimestamp();

  // 1. Create class document with teachers array
  const classRef = doc(collection(db, CLASSES_COLLECTION));
  const teachers: IClassTeacher[] = teacherProfiles.map((profile) => ({
    id: profile.id,
    name: profile.displayName || "N/A",
    avatarUrl: profile.avatarUrl || "",
    phone: (profile as unknown as { phone?: string }).phone || "",
  }));

  const newClassData = {
    name: classData.name,
    status: classData.status || ClassStatus.ACTIVE,
    links: {
      zalo: classData.zaloLink || "",
      meet: classData.meetLink || "",
    },
    teachers: teachers,
    students: [] as Array<{studentId: string; name: string}>, // Initialize empty students array with new format
    createdAt: now,
    updatedAt: now,
  };
  batch.set(classRef, newClassData);

  // 2. Update each teacher's user document with the new classId
  for (const teacherProfile of teacherProfiles) {
    const teacherUserRef = doc(db, USERS_COLLECTION, teacherProfile.id);
    batch.update(teacherUserRef, {
      classIds: arrayUnion(classRef.id),
    });
  }

  await batch.commit();

  return {
    id: classRef.id,
    ...newClassData,
    createdAt: new Date(), // Approximate for return value
    updatedAt: new Date(),
  } as IClass;
};

// Update class
export const updateClass = async (
  classId: string,
  classData: UpdateClassData
): Promise<void> => {
  const batch = writeBatch(db);
  const now = serverTimestamp();
  const classRef = doc(db, CLASSES_COLLECTION, classId);
  
  // Get current class data
  const classSnap = await getDoc(classRef);
  if (!classSnap.exists()) {
    throw new Error("Class not found");
  }
  const currentClassData = classSnap.data() as IClass;
  
  // Build update object with only defined fields
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const dataToUpdate: any = { updatedAt: now };

  if (classData.name !== undefined) dataToUpdate.name = classData.name;
  if (classData.status !== undefined) dataToUpdate.status = classData.status;

  // Handle teachers update
  if (classData.teachers !== undefined) {
    const newTeachers: IClassTeacher[] = classData.teachers;
    
    const oldTeachers = currentClassData.teachers || [];
    const oldTeacherIds = new Set(oldTeachers.map(t => t.id));
    const newTeacherIds = new Set(newTeachers.map(t => t.id));

    // Find teachers to remove (in old but not in new)
    const teachersToRemove = oldTeachers.filter(t => !newTeacherIds.has(t.id));
    
    // Find teachers to add (in new but not in old)
    const teachersToAdd = newTeachers.filter(t => !oldTeacherIds.has(t.id));

    // Remove teachers that are no longer in the class
    for (const teacherToRemove of teachersToRemove) {
      // Remove classId from teacher's user document (only if user still exists)
      const oldTeacherUserRef = doc(db, USERS_COLLECTION, teacherToRemove.id);
      const oldTeacherUserDoc = await getDoc(oldTeacherUserRef);
      if (oldTeacherUserDoc.exists()) {
        batch.update(oldTeacherUserRef, { classIds: arrayRemove(classId) });
      }
    }

    // Add new teachers
    for (const teacherToAdd of teachersToAdd) {
      // Get teacher profile to ensure it exists
      const teacherProfile = (await getUserById(teacherToAdd.id)) as IProfile | null;
      if (!teacherProfile) {
        throw new Error(`Teacher with ID ${teacherToAdd.id} not found`);
      }

      // Add classId to teacher's user document
      const newTeacherUserRef = doc(db, USERS_COLLECTION, teacherToAdd.id);
      batch.update(newTeacherUserRef, { classIds: arrayUnion(classId) });
    }

    // Update teachers array in class document
    dataToUpdate.teachers = newTeachers;
  }
  
  // Handle links update (Firestore doesn't support nested field updates with dot notation in batch)
  if (classData.zaloLink !== undefined || classData.meetLink !== undefined) {
    const currentLinks = currentClassData.links || { zalo: "", meet: "" };
    dataToUpdate.links = {
      zalo: classData.zaloLink !== undefined ? classData.zaloLink : currentLinks.zalo,
      meet: classData.meetLink !== undefined ? classData.meetLink : currentLinks.meet,
    };
  }

  // Handle noteProcess update
  if (classData.noteProcess !== undefined) {
    dataToUpdate.noteProcess = classData.noteProcess;
  }

  // Update class document
  batch.update(classRef, dataToUpdate);

  await batch.commit();
};

// Delete class
// Removes classId from all students' and teachers' user documents (from students[] and teachers[] arrays)
export const deleteClass = async (classId: string): Promise<void> => {
  const batch = writeBatch(db);
  const classRef = doc(db, CLASSES_COLLECTION, classId);

  // 1. Get class data to get students[] and teachers[] arrays
  const classSnap = await getDoc(classRef);
  if (!classSnap.exists()) {
    throw new Error("Class not found");
  }

  const classData = classSnap.data();
  // Get students from new format: Array<{studentId: string, name: string}>
  const studentsData = Array.isArray(classData.students) ? (classData.students as Array<{studentId: string; name: string}>) : [];
  const studentIds = studentsData.map(s => s.studentId);
  const teachers = Array.isArray(classData.teachers) ? (classData.teachers as Array<{ id: string }>) : [];
  const teacherIds = teachers.map((t) => t.id);

  // 2. Remove classId from all students' user documents
  for (const studentId of studentIds) {
    const studentUserRef = doc(db, USERS_COLLECTION, studentId);
    const studentUserDoc = await getDoc(studentUserRef);
    
    if (studentUserDoc.exists()) {
      batch.update(studentUserRef, { classIds: arrayRemove(classId) });
    }
  }

  // 3. Remove classId from all teachers' user documents
  for (const teacherId of teacherIds) {
    const teacherUserRef = doc(db, USERS_COLLECTION, teacherId);
    const teacherUserDoc = await getDoc(teacherUserRef);
    
    if (teacherUserDoc.exists()) {
      batch.update(teacherUserRef, { classIds: arrayRemove(classId) });
    }
  }

  // 4. Delete the main class document
  batch.delete(classRef);

  await batch.commit();
};

// Get members of a class
// Students: reads from students[] array in class document
// Teachers: reads from teachers[] array in class document
export const getClassMembers = async (
  classId: string
): Promise<IClassMember[]> => {
  const classRef = doc(db, CLASSES_COLLECTION, classId);
  const classSnap = await getDoc(classRef);

  if (!classSnap.exists()) {
    return [];
  }

  const classData = classSnap.data();

  // Get students directly from class.students[] (single class-doc read only)
  const studentsData = Array.isArray(classData.students)
    ? (classData.students as Array<{ studentId: string; name: string; avatarUrl?: string }>)
    : [];
  const allStudentMembers: IClassMember[] = studentsData.map((student) => ({
    id: student.studentId,
    name: student.name || "Học sinh",
    avatarUrl: student.avatarUrl || "",
    // Intentionally skip user-profile lookups to keep class detail modal at one query.
    phone: "",
    role: "student" as const,
    status: "active" as const,
    joinedAt: new Date(),
  }));

  // Get teachers directly from class.teachers[] (single class-doc read only)
  const teachersArray = Array.isArray(classData.teachers)
    ? (classData.teachers as Array<{
        id: string;
        name: string;
        avatarUrl?: string;
        phone?: string;
      }>)
    : [];
  const teachers: IClassMember[] = teachersArray.map((teacher) => ({
    id: teacher.id,
    name: teacher.name || "N/A",
    avatarUrl: teacher.avatarUrl || "",
    // Intentionally skip phone to avoid per-user reads in detail modal.
    phone: "",
    role: "teacher" as const,
    status: "active" as const,
    joinedAt: new Date(), // We don't have joinedAt in array format, use current date as fallback
  }));

  // Combine teachers and students
  return [...teachers, ...allStudentMembers];
};

// Add a student to a class
// Only uses students[] array format
export const addStudentToClass = async (
  classId: string,
  studentId: string
): Promise<void> => {
  const studentProfile = (await getUserById(studentId)) as IStudent | null;
  if (!studentProfile || studentProfile.role !== "student") {
    throw new Error("Student profile not found or user is not a student.");
  }

  const batch = writeBatch(db);
  const now = serverTimestamp();
  const classRef = doc(db, CLASSES_COLLECTION, classId);
  
  // Get current class data
  const classSnap = await getDoc(classRef);
  if (!classSnap.exists()) {
    throw new Error("Class not found");
  }
  
  const classData = classSnap.data();
  const studentsData = Array.isArray(classData.students) ? (classData.students as Array<{studentId: string; name: string}>) : [];
  
  // Check if student already exists
  const studentExists = studentsData.some(s => s.studentId === studentId);
  
  if (!studentExists) {
    const newStudent = {
      studentId: studentId,
      name: studentProfile.displayName || "Chưa có tên",
      ...(studentProfile.avatarUrl && { avatarUrl: studentProfile.avatarUrl }),
    };
    batch.update(classRef, {
      students: [...studentsData, newStudent],
      updatedAt: now,
    });
  }

  // Update student's user document with the new classId
  const studentUserRef = doc(db, USERS_COLLECTION, studentId);
  batch.update(studentUserRef, { classIds: arrayUnion(classId) });

  await batch.commit();
};

// Remove a member (student or teacher) from a class
// Students: removed from students[] array
// Teachers: removed from teachers[] array
export const removeMemberFromClass = async (
  classId: string,
  memberId: string
): Promise<void> => {
  const batch = writeBatch(db);
  const classRef = doc(db, CLASSES_COLLECTION, classId);
  
  // Get current class data
  const classSnap = await getDoc(classRef);
  if (!classSnap.exists()) {
    throw new Error("Class not found");
  }

  const classData = classSnap.data();
  
  // Check if member is a student or teacher by checking user document
  const userRef = doc(db, USERS_COLLECTION, memberId);
  const userDoc = await getDoc(userRef);
  const isStudent = userDoc.exists() && userDoc.data()?.role === "student";

  if (isStudent) {
    // Remove student from students[] array - new format: Array<{studentId: string, name: string}>
    const studentsData = Array.isArray(classData.students) ? (classData.students as Array<{studentId: string; name: string}>) : [];
    const updatedStudents = studentsData.filter(s => s.studentId !== memberId);
    
    if (updatedStudents.length !== studentsData.length) {
      batch.update(classRef, {
        students: updatedStudents,
        updatedAt: serverTimestamp(),
      });
    }
  } else {
    // Remove teacher from teachers[] array
    const currentTeachers = Array.isArray(classData.teachers) ? (classData.teachers as Array<{ id: string }>) : [];
    const updatedTeachers = currentTeachers.filter((t) => t.id !== memberId);
    
    batch.update(classRef, {
      teachers: updatedTeachers,
      updatedAt: serverTimestamp(),
    });
  }

  // Remove classId from member's user document (only if user still exists)
  if (userDoc.exists()) {
    batch.update(userRef, { classIds: arrayRemove(classId) });
  }

  await batch.commit();
};

// Sync all teachers' information in a class with their latest user profiles
// Updates teachers[] array in class document with latest user profile data
// Note: Students are read directly from user documents via students[] array, so no sync needed
export const syncClassMembers = async (
  classId: string
): Promise<void> => {
  const batch = writeBatch(db);
  const classRef = doc(db, CLASSES_COLLECTION, classId);
  
  // Get current class data
  const classSnap = await getDoc(classRef);
  if (!classSnap.exists()) {
    throw new Error("Class not found");
  }

  const classData = classSnap.data();
  const teachersArray = Array.isArray(classData.teachers) ? (classData.teachers as Array<{ id: string; name: string; avatarUrl?: string; phone?: string }>) : [];
  
  // Sync each teacher's data from user profile
  const updatedTeachers = await Promise.all(
    teachersArray.map(async (teacher) => {
      try {
        const userProfile = await getUserById(teacher.id);
        if (userProfile) {
          return {
            id: teacher.id,
            name: userProfile.displayName || teacher.name || "N/A",
            avatarUrl: userProfile.avatarUrl || teacher.avatarUrl || "",
            phone: userProfile.phone || teacher.phone || "",
          };
        }
        return teacher; // Keep original if user not found
      } catch (error) {
        console.error(`Error syncing teacher ${teacher.id}:`, error);
        return teacher; // Keep original on error
      }
    })
  );
  
  // Update teachers array in class document
  batch.update(classRef, {
    teachers: updatedTeachers,
    updatedAt: serverTimestamp(),
  });
  
  await batch.commit();
};

// Update a class member's details (teacher or student)
// Teachers: updates teachers[] array in class document
// Students: updates students[] array in class document (denormalized name/avatarUrl)
export const updateClassMember = async (
  classId: string,
  memberId: string,
  data: Partial<IClassMember>
) => {
  const userRef = doc(db, USERS_COLLECTION, memberId);
  const userDoc = await getDoc(userRef);
  const userRole = userDoc.exists() ? userDoc.data()?.role : null;
  const isTeacher = userRole === "teacher";
  const isStudent = userRole === "student";

  if (!isTeacher && !isStudent) {
    throw new Error("Member not found or has invalid role.");
  }

  const classRef = doc(db, CLASSES_COLLECTION, classId);
  const classSnap = await getDoc(classRef);

  if (!classSnap.exists()) {
    throw new Error("Class not found");
  }

  const classData = classSnap.data();

  if (isStudent) {
    // Update student in students[] array - format: Array<{studentId: string, name: string, avatarUrl?: string}>
    const studentsData = Array.isArray(classData.students)
      ? (classData.students as Array<{ studentId: string; name: string; avatarUrl?: string }>)
      : [];
    const updatedStudents = studentsData.map((s) => {
      if (s.studentId === memberId) {
        return {
          ...s,
          name: data.name ?? s.name,
          ...(data.avatarUrl !== undefined && { avatarUrl: data.avatarUrl }),
        };
      }
      return s;
    });

    await updateDoc(classRef, {
      students: updatedStudents,
      updatedAt: serverTimestamp(),
    });
  } else {
    // Update teacher in teachers array
    const teachersArray = Array.isArray(classData.teachers)
      ? (classData.teachers as Array<{ id: string; name: string; avatarUrl?: string; phone?: string }>)
      : [];
    const updatedTeachers = teachersArray.map((teacher) => {
      if (teacher.id === memberId) {
        return {
          ...teacher,
          name: data.name ?? teacher.name,
          avatarUrl: data.avatarUrl ?? teacher.avatarUrl,
          phone: data.phone ?? teacher.phone,
        };
      }
      return teacher;
    });

    await updateDoc(classRef, {
      teachers: updatedTeachers,
      updatedAt: serverTimestamp(),
    });
  }
};
