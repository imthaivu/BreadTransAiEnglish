"use client";

import Link from "next/link";
import type { MouseEvent, ReactNode } from "react";
import { useAuth } from "@/lib/auth/context";
import { profilePathForUserId } from "@/utils/profileHref";
import { cn } from "@/utils";

export function ProfileAvatarLink({
  userId,
  className,
  stopPropagation,
  onClick,
  children,
  ariaLabel,
}: {
  userId: string | null | undefined;
  className?: string;
  stopPropagation?: boolean;
  onClick?: (e: MouseEvent<HTMLAnchorElement>) => void;
  children: ReactNode;
  ariaLabel?: string;
}) {
  const { session } = useAuth();
  const uid = (userId || "").trim();
  if (!uid) {
    return <span className={cn("inline-flex", className)}>{children}</span>;
  }

  const href = profilePathForUserId(uid, session?.user?.id);

  return (
    <Link
      href={href}
      className={cn("inline-flex shrink-0 rounded-full", className)}
      aria-label={ariaLabel || "Xem hồ sơ"}
      onClick={(e) => {
        if (stopPropagation) e.stopPropagation();
        onClick?.(e);
      }}
    >
      {children}
    </Link>
  );
}
