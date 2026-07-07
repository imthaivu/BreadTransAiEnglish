"use client";

import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { FiPhone, FiLock } from "react-icons/fi";
import { getFirebaseAuth, getDb } from "@/lib/firebase/client";
import { signInWithCustomToken } from "firebase/auth";
import { doc, onSnapshot } from "firebase/firestore";
import { getDeviceType } from "@/utils/device";

const SAVED_PHONE_KEY = "magicDoorSavedPhone";

interface MagicDoorProps {
  isOpen: boolean;
  onClose: () => void;
  onLogin: (studentId: string) => void;
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

export default function MagicDoor({
  isOpen,
  onClose,
  onLogin,
}: MagicDoorProps) {
  const [loadingButton, setLoadingButton] = useState<"login" | null>(null);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  
  // Form states
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string>("");

      // Prefill saved phone when opening modal
      useEffect(() => {
        if (!isOpen) return;
        const savedPhone = localStorage.getItem(SAVED_PHONE_KEY);
        if (savedPhone) {
          setPhone(savedPhone);
        }
      }, [isOpen]);

      // Setup realtime listener for session invalidation (only for students)
      useEffect(() => {
        if (!isOpen) return;

        const setupSessionListener = (uid: string) => {
          const db = getDb();
          const userRef = doc(db, "users", uid);
          
          // Listen for changes to sessionToken
          const unsubscribe = onSnapshot(userRef, (snapshot) => {
            if (!snapshot.exists()) return;
            
            const userData = snapshot.data();
            const userRole = userData?.role;
            
            // Only setup session listener for students (single-session enforcement)
            // Teachers and admins can have multiple sessions
            if (userRole !== "student") {
              return;
            }
            
            const currentSessionToken = userData?.sessionToken;
            
            // Get stored session token from sessionStorage
            const storedSessionToken = sessionStorage.getItem(`sessionToken_${uid}`);
            
            // If session token changed, invalidate current session
            if (storedSessionToken && currentSessionToken && storedSessionToken !== currentSessionToken) {
              // Session was invalidated by another login
              const auth = getFirebaseAuth();
              auth.signOut().then(() => {
                sessionStorage.removeItem(`sessionToken_${uid}`);
                window.location.reload();
              });
            } else if (currentSessionToken) {
              // Store current session token
              sessionStorage.setItem(`sessionToken_${uid}`, currentSessionToken);
            }
          }, (error) => {
            console.error("Session listener error:", error);
          });

          // Cleanup on unmount
          return unsubscribe;
        };

        // Get current user UID if available
        const auth = getFirebaseAuth();
        const currentUser = auth.currentUser;
        if (currentUser) {
          const unsubscribe = setupSessionListener(currentUser.uid);
          return () => {
            unsubscribe();
          };
        }
      }, [isOpen]);

  const resetForm = () => {
    setPhone("");
    setPassword("");
    setError("");
  };

  const handlePhoneAuth = async (e: React.FormEvent) => {
    e.preventDefault();

    // Clear previous errors
    setError("");

    // Validate phone
    if (!phone.trim()) {
      setError("Vui lòng nhập số điện thoại");
      return;
    }

    if (!validatePhone(phone)) {
      setError("Số điện thoại không hợp lệ");
      return;
    }

    const normalizedPhone = normalizePhone(phone);
    localStorage.setItem(SAVED_PHONE_KEY, normalizedPhone);

    // Validate password
    if (!password.trim()) {
      setError("Vui lòng nhập mật khẩu");
      return;
    }

    if (!validatePassword(password)) {
      setError("Mật khẩu phải có 6-8 ký tự");
      return;
    }

    setLoadingButton("login");

    try {
      const auth = getFirebaseAuth();

      // Login existing user
      try {
        // Clear old sessionToken from sessionStorage before login
        clearOldSessionTokens();

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
          throw new Error(verifyData.error || "Đăng nhập thất bại");
        }

        // Sign in with custom token
        const userCredential = await signInWithCustomToken(auth, verifyData.data.customToken);
        const sessionToken = verifyData.data.sessionToken;
        const loggedRole = verifyData.data?.role as string | undefined;

        // Store session token for session invalidation check
        if (sessionToken) {
          sessionStorage.setItem(`sessionToken_${userCredential.user.uid}`, sessionToken);
        }

        resetForm();
        onClose();
        onLogin("");
        if (loggedRole === "admin") {
          window.location.href = "/admin";
        } else {
          window.location.reload();
        }
      } catch (error: unknown) {
        console.error("Login error:", error);
        
        const firebaseError = error as { code?: string; message?: string };
        if (firebaseError.code === "auth/user-not-found" || firebaseError.code === "auth/invalid-credential" || firebaseError.code === "auth/custom-token-mismatch") {
          setError("Số điện thoại hoặc mật khẩu không đúng");
        } else if (firebaseError.message) {
          setError(firebaseError.message);
        } else {
          setError("Đăng nhập thất bại");
        }
      }
    } catch (error: unknown) {
      console.error("Auth error:", error);
      setError("Có lỗi xảy ra");
    } finally {
      setLoadingButton(null);
    }
  };

  if (!mounted || typeof document === "undefined") return null;

  const content = (
    <>
      {isOpen && (
        <>
          {/* Backdrop - keep static for better iOS WebView compatibility */}
          <div
            className="fixed inset-0 z-[10050] bg-black/50"
            onClick={onClose}
          />

          {/* Login Modal */}
          <div
            className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-[10051] bg-white border border-gray-300 rounded-lg p-6 shadow-lg max-w-[calc(100vw-40px)] w-[400px] max-h-[calc(100vh-40px)] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-xl font-semibold text-gray-900 mb-4 text-center">
              Đăng nhập
            </h2>

            <form onSubmit={handlePhoneAuth} className="space-y-4 w-full">
              {/* Error Message */}
              {error && (
                <div className="bg-red-50 border border-red-200 rounded p-3">
                  <p className="text-sm text-red-700">{error}</p>
                </div>
              )}

              {/* Phone Input */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Số điện thoại <span className="text-red-500">*</span>
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
                    className="pl-10 w-full"
                    disabled={loadingButton !== null}
                    required
                  />
                </div>
              </div>

              {/* Password Input */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Mật khẩu <span className="text-red-500">*</span>
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
                    className="pl-10 w-full"
                    disabled={loadingButton !== null}
                    required
                  />
                </div>
              </div>

              {/* Submit Button */}
              <Button
                type="submit"
                disabled={loadingButton !== null}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-2.5 rounded-lg"
              >
                {loadingButton === "login" ? (
                  <div className="flex items-center justify-center gap-2">
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                    <span>Đang xử lý...</span>
                  </div>
                ) : (
                  <span>Đăng nhập</span>
                )}
              </Button>
            </form>
          </div>
        </>
      )}
    </>
  );

  return createPortal(content, document.body);
}
