import { NextRequest, NextResponse } from "next/server";
import { checkIPRateLimit } from "@/lib/rate-limit";

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
  // Chuyển 0 thành 84 để tạo email unique
  const emailPrefix = normalized.startsWith("0") 
    ? "84" + normalized.substring(1)
    : normalized;
  return `${emailPrefix}@breadtrans.local`;
}

// Validate phone number (Vietnamese format)
function validatePhone(phone: string): boolean {
  const cleaned = phone.replace(/\D/g, "");
  // Vietnamese phone: exactly 10 digits starting with 0
  // Also accept 11 digits starting with 84 (will be converted to 0xxxxxxxxx)
  if (cleaned.startsWith("84") && cleaned.length === 11) {
    // Convert 84xxxxxxxxx to 0xxxxxxxxx for validation
    const converted = "0" + cleaned.substring(2);
    return /^0[1-9][0-9]{8}$/.test(converted);
  }
  // Must be exactly 10 digits starting with 0
  return /^0[1-9][0-9]{8}$/.test(cleaned);
}

export async function POST(request: NextRequest) {
  try {
    // Rate limiting: 10 login attempts per IP per 15 minutes
    const rateLimit = checkIPRateLimit(request, "login", {
      maxAttempts: 10,
      windowMs: 15 * 60 * 1000, // 15 minutes
      blockDurationMs: 30 * 60 * 1000, // Block for 30 minutes after exceeding
    });

    if (!rateLimit.allowed) {
      const minutesLeft = Math.ceil((rateLimit.resetTime - Date.now()) / (60 * 1000));
      return NextResponse.json(
        {
          success: false,
          error: `Quá nhiều lần đăng nhập thất bại. Vui lòng thử lại sau ${minutesLeft} phút.`,
        },
        { 
          status: 429,
          headers: {
            "X-RateLimit-Limit": "10",
            "X-RateLimit-Remaining": "0",
            "X-RateLimit-Reset": rateLimit.resetTime.toString(),
          },
        }
      );
    }

    const body = await request.json();
    const { phone, password } = body;

    // Validate input
    if (!phone || !password) {
      return NextResponse.json(
        {
          success: false,
          error: "Vui lòng nhập đầy đủ số điện thoại và mật khẩu.",
        },
        { status: 400 }
      );
    }

    if (!validatePhone(phone)) {
      return NextResponse.json(
        {
          success: false,
          error: "Số điện thoại không hợp lệ.",
        },
        { status: 400 }
      );
    }

    const normalizedPhone = normalizePhone(phone);
    const email = phoneToEmail(normalizedPhone);

    // Security: Always return the same response to prevent enumeration attacks
    // Don't check if user exists here - let verify-password handle authentication
    // This prevents attackers from discovering which phone numbers have accounts
    
    // Always return success with email format (even if user doesn't exist)
    // The actual authentication will happen in verify-password route
    return NextResponse.json({
      success: true,
      message: "Xác thực thành công!",
      data: {
        email, // Phone-based email for Firebase Auth
        password, // Client will verify with Firebase Auth
        phone: normalizedPhone,
      },
    });
  } catch (error: unknown) {
    console.error("Login error:", error);
    
    return NextResponse.json(
      {
        success: false,
        error: "Đăng nhập thất bại. Vui lòng thử lại sau.",
      },
      { status: 500 }
    );
  }
}

