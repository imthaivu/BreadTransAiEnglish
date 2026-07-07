"use client";

import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useState, useRef } from "react";

export type TransitionType =
  | "slide"
  | "fade"
  | "slideUp"
  | "slidePrev"
  | "none";

interface UsePageTransitionOptions {
  defaultTransition?: TransitionType;
  duration?: number;
}

interface UsePageTransitionReturn {
  isTransitioning: boolean;
  transitionType: TransitionType;
  navigateWithTransition: (path: string, transition?: TransitionType) => void;
  navigateBack: () => void;
  setTransitionType: (type: TransitionType) => void;
}

export function usePageTransition(
  options: UsePageTransitionOptions = {}
): UsePageTransitionReturn {
  const { defaultTransition = "slide", duration = 300 } = options;
  const pathname = usePathname();
  const router = useRouter();
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [transitionType, setTransitionType] =
    useState<TransitionType>(defaultTransition);

  // Theo dõi navigation history để xác định direction
  const navigationHistory = useRef<string[]>([]);
  const isBackNavigation = useRef(false);

  // Tự động xác định loại transition dựa trên route và navigation direction
  const getTransitionForRoute = useCallback(
    (path: string, isBack: boolean = false): TransitionType => {
      // Nếu là back navigation về homepage, sử dụng slidePrev
      if (isBack && (path === "/" || path === "/home")) {
        return "slidePrev";
      }

      // Các route đặc biệt có transition riêng
      if (path.includes("/dashboard")) {
        return "fade";
      }
      if (path.includes("/profile")) {
        return "slideUp";
      }
      if (path.includes("/classes/") && path.includes("/lessons/")) {
        return "slideUp";
      }

      // Nếu là back navigation, sử dụng slidePrev
      if (isBack) {
        return "slidePrev";
      }

      // Mặc định là slide cho mobile-like experience
      return "slide";
    },
    []
  );

  // Cập nhật transition type khi route thay đổi
  useEffect(() => {
    const newTransitionType = getTransitionForRoute(
      pathname,
      isBackNavigation.current
    );
    setTransitionType(newTransitionType);

    // Reset back navigation flag
    isBackNavigation.current = false;
  }, [pathname, getTransitionForRoute]);

  const navigateWithTransition = useCallback(
    (path: string, transition?: TransitionType) => {
      if (isTransitioning) return;

      setIsTransitioning(true);

      // Thêm current path vào history
      navigationHistory.current.push(pathname);

      // Giới hạn history size
      if (navigationHistory.current.length > 10) {
        navigationHistory.current = navigationHistory.current.slice(-10);
      }

      if (transition) {
        setTransitionType(transition);
      } else {
        // Tự động xác định transition dựa trên route
        const autoTransition = getTransitionForRoute(path);
        setTransitionType(autoTransition);
      }

      // Navigate ngay lập tức, không delay
      router.push(path);

      // Reset trạng thái sau khi transition hoàn thành
      setTimeout(() => {
        setIsTransitioning(false);
      }, duration);
    },
    [router, isTransitioning, duration, pathname, getTransitionForRoute]
  );

  // Function để navigate back với slidePrev
  const navigateBack = useCallback(() => {
    if (isTransitioning) return;

    // Đánh dấu là back navigation
    isBackNavigation.current = true;

    // Sử dụng router.back() hoặc navigate về homepage
    if (navigationHistory.current.length > 1) {
      // Có history, sử dụng router.back()
      router.back();
    } else {
      // Không có history, navigate về homepage
      navigateWithTransition("/", "slidePrev");
    }
  }, [isTransitioning, router, navigateWithTransition]);

  return {
    isTransitioning,
    transitionType,
    navigateWithTransition,
    navigateBack,
    setTransitionType,
  };
}

// Hook đơn giản hơn cho việc sử dụng cơ bản
export function useSimplePageTransition() {
  const [isTransitioning, setIsTransitioning] = useState(false);
  const router = useRouter();

  const navigate = useCallback(
    (path: string) => {
      if (isTransitioning) return;

      setIsTransitioning(true);
      router.push(path);

      // Reset sau 300ms
      setTimeout(() => {
        setIsTransitioning(false);
      }, 300);
    },
    [router, isTransitioning]
  );

  return { isTransitioning, navigate };
}
