"use client";

import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { getDb, getFirebaseAuth } from "@/lib/firebase/client";
import { useUpdateStudentStreak } from "@/modules/user/hooks";
import { signOut, User, signInWithEmailAndPassword, onAuthStateChanged } from "firebase/auth";
import { doc, getDoc, onSnapshot } from "firebase/firestore";
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { FaFire } from "react-icons/fa";
import { LuckyBreadParticleEffect } from "@/components/notifications/LuckyBreadParticleEffect";
import { AppUserProfile, UserRole } from "./types";
import { getAdmirationSummary } from "@/modules/classes/api/admiration";
import type { AdmirationReactionType } from "@/modules/classes/api/admiration";
import { SafeImage as Image } from "@/components/ui/SafeImage";

function playItXuSound() {
  try {
    const sound = new Audio("/sounds/it-xu.mp3");
    sound.volume = 0.6;
    sound.play().catch(() => { });
  } catch { }
}

const REACTION_ICONS: Record<AdmirationReactionType, string> = {
  heart: "❤️",
  wow: "😱",
  like: "👍",
  haha: "😂",
  dislike: "👎",
};

const REACTION_LABELS: Record<AdmirationReactionType, string> = {
  heart: "Tim",
  wow: "Wow",
  like: "Like",
  haha: "Haha",
  dislike: "Dislike",
};

// Hiển thị theo thứ tự ưu tiên này
const REACTION_DISPLAY_ORDER: AdmirationReactionType[] = ["wow", "heart", "like", "haha", "dislike"];

