"use client";

import {
  AvatarCard,
  ChangePasswordButton,
} from "@/components/profile/ProfileSections";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import {
  AboutStory,
  RulesAndBenefits,
  Timeline,
} from "@/modules/home/components";
import PageMotion, {
  StaggerContainer,
  StaggerItem,
} from "@/components/ui/PageMotion";
import { useAuth } from "@/lib/auth/context";
import { RequireAuth } from "@/lib/auth/guard";
import { AppUserProfile, UserRole } from "@/lib/auth/types";
import { readAchievementsFromUser } from "@/modules/user/services";
import { usePublicUserProfile } from "@/modules/user/hooks";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { FiArrowLeft, FiLogOut, FiMoreVertical } from "react-icons/fi";

const MENU_SECTIONS = [
  { id: "about", label: "Tìm hiểu về BreadTrans", Component: AboutStory },
  { id: "timeline", label: "Lộ trình học", Component: Timeline },
  { id: "rules", label: "Quy tắc & Quyền lợi", Component: RulesAndBenefits },
] as const;
type MenuSectionId = (typeof MENU_SECTIONS)[number]["id"];

export default function ProfilePage() {
  const searchParams = useSearchParams();
  const viewUserId = searchParams.get("viewUserId");
  return <ProfilePageContent viewUserId={viewUserId} />;
}

function ProfilePageContent({ viewUserId }: { viewUserId: string | null }) {
  const { session, signOutApp } = useAuth();
  const router = useRouter();
  const isViewingAnotherUser = !!viewUserId && viewUserId !== session?.user?.id;
  const { data: viewedProfile } = usePublicUserProfile(isViewingAnotherUser ? viewUserId : null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [activeModalId, setActiveModalId] = useState<MenuSectionId | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const activeModalSection = useMemo(
    () => MENU_SECTIONS.find((section) => section.id === activeModalId) ?? null,
    [activeModalId]
  );

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    };
    if (menuOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [menuOpen]);

  useEffect(() => {
    if (!session?.user?.id || !viewUserId) return;
    if (viewUserId === session.user.id) {
      router.replace("/profile");
    }
  }, [viewUserId, session?.user?.id, router]);

  useEffect(() => {
    if (!session?.user?.id || isViewingAnotherUser) return;
    if (session.user.role === UserRole.ADMIN) {
      router.replace("/admin");
    }
  }, [session?.user?.id, session?.user?.role, isViewingAnotherUser, router]);

  return (
    <RequireAuth>
      <PageMotion showLoading={false}>
        <div className="bg-white">
          <StaggerContainer>


            <StaggerItem>
              <div className="max-w-4xl mx-auto space-y-2 relative pt-4">
                {isViewingAnotherUser ? (
                  <div className="absolute top-0 left-0 z-30">
                    <Button
                      type="button"
                      variant="outline"
                      className="h-10 w-10 p-0 rounded-full border-0 shadow-none"
                      onClick={() => router.replace("/")}
                      aria-label="Quay về"
                    >
                      <FiArrowLeft className="w-5 h-5" />
                    </Button>
                  </div>
                ) : (
                  <div className="absolute top-0 right-0 z-30" ref={menuRef}>
                    <Button
                      type="button"
                      variant="outline"
                      className="h-10 w-10 p-0 rounded-full border-0 shadow-none"
                      onClick={() => setMenuOpen((prev) => !prev)}
                      aria-label="Mở menu profile"
                    >
                      <FiMoreVertical className="w-5 h-5" />
                    </Button>

                    {menuOpen && (
                      <div className="absolute top-12 right-0 w-72 rounded-xl border border-slate-200 bg-white z-20 p-2">
                        <div className="space-y-1">
                          {MENU_SECTIONS.map(({ id, label }) => (
                            <button
                              key={id}
                              type="button"
                              onClick={() => {
                                setActiveModalId(id);
                                setMenuOpen(false);
                              }}
                              className="w-full text-left px-3 py-2 rounded-lg hover:bg-slate-100 text-sm font-medium text-slate-700"
                            >
                              {label}
                            </button>
                          ))}
                        </div>

                        <div className="my-2 h-px bg-slate-200" />

                        <div className="space-y-2">
                          <ChangePasswordButton />
                          <Button
                            variant="destructive"
                            onClick={() => {
                              setMenuOpen(false);
                              signOutApp();
                            }}
                            className="w-full flex items-center justify-center gap-2 min-h-[44px] text-sm font-medium"
                          >
                            <FiLogOut className="w-4 h-4 shrink-0" />
                            Thoát
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
                <AvatarCard
                  profileOverride={
                    isViewingAnotherUser
                      ? {
                          uid: viewedProfile?.id || "",
                          displayName: viewedProfile?.displayName || "Người dùng",
                          avatarUrl: viewedProfile?.avatarUrl,
                          streakCount: viewedProfile?.streakCount ?? 0,
                          achievements: readAchievementsFromUser(
                            viewedProfile as Record<string, unknown> | null | undefined
                          ),
                          timesVocabXS: viewedProfile?.timesVocabXS ?? 0,
                          timesVocab: viewedProfile?.timesVocab ?? 0,
                          quizAccuracy: (viewedProfile as { quizAccuracy?: number } | null)?.quizAccuracy ?? 50,
                          speakingAccuracy: viewedProfile?.speakingAccuracy ?? 50,
                          countHeart: viewedProfile?.countHeart ?? 0,
                          role: UserRole.STUDENT,
                        } as Partial<AppUserProfile>
                      : null
                  }
                  readOnly={isViewingAnotherUser}
                />

                <Modal
                  open={!!activeModalSection}
                  onClose={() => setActiveModalId(null)}
                  title={activeModalSection?.label || ""}
                  maxWidth="xl"
                >
                  {activeModalSection && <activeModalSection.Component />}
                </Modal>
              </div>
            </StaggerItem>
          </StaggerContainer>
        </div>
      </PageMotion>
    </RequireAuth>
  );
}
