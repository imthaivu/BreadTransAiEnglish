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
import { getClassMembers } from "@/modules/classes/services";
import { buildRosterDisplayMapFromClasses } from "@/modules/classes/rosterFromClasses";
import type { IQuizStory } from "@/modules/classes/types";
import { AppUserProfile, UserRole } from "@/lib/auth/types";
import { readAchievementsFromUser } from "@/modules/user/services";
import { IClassMember } from "@/types";
import { useQueries } from "@tanstack/react-query";
import {
  useAddQuizStoryReaction,
  useAllClassesForInbox,
  useClassQuizStoriesMany,
  useRemoveQuizStoryReaction,
  useStudentClasses,
  useTeacherClasses,
  teacherClassKeys,
  QUIZ_STORY_WINDOW_HOURS,
} from "@/modules/classes/hooks";

function getSurnameInitial(fullName?: string | null): string {
  const normalized = (fullName || "").trim();
  if (!normalized) return "?";
  const firstPart = normalized.split(/\s+/)[0] || normalized;
  return firstPart.charAt(0).toUpperCase();
}

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

function getAccuracyBadgeClass(accuracy: number): string {
  if (accuracy >= 95) return "bg-emerald-500/90";
  if (accuracy >= 90) return "bg-blue-500/90";
  if (accuracy >= 80) return "bg-cyan-500/90";
  return "bg-amber-500/90";
}

type MyQuizStoriesCardProps = {
  targetUserId?: string;
  targetAvatarUrl?: string;
  targetClassIds?: string[];
};

