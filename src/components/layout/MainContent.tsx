"use client";

import { usePathname } from "next/navigation";
import { ReactNode } from "react";
import { useAuth } from "@/lib/auth/context";
import {
  useLearnSessionActive,
  useMovieImmersive,
  useImmersiveLight,
} from "@/lib/homeUiStore";

interface MainContentProps {
  children: ReactNode;
}

export default function MainContent({ children }: MainContentProps) {
  const pathname = usePathname();
  const { session } = useAuth();
  const isMovieImmersive = useMovieImmersive();
  const isImmersiveLight = useImmersiveLight();
  const isLearnSessionActive = useLearnSessionActive();
  const isImmersive = isMovieImmersive || isImmersiveLight;
  const isAdminRoute = pathname?.startsWith("/admin");
  const isGrammarRoute = pathname?.startsWith("/grammar");
  const isHomeDark = false;
  // Khi pathname null (hydrate) vẫn thêm padding để tránh content bị che
  const showAppNav = pathname === null || !pathname.startsWith("/admin");

  const paddingClass = isImmersive
    ? "p-0"
    : isAdminRoute
    ? ""
    : isLearnSessionActive
    ? "px-0 sm:px-1 py-2"
    : isGrammarRoute
    ? "px-1 sm:px-2 py-2"
    : "px-2 sm:px-4 lg:px-8 py-4";

  const sidebarClass =
    showAppNav && !isImmersive ? "pb-20 md:pb-8 main-with-sidebar" : "";

  const bgClass = isMovieImmersive
    ? "bg-[#0f1217] text-slate-200"
    : isHomeDark
    ? "bg-black text-white"
    : "bg-background";

  return (
    <main
      className={`flex-1 ${bgClass} transition-[padding] ${paddingClass} ${sidebarClass}`}
    >
      {children}
    </main>
  );
}

