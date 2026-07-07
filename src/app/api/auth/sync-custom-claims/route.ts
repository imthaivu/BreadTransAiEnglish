import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase/admin";
import { syncRoleCustomClaims } from "@/lib/firebase/auth-custom-claims";
import { checkIPRateLimit, checkUserRateLimit } from "@/lib/rate-limit";

const VALID_ROLES = ["admin", "teacher", "student"] as const;

/**
 * Aligns Auth custom claims with Firestore `users.role` for the signed-in user.
 * Call after login or when the token may be stale; then refresh the ID token on the client.
 *
 * Đã siết rate limit để tránh ai đó spam endpoint nhằm đốt CPU verify token
 * và churn token-revocation cache.
 */
export async function POST(request: NextRequest) {
  try {
    const ipLimit = checkIPRateLimit(request, "sync-claims", {
      maxAttempts: 60,
      windowMs: 60 * 60 * 1000,
    });
    if (!ipLimit.allowed) {
      return NextResponse.json(
        { success: false, error: "Quá nhiều yêu cầu đồng bộ phân quyền." },
        { status: 429 }
      );
    }

    const authHeader = request.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 }
      );
    }

    const idToken = authHeader.substring(7);
    const decoded = await adminAuth().verifyIdToken(idToken);
    const uid = decoded.uid;

    const userLimit = checkUserRateLimit(uid, "sync-claims", {
      maxAttempts: 20,
      windowMs: 60 * 60 * 1000,
    });
    if (!userLimit.allowed) {
      return NextResponse.json(
        { success: false, error: "Bạn đã đồng bộ phân quyền quá nhiều lần." },
        { status: 429 }
      );
    }

    const userDoc = await adminDb().collection("users").doc(uid).get();
    if (!userDoc.exists) {
      return NextResponse.json(
        { success: false, error: "User not found" },
        { status: 404 }
      );
    }

    const rawRole = userDoc.data()?.role;
    const role =
      typeof rawRole === "string" && VALID_ROLES.includes(rawRole as (typeof VALID_ROLES)[number])
        ? rawRole
        : "student";

    await syncRoleCustomClaims(uid, role);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[sync-custom-claims]", error);
    return NextResponse.json(
      { success: false, error: "Sync failed" },
      { status: 500 }
    );
  }
}