// Story của tôi - dùng cùng nguồn class stories và lọc theo user hiện tại
export function MyQuizStoriesCard({ targetUserId, targetAvatarUrl, targetClassIds }: MyQuizStoriesCardProps) {
  const { session, profile } = useAuth();
  const currentUserId = session?.user?.id || "";
  const currentUserName = session?.user?.name || "Học sinh";
  const isViewingOtherProfile = !!targetUserId && targetUserId !== session?.user?.id;
  const isTeacher = session?.user?.role === UserRole.TEACHER;
  const { data: myTeacherClasses = [] } = useTeacherClasses(
    !isViewingOtherProfile && isTeacher ? currentUserId : undefined
  );
  const { data: myStudentClasses = [] } = useStudentClasses(
    !isViewingOtherProfile && !isTeacher ? currentUserId : undefined
  );
  const ownClassIdsFromQuery = useMemo(() => {
    const list = isTeacher ? myTeacherClasses : myStudentClasses;
    return list.map((c) => c.id).filter(Boolean);
  }, [isTeacher, myTeacherClasses, myStudentClasses]);
  const { mutate: addReaction } = useAddQuizStoryReaction();
  const { mutate: removeReaction } = useRemoveQuizStoryReaction();
  const userId = targetUserId ?? session?.user?.id;
  const classIds = useMemo(() => {
    if (isViewingOtherProfile) {
      return Array.from(new Set((targetClassIds ?? []).filter(Boolean)));
    }
    if (ownClassIdsFromQuery.length > 0) {
      return Array.from(new Set(ownClassIdsFromQuery));
    }
    return Array.from(new Set((profile?.classIds ?? []).filter(Boolean)));
  }, [isViewingOtherProfile, targetClassIds, ownClassIdsFromQuery, profile?.classIds]);
  const primaryClassId = classIds[0];
  const storiesQueries = useClassQuizStoriesMany(
    classIds,
    QUIZ_STORY_WINDOW_HOURS,
    classIds.length > 0
  );
  const classIdsFromStories = useMemo(() => {
    const mergedIds = new Set(classIds);
    for (const queryResult of storiesQueries) {
      for (const story of queryResult.data ?? []) {
        if (story.classId) mergedIds.add(story.classId);
      }
    }
    return Array.from(mergedIds);
  }, [classIds, storiesQueries]);
  /** Chỉ khi xem hồ sơ người khác: không tải full roster hệ thống, cần members theo lớp của story. */
  const membersQueries = useQueries({
    queries: classIdsFromStories.map((classId) => ({
      queryKey: teacherClassKeys.members(classId),
      queryFn: () => getClassMembers(classId),
      enabled: isViewingOtherProfile && !!classId,
    })),
  });
  const isLoading =
    storiesQueries.some((q) => q.isLoading) ||
    (isViewingOtherProfile && membersQueries.some((q) => q.isLoading));
  const [reactionModalStoryId, setReactionModalStoryId] = useState<string | null>(null);
  const [optimisticReactions, setOptimisticReactions] = useState<
    Record<
      string,
      {
        reactionCounts: Record<string, number>;
        userReactionsMap: Record<string, string>;
      }
    >
  >({});

  const classStories = useMemo(() => {
    const merged = storiesQueries.flatMap((q) => (q.data ?? []));
    const map = new Map<string, (typeof merged)[number]>();
    for (const story of merged) {
      if (!map.has(story.id)) map.set(story.id, story);
    }
    return Array.from(map.values());
  }, [storiesQueries]);

  /**
   * Toàn bộ lớp + `students[]` / `teachers[]` trên từng doc (cùng nguồn inbox / full lớp như QuizStoriesView dùng qua hệ thống lớp).
   * Dùng để hiện tên/avatar người react từ lớp khác, không chỉ roster các lớp đã fetch members theo story.
   */
  const { data: allClassesForRoster = [] } = useAllClassesForInbox(
    !isViewingOtherProfile && !!currentUserId
  );

  const fullClassesRosterByUserId = useMemo(
    () => buildRosterDisplayMapFromClasses(allClassesForRoster),
    [allClassesForRoster]
  );

  /** Fallback: tác giả story đã tải (cùng cửa sổ) nếu chưa có trong roster lớp. */
  const storyAuthorDisplayByUserId = useMemo(() => {
    const m = new Map<string, { name: string; avatarUrl?: string }>();
    const ingest = (story: IQuizStory) => {
      if (!story.userId) return;
      m.set(story.userId, {
        name: story.studentName?.trim() || "Học sinh",
        avatarUrl: story.avatarUrl,
      });
    };
    for (const s of classStories) ingest(s);
    return m;
  }, [classStories]);

  const classMembers = useMemo(() => {
    if (!isViewingOtherProfile) return [];
    const merged = membersQueries.flatMap((q) => (q.data ?? []));
    const map = new Map<string, (typeof merged)[number]>();
    for (const member of merged) {
      if (!map.has(member.id)) map.set(member.id, member);
    }
    return Array.from(map.values());
  }, [isViewingOtherProfile, membersQueries]);

  const myStories = useMemo(() => {
    const baseStories = classStories
      .filter((story) => story.userId === userId)
      .sort((a, b) => (b.lastSaveStory || b.createdAt).getTime() - (a.lastSaveStory || a.createdAt).getTime());
    return baseStories.map((story) => {
      const optimistic = optimisticReactions[story.id];
      if (!optimistic) return story;
      return {
        ...story,
        reactionCounts: optimistic.reactionCounts,
        userReactionsMap: optimistic.userReactionsMap as typeof story.userReactionsMap,
      };
    });
  }, [classStories, userId, optimisticReactions]);

  const handleHeartToggle = (story: (typeof myStories)[number]) => {
    if (!currentUserId) return;
    const targetClassId = story.classId || primaryClassId;
    if (!targetClassId) return;

    const existingReaction = story.userReactionsMap?.[currentUserId];

    if (existingReaction === "heart") {
      setOptimisticReactions((prev) => {
        const base = prev[story.id] || {
          reactionCounts: { ...(story.reactionCounts ?? {}) },
          userReactionsMap: { ...(story.userReactionsMap ?? {}) },
        };
        const nextCounts = {
          ...base.reactionCounts,
          heart: Math.max(0, (base.reactionCounts.heart ?? 0) - 1),
        };
        const nextMap = { ...base.userReactionsMap };
        delete nextMap[currentUserId];
        return { ...prev, [story.id]: { reactionCounts: nextCounts, userReactionsMap: nextMap } };
      });
      removeReaction({
        classId: targetClassId,
        ownerUserId: story.userId,
        storyId: story.id,
        reactingUserId: currentUserId,
      });
      return;
    }

    setOptimisticReactions((prev) => {
      const base = prev[story.id] || {
        reactionCounts: { ...(story.reactionCounts ?? {}) },
        userReactionsMap: { ...(story.userReactionsMap ?? {}) },
      };
      const nextCounts = { ...base.reactionCounts };
      if (existingReaction) {
        nextCounts[existingReaction] = Math.max(0, (nextCounts[existingReaction] ?? 0) - 1);
      }
      nextCounts.heart = (nextCounts.heart ?? 0) + 1;
      const nextMap = { ...base.userReactionsMap, [currentUserId]: "heart" };
      return { ...prev, [story.id]: { reactionCounts: nextCounts, userReactionsMap: nextMap } };
    });
    addReaction({
      classId: targetClassId,
      ownerUserId: story.userId,
      storyId: story.id,
      reaction: {
        userId: currentUserId,
        userName: currentUserName,
        reactionType: "heart",
      },
    });
  };

  const getReactionCount = (story: (typeof myStories)[number]) => {
    const counts = story.reactionCounts ?? {};
    return (counts.wow ?? 0) + (counts.heart ?? 0) + (counts.haha ?? 0) + (counts.like ?? 0);
  };
  const memberMap = useMemo(() => {
    return new Map(classMembers.map((m) => [m.id, m]));
  }, [classMembers]);
  const getReactionIcon = (reactionType?: string) => {
    if (reactionType === "wow") return "😱";
    if (reactionType === "heart") return "❤️";
    if (reactionType === "like") return "👍";
    return "😂";
  };
  const getStoryReactions = (story: (typeof myStories)[number]) => {
    const reactions = story.userReactionsMap ?? {};
    return Object.entries(reactions).map(([reactUserId, reactionType]) => {
      const member = memberMap.get(reactUserId);
      const fromFullClasses = fullClassesRosterByUserId.get(reactUserId);
      const fromStories = storyAuthorDisplayByUserId.get(reactUserId);
      if (isViewingOtherProfile) {
        return {
          userId: reactUserId,
          name: member?.name || fromStories?.name || "Người lạ",
          avatarUrl: member?.avatarUrl || fromStories?.avatarUrl || "",
          reactionType,
        };
      }
      return {
        userId: reactUserId,
        name: fromFullClasses?.name || fromStories?.name || "Người lạ",
        avatarUrl: fromFullClasses?.avatarUrl || fromStories?.avatarUrl || "",
        reactionType,
      };
    });
  };
  const titleTiltMap = useMemo(() => {
    const map: Record<string, number> = {};
    for (const story of myStories) {
      map[story.id] = (Math.random() * 3) - 1.5; // -1.5deg -> 1.5deg
    }
    return map;
  }, [myStories]);
  const reactionModalStory = myStories.find((s) => s.id === reactionModalStoryId) ?? null;
  const reactionModalItems = reactionModalStory ? getStoryReactions(reactionModalStory) : [];

  return (
    <Card className="border-0 shadow-none">
      <CardHeader className="p-0">
        <CardTitle className="text-base sm:text-lg">Gần đây</CardTitle>
      </CardHeader>
      <CardContent className="p-0 pt-0">
        {!primaryClassId ? (
          <p className="text-sm text-slate-500">Bạn chưa tham gia lớp nên chưa có story.</p>
        ) : isLoading ? (
          <p className="text-sm text-slate-500">Đang tải story...</p>
        ) : myStories.length === 0 ? (
          <p className="text-sm text-slate-500">Bạn chưa có story nào trong 7 ngày gần nhất.</p>
        ) : (
          <div className="grid grid-cols-3 gap-0">
            {myStories.map((story) => (
              <div key={story.id} className="relative aspect-[3/4] overflow-hidden border border-slate-200">
                {(targetAvatarUrl || profile?.avatarUrl) ? (
                  <Image
                    src={targetAvatarUrl || profile?.avatarUrl || ""}
                    alt={profile?.displayName || "avatar"}
                    fill
                    sizes="(max-width: 768px) 33vw, 280px"
                    className="object-cover opacity-20"
                  />
                ) : (
                  <div className="absolute inset-0 bg-slate-100 flex items-center justify-center">
                    <span className="text-4xl sm:text-5xl font-black text-slate-500/70">
                      {getSurnameInitial(story.studentName || profile?.displayName)}
                    </span>
                  </div>
                )}
                <div className="absolute inset-0 bg-black/10" />

                <div className="absolute top-2 left-2 right-2 z-10">
                  <p
                    className="rounded-md bg-white text-black text-[10px] sm:text-xs font-semibold px-1.5 py-1 text-center border-2 border-black whitespace-nowrap overflow-hidden text-ellipsis"
                    style={{
                      boxShadow: "-2px -2px 0 #31d2dd, 2px 2px 0 #df2d51",
                      transform: `rotate(${titleTiltMap[story.id] ?? 0}deg)`,
                    }}
                  >
                    {story.bookName || `Sách ${story.bookId}`}
                    {story.lessonIds?.length
                      ? ` (${story.lessonNames?.length ? story.lessonNames.join(", ") : story.lessonIds.join(", ")})`
                      : ""}
                  </p>
                </div>

                <div className="absolute right-2 bottom-2 z-10 flex items-center gap-1">
                  {(() => {
                    const reactions = getStoryReactions(story);
                    const preview = reactions.slice(0, 3);
                    const remaining = Math.max(0, reactions.length - preview.length);
                    const isHearted = story.userReactionsMap?.[currentUserId] === "heart";
                    return (
                      <>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setReactionModalStoryId(story.id);
                          }}
                          className="flex items-center"
                          aria-label="Xem người đã tương tác"
                          title="Xem người đã tương tác"
                        >
                          <div className="flex items-center">
                            {preview.map((reaction, idx) => (
                              <div
                                key={`${story.id}_${reaction.userId}_${idx}`}
                                className={`${idx > 0 ? "-ml-3.5" : ""} rounded-full border-2 border-white bg-white`}
                              >
                                <UserAvatar
                                  displayName={reaction.name}
                                  avatarUrl={reaction.avatarUrl}
                                  size={18}
                                  className="w-[18px] h-[18px]"
                                  userId={reaction.userId}
                                  linkToProfile={false}
                                />
                              </div>
                            ))}
                            {remaining > 0 && (
                              <div className="-ml-3.5 h-[18px] min-w-[18px] px-1 rounded-full border-2 border-white bg-slate-700 text-white text-[9px] font-bold flex items-center justify-center">
                                +{remaining}
                              </div>
                            )}
                          </div>
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleHeartToggle(story);
                          }}
                          className={`text-3xl leading-none ${
                            isHearted ? "text-red-500" : "text-white [text-shadow:0_0_0_#ef4444]"
                          }`}
                          aria-label={isHearted ? "Bỏ tim story" : "Tim story"}
                          title={isHearted ? "Bỏ tim" : "Tim"}
                        >
                          {isHearted ? "♥" : "♡"}
                        </button>
                      </>
                    );
                  })()}
                </div>

                <div
                  className={`absolute left-2 bottom-2 z-10 rounded-md px-1.5 py-0.5 text-[10px] sm:text-xs font-bold text-white ${getAccuracyBadgeClass(story.accuracy)}`}
                >
                  {story.accuracy}%
                </div>

              </div>

            ))}
          </div>
        )}
      </CardContent>
      <Modal
        open={!!reactionModalStory}
        onClose={() => setReactionModalStoryId(null)}
        title="'Đồng bọn' luôn ở bên cậu"
        maxWidth="md"
      >
        {reactionModalItems.length === 0 ? (
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-6 text-center">
            <p className="text-sm font-medium text-slate-500">Chưa có tương tác.</p>
          </div>
        ) : (
          <div className="space-y-2.5">
            {reactionModalItems.map((item) => (
              <div
                key={`${item.userId}_${item.reactionType}`}
                className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white/90 px-3 py-2.5 shadow-sm"
              >
                <UserAvatar
                  displayName={item.name}
                  avatarUrl={item.avatarUrl}
                  size={36}
                  className="w-9 h-9 ring-1 ring-slate-200"
                  userId={item.userId}
                />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-slate-800 truncate">{item.name}</p>
                </div>
                <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-lg">
                  {getReactionIcon(item.reactionType)}
                </span>
              </div>
            ))}
          </div>
        )}
      </Modal>
    </Card>
  );
}
