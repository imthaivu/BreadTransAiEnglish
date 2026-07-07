"use client";

import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { UserAvatar } from "@/components/ui/UserAvatar";
import { useAuth } from "@/lib/auth/context";
import { getDb, getStorageBucket } from "@/lib/firebase/client";
import { doc, updateDoc } from "firebase/firestore";
import { getDownloadURL, ref, uploadBytes, deleteObject, listAll } from "firebase/storage";
import { SafeImage as Image } from "@/components/ui/SafeImage";
import { useRef, useState, useEffect, useMemo } from "react";
import toast from "react-hot-toast";
import { compressAndResizeImage } from "@/utils/image";
import { FiLock } from "react-icons/fi";
import { Modal } from "@/components/ui/Modal";
import { ImageCropModal } from "@/components/ui/ImageCropModal";
import { syncMemberAvatarInClasses } from "@/modules/classes/api/member-avatar";
import { AppUserProfile, UserRole } from "@/lib/auth/types";
import { readAchievementsFromUser } from "@/modules/user/services";

/** Điểm 0–100 → hiển thị thang 10 (vd. 50 → "5.0"). */
function formatAccuracyScore(accuracy: number): string {
  return (accuracy / 10).toFixed(1);
}

function getRateTone(rate: number) {
  if (rate >= 80) {
    return {
      numberClass: "text-emerald-600",
      strokeClass: "text-emerald-500",
      cardClass: "bg-emerald-50 ring-1 ring-emerald-100",
    };
  }
  if (rate >= 50) {
    return {
      numberClass: "text-yellow-500",
      strokeClass: "text-yellow-500",
      cardClass: "bg-yellow-50 ring-1 ring-yellow-100",
    };
  }
  return {
    numberClass: "text-orange-600",
    strokeClass: "text-orange-500",
    cardClass: "bg-orange-50 ring-1 ring-orange-100",
  };
}

type HalfCircleGaugeProps = {
  /** Giá trị 0–100 */
  value: number;
  displayValue: string;
  tone: ReturnType<typeof getRateTone>;
};

function HalfCircleGauge({ value, displayValue, tone }: HalfCircleGaugeProps) {
  const clamped = Math.min(100, Math.max(0, value));
  const radius = 36;
  const arcLength = Math.PI * radius;
  const dashOffset = arcLength * (1 - clamped / 100);

  return (
    <div className="relative mx-auto w-full max-w-[88px]">
      <svg viewBox="0 0 88 50" className="w-full h-auto" aria-hidden>
        <path
          d="M 8 44 A 36 36 0 0 1 80 44"
          fill="none"
          stroke="currentColor"
          strokeWidth="7"
          strokeLinecap="round"
          className="text-slate-200/80"
        />
        <path
          d="M 8 44 A 36 36 0 0 1 80 44"
          fill="none"
          stroke="currentColor"
          strokeWidth="7"
          strokeLinecap="round"
          pathLength={arcLength}
          strokeDasharray={arcLength}
          strokeDashoffset={dashOffset}
          className={tone.strokeClass}
          style={{ transition: "stroke-dashoffset 0.4s ease" }}
        />
      </svg>
      <p
        className={`absolute inset-x-0 bottom-0 text-center text-lg sm:text-xl font-black leading-none ${tone.numberClass}`}
      >
        {displayValue}
      </p>
    </div>
  );
}

// Combined Avatar and Achievements Card
type AvatarCardProps = {
  profileOverride?: Partial<AppUserProfile> | null;
  readOnly?: boolean;
};

