import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase/admin";
import { getServerSession } from "@/lib/auth/server-auth";
import { hashPassword } from "@/lib/auth/password";
import { checkIPRateLimit, checkUserRateLimit } from "@/lib/rate-limit";

// Validate password: 6-8 characters
function validatePassword(password: string): boolean {
  return /^.{6,8}$/.test(password);
}

export async function POST(request: NextRequest) {
  try {
    // Rate limit theo IP (chống bot spam đổi mật khẩu để DoS Firebase Auth).
    const ipLimit = checkIPRateLimit(request, "change-password", {
      maxAttempts: 10,
      windowMs: 60 * 60 * 1000,
      blockDurationMs: 60 * 60 * 1000,
    });
    if (!ipLimit.allowed) {
      return NextResponse.json(
        { success: false, error: "Quá nhiều yêu cầu đổi mật khẩu. Vui lòng thử lại sau." },
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

    const userId = session.user.id;
    if (!userId) {
      return NextResponse.json(
        {
          success: false,
          error: "User ID không hợp lệ.",
        },
        { status: 400 }
      );
    }

    // Rate limit theo user: 1 user không thể đổi mật khẩu quá 5 lần / giờ.
    const userLimit = checkUserRateLimit(userId, "change-password", {
      maxAttempts: 5,
      windowMs: 60 * 60 * 1000,
    });
    if (!userLimit.allowed) {
      return NextResponse.json(
        { success: false, error: "Bạn đã đổi mật khẩu quá nhiều lần. Vui lòng thử lại sau 1 giờ." },
        { status: 429 }
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

    // Get user from Firestore to check if they have phone (phone-based account)
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

    const userData = userDoc.data();
    const userPhone = userData?.phone;
    
    // All accounts are phone-based now
    if (!userPhone) {
      return NextResponse.json(
        {
          success: false,
          error: "Tài khoản không có số điện thoại. Vui lòng liên hệ quản trị viên.",
        },
        { status: 403 }
      );
    }
    
    // Convert phone to email format for Firebase Auth lookup
    function phoneToEmail(phone: string): string {
      const normalized = phone.replace(/\D/g, "");
      const emailPrefix = normalized.startsWith("0") 
        ? "84" + normalized.substring(1)
        : normalized;
      return `${emailPrefix}@breadtrans.local`;
    }
    
    // Get user from Firebase Auth
    let userRecord;
    try {
      userRecord = await adminAuth().getUser(userId);
    } catch (error) {
      // If user doesn't exist in Firebase Auth, try by phone-based email
      try {
        const phoneEmail = phoneToEmail(userPhone);
        userRecord = await adminAuth().getUserByEmail(phoneEmail);
      } catch (emailError) {
        return NextResponse.json(
          {
            success: false,
            error: "Không tìm thấy tài khoản trong hệ thống xác thực.",
          },
          { status: 404 }
        );
      }
    }

    // Update password using Firebase Admin SDK
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

      throw authError;
    }

    // Update password hash in Firestore
    const passwordHash = hashPassword(newPassword);
    let firestoreUpdateSuccess = false;
    let lastError: unknown = null;
    
    // Retry logic for Firestore update (up to 3 attempts)
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        await adminDb().collection("users").doc(userId).set({
          passwordHash,
          updatedAt: new Date(),
        }, { merge: true });
        
        firestoreUpdateSuccess = true;
        break;
      } catch (firestoreError: unknown) {
        lastError = firestoreError;
        console.error(`Error updating Firestore passwordHash (attempt ${attempt}/3):`, firestoreError);
        
        if (attempt === 3) {
          break;
        }
        
        await new Promise(resolve => setTimeout(resolve, 100 * attempt));
      }
    }
    
    if (!firestoreUpdateSuccess) {
      const firestoreErr = lastError as { code?: string; message?: string };
      console.error("Error updating Firestore passwordHash:", firestoreErr);
      
      return NextResponse.json(
        {
          success: false,
          error: "Đã cập nhật mật khẩu nhưng có lỗi xảy ra. Vui lòng thử lại.",
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "Đã đổi mật khẩu thành công.",
    });
  } catch (error: unknown) {
    console.error("Change password error:", error);
    const firebaseError = error as { code?: string; message?: string };
    
    const errorMessage = process.env.NODE_ENV === "development" 
      ? `Đổi mật khẩu thất bại: ${firebaseError.message || "Unknown error"}`
      : "Đổi mật khẩu thất bại. Vui lòng thử lại sau.";

    return NextResponse.json(
      {
        success: false,
        error: errorMessage,
      },
      { status: 500 }
    );
  }
}

