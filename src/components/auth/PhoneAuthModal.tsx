"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/ui/Modal";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { getFirebaseAuth } from "@/lib/firebase/client";
import { signInWithCustomToken } from "firebase/auth";
import { FiPhone, FiLock } from "react-icons/fi";
import { getDeviceType } from "@/utils/device";

interface PhoneAuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

// Normalize phone number - lưu dạng bình thường (0901234567)
function normalizePhone(phone: string): string {
  let cleaned = phone.replace(/\D/g, "");
  // Nếu bắt đầu bằng 84, chuyển về 0
  if (cleaned.startsWith("84") && cleaned.length === 11) {
    cleaned = "0" + cleaned.substring(2);
  }
  // Đảm bảo bắt đầu bằng 0 và có 10 chữ số
  if (cleaned.startsWith("0") && cleaned.length === 10) {
    return cleaned;
  }
  // Nếu không đúng format, trả về cleaned (sẽ được validate sau)
  return cleaned;
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

// Validate password
function validatePassword(password: string): boolean {
  return /^.{6,8}$/.test(password);
}

// Clear old sessionToken from sessionStorage
// This prevents session invalidation issues when logging in again
function clearOldSessionTokens() {
  const keysToRemove: string[] = [];
  for (let i = 0; i < sessionStorage.length; i++) {
    const key = sessionStorage.key(i);
    if (key && key.startsWith("sessionToken_")) {
      keysToRemove.push(key);
    }
  }
  keysToRemove.forEach(key => sessionStorage.removeItem(key));
}

export function PhoneAuthModal({
  isOpen,
  onClose,
  onSuccess,
}: PhoneAuthModalProps) {
  const router = useRouter();
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string>("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Clear previous errors
    setError("");

    // Validate phone
    if (!phone.trim()) {
      setError("Vui lòng nhập số điện thoại của bạn");
      return;
    }

    if (!validatePhone(phone)) {
      setError("Số điện thoại không hợp lệ. Vui lòng nhập đúng định dạng (ví dụ: 0901234567)");
      return;
    }

    // Validate password
    if (!password.trim()) {
      setError("Vui lòng nhập mật khẩu");
      return;
    }

    if (!validatePassword(password)) {
      setError("Mật khẩu phải có từ 6-8 ký tự");
      return;
    }

    setIsLoading(true);

    try {
      const normalizedPhone = normalizePhone(phone);
      const auth = getFirebaseAuth();

      // Login existing user
      try {
        // Clear old sessionToken from sessionStorage before login
        clearOldSessionTokens();

        // Always use API to verify password and get custom token
        // This works regardless of whether Email/Password provider is enabled
        const deviceType = getDeviceType();
        const verifyResponse = await fetch("/api/auth/verify-password", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ phone: normalizedPhone, password, deviceType }),
        });

        const verifyData = await verifyResponse.json();

        if (!verifyResponse.ok || !verifyData.success) {
          // Check if it's a rate limit error (429)
          if (verifyResponse.status === 429) {
            throw new Error(verifyData.error || "Tài khoản bị tạm khóa. Vui lòng thử lại sau hoặc liên hệ hỗ trợ.");
          }
          throw new Error(verifyData.error || "Đăng nhập thất bại. Vui lòng thử lại.");
        }

        // Sign in with custom token
        const credential = await signInWithCustomToken(auth, verifyData.data.customToken);
        const sessionToken = verifyData.data.sessionToken;
        const loggedRole = verifyData.data?.role as string | undefined;

        if (sessionToken) {
          sessionStorage.setItem(`sessionToken_${credential.user.uid}`, sessionToken);
        }

        onSuccess?.();
        onClose();
        resetForm();
        if (typeof window !== "undefined") {
          if (loggedRole === "admin") {
            router.replace("/admin");
          } else {
            router.push("/");
          }
        }
      } catch (error: unknown) {
        console.error("Login error:", error);
        
        const firebaseError = error as { code?: string; message?: string };
        if (firebaseError.code === "auth/user-not-found" || firebaseError.code === "auth/invalid-credential" || firebaseError.code === "auth/custom-token-mismatch") {
          setError("Số điện thoại hoặc mật khẩu không đúng. Vui lòng kiểm tra lại.");
        } else if (firebaseError.message) {
          setError(firebaseError.message);
        } else {
          setError("Đăng nhập thất bại. Vui lòng thử lại.");
        }
      }
    } catch (error: unknown) {
      console.error("Auth error:", error);
      setError("Có lỗi xảy ra. Vui lòng thử lại sau.");
    } finally {
      setIsLoading(false);
    }
  };

  const resetForm = () => {
    setPhone("");
    setPassword("");
    setError("");
  };

  const handleClose = () => {
    if (!isLoading) {
      resetForm();
      onClose();
    }
  };

  return (
    <Modal
      open={isOpen}
      onClose={handleClose}
      title="Đăng nhập"
      maxWidth="sm"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Error Message */}
        {error && (
          <div className="bg-red-50 border-l-4 border-red-400 p-4 rounded-md">
            <div className="flex">
              <div className="flex-shrink-0">
                <svg className="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                </svg>
              </div>
              <div className="ml-3">
                <p className="text-sm text-red-700">{error}</p>
              </div>
            </div>
          </div>
        )}

        {/* Phone Input */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Số điện thoại
          </label>
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <FiPhone className="h-5 w-5 text-gray-400" />
            </div>
            <Input
              type="tel"
              value={phone}
              onChange={(e) => {
                setPhone(e.target.value);
                setError("");
              }}
              placeholder="0901234567"
              className="pl-10"
              disabled={isLoading}
              required
            />
          </div>
          <p className="mt-1 text-xs text-gray-500">
            Nhập số điện thoại
          </p>
        </div>

        {/* Password Input */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Mật khẩu
          </label>
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <FiLock className="h-5 w-5 text-gray-400" />
            </div>
            <Input
              type="text"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                setError("");
              }}
              placeholder="Nhập mật khẩu"
              className="pl-10"
              disabled={isLoading}
              required
            />
          </div>
          <p className="mt-1 text-xs text-gray-500">
            Mật khẩu từ 6-8 ký tự
          </p>
        </div>


        {/* Submit Button */}
        <Button
          type="submit"
          className="w-full"
          disabled={isLoading}
        >
          {isLoading ? "Đang xử lý..." : "Đăng nhập"}
        </Button>

      </form>
    </Modal>
  );
}