export function AvatarCard({
  profileOverride,
  readOnly = false,
}: AvatarCardProps) {
  const { session, profile, refetchProfile } = useAuth();
  const currentProfile = (profileOverride ?? profile) as (Partial<AppUserProfile> & {
    achievements?: string;
    timesVocabXS?: number;
    timesVocab?: number;
    countHeart?: number;
    speakingAccuracy?: number;
    quizAccuracy?: number;
  }) | null;
  const [, setAvatarUploading] = useState(false);
  const [cropModalOpen, setCropModalOpen] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Người nhận quà: true = học sinh (HS), false = phụ huynh (PH)
  const [isSelfClaimedLocal, setIsSelfClaimedLocal] = useState<boolean>(
    !!(profile as { isSelfClaimed?: boolean } | null)?.isSelfClaimed
  );
  const [isClaimUpdating, setIsClaimUpdating] = useState(false);
  useEffect(() => {
    setIsSelfClaimedLocal(!!(profile as { isSelfClaimed?: boolean } | null)?.isSelfClaimed);
  }, [profile]);

  async function handleClaimChange(selfClaimed: boolean) {
    if (!session?.user) return;
    const previous = isSelfClaimedLocal;
    try {
      setIsSelfClaimedLocal(selfClaimed);
      setIsClaimUpdating(true);
      await updateDoc(doc(getDb(), "users", session.user.id), { isSelfClaimed: selfClaimed });
      toast.success("Đã cập nhật người nhận quà");
    } catch {
      setIsSelfClaimedLocal(previous);
      toast.error("Cập nhật thất bại");
    } finally {
      setIsClaimUpdating(false);
    }
  }

  const profileWithExtras = currentProfile ?? {};

  const timesVocabXS = profileWithExtras.timesVocabXS ?? 0;
  const countHeart = profileWithExtras.countHeart ?? 0;
  const streakCount = currentProfile?.streakCount ?? 0;
  const speakingAccuracy = profileWithExtras.speakingAccuracy ?? 50;
  const quizAccuracy = profileWithExtras.quizAccuracy ?? 50;

  const vocabRate = Number(quizAccuracy.toFixed(3));
  const speakingRate = Number(speakingAccuracy.toFixed(3));
  const vocabTone = getRateTone(vocabRate);
  const speakingTone = getRateTone(speakingRate);
  const vocabScoreDisplay = formatAccuracyScore(vocabRate);
  const speakingScoreDisplay = formatAccuracyScore(speakingRate);

  function handleFileSelect(file: File | null) {
    if (!file) return;
    setSelectedFile(file);
    setCropModalOpen(true);
  }

  async function handleAvatarChange(croppedFile: File) {
    if (!session?.user || !croppedFile || readOnly) return;

    const toastId = toast.loading("Đang xử lý và tải ảnh lên...");
    setAvatarUploading(true);
    try {
      // Compress and resize image before upload (400x400, quality 0.85)
      const compressedFile = await compressAndResizeImage(croppedFile, 400, 400, 0.85);

      const storage = getStorageBucket();

      // Delete all old avatar files in the folder before uploading new one
      const avatarFolderRef = ref(storage, `users/${session.user.id}/avatar`);
      try {
        const oldFiles = await listAll(avatarFolderRef);
        // Delete all files in the avatar folder
        if (oldFiles.items.length > 0) {
          const deletePromises = oldFiles.items.map((item) => {
            return deleteObject(item);
          });
          await Promise.all(deletePromises);
        }
      } catch (deleteError: unknown) {
        // Ignore errors - folder might not exist or already empty
        // This is expected for first-time uploads
      }

      // Use fixed filename to ensure only one avatar exists (always jpg after compression)
      const path = `users/${session.user.id}/avatar/avatar.jpg`;
      const storageRef = ref(storage, path);
      await uploadBytes(storageRef, compressedFile);
      const url = await getDownloadURL(storageRef);

      // If user is a student, update their avatarUrl directly using updateDoc 
      // instead of the admin hook useUpdateStudent
      await updateDoc(doc(getDb(), "users", session.user.id), {
        avatarUrl: url,
      });
      await syncMemberAvatarInClasses({
        memberId: session.user.id,
        avatarUrl: url,
      });

      // Refresh profile to update UI immediately
      refetchProfile();

      toast.success("Cập nhật ảnh đại diện thành công!", { id: toastId });
    } catch (error) {
      console.error(error);
      toast.error("Đã có lỗi xảy ra.", { id: toastId });
    } finally {
      setAvatarUploading(false);
    }
  }

  return (
    <>
      <Card className="border-0 shadow-none">
        <CardContent className="pt-0 px-0 pb-2">
          <div className="flex flex-col items-center gap-1">
            <div className="relative">
              {currentProfile?.role === "student" && !readOnly && (
                <div className="absolute right-full mr-3 top-1/2 -translate-y-1/2 flex flex-col gap-1.5">
                  <span className="text-[11px] font-semibold text-slate-700 whitespace-nowrap">SDT người nhận quà</span>
                  <label
                    className={`flex items-center gap-1.5 ${
                      profile?.phone ? "cursor-pointer" : "cursor-not-allowed opacity-50"
                    }`}
                  >
                    <input
                      type="radio"
                      name="claimReceiver"
                      disabled={isClaimUpdating || !profile?.phone}
                      checked={isSelfClaimedLocal}
                      onChange={() => handleClaimChange(true)}
                      className="w-4 h-4 text-primary border-slate-300 focus:ring-primary"
                    />
                    <span className="flex flex-col leading-tight">
                      <span className="text-[11px] font-semibold text-slate-700 whitespace-nowrap">Học sinh</span>
                      <span className="text-[10px] text-slate-400 whitespace-nowrap">{profile?.phone || "Chưa có"}</span>
                    </span>
                  </label>
                  <label
                    className={`flex items-center gap-1.5 ${
                      (profile as { parentPhone?: string } | null)?.parentPhone
                        ? "cursor-pointer"
                        : "cursor-not-allowed opacity-50"
                    }`}
                  >
                    <input
                      type="radio"
                      name="claimReceiver"
                      disabled={isClaimUpdating || !(profile as { parentPhone?: string } | null)?.parentPhone}
                      checked={!isSelfClaimedLocal}
                      onChange={() => handleClaimChange(false)}
                      className="w-4 h-4 text-primary border-slate-300 focus:ring-primary"
                    />
                    <span className="flex flex-col leading-tight">
                      <span className="text-[11px] font-semibold text-slate-700 whitespace-nowrap">Phụ huynh</span>
                      <span className="text-[10px] text-slate-400 whitespace-nowrap">{(profile as { parentPhone?: string } | null)?.parentPhone || "Chưa có"}</span>
                    </span>
                  </label>
                </div>
              )}
              <UserAvatar
                displayName={currentProfile?.displayName}
                avatarUrl={currentProfile?.avatarUrl}
                size={100}
                className="w-24 h-24"
              />
              {!readOnly && (
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="absolute -bottom-1 -right-1 px-1.5 h-5 rounded-full bg-white border flex items-center justify-center text-slate-500"
                >
                  <span className="text-[10px] font-medium leading-none text-blue-400">Đổi</span>
                </button>
              )}
            </div>
            <h2 className="text-base font-bold text-slate-800 text-center line-clamp-2">
              {currentProfile?.displayName ?? "Người dùng"}
            </h2>
            <p className="text-xs text-slate-500 text-center line-clamp-2">
              {readAchievementsFromUser(profileWithExtras as Record<string, unknown>) ||
                "Chưa có thành tích"}
            </p>
          </div>

          <div className="mt-2 grid grid-cols-3 gap-1.5 sm:gap-2.5">
            <div className={`rounded-lg p-2 sm:p-3 text-center ${vocabTone.cardClass}`}>
              <HalfCircleGauge value={vocabRate} displayValue={vocabScoreDisplay} tone={vocabTone} />
              <p className="mt-1 text-[11px] sm:text-xs font-semibold leading-tight text-slate-700">
                Xuất sắc: <span className={vocabTone.numberClass}>{timesVocabXS}</span>
              </p>
            </div>
            <div className="rounded-lg bg-rose-50 ring-1 ring-rose-100 p-3 sm:p-3.5 text-center">
              <p className="text-xl font-black tracking-tight text-rose-700">{countHeart} ❤️</p>
              <p className="text-xl text-slate-700 leading-tight font-semibold"> {streakCount} 🔥</p>
            </div>
            <div className={`rounded-lg p-2 sm:p-3 text-center ${speakingTone.cardClass}`}>
              <HalfCircleGauge value={speakingRate} displayValue={speakingScoreDisplay} tone={speakingTone} />
              <p className="mt-1 text-[11px] sm:text-xs font-semibold leading-tight text-slate-700">
                Speaking
              </p>
            </div>
          </div>

          <input
            type="file"
            accept="image/*"
            className="sr-only"
            ref={fileInputRef}
            onChange={(e) => {
              handleFileSelect(e.target.files?.[0] ?? null);
              if (e.target) e.target.value = "";
            }}
          />
        </CardContent>
      </Card>
      {/* Image Crop Modal */}
      <ImageCropModal
        open={cropModalOpen}
        onClose={() => {
          setCropModalOpen(false);
          setSelectedFile(null);
        }}
        imageFile={selectedFile}
        onCrop={handleAvatarChange}
        aspectRatio={1}
        outputSize={400}
      />
    </>
  );
}

