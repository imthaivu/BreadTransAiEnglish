import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase/admin";
import { checkAdminAccess } from "@/lib/auth/server-auth";
import { hashPassword } from "@/lib/auth/password";
import { unlockUserCompletely, unlockAllIPRateLimits } from "@/lib/rate-limit";

// Validate password: 6-8 characters
function validatePassword(password: string): boolean {
  return /^.{6,8}$/.test(password);
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
// This must match the format used in register/login routes
function phoneToEmail(phone: string): string {
  const normalized = normalizePhone(phone);
  // Chuyển 0 thành 84 để tạo email unique (giống format trong Firebase Auth)
  const emailPrefix = normalized.startsWith("0") 
    ? "84" + normalized.substring(1)
    : normalized;
  return `${emailPrefix}@breadtrans.local`;
}

export async function POST(
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

    // Check if user is authenticated and is admin
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
    const { newPassword } = body;

    // Validate input
    if (!newPassword) {
      return NextResponse.json(
        {
          success: false,
          error: "Vui lòng nhập mật khẩu mới.",
        },
        { status: 400 }
      );
    }

    if (!validatePassword(newPassword)) {
      return NextResponse.json(
        {
          success: false,
          error: "Mật khẩu phải có từ 6-8 ký tự.",
        },
        { status: 400 }
      );
    }

    // Get user from Firestore to get email
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
    
    // Verify document exists and is accessible
    if (!userData) {
      return NextResponse.json(
        {
          success: false,
          error: "Không thể đọc dữ liệu người dùng từ Firestore.",
        },
        { status: 500 }
      );
    }
    
    // Get user's email from Firebase Auth (phone-based email)
    // We need to find the user in Firebase Auth
    let userRecord;
    try {
      // Try to get user by UID first
      userRecord = await adminAuth().getUser(userId);
    } catch (error) {
      // If user doesn't exist in Firebase Auth by UID, check if they have phone
      const phone = userData?.phone;
      if (phone) {
        // Convert phone to email format using the same logic as register/login
        // This ensures we use the correct format that matches Firebase Auth
        const email = phoneToEmail(phone);
        try {
          userRecord = await adminAuth().getUserByEmail(email);
        } catch (emailError) {
          const firebaseError = emailError as { code?: string; message?: string };
          console.error(`[Reset Password API] User not found in Firebase Auth by email: ${email}`, firebaseError);
          
          // Provide more detailed error message
          return NextResponse.json(
            {
              success: false,
              error: `Không tìm thấy tài khoản trong hệ thống xác thực. Email tìm kiếm: ${email}. Có thể tài khoản chưa được tạo trong Firebase Auth hoặc số điện thoại không khớp.`,
            },
            { status: 404 }
          );
        }
      } else {
        return NextResponse.json(
          {
            success: false,
            error: "Người dùng không có số điện thoại hoặc email.",
          },
          { status: 400 }
        );
      }
    }

    // Update password using Firebase Admin SDK
    // Firebase Admin SDK will automatically hash the password for Firebase Auth
    try {
      await adminAuth().updateUser(userRecord.uid, {
        password: newPassword,
      });
    } catch (authError: unknown) {
      console.error("Error updating Firebase Auth password:", authError);
      const firebaseAuthError = authError as { code?: string; message?: string };
      
      if (firebaseAuthError.code === "auth/user-not-found") {
        return NextResponse.json(
          {
            success: false,
            error: "Người dùng không tồn tại trong hệ thống xác thực.",
          },
          { status: 404 }
        );
      }

      if (firebaseAuthError.code === "auth/weak-password") {
        return NextResponse.json(
          {
            success: false,
            error: "Mật khẩu quá yếu. Vui lòng chọn mật khẩu mạnh hơn.",
          },
          { status: 400 }
        );
      }

      throw authError; // Re-throw to be caught by outer catch
    }

    // Also update password hash in Firestore for our custom verification
    // This is critical - if this fails, login will fail even with correct password
    const passwordHash = hashPassword(newPassword);
    let firestoreUpdateSuccess = false;
    let lastError: unknown = null;
    
    // Retry logic for Firestore update (up to 3 attempts)
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        // Use set with merge to ensure the field is added even if it doesn't exist
        // This is more reliable than update which requires the document to exist
        await adminDb().collection("users").doc(userId).set({
          passwordHash,
          updatedAt: new Date(),
        }, { merge: true });
        
        firestoreUpdateSuccess = true;
        break;
      } catch (firestoreError: unknown) {
        lastError = firestoreError;
        console.error(`Error updating Firestore passwordHash (attempt ${attempt}/3):`, firestoreError);
        
        // If it's the last attempt, break and handle error
        if (attempt === 3) {
          break;
        }
        
        // Wait a bit before retrying (exponential backoff)
        await new Promise(resolve => setTimeout(resolve, 100 * attempt));
      }
    }
    
    if (!firestoreUpdateSuccess) {
      // All retry attempts failed
      const firestoreError = lastError as { code?: string; message?: string; details?: string };
      console.error("Error updating Firestore passwordHash:", firestoreError);
      
      // Log detailed error information
      const firestoreErr = firestoreError as { code?: string; message?: string; details?: string };
      console.error("Firestore error code:", firestoreErr.code);
      console.error("Firestore error message:", firestoreErr.message);
      console.error("Firestore error details:", firestoreErr.details);
      
      // Try to rollback Firebase Auth password update
      // Get the old password from userData if available, or use a temporary one
      try {
        // We can't easily get the old password, so we'll just log the issue
        // The admin will need to manually fix this or retry
        console.error(`CRITICAL: Password updated in Firebase Auth for user ${userId} but Firestore update failed. Manual intervention may be required.`);
      } catch (rollbackError) {
        console.error("Error during rollback attempt:", rollbackError);
      }
      
      // Return detailed error in development, generic in production
      const errorMessage = process.env.NODE_ENV === "development"
        ? `Đã cập nhật mật khẩu trong Firebase Auth nhưng không thể cập nhật hash trong Firestore. Lỗi: ${firestoreErr.message || "Unknown error"}. Vui lòng thử lại.`
        : "Đã cập nhật mật khẩu trong Firebase Auth nhưng không thể cập nhật hash trong Firestore. Vui lòng thử lại.";
      
      return NextResponse.json(
        {
          success: false,
          error: errorMessage,
        },
        { status: 500 }
      );
    }

    // After successfully resetting password, ALWAYS unlock rate limits for this user
    // This ensures user can login immediately after password reset
    // IMPORTANT: This must be done BEFORE returning success response
    // Unlock is included as part of reset password operation
    const userPhone = userData?.phone;
    
    if (userPhone && userPhone.trim()) {
      try {
        // Normalize phone number - MUST match the format used in verify-password
        const normalizedPhone = normalizePhone(userPhone);
        // Validate normalized phone
        if (normalizedPhone && normalizedPhone.length === 10 && normalizedPhone.startsWith("0")) {
          // Use comprehensive unlock function to unlock everything
          // This unlocks: phone, all ip-phone combinations, and all IP rate limits
          unlockUserCompletely(normalizedPhone);
        } else {
          console.warn(`[Reset Password API] ⚠️ Invalid phone number format for unlock: ${userPhone} (normalized: ${normalizedPhone})`);
          // Still try to unlock all IP rate limits even if phone format is invalid
          try {
            unlockAllIPRateLimits();
          } catch (fallbackError) {
            console.error(`[Reset Password API] ❌ Error in fallback unlock:`, fallbackError);
          }
        }
      } catch (unlockError) {
        // Log error but don't fail the request - password was already reset successfully
        // Try to unlock all IP rate limits as fallback
        console.error(`[Reset Password API] ❌ Error unlocking rate limits for phone, trying fallback:`, unlockError);
        try {
          unlockAllIPRateLimits();
        } catch (fallbackError) {
          console.error(`[Reset Password API] ❌ CRITICAL: Both unlock attempts failed:`, fallbackError);
          console.error(`[Reset Password API] User ${userId} password was reset but rate limits may still be active`);
        }
      }
    } else {
      // User has no phone number, but still try to unlock all IP rate limits
      console.warn(`[Reset Password API] ⚠️ User ${userId} has no phone number, unlocking all IP rate limits as fallback`);
      try {
        unlockAllIPRateLimits();
      } catch (fallbackError) {
        console.error(`[Reset Password API] ❌ Error in fallback unlock:`, fallbackError);
      }
    }

    return NextResponse.json({
      success: true,
      message: "Đã đặt lại mật khẩu thành công. Tài khoản đã được tự động mở khóa.",
      data: {
        unlocked: true,
      },
    });
  } catch (error: unknown) {
    console.error("Reset password error:", error);
    const firebaseError = error as { code?: string; message?: string };
    
    // More detailed error logging
    if (firebaseError.code) {
      console.error("Firebase error code:", firebaseError.code);
      console.error("Firebase error message:", firebaseError.message);
    }
    
    if (firebaseError.code === "auth/user-not-found") {
      return NextResponse.json(
        {
          success: false,
          error: "Người dùng không tồn tại trong hệ thống xác thực.",
        },
        { status: 404 }
      );
    }

    if (firebaseError.code === "auth/weak-password") {
      return NextResponse.json(
        {
          success: false,
          error: "Mật khẩu quá yếu. Vui lòng chọn mật khẩu mạnh hơn.",
        },
        { status: 400 }
      );
    }

    // Return more detailed error message in development
    const errorMessage = process.env.NODE_ENV === "development" 
      ? `Đặt lại mật khẩu thất bại: ${firebaseError.message || "Unknown error"}`
      : "Đặt lại mật khẩu thất bại. Vui lòng thử lại sau.";

    return NextResponse.json(
      {
        success: false,
        error: errorMessage,
      },
      { status: 500 }
    );
  }
}

