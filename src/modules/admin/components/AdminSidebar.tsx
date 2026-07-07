"use client";

import { SidebarHeader } from "@/components/layout/SidebarHeader";
import {
  SIDEBAR_NAV_ICON_SIZE,
  SIDEBAR_NAV_ITEM_ACTIVE_CLASS,
  SIDEBAR_NAV_ITEM_INACTIVE_CLASS,
} from "@/constants/sidebar.constants";
import { cn } from "@/utils";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  FiBookOpen,
  FiDollarSign,
  FiLayers,
  FiSettings,
  FiUser,
} from "react-icons/fi";
import { FaGamepad } from "react-icons/fa";
import { SIDEBAR_ITEMS } from "../constants/sidebar";
import { ADMIN_LAYOUT, Z_INDEX } from "@/constants/layout";

const ICON_MAP = {
  dashboard: FiSettings,
  users: FiUser,
  classes: FiLayers,
  teachers: FiUser,
  students: FiUser,
  currency: FiDollarSign,
  content: FiBookOpen,
  games: FaGamepad,
} as const;

interface AdminSidebarProps {
  className?: string;
}

export default function AdminSidebar({ className = "" }: AdminSidebarProps) {
  const pathname = usePathname();

  return (
    <div
      className={cn(
        "hidden lg:flex flex-col fixed inset-y-0 left-0 bg-white shadow-lg",
        className
      )}
      style={{
        top: ADMIN_LAYOUT.CONTENT_TOP,
        width: `${ADMIN_LAYOUT.SIDEBAR_WIDTH}px`,
        height: ADMIN_LAYOUT.CONTENT_HEIGHT,
        zIndex: Z_INDEX.SIDEBAR,
      }}
    >
      <SidebarHeader />

      <nav className="mt-6">
        <div className="px-2">
          {SIDEBAR_ITEMS.map((item) => {
            const IconComponent = ICON_MAP[item.id as keyof typeof ICON_MAP];
            const isActive = pathname === item.href;

            return (
              <Link
                className={cn(
                  "flex items-center gap-3 px-4 py-3 text-sm md:text-base font-medium rounded-lg transition-colors mb-1 min-h-12",
                  isActive
                    ? SIDEBAR_NAV_ITEM_ACTIVE_CLASS
                    : SIDEBAR_NAV_ITEM_INACTIVE_CLASS
                )}
                key={item.id}
                href={item.href}
              >
                <div className="flex items-center justify-center flex-shrink-0">
                  <IconComponent
                    className={cn(
                      SIDEBAR_NAV_ICON_SIZE,
                      isActive ? "text-primary" : "text-gray-500"
                    )}
                  />
                </div>
                <span className={cn("truncate min-w-0", isActive ? "text-primary" : "text-gray-700")}>{item.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
