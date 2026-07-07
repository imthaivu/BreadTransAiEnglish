import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb, adminStorage } from "@/lib/firebase/admin";
import { checkAdminAccess } from "@/lib/auth/server-auth";
import { syncRoleCustomClaims } from "@/lib/firebase/auth-custom-claims";
import { FieldValue } from "firebase-admin/firestore";

// Helper function to get current user ID from request
async function getCurrentUserId(request: NextRequest): Promise<string | null> {
  const adminCheck = await checkAdminAccess(request);
  return adminCheck.session?.user.id || null;
}

// Normalize phone number - lưu dạng bình thường (0901234567)
function normalizePhone(phone: string): string {
  let cleaned = phone.replace(/\D/g, "");

  // Handle Vietnamese phone numbers - chuyển về dạng 0xxxxxxxxx
  if (cleaned.startsWith("84") && cleaned.length === 11) {
    cleaned = "0" + cleaned.substring(2);
  }
  // Đảm bảo bắt đầu bằng 0 và có 10 chữ số
  if (cleaned.startsWith("0") && cleaned.length === 10) {
    return cleaned;
  }

  return cleaned;
}

// Convert phone to email format for Firebase Auth
function phoneToEmail(phone: string): string {
  const normalized = normalizePhone(phone);
  const emailPrefix = normalized.startsWith("0")
    ? "84" + normalized.substring(1)
    : normalized;
  return `${emailPrefix}@breadtrans.local`;
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  try {
    // Await params (Next.js 15+ requires params to be a Promise)
    const { userId } = await params;


    // Validate userId
    if (!userId || typeof userId !== "string") {
      return NextResponse.json(
        {
          success: false,
          error: "User ID không hợp lệ.",
        },
        { status: 400 }
      );
    }

    // Check admin access
    const adminCheck = await checkAdminAccess(request);
    if (!adminCheck.authorized) {
      return NextResponse.json(
        {
          success: false,
          error: adminCheck.error,
        },
        { status: adminCheck.error === "Unauthorized" ? 401 : 403 }
      );
    }

    // Get current user ID
    const currentUserId = await getCurrentUserId(request);

    // Prevent deleting yourself
    if (currentUserId && currentUserId === userId) {
      return NextResponse.json(
        {
          success: false,
          error: "Không thể xóa chính tài khoản của bạn.",
        },
        { status: 400 }
      );
    }

    // Get user from Firestore first
    const userDoc = await adminDb().collection("users").doc(userId).get();

    if (!userDoc.exists) {
      return NextResponse.json(
        {
          success: false,
          error: "Người dùng không tồn tại trong Firestore.",
        },
        { status: 404 }
      );
    }

    const userData = userDoc.data();

    // Try to delete from Firebase Auth
    // First, try to get user by UID
    let authUserDeleted = false;
    let authUserNotFound = false;
    try {
      await adminAuth().deleteUser(userId);
      authUserDeleted = true;
    } catch (authError: unknown) {
      const firebaseAuthError = authError as { code?: string; message?: string };

      // If user not found in Auth, try to find by phone
      if (firebaseAuthError.code === "auth/user-not-found") {
        authUserNotFound = true;

        // If user has phone, try phone-based email
        if (!authUserDeleted && userData?.phone) {
          const phone = userData.phone;
          const normalizedPhone = phone.replace(/\D/g, "");
          const emailPrefix = normalizedPhone.startsWith("0")
            ? "84" + normalizedPhone.substring(1)
            : normalizedPhone;
          const phoneEmail = `${emailPrefix}@breadtrans.local`;

          try {
            const userRecord = await adminAuth().getUserByEmail(phoneEmail);
            await adminAuth().deleteUser(userRecord.uid);
            authUserDeleted = true;
            authUserNotFound = false;
          } catch (phoneError) {
            // User not found in Auth at all - this is acceptable, continue to delete Firestore
          }
        }
      } else {
        // Other auth errors - this is a real error, should not continue
        console.error("Error deleting user from Firebase Auth:", firebaseAuthError);
        return NextResponse.json(
          {
            success: false,
            error: `Không thể xóa tài khoản xác thực: ${firebaseAuthError.message || "Lỗi không xác định"}`,
          },
          { status: 500 }
        );
      }
    }

    // Remove userId from presences, students, teachers in all classes
    try {
      const db = adminDb();
      const classesSnap = await db.collection("classes").get();

      for (const classDoc of classesSnap.docs) {
        const data = classDoc.data();
        const updates: Record<string, unknown> = {};
        let hasUpdate = false;

        // Remove from presences
        const presences = data.presences as Record<string, unknown> | undefined;
        if (presences && userId in presences) {
          updates[`presences.${userId}`] = FieldValue.delete();
          hasUpdate = true;
        }

        // Remove from students array
        const students = data.students as Array<{ studentId: string; name?: string; avatarUrl?: string }> | undefined;
        if (Array.isArray(students)) {
          const filtered = students.filter((s) => (typeof s === "string" ? s : s.studentId) !== userId);
          if (filtered.length !== students.length) {
            updates.students = filtered;
            hasUpdate = true;
          }
        }

        // Remove from teachers array
        const teachers = data.teachers as Array<{ id: string; name?: string; avatarUrl?: string }> | undefined;
        if (Array.isArray(teachers)) {
          const filtered = teachers.filter((t) => t.id !== userId);
          if (filtered.length !== teachers.length) {
            updates.teachers = filtered;
            hasUpdate = true;
          }
        }

        if (hasUpdate) {
          updates.updatedAt = FieldValue.serverTimestamp();
          await classDoc.ref.update(updates);
        }
      }
    } catch (classCleanupError) {
      console.error("[Delete User API] Error cleaning up classes for deleted user:", classCleanupError);
      // Continue with user delete - class refs will be orphaned but user deletion is primary
    }

    // Delete avatar from Firebase Storage (users/{userId}/avatar/)
    try {
      const bucket = adminStorage().bucket();
      const [files] = await bucket.getFiles({ prefix: `users/${userId}/avatar/` });
      if (files.length > 0) {
        await Promise.all(files.map((file) => file.delete()));
      }
    } catch (storageError) {
      console.error("[Delete User API] Error deleting avatar from Storage:", storageError);
      // Continue - user might not have avatar or bucket not configured
    }

    // Delete user document from Firestore
    let firestoreDeleted = false;
    try {
      await adminDb().collection("users").doc(userId).delete();
      firestoreDeleted = true;
    } catch (firestoreError) {
      console.error("Error deleting user from Firestore:", firestoreError);

      // If Firestore delete fails but Auth delete succeeded, we have a problem
      if (authUserDeleted) {
        return NextResponse.json(
          {
            success: false,
            error: "Đã xóa tài khoản xác thực nhưng không thể xóa dữ liệu người dùng. Vui lòng thử lại.",
          },
          { status: 500 }
        );
      }

      // If both failed, return error
      throw firestoreError;
    }

    // If Firestore was deleted but Auth was not found, that's acceptable (user might have been deleted from Auth already)
    // If both were deleted successfully, that's perfect
    if (!firestoreDeleted) {
      return NextResponse.json(
        {
          success: false,
          error: "Không thể xóa dữ liệu người dùng từ Firestore.",
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: authUserNotFound
        ? "Đã xóa dữ liệu người dùng. Tài khoản xác thực không tồn tại (có thể đã bị xóa trước đó)."
        : "Xóa người dùng thành công.",
      data: {
        authDeleted: authUserDeleted,
        firestoreDeleted: firestoreDeleted,
      },
    });
  } catch (error: unknown) {
    console.error("Delete user error:", error);
    const firebaseError = error as { code?: string; message?: string };

    return NextResponse.json(
      {
        success: false,
        error: process.env.NODE_ENV === "development"
          ? `Xóa người dùng thất bại: ${firebaseError.message || "Unknown error"}`
          : "Xóa người dùng thất bại. Vui lòng thử lại sau.",
      },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  try {
    // Await params (Next.js 15+ requires params to be a Promise)
    const { userId } = await params;


    // Validate userId
    if (!userId || typeof userId !== "string") {
      return NextResponse.json(
        {
          success: false,
          error: "User ID không hợp lệ.",
        },
        { status: 400 }
      );
    }

    // Check admin access
    const adminCheck = await checkAdminAccess(request);
    if (!adminCheck.authorized) {
      return NextResponse.json(
        {
          success: false,
          error: adminCheck.error,
        },
        { status: adminCheck.error === "Unauthorized" ? 401 : 403 }
      );
    }

    const body = await request.json();
    const { role, ...otherUpdates } = body;

    // Get current user data
    const userDoc = await adminDb().collection("users").doc(userId).get();

    if (!userDoc.exists) {
      return NextResponse.json(
        {
          success: false,
          error: "Người dùng không tồn tại.",
        },
        { status: 404 }
      );
    }

    const currentUserData = userDoc.data();
    const currentRole = currentUserData?.role;
    const currentPhone = currentUserData?.phone;

    // Validate role if provided
    if (role && !["admin", "teacher", "student"].includes(role)) {
      return NextResponse.json(
        {
          success: false,
          error: "Vai trò không hợp lệ. Vai trò phải là admin, teacher hoặc student.",
        },
        { status: 400 }
      );
    }

    // Check if phone is being updated and is different
    const newPhone = otherUpdates.phone;
    if (newPhone && typeof newPhone === "string" && newPhone !== currentPhone) {
      const normalizedNewPhone = normalizePhone(newPhone);

      // Update phone in otherUpdates to ensure we save the normalized version
      otherUpdates.phone = normalizedNewPhone;

      const newEmail = phoneToEmail(normalizedNewPhone);

      try {
        // Attempt to update the user's email in Firebase Auth
        await adminAuth().updateUser(userId, {
          email: newEmail,
        });
      } catch (authError: unknown) {
        console.error("[Update User API] Error updating Firebase Auth:", authError);

        const firebaseAuthError = authError as { code?: string; message?: string };

        if (firebaseAuthError.code === "auth/email-already-exists") {
          return NextResponse.json(
            {
              success: false,
              error: "Số điện thoại này đã được sử dụng bởi một tài khoản khác. Vui lòng chọn số khác.",
            },
            { status: 409 }
          );
        } else if (firebaseAuthError.code === "auth/user-not-found") {
          // It's possible the user was deleted in Auth but not Firestore
          console.warn(`[Update User API] User ${userId} not found in Auth, continuing with Firestore update`);
        } else {
          return NextResponse.json(
            {
              success: false,
              error: `Lỗi khi cập nhật tài khoản đăng nhập: ${firebaseAuthError.message || "Lỗi không xác định"}`,
            },
            { status: 500 }
          );
        }
      }
    }

    // Filter out undefined values from otherUpdates to prevent overwriting with undefined
    const cleanedOtherUpdates = Object.fromEntries(
      Object.entries(otherUpdates).filter(([_, value]) => value !== undefined)
    );

    const updates: Record<string, unknown> = {
      ...cleanedOtherUpdates,
      updatedAt: new Date(),
    };

    // If role is being changed to "student", ensure sessionToken exists
    if (role && role === "student" && currentRole !== "student") {
      // User is being upgraded to student
      // Create sessionToken if it doesn't exist
      if (!currentUserData?.sessionToken) {
        const sessionToken = `${Date.now()}-${Math.random().toString(36).substring(2, 15)}`;
        updates.sessionToken = sessionToken;
      }
    } else if (role && role !== "student" && currentRole === "student") {
      // User is being downgraded from student to other role
      // Remove sessionToken (not needed for non-students)
      updates.sessionToken = null;
    }

    // Add role to updates if provided
    if (role) {
      updates.role = role;
    }

    // Update user in Firestore
    await adminDb().collection("users").doc(userId).update(updates);

    // Align Auth custom claims with persisted role (same as `npm run sync-auth-claims`)
    const updatedSnap = await adminDb().collection("users").doc(userId).get();
    await syncRoleCustomClaims(userId, updatedSnap.data()?.role);

    return NextResponse.json({
      success: true,
      message: "Cập nhật người dùng thành công.",
      data: {
        userId,
        updates,
      },
    });
  } catch (error: unknown) {
    console.error("Update user error:", error);
    const firebaseError = error as { code?: string; message?: string };

    return NextResponse.json(
      {
        success: false,
        error: process.env.NODE_ENV === "development"
          ? `Cập nhật người dùng thất bại: ${firebaseError.message || "Unknown error"}`
          : "Cập nhật người dùng thất bại. Vui lòng thử lại sau.",
      },
      { status: 500 }
    );
  }
}

