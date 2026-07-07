"use client";

import { usePageTransition } from "@/hooks/usePageTransition";
import { ReactNode } from "react";

interface BackButtonProps {
  children: ReactNode;
  className?: string;
  onClick?: () => void;
  /** Khi true, nút sẽ KHÔNG tự động gọi navigateBack, chỉ chạy onClick custom */
  disableAutoNavigate?: boolean;
  [key: string]: unknown;
}

export default function BackButton({
  children,
  className,
  onClick,
  disableAutoNavigate = false,
  ...props
}: BackButtonProps) {
  const { navigateBack } = usePageTransition();

  const handleClick = () => {
    // Call custom onClick if provided
    if (onClick) {
      onClick();
    }

    // Navigate back với slidePrev effect nếu không tắt auto navigate
    if (!disableAutoNavigate) {
      navigateBack();
    }
  };

  return (
    <button className={className} onClick={handleClick} {...props}>
      {children}
    </button>
  );
}
