import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { checkAdminAccess } from "@/lib/auth/server-auth";
import { unlockUser, unlockAllIPRateLimits } from "@/lib/rate-limit";

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

    // Get user from Firestore to get phone number
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


    if (!userPhone || !userPhone.trim()) {
      return NextResponse.json(
        {
          success: false,
          error: "Người dùng này không có số điện thoại. Không thể unlock.",
        },
        { status: 400 }
      );
    }

    // Normalize phone number
    const normalizedPhone = normalizePhone(userPhone);
    

    // Validate normalized phone
    if (!normalizedPhone || normalizedPhone.length < 10) {
      console.error(`[Unlock User API] Invalid phone number after normalization:`, {
        original: userPhone,
        normalized: normalizedPhone,
      });
      return NextResponse.json(
        {
          success: false,
          error: `Số điện thoại không hợp lệ: ${userPhone}. Không thể unlock.`,
        },
        { status: 400 }
      );
    }

    // Unlock user - this will unlock both phone and all related IPs
    try {
      // Unlock phone and all IP-phone combinations
      unlockUser(normalizedPhone);
      
      // Also unlock all IP rate limits to ensure user can login from any IP
      // This handles cases where user is blocked by IP rate limit (not phone-based)
      unlockAllIPRateLimits();
      
    } catch (unlockError) {
      console.error(`[Unlock User API] Error in unlockUser:`, unlockError);
      throw unlockError;
    }

    return NextResponse.json({
      success: true,
      message: "Đã mở khóa tài khoản thành công. Người dùng có thể đăng nhập lại bình thường.",
      data: {
        userId,
        phone: normalizedPhone,
      },
    });
  } catch (error: unknown) {
    console.error("[Unlock User API] Error:", error);
    
    return NextResponse.json(
      {
        success: false,
        error: "Mở khóa tài khoản thất bại. Vui lòng thử lại sau.",
      },
      { status: 500 }
    );
  }
}