// Change Password Button and Modal - Only for phone-based accounts
export function ChangePasswordButton() {
  const { session, profile, loading } = useAuth();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [isChanging, setIsChanging] = useState(false);
  const [error, setError] = useState("");

  // Wait for profile to load
  if (loading || !profile) {
    return null;
  }

  // Check if user is phone-based account
  // Phone-based accounts have phone in profile
  // (Only phone-based accounts have phone field, Gmail accounts don't)
  const hasPhone = profile?.phone && profile.phone.trim() !== "";

  // Don't render if not a phone-based account
  if (!hasPhone) {
    return null;
  }

  async function handleChangePassword() {
    if (!session?.user || !newPassword.trim()) {
      setError("Vui lòng nhập mật khẩu mới.");
      return;
    }

    // Validate password: 6-8 characters
    if (!/^.{6,8}$/.test(newPassword)) {
      setError("Mật khẩu phải có từ 6-8 ký tự.");
      return;
    }

    setIsChanging(true);
    setError("");
    const toastId = toast.loading("Đang đổi mật khẩu...");

    try {
      const response = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ newPassword }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || "Đổi mật khẩu thất bại.");
      }

      toast.success("Đã đổi mật khẩu thành công!", { id: toastId });
      setNewPassword("");
      setError("");
      setIsModalOpen(false);
    } catch (error) {
      console.error("Error changing password:", error);
      const errorMessage = error instanceof Error ? error.message : "Đổi mật khẩu thất bại. Vui lòng thử lại.";
      setError(errorMessage);
      toast.error(errorMessage, { id: toastId });
    } finally {
      setIsChanging(false);
    }
  }

  const handleOpenModal = () => {
    setNewPassword("");
    setError("");
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    if (!isChanging) {
      setNewPassword("");
      setError("");
      setIsModalOpen(false);
    }
  };

  return (
    <>
      <div className="w-full sm:flex-1 min-w-0 flex">
        <Button
          variant="secondary"
          onClick={handleOpenModal}
          className="w-full flex items-center justify-center gap-2 min-h-[48px] sm:min-h-[44px] px-4 py-3 sm:py-2.5 text-base sm:text-sm font-medium touch-manipulation active:scale-95 transition-transform select-none"
        >
          <FiLock className="w-5 h-5 sm:w-4 sm:h-4 shrink-0" />
          Đổi mật khẩu
        </Button>
      </div>

      <Modal
        open={isModalOpen}
        onClose={handleCloseModal}
        title="Đổi mật khẩu"
        maxWidth="sm"
      >
        <div className="space-y-4 p-6">
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

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Mật khẩu mới <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <FiLock className="h-5 w-5 text-gray-400" />
              </div>
              <input
                type="text"
                value={newPassword}
                onChange={(e) => {
                  setNewPassword(e.target.value);
                  setError("");
                }}
                placeholder="Nhập mật khẩu mới..."
                className="w-full pl-10 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary"
                disabled={isChanging}
                minLength={6}
                maxLength={8}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !isChanging && newPassword.trim()) {
                    handleChangePassword();
                  }
                }}
              />
            </div>
            <p className="mt-1 text-xs text-gray-500">
              Phải có từ 6-8 ký tự.
            </p>
          </div>

          <div className="flex justify-end gap-2 pt-4 border-t border-gray-200">
            <Button
              variant="outline"
              onClick={handleCloseModal}
              disabled={isChanging}
            >
              Hủy
            </Button>
            <Button
              onClick={handleChangePassword}
              disabled={isChanging || !newPassword.trim()}
            >
              {isChanging ? "Đang đổi..." : "Đổi mật khẩu"}
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
