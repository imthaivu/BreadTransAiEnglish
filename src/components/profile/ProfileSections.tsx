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

/** Äiá»ƒm 0â€“100 â†’ hiá»ƒn thá»‹ thang 10 (vd. 50 â†’ "5.0"). */
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
  /** GiÃ¡ trá»‹ 0â€“100 */
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

  // NgÆ°á»i nháº­n quÃ : true = há»c sinh (HS), false = phá»¥ huynh (PH)
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
      toast.success("ÄÃ£ cáº­p nháº­t ngÆ°á»i nháº­n quÃ ");
    } catch {
      setIsSelfClaimedLocal(previous);
      toast.error("Cáº­p nháº­t tháº¥t báº¡i");
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

    const toastId = toast.loading("Äang xá»­ lÃ½ vÃ  táº£i áº£nh lÃªn...");
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

      toast.success("Cáº­p nháº­t áº£nh Ä‘áº¡i diá»‡n thÃ nh cÃ´ng!", { id: toastId });
    } catch (error) {
      console.error(error);
      toast.error("ÄÃ£ cÃ³ lá»—i xáº£y ra.", { id: toastId });
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
                  <span className="text-[11px] font-semibold text-slate-700 whitespace-nowrap">SDT ngÆ°á»i nháº­n quÃ </span>
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
                      <span className="text-[11px] font-semibold text-slate-700 whitespace-nowrap">Há»c sinh</span>
                      <span className="text-[10px] text-slate-400 whitespace-nowrap">{profile?.phone || "ChÆ°a cÃ³"}</span>
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
                      <span className="text-[11px] font-semibold text-slate-700 whitespace-nowrap">Phá»¥ huynh</span>
                      <span className="text-[10px] text-slate-400 whitespace-nowrap">{(profile as { parentPhone?: string } | null)?.parentPhone || "ChÆ°a cÃ³"}</span>
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
                  <span className="text-[10px] font-medium leading-none text-blue-400">Äá»•i</span>
                </button>
              )}
            </div>
            <h2 className="text-base font-bold text-slate-800 text-center line-clamp-2">
              {currentProfile?.displayName ?? "NgÆ°á»i dÃ¹ng"}
            </h2>
            <p className="text-xs text-slate-500 text-center line-clamp-2">
              {readAchievementsFromUser(profileWithExtras as Record<string, unknown>) ||
                "ChÆ°a cÃ³ thÃ nh tÃ­ch"}
            </p>
          </div>

          <div className="mt-2 grid grid-cols-3 gap-1.5 sm:gap-2.5">
            <div className={`rounded-lg p-2 sm:p-3 text-center ${vocabTone.cardClass}`}>
              <HalfCircleGauge value={vocabRate} displayValue={vocabScoreDisplay} tone={vocabTone} />
              <p className="mt-1 text-[11px] sm:text-xs font-semibold leading-tight text-slate-700">
                Xuáº¥t sáº¯c: <span className={vocabTone.numberClass}>{timesVocabXS}</span>
              </p>
            </div>
            <div className="rounded-lg bg-rose-50 ring-1 ring-rose-100 p-3 sm:p-3.5 text-center">
              <p className="text-xl font-black tracking-tight text-rose-700">{countHeart} â¤ï¸</p>
              <p className="text-xl text-slate-700 leading-tight font-semibold"> {streakCount} ðŸ”¥</p>
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
      setError("Vui lÃ²ng nháº­p máº­t kháº©u má»›i.");
      return;
    }

    // Validate password: 6-8 characters
    if (!/^.{6,8}$/.test(newPassword)) {
      setError("Máº­t kháº©u pháº£i cÃ³ tá»« 6-8 kÃ½ tá»±.");
      return;
    }

    setIsChanging(true);
    setError("");
    const toastId = toast.loading("Äang Ä‘á»•i máº­t kháº©u...");

    try {
      const response = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ newPassword }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || "Äá»•i máº­t kháº©u tháº¥t báº¡i.");
      }

      toast.success("ÄÃ£ Ä‘á»•i máº­t kháº©u thÃ nh cÃ´ng!", { id: toastId });
      setNewPassword("");
      setError("");
      setIsModalOpen(false);
    } catch (error) {
      console.error("Error changing password:", error);
      const errorMessage = error instanceof Error ? error.message : "Äá»•i máº­t kháº©u tháº¥t báº¡i. Vui lÃ²ng thá»­ láº¡i.";
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
          Äá»•i máº­t kháº©u
        </Button>
      </div>

      <Modal
        open={isModalOpen}
        onClose={handleCloseModal}
        title="Äá»•i máº­t kháº©u"
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
              Máº­t kháº©u má»›i <span className="text-red-500">*</span>
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
                placeholder="Nháº­p máº­t kháº©u má»›i..."
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
              Pháº£i cÃ³ tá»« 6-8 kÃ½ tá»±.
            </p>
          </div>

          <div className="flex justify-end gap-2 pt-4 border-t border-gray-200">
            <Button
              variant="outline"
              onClick={handleCloseModal}
              disabled={isChanging}
            >
              Há»§y
            </Button>
            <Button
              onClick={handleChangePassword}
              disabled={isChanging || !newPassword.trim()}
            >
              {isChanging ? "Äang Ä‘á»•i..." : "Äá»•i máº­t kháº©u"}
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
