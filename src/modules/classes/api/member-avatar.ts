import { db } from "@/lib/firebase/client";
import {
  doc,
  getDoc,
  serverTimestamp,
  writeBatch,
} from "firebase/firestore";

type SyncMemberAvatarInput = {
  memberId: string;
  avatarUrl: string;
};

const USERS_COLLECTION = "users";
const CLASSES_COLLECTION = "classes";

type ClassStudent = {
  studentId: string;
  name: string;
  avatarUrl?: string;
};

type ClassTeacher = {
  id: string;
  name: string;
  avatarUrl?: string;
  phone?: string;
};

export const syncMemberAvatarInClasses = async ({
  memberId,
  avatarUrl,
}: SyncMemberAvatarInput): Promise<void> => {
  if (!memberId || !avatarUrl) return;

  const userRef = doc(db, USERS_COLLECTION, memberId);
  const userSnap = await getDoc(userRef);
  if (!userSnap.exists()) return;

  const userData = userSnap.data() as { role?: string; classIds?: string[] };
  const role = userData.role;
  const classIds = Array.isArray(userData.classIds) ? userData.classIds : [];
  if (classIds.length === 0) return;

  const batch = writeBatch(db);
  let hasChanges = false;

  for (const classId of classIds) {
    const classRef = doc(db, CLASSES_COLLECTION, classId);
    const classSnap = await getDoc(classRef);
    if (!classSnap.exists()) continue;

    const classData = classSnap.data() as {
      students?: ClassStudent[];
      teachers?: ClassTeacher[];
    };

    if (role === "student") {
      const students = Array.isArray(classData.students) ? classData.students : [];
      let changed = false;

      const updatedStudents = students.map((student) => {
        if (student.studentId !== memberId) return student;
        if ((student.avatarUrl || "") === avatarUrl) return student;
        changed = true;
        return { ...student, avatarUrl };
      });

      if (changed) {
        batch.update(classRef, {
          students: updatedStudents,
          updatedAt: serverTimestamp(),
        });
        hasChanges = true;
      }
      continue;
    }

    if (role === "teacher") {
      const teachers = Array.isArray(classData.teachers) ? classData.teachers : [];
      let changed = false;

      const updatedTeachers = teachers.map((teacher) => {
        if (teacher.id !== memberId) return teacher;
        if ((teacher.avatarUrl || "") === avatarUrl) return teacher;
        changed = true;
        return { ...teacher, avatarUrl };
      });

      if (changed) {
        batch.update(classRef, {
          teachers: updatedTeachers,
          updatedAt: serverTimestamp(),
        });
        hasChanges = true;
      }
    }
  }

  if (hasChanges) {
    await batch.commit();
  }
};
