"use client";

import { LearnChrome } from "./LearnChrome";
import { LearnSelectionProvider } from "./LearnSelectionProvider";
import { LearnTabProvider } from "./LearnTabProvider";
import { useScrollToTop } from "@/hooks";
import { useLearnSessionActive, useImmersiveLight } from "@/lib/homeUiStore";
import { usePathname } from "next/navigation";
import { ReactNode, Suspense } from "react";

/**
 * Shell cho mọi route dưới (routes) trừ trang chủ "/".
 * Trước đây nằm trong app/(routes)/(features)/layout.tsx.
 */
export function FeatureRoutesChrome({ children }: { children: ReactNode }) {
  useScrollToTop();
  const pathname = usePathname();
  const isHome = pathname === "/";
  const isImmersiveLight = useImmersiveLight();
  const isLearnSessionActive = useLearnSessionActive();
  const showLearnChrome =
    (pathname.startsWith("/flashcard") ||
      pathname.startsWith("/speaking-upload")) &&
    !isLearnSessionActive;

  if (isHome) {
    return <>{children}</>;
  }

  const contentClass = isLearnSessionActive
    ? "w-full max-w-none mx-auto py-0 min-h-[calc(100vh-122px)] px-0"
    : isImmersiveLight
    ? "max-w-[1440px] mx-auto py-2 min-h-[calc(100vh-122px)] px-1 sm:px-3 lg:px-4"
    : "max-w-6xl mx-auto min-h-[calc(100vh-122px)]";

  if (showLearnChrome) {
    return (
      <div className="bg-gradient-to-br bg-white rounded-xl">
        <LearnTabProvider>
          <LearnSelectionProvider>
            <div className="max-w-6xl mx-auto px-2 lg:px-6">
              <Suspense fallback={null}>
                <LearnChrome />
              </Suspense>
            </div>
            <div className={contentClass}>{children}</div>
          </LearnSelectionProvider>
        </LearnTabProvider>
      </div>
    );
  }

  return (
    <div className="bg-gradient-to-br bg-white rounded-xl">
      <div className={contentClass}>{children}</div>
    </div>
  );
}
