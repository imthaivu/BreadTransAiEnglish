import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase/admin";
import { syncRoleCustomClaims } from "@/lib/firebase/auth-custom-claims";
import { UserRole } from "@/lib/auth/types";
import { checkAdminAccess } from "@/lib/auth/server-auth";
import { hashPassword } from "@/lib/auth/password";

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

// Validate phone number (Vietnamese format)
function validatePhone(phone: string): boolean {
  const cleaned = phone.replace(/\D/g, "");
  // Vietnamese phone: exactly 10 digits starting with 0
  // Also accept 11 digits starting with 84 (will be converted to 0xxxxxxxxx)
  if (cleaned.startsWith("84") && cleaned.length === 11) {
    const converted = "0" + cleaned.substring(2);
    return /^0[1-9][0-9]{8}$/.test(converted);
  }
  return /^0[1-9][0-9]{8}$/.test(cleaned);
}

// Validate password: 6-8 characters
function validatePassword(password: string): boolean {
  return /^.{6,8}$/.test(password);
}

export async function POST(request: NextRequest) {
  try {
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
    const {
      displayName, // Họ tên của bé
      role,
      phone, // SĐT zalo của bé (required - dùng để đăng nhập)
      parentPhone, // SĐT zalo của PH (optional)
      address, // Địa chỉ (optional)
      addressDetail, // Địa chỉ chi tiết (optional)
      birthYear, // Năm sinh học sinh (dùng tính lớp)
      password
    } = body;

    const targetRole = role as UserRole | undefined;
    if (targetRole !== UserRole.STUDENT && targetRole !== UserRole.TEACHER) {
      return NextResponse.json(
        {
          success: false,
          error: "Loại tài khoản không hợp lệ. Chỉ hỗ trợ giáo viên hoặc học sinh.",
        },
        { status: 400 }
      );
    }

    // Validate required fields
    if (!displayName || !displayName.trim()) {
      return NextResponse.json(
        {
          success: false,
          error: "Vui lòng nhập họ tên của bé.",
        },
        { status: 400 }
      );
    }

    if (displayName.trim().length < 2) {
      return NextResponse.json(
        {
          success: false,
          error: "Họ tên của bé phải có ít nhất 2 ký tự.",
        },
        { status: 400 }
      );
    }

    // Phone của bé là required - dùng để đăng nhập (This could be the fallback parent phone from client)
    if (!phone || !phone.trim()) {
      return NextResponse.json(
        {
          success: false,
          error: "Vui lòng nhập số điện thoại.",
        },
        { status: 400 }
      );
    }

    if (!validatePhone(phone)) {
      return NextResponse.json(
        {
          success: false,
          error: "Số điện thoại không hợp lệ. Vui lòng nhập số điện thoại 10 số (ví dụ: 0901234567).",
        },
        { status: 400 }
      );
    }

    const normalizedPhone = normalizePhone(phone);

    const normalizedParentPhone =
      targetRole === UserRole.STUDENT && parentPhone && parentPhone.trim()
        ? normalizePhone(parentPhone)
        : null;

    if (targetRole === UserRole.STUDENT) {
      if (!parentPhone || !parentPhone.trim()) {
        return NextResponse.json(
          {
            success: false,
            error: "Vui lòng nhập số điện thoại phụ huynh.",
          },
          { status: 400 }
        );
      }

      if (!validatePhone(parentPhone)) {
        return NextResponse.json(
          {
            success: false,
            error: "Số điện thoại phụ huynh không hợp lệ. Vui lòng nhập số điện thoại 10 số (ví dụ: 0901234567).",
          },
          { status: 400 }
        );
      }
    }

    if (!password) {
      return NextResponse.json(
        {
          success: false,
          error: "Vui lòng nhập mật khẩu.",
        },
        { status: 400 }
      );
    }

    if (!validatePassword(password)) {
      return NextResponse.json(
        {
          success: false,
          error: "Mật khẩu phải có từ 6-8 ký tự.",
        },
        { status: 400 }
      );
    }

    // Use student phone for Firebase Auth (required for authentication)
    const email = phoneToEmail(normalizedPhone);

    // Check if user already exists (by student phone)
    try {
      await adminAuth().getUserByEmail(email);

      return NextResponse.json(
        {
          success: false,
          error: "Số điện thoại này đã được đăng ký. Vui lòng sử dụng số khác.",
        },
        { status: 409 }
      );
    } catch (error: unknown) {
      const firebaseError = error as { code?: string; message?: string };
      if (firebaseError.code !== "auth/user-not-found") {
        throw error;
      }
    }

    // Check if student phone already exists in Firestore
    const studentPhoneQuery = await adminDb()
      .collection("users")
      .where("phone", "==", normalizedPhone)
      .limit(1)
      .get();

    if (!studentPhoneQuery.empty) {
      return NextResponse.json(
        {
          success: false,
          error: "Số điện thoại này đã được đăng ký. Vui lòng sử dụng số khác.",
        },
        { status: 409 }
      );
    }

    // parentPhone may be shared by siblings; only login phone (normalizedPhone) must be unique.

    // Create user in Firebase Auth using student phone
    const userRecord = await adminAuth().createUser({
      email,
      password,
      emailVerified: false,
      disabled: false,
    });

    // Hash password for storage in Firestore
    const passwordHash = hashPassword(password);

    // Create user document in Firestore
    const now = new Date();
    const userDocData: Record<string, unknown> = {
      uid: userRecord.uid,
      displayName: displayName.trim(),
      phone: normalizedPhone, // SĐT dùng để đăng nhập
      address: address?.trim() || null, // Địa chỉ (optional)
      addressDetail: addressDetail?.trim() || null, // Địa chỉ chi tiết (optional)
      passwordHash, // Store hashed password for verification
      avatarUrl: null,
      role: targetRole,
      isActive: true,
      createdAt: now,
      updatedAt: now,
    };

    if (targetRole === UserRole.STUDENT) {
      userDocData.parentPhone = normalizedParentPhone;
      userDocData.classIds = [];
      userDocData.isSelfClaimed = false; // Mặc định: Phụ huynh nhận hàng
      userDocData.timesVocabXS = 0;
      userDocData.timesVocab = 0;
      userDocData.quizAccuracy = 50.0;
      userDocData.speakingAccuracy = 50.0;
      userDocData.countHeart = 0;

      // Năm sinh (optional). Kiểm tra hợp lệ: số nguyên 1990 - năm hiện tại.
      const parsedBirthYear =
        typeof birthYear === "number"
          ? birthYear
          : typeof birthYear === "string" && birthYear.trim() !== ""
            ? Number(birthYear)
            : null;
      const currentYear = new Date().getFullYear();
      if (
        parsedBirthYear !== null &&
        Number.isFinite(parsedBirthYear) &&
        parsedBirthYear >= 1990 &&
        parsedBirthYear <= currentYear
      ) {
        userDocData.birthYear = parsedBirthYear;
      }
    } else if (targetRole === UserRole.TEACHER) {
      userDocData.classIds = [];
      userDocData.canCreateClass = true;
    }

    await adminDb().collection("users").doc(userRecord.uid).set(userDocData);

    await syncRoleCustomClaims(userRecord.uid, targetRole);

    return NextResponse.json({
      success: true,
      message:
        targetRole === UserRole.TEACHER
          ? "Tạo tài khoản giáo viên thành công!"
          : "Tạo tài khoản học sinh thành công!",
      data: {
        uid: userRecord.uid,
        phone: normalizedPhone,
        parentPhone: normalizedParentPhone,
        displayName: displayName.trim(),
        role: targetRole,
      },
    });
  } catch (error: unknown) {
    console.error("Create user error:", error);

    const firebaseError = error as { code?: string; message?: string };
    if (firebaseError.code === "auth/email-already-exists") {
      return NextResponse.json(
        {
          success: false,
          error: "Số điện thoại này đã được đăng ký.",
        },
        { status: 409 }
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

    return NextResponse.json(
      {
        success: false,
        error: "Tạo tài khoản thất bại. Vui lòng thử lại sau.",
      },
      { status: 500 }
    );
  }
}

