import { ref, type DatabaseReference } from "firebase/database";
import { getRtdb } from "@/lib/firebase/client";
import type { ActivityTabLabel } from "./types";

/** Node presence của một user (online/lastSeen/name/currentActivity). */
export const presenceRef = (uid: string): DatabaseReference =>
  ref(getRtdb(), `presence/${uid}`);

/** Toàn bộ collection presence (đọc 1 lần để dựng map global). */
export const presenceRootRef = (): DatabaseReference =>
  ref(getRtdb(), "presence");

/** Trạng thái .info/connected (true khi socket Firebase đang kết nối). */
export const connectedInfoRef = (): DatabaseReference =>
  ref(getRtdb(), ".info/connected");

/** Suy ra tab hoạt động từ pathname hiện tại. */
export function mapPathToActivityTab(
  pathname: string | null
): ActivityTabLabel | null {
  if (!pathname) return null;
  if (pathname === "/") return "Home";
  if (pathname === "/grammar" || pathname.startsWith("/grammar/")) return "Grammar";
  if (
    pathname === "/learn" ||
    pathname.startsWith("/learn/") ||
    pathname === "/flashcard" ||
    pathname.startsWith("/flashcard/") ||
    pathname === "/speaking-upload" ||
    pathname.startsWith("/speaking-upload/")
  ) {
    return "Learn";
  }
  if (pathname === "/ai" || pathname.startsWith("/ai/")) return "AI";
  if (pathname === "/profile" || pathname.startsWith("/profile/")) return "Hồ sơ";
  return null;
}

/** True khi pathname thuộc tab Learn (flashcard, speaking, stories…). */
export function isOnLearnRoute(pathname: string | null): boolean {
  return mapPathToActivityTab(pathname) === "Learn";
}
