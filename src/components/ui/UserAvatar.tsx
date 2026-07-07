"use client";

import { SafeImage as Image } from "@/components/ui/SafeImage";
import Link from "next/link";
import { useAuth } from "@/lib/auth/context";
import { profilePathForUserId } from "@/utils/profileHref";
import { cn } from "@/utils";

interface UserAvatarProps {
  displayName?: string | null;
  avatarUrl?: string | null;
  size?: number;
  className?: string;
  /** When set, avatar is a link to that user's profile (unless linkToProfile is false). */
  userId?: string | null;
  /** Default: true when userId is non-empty. Set false e.g. inside another clickable control. */
  linkToProfile?: boolean;
}

// Get first letter of name
function getInitials(name: string | null | undefined): string {
  if (!name || name.trim().length === 0) return "?";
  
  // Get first letter, handle Vietnamese characters
  const firstChar = name.trim().charAt(0).toUpperCase();
  return firstChar;
}

// Get color based on first letter
function getAvatarColor(name: string | null | undefined): string {
  if (!name || name.trim().length === 0) return "bg-gray-400";
  
  const firstChar = name.trim().charAt(0).toUpperCase();
  const colors = [
    "bg-blue-500",
    "bg-green-500",
    "bg-purple-500",
    "bg-pink-500",
    "bg-indigo-500",
    "bg-yellow-500",
    "bg-red-500",
    "bg-teal-500",
    "bg-orange-500",
    "bg-cyan-500",
  ];
  
  // Use char code to get consistent color for same letter
  const index = firstChar.charCodeAt(0) % colors.length;
  return colors[index];
}

export function UserAvatar({
  displayName,
  avatarUrl,
  size = 32,
  className,
  userId,
  linkToProfile,
}: UserAvatarProps) {
  const { session } = useAuth();
  const uid = (userId || "").trim();
  const shouldLink = !!uid && linkToProfile !== false;
  const label = `Xem hồ sơ ${(displayName || "người dùng").trim() || "người dùng"}`;

  // If has avatarUrl, show image
  if (avatarUrl) {
    const img = (
      <Image
        src={avatarUrl}
        alt={displayName || "Avatar"}
        width={size}
        height={size}
        sizes={`${size}px`}
        className={cn("rounded-full object-cover", className)}
      />
    );
    if (shouldLink) {
      return (
        <Link
          href={profilePathForUserId(uid, session?.user?.id)}
          className="inline-flex shrink-0 rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1"
          aria-label={label}
        >
          {img}
        </Link>
      );
    }
    return img;
  }

  // Otherwise show default avatar with initial
  const initial = getInitials(displayName);
  const bgColor = getAvatarColor(displayName);

  const fallback = (
    <div
      className={cn(
        "rounded-full flex items-center justify-center text-white font-semibold",
        bgColor,
        className
      )}
      style={{ width: size, height: size, fontSize: size * 0.4 }}
    >
      {initial}
    </div>
  );

  if (shouldLink) {
    return (
      <Link
        href={profilePathForUserId(uid, session?.user?.id)}
        className="inline-flex shrink-0 rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1"
        aria-label={label}
      >
        {fallback}
      </Link>
    );
  }
  return fallback;
}

