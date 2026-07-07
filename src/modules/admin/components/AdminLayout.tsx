"use client";

import { RequireAuth, RequireRole } from "@/lib/auth/guard";
import AdminSidebar from "./AdminSidebar";
import AdminMobileMenu from "./AdminMobileMenu";
import { UserRole } from "@/lib/auth/types";
import { ADMIN_LAYOUT, Z_INDEX } from "@/constants/layout";

interface AdminLayoutProps {
  children: React.ReactNode;
}

export default function AdminLayout({ children }: AdminLayoutProps) {
  return (
    <RequireAuth>
      <RequireRole roles={[UserRole.ADMIN]}>
        <div
          className="relative w-screen overflow-hidden"
          style={
            {
              height: ADMIN_LAYOUT.CONTENT_HEIGHT,
              "--sidebar-width": `${ADMIN_LAYOUT.SIDEBAR_WIDTH}px`,
            } as React.CSSProperties
          }
        >
          <AdminSidebar />
          <AdminMobileMenu />

          <div
            className="fixed left-0 lg:left-[var(--sidebar-width)] right-0 bottom-0 overflow-y-auto"
            style={{
              top: ADMIN_LAYOUT.CONTENT_TOP,
              zIndex: Z_INDEX.BASE,
            }}
          >
            <main
              className="p-2 overflow-x-hidden pt-14 lg:pt-2"
              style={{ minHeight: ADMIN_LAYOUT.CONTENT_HEIGHT }}
            >
              {children}
            </main>
          </div>
        </div>
      </RequireRole>
    </RequireAuth>
  );
}