function ReactionSummaryModalContent({
  reactionCounts,
  totalReactions,
  senderAvatars,
  streakCount,
  onClose,
}: {
  reactionCounts: Record<AdmirationReactionType, number>;
  totalReactions: number;
  senderAvatars: string[];
  streakCount: number;
  onClose: () => void;
}) {
  const hasReactions = totalReactions > 0;
  const orderedReactions = REACTION_DISPLAY_ORDER
    .filter((type) => (reactionCounts[type] ?? 0) > 0)
    .map((type) => ({ type, count: reactionCounts[type] }));

  return (
    <Modal
      open={true}
      onClose={onClose}
      title={hasReactions ? "Reaction nhận được" : "Chào mừng quay lại!"}
      maxWidth="sm"
    >
      <div className="text-center p-4">
        {hasReactions ? (
          <>
            <p className="text-sm text-gray-600">
              Tổng kết reaction hôm qua &amp; nay
            </p>
            <p className="mt-1 text-3xl font-extrabold text-amber-600">
              {totalReactions} lượt
            </p>

            <div className="mt-5 flex flex-wrap justify-center gap-3">
              {orderedReactions.map(({ type, count }) => (
                <div
                  key={type}
                  className="flex flex-col items-center justify-center min-w-[64px] px-3 py-2 rounded-2xl bg-orange-50 border border-orange-100 shadow-sm"
                >
                  <span className="text-3xl leading-none">{REACTION_ICONS[type]}</span>
                  <span className="mt-1 text-xs font-medium text-gray-500">
                    {REACTION_LABELS[type]}
                  </span>
                  <span className="text-lg font-bold text-amber-700 leading-none mt-0.5">
                    ×{count}
                  </span>
                </div>
              ))}
            </div>

            {senderAvatars.length > 0 && (
              <div className="mt-5">
                <p className="text-xs text-gray-500 mb-2">Từ các bạn</p>
                <div className="flex justify-center -space-x-2 overflow-hidden">
                  {senderAvatars.slice(0, 8).map((url, i) => (
                    <div
                      key={i}
                      className="relative h-10 w-10 rounded-full border-2 border-white overflow-hidden shadow-sm ring-1 ring-orange-200"
                    >
                      <Image src={url} alt="avatar" fill sizes="40px" className="object-cover" />
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        ) : (
          <>
            <div className="text-5xl">🍞</div>
            <p className="mt-3 text-md leading-relaxed text-gray-700">
              Hôm qua &amp; nay chưa có reaction nào. Đăng story và chăm tương tác để
              bạn bè thả icon cho mình nhé!
            </p>
          </>
        )}

        {streakCount > 0 && (
          <p className="mt-5 text-sm text-gray-600 flex items-center justify-center gap-1">
            <FaFire className="text-orange-500" />
            Chuỗi học hiện tại:{" "}
            <span className="font-bold text-orange-600">{streakCount} ngày</span>
          </p>
        )}

        <Button
          onClick={onClose}
          className="mt-6 w-full py-6 text-lg rounded-xl shadow-lg shadow-primary/20"
        >
          Tiếp tục học
        </Button>
      </div>
    </Modal>
  );
}

interface AuthContextValue {
  profile: AppUserProfile | null;
  loading: boolean;
  role: UserRole | undefined;
  session: { user: { id: string; phone?: string | null; role: UserRole; name?: string | null; image?: string | null } } | null;

  refetchProfile: () => void;
  signInWithPhone: (phone: string, password: string) => Promise<void>;
  signOutApp: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

const EMPTY_REACTION_COUNTS: Record<AdmirationReactionType, number> = {
  heart: 0,
  wow: 0,
  like: 0,
  haha: 0,
  dislike: 0,
};

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<AppUserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [dailySummary, setDailySummary] = useState<{
    showModal: boolean;
    streakCount: number;
    luckyBreads: number;
    senderAvatars: string[];
    reactionCounts: Record<AdmirationReactionType, number>;
    totalReactions: number;
  }>({
    showModal: false,
    streakCount: 0,
    luckyBreads: 0,
    senderAvatars: [],
    reactionCounts: { ...EMPTY_REACTION_COUNTS },
    totalReactions: 0,
  });
  const [closingAnimationCount, setClosingAnimationCount] = useState(0);

  const { mutate: updateStreak } = useUpdateStudentStreak();
  const previousRoleRef = useRef<string | null>(null);
  const lastSyncedClaimsUidRef = useRef<string | null>(null);
  const streakUpdateInProgressRef = useRef<string | null>(null);
  const isMountedRef = useRef(false);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const fetchProfile = useCallback(
    async (uid: string, options?: { silent?: boolean }) => {
      const shouldSetLoading = !options?.silent;
      if (shouldSetLoading) {
        setLoading(true);
      }
      try {
        const ref = doc(getDb(), "users", uid);
        const snap = await getDoc(ref);
        if (snap.exists()) {
          const current = (snap.data() as AppUserProfile) ?? null;
          setProfile(current);
          if (shouldSetLoading) {
            setLoading(false);
          }

          // --- Streak Logic --- Chỉ gọi updateStreak 1 lần/ngày, chỉ hiện modal 1 lần/ngày.
          // Dựa vào lastStreakUpdate trong users: nếu đã update hôm nay thì không gọi API, không hiện modal.
          if (current?.role === "student") {
            const todayKey = typeof window !== "undefined"
              ? new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Ho_Chi_Minh" })
              : "";
            const rawLast = (current as { lastStreakUpdate?: { toDate?: () => Date } | Date })?.lastStreakUpdate;
            const lastUpdateDate = rawLast
              ? ("toDate" in rawLast && typeof (rawLast as { toDate: () => Date }).toDate === "function"
                ? (rawLast as { toDate: () => Date }).toDate()
                : rawLast instanceof Date ? rawLast : null)
              : null;
            const lastUpdateKey = lastUpdateDate
              ? lastUpdateDate.toLocaleDateString("en-CA", { timeZone: "Asia/Ho_Chi_Minh" })
              : "";
            if (lastUpdateKey === todayKey && todayKey) {
              return; // Đã update streak hôm nay → không gọi API, không hiện modal
            }
            if (streakUpdateInProgressRef.current === `${uid}_${todayKey}`) return;
            streakUpdateInProgressRef.current = `${uid}_${todayKey}`;
            updateStreak(uid, {
              onSuccess: (data) => {
                const runUpdate = () => {
                  if (!isMountedRef.current) return;
                  // Mỗi ngày vào: luôn show popup tổng kết reaction nhận được hôm qua & nay
                  if (data.updated) {
                    getAdmirationSummary(uid).then((summary) => {
                      if (!isMountedRef.current) return;
                      setDailySummary({
                        showModal: true,
                        streakCount: data.newStreakCount,
                        luckyBreads: summary.totalBreads,
                        senderAvatars: summary.senderAvatars,
                        reactionCounts: summary.reactionCounts,
                        totalReactions: summary.totalReactions,
                      });
                    });
                  }
                };
                setTimeout(runUpdate, 0);
              },
              onSettled: () => {
                streakUpdateInProgressRef.current = null;
              },
              onError: (err) => {
                console.error("[Streak] updateStudentStreak failed:", err);
              },
            });
          }
          // --- End of Streak Logic ---
        } else {
          // User phải được tạo bởi admin với role hợp lệ (student, teacher, admin)
          setProfile(null);
          if (shouldSetLoading) {
            setLoading(false);
          }
          // Sign out user since they don't have a valid profile
          await signOut(getFirebaseAuth());
        }
      } catch (error) {
        // Avoid getting stuck in loading state on flaky mobile/webview networks (iOS in-app browsers)
        console.error("[Auth] fetchProfile failed:", error);
        setProfile(null);
        if (shouldSetLoading) {
          setLoading(false);
        }
      }
    },
    [user, updateStreak]
  );

  const refetchProfile = useCallback(() => {
    if (user?.uid) {
      fetchProfile(user.uid, { silent: true });
    }
  }, [fetchProfile, user]);

  // Listen to Firebase Auth state changes
  useEffect(() => {
    const auth = getFirebaseAuth();
    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      setUser(firebaseUser);
      if (firebaseUser) {
        fetchProfile(firebaseUser.uid);
        if (lastSyncedClaimsUidRef.current !== firebaseUser.uid) {
          lastSyncedClaimsUidRef.current = firebaseUser.uid;
          void import("@/lib/auth/sync-custom-claims-client").then(
            ({ syncCustomClaimsAndRefreshIdToken }) =>
              syncCustomClaimsAndRefreshIdToken(firebaseUser).catch(() => {})
          );
        }
      } else {
        lastSyncedClaimsUidRef.current = null;
        setProfile(null);
        setLoading(false);
      }
    });

    return () => unsubscribe();
  }, [fetchProfile]);

  // Set up realtime listener for session invalidation and role changes
  useEffect(() => {
    if (!user?.uid) {
      setProfile(null);
      setLoading(false);
      previousRoleRef.current = null;
      return;
    }

    const db = getDb();
    const userRef = doc(db, "users", user.uid);

    // Initialize previous role ref if not set
    if (previousRoleRef.current === null && profile?.role) {
      previousRoleRef.current = profile.role;
    }

    const unsubscribe = onSnapshot(userRef, (snapshot) => {
      if (!snapshot.exists()) return;

      const userData = snapshot.data();
      const currentSessionToken = userData?.sessionToken;
      const currentRole = userData?.role;
      const previousRole = previousRoleRef.current;

      // Check if role has changed
      if (currentRole !== previousRole) {
        previousRoleRef.current = currentRole;
        fetchProfile(user.uid);
        void getFirebaseAuth().currentUser?.getIdToken(true);
        return;
      }

      // Get stored session token from sessionStorage
      const storedSessionToken = sessionStorage.getItem(`sessionToken_${user.uid}`);

      // If session token changed, invalidate current session (for students)
      // Check: if we have a stored token and it doesn't match the current one, OR
      // if we don't have a stored token but there's a current token (first time after login from another device)
      if (currentRole === "student" && currentSessionToken) {
        if (storedSessionToken && storedSessionToken !== currentSessionToken) {
          // Session was invalidated by another login - stored token doesn't match current
          signOut(getFirebaseAuth()).then(() => {
            sessionStorage.removeItem(`sessionToken_${user.uid}`);
            window.location.reload();
          });
          return; // Don't update sessionStorage, we're signing out
        } else if (!storedSessionToken) {
          // First time setting session token for this device - store it
          sessionStorage.setItem(`sessionToken_${user.uid}`, currentSessionToken);
        }
        // If storedSessionToken === currentSessionToken, do nothing (already in sync)
      } else if (currentSessionToken && currentRole !== "student") {
        // For non-students, just store the token (they can have multiple sessions)
        sessionStorage.setItem(`sessionToken_${user.uid}`, currentSessionToken);
      }
    });

    return () => {
      unsubscribe();
    };
  }, [user?.uid, profile, fetchProfile]);

  const signInWithPhone = useCallback(async (phone: string, password: string) => {
    // Normalize phone
    let cleaned = phone.replace(/\D/g, "");
    if (cleaned.startsWith("0")) {
      cleaned = "+84" + cleaned.substring(1);
    } else if (cleaned.startsWith("84")) {
      cleaned = "+" + cleaned;
    } else if (!cleaned.startsWith("+")) {
      cleaned = "+84" + cleaned;
    }

    const email = `${cleaned.replace(/\+/g, "")}@breadtrans.local`;

    // Sign in with Firebase Auth
    const auth = getFirebaseAuth();
    await signInWithEmailAndPassword(auth, email, password);
  }, []);

  const signOutApp = useCallback(async () => {
    try {
      await signOut(getFirebaseAuth());
      setProfile(null);
      setUser(null);
      setLoading(false);
      // Redirect to home after sign out
      if (typeof window !== "undefined") {
        window.location.href = "/";
      }
    } catch (error) {
      // Error signing out
    }
  }, []);

  const value = useMemo<AuthContextValue>(
    () => {
      const isValidSession = user && profile;

      return {
        session: isValidSession ? {
          user: {
            id: user.uid,
            phone: profile.phone || null,
            role: profile.role,
            name: profile.displayName || null,
            image: profile.avatarUrl || null,
          }
        } : null,
        profile: isValidSession ? profile : null,
        loading,
        role: isValidSession ? profile.role : undefined,

        refetchProfile,
        signInWithPhone,
        signOutApp,
      };
    },
    [user, profile, loading, refetchProfile, signInWithPhone, signOutApp]
  );

  return (
    <AuthContext.Provider value={value}>
      {children}
      {closingAnimationCount > 0 && <LuckyBreadParticleEffect count={closingAnimationCount} />}
      {dailySummary.showModal && (() => {
        const luckyBreads = dailySummary.luckyBreads ?? 0;
        const handleClose = () => {
          playItXuSound();
          if (luckyBreads > 0) {
            setClosingAnimationCount(luckyBreads);
            setTimeout(() => setClosingAnimationCount(0), 4000);
          }
          setDailySummary({ ...dailySummary, showModal: false });
          refetchProfile();
        };
        return (
          <ReactionSummaryModalContent
            reactionCounts={dailySummary.reactionCounts}
            totalReactions={dailySummary.totalReactions}
            senderAvatars={dailySummary.senderAvatars}
            streakCount={dailySummary.streakCount}
            onClose={handleClose}
          />
        );
      })()}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
