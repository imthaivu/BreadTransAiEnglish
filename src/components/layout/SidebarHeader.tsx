"use client";

import { SafeImage as Image } from "@/components/ui/SafeImage";
import Link from "next/link";

interface SidebarHeaderProps {
  /** Nút bổ sung bên phải (vd: nút đóng trên mobile) */
  rightAction?: React.ReactNode;
  className?: string;
}

export function SidebarHeader({
  rightAction,
  className = "",
}: SidebarHeaderProps) {
  return (
    <div
      className={`flex items-center justify-between h-16 px-4 lg:px-6 border-b border-gray-200 flex-shrink-0 ${className}`}
    >
      <Link
        href="/"
        className="flex items-center gap-2 text-xl md:text-3xl font-bold text-primary truncate min-w-0 flex-1"
      >
        <Image
          src="/assets/images/icon.ico"
          alt="BreadTrans"
          width={24}
          height={24}
          className="rounded-lg flex-shrink-0"
        />
        <span className="truncate">BreadTrans</span>
      </Link>
      {rightAction}
    </div>
  );
}
