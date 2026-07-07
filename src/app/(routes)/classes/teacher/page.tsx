"use client";

import { RequireAuth, RequireRole } from "@/lib/auth/guard";
import { UserRole } from "@/lib/auth/types";
import { TeacherClassesList } from "@/modules/classes/components/ClassesList";

export default function TeacherClassesPage() {
  return (
    <RequireAuth>
      <RequireRole roles={[UserRole.TEACHER]}>
        <main className="space-y-4 md:space-y-6">
          <TeacherClassesList />
        </main>
      </RequireRole>
    </RequireAuth>
  );
}
