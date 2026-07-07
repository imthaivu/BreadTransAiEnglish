"use client";

import { useAuth } from "@/lib/auth/context";
import { redirect } from "next/navigation";
import { UserRole } from "@/lib/auth/types";

const ClassesPage = () => {
  const { session } = useAuth();

  if (session?.user?.role === UserRole.TEACHER) {
    return redirect("/classes/teacher");
  }

  return <>
  {/* Bạn chưa tham gia lớp học nào */}
  <div className="text-center">
    <h1 className="text-xl md:text-2xl lg:text-4xl font-bold text-gray-800 mb-2 sm:mb-4">
      Bạn chưa tham gia lớp học nào
    </h1>
  </div>
  <div className="text-center">
    <p className="text-sm md:text-base text-gray-600">
      Vui lòng liên hệ Trung tâm để được hỗ trợ
    </p>
  </div>
  </>;
};

export default ClassesPage;
