"use client";

import type { User } from "firebase/auth";

/** POST /api/auth/sync-custom-claims then force-refresh ID token (picks up new custom claims). */
export async function syncCustomClaimsAndRefreshIdToken(user: User): Promise<void> {
  const idToken = await user.getIdToken();
  const res = await fetch("/api/auth/sync-custom-claims", {
    method: "POST",
    headers: { Authorization: `Bearer ${idToken}` },
  });
  if (!res.ok) {
    console.warn("[auth] sync-custom-claims failed", await res.text());
    return;
  }
  await user.getIdToken(true);
}
