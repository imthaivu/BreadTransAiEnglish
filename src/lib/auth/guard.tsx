"use client";

import { Button } from "@/components/ui/Button";
import { MiluLoading } from "@/components/ui/LoadingSpinner";
import { FiAlertTriangle, FiUser } from "react-icons/fi";
import Link from "next/link";
import React from "react";
import { useAuth } from "./context";
import type { UserRole } from "./types";
import { translateRole } from "./utils";

export function RequireAuth({ children }: { children: React.ReactNode }) {
  const { session, loading } = useAuth();

  if (loading)
    return (
      <div className="p-6">
        <MiluLoading />
      </div>
    );

  if (!session?.user || !session?.user?.id) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center text-center p-6">
        <FiUser className="w-16 h-16 text-slate-400 mb-4" />
        <h1 className="text-2xl font-bold text-slate-800">
          Yêu cầu tham gia
        </h1>

      </div>
    );
  }
  return <>{children}</>;
}

export function RequireRole({
  children,
  roles,
}: {
  children: React.ReactNode;
  roles: UserRole[];
}) {
  const { profile, loading } = useAuth();
  if (loading) return <div className="p-6">Loading...</div>;

  const userRole = profile?.role;

  if (!userRole || !roles.includes(userRole)) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center text-center p-6">
        <FiAlertTriangle className="w-16 h-16 text-amber-500 mb-4" />
        <h1 className="text-2xl font-bold text-slate-800">
          Vai trò không phù hợp
        </h1>
        <p className="mt-2 text-slate-600 max-w-sm">
          Trang này yêu cầu vai trò{" "}
          <span className="font-semibold text-slate-900">
            {roles.map(translateRole).join(" hoặc ")}
          </span>
          , nhưng bạn đang tham gia với vai trò{" "}
          <span className="font-semibold text-slate-900">
            {translateRole(userRole)}
          </span>
          .
        </p>
        <div className="mt-6 flex gap-4">
          <Link href="/">
            <Button>Về trang chủ</Button>
          </Link>
        </div>
      </div>
    );
  }
  return <>{children}</>;
}
