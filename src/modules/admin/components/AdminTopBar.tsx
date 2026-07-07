"use client";

import { Button } from "@/components/ui/Button";
import { FiMenu } from "react-icons/fi";
import { ADMIN_LAYOUT } from "@/constants/layout";

interface AdminTopBarProps {
  setSidebarOpen: (open: boolean) => void;
  className?: string;
}

export default function AdminTopBar({
  setSidebarOpen,
  className = "",
}: AdminTopBarProps) {
  return (
    <div 
      className={`lg:hidden fixed z-50 ${className}`}
      style={{ top: ADMIN_LAYOUT.CONTENT_TOP }}
    >
      <div className="flex items-center justify-between h-16">
        <Button 
          variant="primary" 
          onClick={() => setSidebarOpen(true)}
          className="p-2"
          title="Menu"
        >
          <FiMenu className="w-5 h-5" />
        </Button>
      </div>
    </div>
  );
}
