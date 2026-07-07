import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase/admin";
import { syncRoleCustomClaims } from "@/lib/firebase/auth-custom-claims";
import { checkIPRateLimit, checkPhoneRateLimit, checkIPPhoneRateLimit } from "@/lib/rate-limit";
import { verifyPassword } from "@/lib/auth/password";

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

export async function POST(request: NextRequest) {
  try {
    // Rate limiting: 5 attempts per IP per 15 minutes
    const ipRateLimit = checkIPRateLimit(request, "verify-password", {
      maxAttempts: 5,
      windowMs: 15 * 60 * 1000, // 15 minutes
      blockDurationMs: 30 * 60 * 1000, // Block for 30 minutes after exceeding
    });

    if (!ipRateLimit.allowed) {
      const minutesLeft = Math.ceil((ipRateLimit.resetTime - Date.now()) / (60 * 1000));
      return NextResponse.json(
        {
          success: false,
          error: `Quá nhiều lần thử. Vui lòng thử lại sau ${minutesLeft} phút.`,
        },
        { 
          status: 429,
          headers: {
            "X-RateLimit-Limit": "5",
            "X-RateLimit-Remaining": "0",
            "X-RateLimit-Reset": ipRateLimit.resetTime.toString(),
          },
        }
      );
    }

    const body = await request.json();
    const { phone, password, deviceType } = body;

    if (!phone || !password) {
      return NextResponse.json(
        {
          success: false,
          error: "Vui lòng nhập đầy đủ số điện thoại và mật khẩu.",
        },
        { status: 400 }
      );
    }

    const normalizedPhone = normalizePhone(phone);

    // Rate limiting by phone number: 3 failed attempts per phone per 30 minutes
    const phoneRateLimit = checkPhoneRateLimit(normalizedPhone, {
      maxAttempts: 3,
      windowMs: 30 * 60 * 1000, // 30 minutes
      blockDurationMs: 60 * 60 * 1000, // Block for 1 hour after 3 failed attempts
    });

    if (!phoneRateLimit.allowed) {
      const minutesLeft = Math.ceil((phoneRateLimit.resetTime - Date.now()) / (60 * 1000));
      return NextResponse.json(
        {
          success: false,
          error: `Tài khoản bị tạm khóa, thử lại sau ${minutesLeft} phút. Hoặc liên hệ hỗ trợ để được mở khóa ngay.`,
        },
        { 
          status: 429,
          headers: {
            "X-RateLimit-Limit": "3",
            "X-RateLimit-Remaining": "0",
            "X-RateLimit-Reset": phoneRateLimit.resetTime.toString(),
          },
        }
      );
    }

    // Rate limiting by IP + phone combination: 10 attempts per combination per hour
    const ipPhoneRateLimit = checkIPPhoneRateLimit(request, normalizedPhone, {
      maxAttempts: 10,
      windowMs: 60 * 60 * 1000, // 1 hour
    });

    if (!ipPhoneRateLimit.allowed) {
      const minutesLeft = Math.ceil((ipPhoneRateLimit.resetTime - Date.now()) / (60 * 1000));
      return NextResponse.json(
        {
          success: false,
          error: `Quá nhiều lần thử đăng nhập. Vui lòng thử lại sau ${minutesLeft} phút.`,
        },
        { 
          status: 429,
          headers: {
            "X-RateLimit-Limit": "10",
            "X-RateLimit-Remaining": "0",
            "X-RateLimit-Reset": ipPhoneRateLimit.resetTime.toString(),
          },
        }
      );
    }

    const email = phoneToEmail(normalizedPhone);

    try {
      // Get user by email from Firebase Auth
      const userRecord = await adminAuth().getUserByEmail(email);
      
      // Get user document from Firestore to verify password hash
      const userDoc = await adminDb().collection("users").doc(userRecord.uid).get();
      
      if (!userDoc.exists) {
        return NextResponse.json(
          {
            success: false,
            error: "Số điện thoại hoặc mật khẩu không đúng.",
          },
          { status: 401 }
        );
      }

      const userData = userDoc.data();
      const storedPasswordHash = userData?.passwordHash;

      // Verify password using stored hash
      let passwordValid = false;
      
      if (storedPasswordHash) {
        // New method: verify using stored hash
        passwordValid = verifyPassword(password, storedPasswordHash);
        
        if (!passwordValid) {
          // If stored hash verification fails, try Firebase Auth REST API as fallback
          // This handles cases where password was reset but hash wasn't updated
          const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
          if (apiKey) {
            try {
              const verifyPasswordUrl = `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${apiKey}`;
              const verifyResponse = await fetch(verifyPasswordUrl, {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                },
                body: JSON.stringify({
                  email,
                  password,
                  returnSecureToken: true,
                }),
              });

              await verifyResponse.json();

              if (verifyResponse.ok) {
                // Password is correct in Firebase Auth but hash doesn't match
                // Update the hash to match the current password
                const { hashPassword } = await import("@/lib/auth/password");
                const newPasswordHash = hashPassword(password);
                await adminDb().collection("users").doc(userRecord.uid).update({
                  passwordHash: newPasswordHash,
                  updatedAt: new Date(),
                });
                passwordValid = true;
              } else {
                passwordValid = false;
              }
            } catch (fetchError) {
              console.error("Error verifying password via REST API (fallback):", fetchError);
              passwordValid = false;
            }
          }
        }
      } else {
        // Fallback for old users: try Firebase Auth REST API
        // This handles users created before password hash was implemented
        const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
        if (apiKey) {
          try {
            const verifyPasswordUrl = `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${apiKey}`;
            const verifyResponse = await fetch(verifyPasswordUrl, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                email,
                password,
                returnSecureToken: true,
              }),
            });

            await verifyResponse.json();
            passwordValid = verifyResponse.ok;

            // If password is valid and user doesn't have hash, migrate it
            if (passwordValid && !storedPasswordHash) {
              const { hashPassword } = await import("@/lib/auth/password");
              const passwordHash = hashPassword(password);
              await adminDb().collection("users").doc(userRecord.uid).update({
                passwordHash,
                updatedAt: new Date(),
              });
            } else if (!passwordValid) {
            }
          } catch (fetchError) {
            console.error("Error verifying password via REST API (fallback):", fetchError);
            passwordValid = false;
          }
        } else {
          // No API key and no hash - cannot verify
          console.error(`Cannot verify password for user ${userRecord.uid}: No API key and no password hash`);
          passwordValid = false;
        }
      }

      if (!passwordValid) {
        // Password is incorrect
        return NextResponse.json(
          {
            success: false,
            error: "Số điện thoại hoặc mật khẩu không đúng.",
          },
          { 
            status: 401,
            headers: {
              "X-RateLimit-Remaining": Math.max(0, phoneRateLimit.remaining - 1).toString(),
            },
          }
        );
      }

      const now = new Date();
      const userRef = adminDb().collection("users").doc(userRecord.uid);
      const currentData = userDoc.data();
      const currentLoginCount = currentData?.loginCount || 0;
      const rawRole = currentData?.role;
      const userRole =
        rawRole === "admin" || rawRole === "teacher" || rawRole === "student"
          ? rawRole
          : "student";

      await syncRoleCustomClaims(userRecord.uid, userRole);

      // Password is correct, create custom token (claims are already set on the user)
      const customToken = await adminAuth().createCustomToken(userRecord.uid);
      const lastDeviceType = currentData?.lastDeviceType as "pc" | "non-pc" | undefined;
      
      // Normalize device type: default to "pc" if not provided or invalid
      const normalizedDeviceType: "pc" | "non-pc" = (deviceType === "pc" || deviceType === "non-pc") 
        ? deviceType 
        : "pc";

      // Only increment login count if device type matches last device type
      // If lastDeviceType is undefined/null (first login), always increment
      const shouldIncrementLoginCount = !lastDeviceType || lastDeviceType === normalizedDeviceType;
      const newLoginCount = shouldIncrementLoginCount ? currentLoginCount + 1 : currentLoginCount;

      // Only generate and update session token for students (single-session enforcement)
      // Teachers and admins can have multiple sessions
      let sessionToken = currentData?.sessionToken || null;
      if (userRole === "student") {
        sessionToken = `${Date.now()}-${Math.random().toString(36).substring(2, 15)}`;
        await userRef.update({
          sessionToken,
          lastLoginAt: now,
          loginCount: newLoginCount,
          lastDeviceType: normalizedDeviceType,
          updatedAt: now,
        });
      } else {
        // For teachers and admins, only update login count and last login time
        await userRef.update({
          lastLoginAt: now,
          loginCount: newLoginCount,
          lastDeviceType: normalizedDeviceType,
          updatedAt: now,
        });
      }

      return NextResponse.json({
        success: true,
        data: {
          customToken,
          sessionToken, // Include session token in response
          uid: userRecord.uid,
          email,
          phone: normalizedPhone,
          role: userRole,
        },
      });
    } catch (error: unknown) {
      const firebaseError = error as { code?: string; message?: string };
      if (firebaseError.code === "auth/user-not-found") {
        return NextResponse.json(
          {
            success: false,
            error: "Số điện thoại hoặc mật khẩu không đúng.",
          },
          { status: 401 }
        );
      }
      throw error;
    }
  } catch (error: unknown) {
    console.error("Verify password error:", error);
    
    return NextResponse.json(
      {
        success: false,
        error: "Xác thực thất bại. Vui lòng thử lại sau.",
      },
      { status: 500 }
    );
  }
}

