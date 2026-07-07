"use client";

import {
  buildLearnTabUrl,
  isLearnRoute,
  readClientLearnTabParam,
  resolveLearnTab,
  type LearnTabId,
} from "@/lib/learn-tabs";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

type LearnTabContextValue = {
  activeTab: LearnTabId;
  setLearnTab: (tabId: LearnTabId) => void;
};

const LearnTabContext = createContext<LearnTabContextValue | null>(null);

function readTabFromLocation(pathname: string): LearnTabId {
  return resolveLearnTab(pathname, readClientLearnTabParam());
}

export function LearnTabProvider({
  children,
  initialTab,
}: {
  children: ReactNode;
  initialTab?: LearnTabId;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [activeTab, setActiveTab] = useState<LearnTabId>(
    () => initialTab ?? "vocabulary"
  );
  const pendingTabRef = useRef<LearnTabId | null>(null);

  // Đồng bộ khi client-navigate cập nhật searchParams (vd: sidebar Learn).
  useEffect(() => {
    const hookTab = searchParams.get("tab");
    if (isLearnRoute(pathname)) {
      if (hookTab === "speaking" || hookTab === "vocabulary") {
        pendingTabRef.current = null;
        setActiveTab(hookTab);
        return;
      }
      if (pendingTabRef.current) {
        setActiveTab(pendingTabRef.current);
        return;
      }
      setActiveTab(readTabFromLocation(pathname));
      return;
    }
    pendingTabRef.current = null;
    setActiveTab(resolveLearnTab(pathname, hookTab));
  }, [pathname, searchParams]);

  // bfcache / pull-to-refresh trên mobile.
  useEffect(() => {
    const handlePageShow = () => {
      setActiveTab(readTabFromLocation(pathname));
    };
    window.addEventListener("pageshow", handlePageShow);
    return () => window.removeEventListener("pageshow", handlePageShow);
  }, [pathname]);

  const setLearnTab = useCallback(
    (tabId: LearnTabId) => {
      pendingTabRef.current = tabId;
      setActiveTab(tabId);
      router.replace(buildLearnTabUrl(tabId), { scroll: false });
    },
    [router]
  );

  const value = useMemo(
    () => ({ activeTab, setLearnTab }),
    [activeTab, setLearnTab]
  );

  return (
    <LearnTabContext.Provider value={value}>{children}</LearnTabContext.Provider>
  );
}

export function useLearnTab(): LearnTabContextValue {
  const context = useContext(LearnTabContext);
  if (!context) {
    throw new Error("useLearnTab must be used within LearnTabProvider");
  }
  return context;
}
