import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { getServerSession } from "@/lib/auth/server-auth";
import { checkIPRateLimit, checkUserRateLimit } from "@/lib/rate-limit";

const LOGIN_COUNT_COOLDOWN_MS = 60 * 60 * 1000; // 1 giờ

/**
 * API endpoint to update session token and increment login count
 * Used when user logs in after registration or for session refresh
 */
export async function POST(request: NextRequest) {
  try {
    // 1) IP rate limit: tránh ai đó spam endpoint này để inflate số liệu.
    const ipLimit = checkIPRateLimit(request, "update-login-session", {
      maxAttempts: 30,
      windowMs: 15 * 60 * 1000,
    });
    if (!ipLimit.allowed) {
      return NextResponse.json(
        { success: false, error: "Quá nhiều yêu cầu cập nhật phiên đăng nhập." },
        { status: 429 }
      );
    }

    // Check if user is authenticated
    const session = await getServerSession(request);

    if (!session?.user) {
      return NextResponse.json(
        {
          success: false,
          error: "Unauthorized",
        },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { uid, deviceType } = body;

    if (!uid || typeof uid !== "string") {
      return NextResponse.json(
        {
          success: false,
          error: "Missing user ID",
        },
        { status: 400 }
      );
    }

    // Security: User can only update their own session token
    if (session.user.id !== uid) {
      return NextResponse.json(
        {
          success: false,
          error: "Forbidden: You can only update your own session",
        },
        { status: 403 }
      );
    }

    // 2) User rate limit: cùng user spam endpoint cũng bị chặn.
    const userLimit = checkUserRateLimit(uid, "update-login-session", {
      maxAttempts: 20,
      windowMs: 60 * 60 * 1000,
    });
    if (!userLimit.allowed) {
      return NextResponse.json(
        { success: false, error: "Cập nhật phiên quá thường xuyên. Vui lòng thử lại sau." },
        { status: 429 }
      );
    }

    // Generate new session token
    const sessionToken = `${Date.now()}-${Math.random().toString(36).substring(2, 15)}`;
    const now = new Date();

    // Get current user data
    const userDoc = await adminDb().collection("users").doc(uid).get();
    
    if (!userDoc.exists) {
      return NextResponse.json(
        {
          success: false,
          error: "User not found",
        },
        { status: 404 }
      );
    }

    const currentData = userDoc.data();
    const currentLoginCount = currentData?.loginCount || 0;
    const userRole = currentData?.role;
    const lastDeviceType = currentData?.lastDeviceType as "pc" | "non-pc" | undefined;

    // Normalize device type: default to "pc" if not provided or invalid
    const normalizedDeviceType: "pc" | "non-pc" = (deviceType === "pc" || deviceType === "non-pc")
      ? deviceType
      : "pc";

    // 3) Cooldown loginCount: cùng 1 user gọi endpoint nhiều lần liên tiếp
    //    sẽ KHÔNG được tăng loginCount nữa (tránh inflate metric / abuse).
    const lastLoginAtRaw = currentData?.lastLoginAt;
    const lastLoginAtMillis = lastLoginAtRaw?.toMillis
      ? lastLoginAtRaw.toMillis()
      : lastLoginAtRaw instanceof Date
        ? lastLoginAtRaw.getTime()
        : 0;
    const isWithinCooldown =
      lastLoginAtMillis > 0 &&
      Date.now() - lastLoginAtMillis < LOGIN_COUNT_COOLDOWN_MS;

    // Only increment login count if device type matches last device type
    // If lastDeviceType is undefined/null (first login), always increment
    // Trong cooldown thì cũng bỏ qua để tránh ăn gian số phiên đăng nhập.
    const shouldIncrementLoginCount =
      !isWithinCooldown && (!lastDeviceType || lastDeviceType === normalizedDeviceType);
    const newLoginCount = shouldIncrementLoginCount ? currentLoginCount + 1 : currentLoginCount;

    // Only update session token for students (single-session enforcement)
    // Teachers and admins can have multiple sessions
    if (userRole === "student") {
      await adminDb().collection("users").doc(uid).update({
        sessionToken,
        lastLoginAt: now,
        loginCount: newLoginCount,
        lastDeviceType: normalizedDeviceType,
        updatedAt: now,
      });
    } else {
      // For teachers and admins, only update login count and last login time
      await adminDb().collection("users").doc(uid).update({
        lastLoginAt: now,
        loginCount: newLoginCount,
        lastDeviceType: normalizedDeviceType,
        updatedAt: now,
      });
    }

    return NextResponse.json({
      success: true,
      data: {
        sessionToken,
        loginCount: newLoginCount,
      },
    });
  } catch (error: unknown) {
    console.error("Update login session error:", error);
    
    return NextResponse.json(
      {
        success: false,
        error: "Failed to update login session",
      },
      { status: 500 }
    );
  }
}

