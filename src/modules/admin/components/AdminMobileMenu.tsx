"use client";

import { SidebarHeader } from "@/components/layout/SidebarHeader";
import { Button } from "@/components/ui/Button";
import {
  SIDEBAR_NAV_ICON_SIZE,
  SIDEBAR_NAV_ITEM_ACTIVE_CLASS,
  SIDEBAR_NAV_ITEM_INACTIVE_CLASS,
} from "@/constants/sidebar.constants";
import { ADMIN_LAYOUT, Z_INDEX } from "@/constants/layout";
import { cn } from "@/utils";
import { AnimatePresence, motion } from "framer-motion";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  FiBookOpen,
  FiDollarSign,
  FiLayers,
  FiMenu,
  FiSettings,
  FiUser,
  FiX,
} from "react-icons/fi";
import { FaGamepad } from "react-icons/fa";
import { SIDEBAR_ITEMS } from "../constants/sidebar";

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

const DRAWER_WIDTH = 280;

export default function AdminMobileMenu() {
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);

  // Auto-close khi đổi route
  useEffect(() => {
    setIsOpen(false);
  }, [pathname]);

  // Khoá scroll body khi mở drawer
  useEffect(() => {
    if (!isOpen) return;
    const original = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = original;
    };
  }, [isOpen]);

  return (
    <>
      {/* Hamburger button - chỉ hiện trên mobile */}
      <div
        className="lg:hidden fixed left-2 top-2"
        style={{ zIndex: Z_INDEX.HEADER + 5 }}
      >
        <Button
          variant="primary"
          onClick={() => setIsOpen(true)}
          className="p-2 shadow-md"
          aria-label="Mở menu admin"
          title="Menu"
        >
          <FiMenu className="w-5 h-5" />
        </Button>
      </div>

      <AnimatePresence>
        {isOpen && (
          <>
            {/* Overlay */}
            <motion.div
              className="lg:hidden fixed inset-0 bg-black/50"
              style={{ zIndex: Z_INDEX.SIDEBAR }}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              onClick={() => setIsOpen(false)}
            />

            {/* Drawer trượt từ trái */}
            <motion.aside
              className="lg:hidden fixed top-0 left-0 bottom-0 bg-white shadow-2xl flex flex-col"
              style={{
                width: DRAWER_WIDTH,
                height: ADMIN_LAYOUT.CONTENT_HEIGHT,
                zIndex: Z_INDEX.SIDEBAR + 1,
              }}
              initial={{ x: -DRAWER_WIDTH }}
              animate={{ x: 0 }}
              exit={{ x: -DRAWER_WIDTH }}
              transition={{ type: "tween", duration: 0.25 }}
            >
              <SidebarHeader
                rightAction={
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setIsOpen(false)}
                    className="bg-red-100 hover:bg-red-200 flex-shrink-0 ml-2"
                    aria-label="Đóng menu"
                  >
                    <FiX className="w-5 h-5 text-red-500" />
                  </Button>
                }
              />

              <nav className="flex-1 overflow-y-auto py-3 px-2">
                {SIDEBAR_ITEMS.map((item) => {
                  const IconComponent =
                    ICON_MAP[item.id as keyof typeof ICON_MAP];
                  const isActive = pathname === item.href;

                  return (
                    <Link
                      key={item.id}
                      href={item.href}
                      onClick={() => setIsOpen(false)}
                      className={cn(
                        "flex items-center gap-3 px-4 py-3 text-sm md:text-base font-medium rounded-lg transition-colors mb-1 min-h-12",
                        isActive
                          ? SIDEBAR_NAV_ITEM_ACTIVE_CLASS
                          : SIDEBAR_NAV_ITEM_INACTIVE_CLASS
                      )}
                    >
                      <div className="flex items-center justify-center flex-shrink-0">
                        <IconComponent
                          className={cn(
                            SIDEBAR_NAV_ICON_SIZE,
                            isActive ? "text-primary" : "text-gray-500"
                          )}
                        />
                      </div>
                      <span
                        className={cn(
                          "truncate min-w-0",
                          isActive ? "text-primary" : "text-gray-700"
                        )}
                      >
                        {item.label}
                      </span>
                    </Link>
                  );
                })}
              </nav>
            </motion.aside>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
