"use client";

import { useAuth } from "@/lib/auth/context";
import type { IClass } from "@/modules/admin";
import {
  IAdmiration,
  subscribeToAdmirations,
} from "@/modules/classes/api/admiration";
import { getClassStoryMeta } from "@/modules/classes/api/quiz-story";
import { getSpeakingBookLessonMeta } from "@/modules/speaking-upload/services";
import {
  getReactionIcon,
  useStudentClasses,
  useTeacherClasses,
} from "@/modules/classes/hooks";
import {
  usePeerPresence,
  type PeerRow,
  type PeerPanel,
} from "./usePeerPresence";
import {
  formatPresenceRelativeTime,
  formatPresenceShort,
} from "@/utils/presenceRelativeTime";
import { getLastSeenInboxMs, markInboxSeenNow } from "@/utils/lastSeenInboxs";
import { cn } from "@/utils";
import { useQuery } from "@tanstack/react-query";
import { SafeImage as Image } from "@/components/ui/SafeImage";
import { ProfileAvatarLink } from "@/components/ui/ProfileAvatarLink";
import { useEffect, useLayoutEffect, useMemo, useState } from "react";
import type { Timestamp } from "firebase/firestore";
import { FiCheck, FiX } from "react-icons/fi";
import { ClassRankBoard } from "@/modules/classes/components/ClassRankBoard";
import { useMultiplayer } from "../lobby/MultiplayerProvider";
import {
  useGameInvitationActions,
  usePendingInvites,
} from "../lobby/useGameInvitationActions";
import { GAME_TITLES, type MultiplayerGameId } from "../realtime/types";

/** Chỉ ngày + tháng (không giờ, không năm) */
function formatActivityDayMonth(d: Date) {
  return new Intl.DateTimeFormat("vi-VN", {
    day: "2-digit",
    month: "2-digit",
  }).format(d);
}

function StoryMetaLine({
  classId,
  storyOwnerId,
  storyId,
}: {
  classId: string;
  storyOwnerId: string;
  storyId: string;
}) {
  const { data, isLoading } = useQuery({
    queryKey: ["classStoryMeta", classId, storyOwnerId, storyId],
    queryFn: () => getClassStoryMeta(classId, storyOwnerId, storyId),
    enabled: !!classId && !!storyOwnerId && !!storyId,
    staleTime: 5 * 60 * 1000,
  });

  if (isLoading) {
    return <span className="text-gray-400">…</span>;
  }
  if (!data) {
    return <span className="text-gray-400">—</span>;
  }
  return (
    <span className="text-gray-600">
      <span className="font-normal">{data.bookName}</span>
      <span className="text-gray-400 mx-0.5">·</span>
      <span className="font-normal">Bài: {data.lessonLabel}</span>
    </span>
  );
}

function SpeakingMetaLine({ speakingId }: { speakingId: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ["speakingBookLessonMeta", speakingId],
    queryFn: () => getSpeakingBookLessonMeta(speakingId),
    enabled: !!speakingId,
    staleTime: 10 * 60 * 1000,
  });

  if (isLoading) {
    return <span className="text-gray-400">…</span>;
  }
  if (!data) {
    return <span className="text-gray-400">—</span>;
  }
  return (
    <span className="text-gray-600">
      <span className="font-normal">{data.bookName}</span>
      <span className="text-gray-400 mx-0.5">·</span>
      <span className="font-normal">Bài {data.lessonLabel}</span>
    </span>
  );
}

function GameInviteActivityCard({
  item,
  isNew,
  senderPeer,
}: {
  item: IAdmiration;
  isNew: boolean;
  senderPeer?: PeerRow | null;
}) {
  const invites = usePendingInvites();
  const invitation = invites.find((i) => i.roomId === item.roomId);
  const { enterRoom } = useMultiplayer();
  const { accept, decline, busyId } = useGameInvitationActions(enterRoom);
  const canRespond = !!invitation;
  const busy = !!invitation && busyId === invitation.id;

  const avatarUrl =
    senderPeer?.avatarUrl || item.fromStudentAvatarUrl || undefined;
  const displayName = senderPeer?.name || item.fromStudentName || "?";
  const gameTitle =
    item.gameId && item.gameId in GAME_TITLES
      ? GAME_TITLES[item.gameId as MultiplayerGameId]
      : item.gameId ?? "—";

  const presenceShort = senderPeer
    ? formatPresenceShort(senderPeer.lastSeen)
    : "";
  const showGreenDot = !!senderPeer?.online;
  const showTimeBadge = !showGreenDot && !!presenceShort;

  const handleAccept = () => {
    if (!invitation) return;
    void accept(invitation);
  };

  const handleDecline = () => {
    if (!invitation) return;
    void decline(invitation);
  };

  return (
    <article className="flex gap-3 py-3 sm:py-3.5 w-full">
      <div className="relative h-11 w-11 flex-shrink-0">
        <ProfileAvatarLink
          userId={item.fromStudentId}
          className="h-11 w-11 rounded-full overflow-hidden bg-gray-100 ring-1 ring-gray-200"
          ariaLabel={`Hồ sơ ${displayName}`}
        >
          {avatarUrl ? (
            <Image
              src={avatarUrl}
              alt=""
              width={44}
              height={44}
              sizes="44px"
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-gray-400 text-sm font-normal">
              {displayName.slice(0, 1).toUpperCase()}
            </div>
          )}
        </ProfileAvatarLink>
        <div className="absolute bottom-0 right-0 z-20 flex items-center justify-center min-w-[12px] min-h-[12px] translate-x-px translate-y-px">
          {showGreenDot ? (
            <span
              className="block w-2.5 h-2.5 rounded-full bg-green-500 border-2 border-white shadow-sm"
              aria-hidden
            />
          ) : showTimeBadge ? (
            <span
              className="text-[7px] font-bold tabular-nums leading-none px-0.5 py-0.5 rounded-md bg-white border border-gray-200 text-gray-800 shadow-sm max-w-[28px] truncate"
              aria-hidden
            >
              {presenceShort}
            </span>
          ) : (
            <span
              className="block w-1.5 h-1.5 rounded-full bg-gray-300 border border-white shadow-sm"
              aria-hidden
            />
          )}
        </div>
      </div>
      <div className="min-w-0 flex-1 flex flex-col gap-1.5">
        <div className="flex flex-col gap-0.5">
          <div className="flex flex-nowrap items-center gap-x-2 min-w-0">
            <span
              className={cn(
                "truncate min-w-0",
                isNew
                  ? "font-semibold text-green-700"
                  : "font-normal text-gray-800"
              )}
            >
              {displayName}
            </span>
          </div>
          <div className="flex flex-nowrap items-center gap-x-1 min-w-0 text-xs text-gray-500 font-normal">
            <span className="shrink-0">Lời mời đấu solo</span>
            <span className="text-gray-300 shrink-0" aria-hidden>
              ·
            </span>
            <span className="min-w-0 flex-1 truncate font-normal text-amber-700">
              {gameTitle}
            </span>
            <span className="text-gray-300 shrink-0" aria-hidden>
              ·
            </span>
            <span className="shrink-0 whitespace-nowrap">
              {formatActivityDayMonth(item.createdAt)}
            </span>
          </div>
        </div>
        {canRespond ? (
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleDecline}
              disabled={busy}
              className="inline-flex flex-1 items-center justify-center gap-1 rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-xs font-semibold text-gray-600 hover:bg-gray-50 disabled:opacity-50"
            >
              <FiX className="h-3.5 w-3.5" /> Từ chối
            </button>
            <button
              type="button"
              onClick={handleAccept}
              disabled={busy}
              className="inline-flex flex-1 items-center justify-center gap-1 rounded-lg bg-amber-500 px-2 py-1.5 text-xs font-semibold text-white hover:bg-amber-600 disabled:opacity-50"
            >
              <FiCheck className="h-3.5 w-3.5" /> Chấp nhận
            </button>
          </div>
        ) : null}
      </div>
    </article>
  );
}

function ActivityCard({
  item,
  isNew,
  senderPeer,
}: {
  item: IAdmiration;
  isNew: boolean;
  senderPeer?: PeerRow | null;
}) {
  if (item.type === "gameInvite") {
    return (
      <GameInviteActivityCard
        item={item}
        isNew={isNew}
        senderPeer={senderPeer}
      />
    );
  }

  const isStory = item.type === "reactStory";
  const isSpeakingGrade = item.type === "speakingGrade";
  const reaction = getReactionIcon(item.reactionType);

  const activitySubtitle = isStory
    ? "Story"
    : isSpeakingGrade
      ? "Bài nói"
      : "Ngưỡng mộ";

  const showStoryMeta =
    isStory && item.classId && item.storyOwnerId && item.storyId;
  const showSpeakingMeta = isSpeakingGrade && item.speakingId;

  const presenceShort = senderPeer
    ? formatPresenceShort(senderPeer.lastSeen)
    : "";
  const showGreenDot = !!senderPeer?.online;
  const showTimeBadge = !showGreenDot && !!presenceShort;

  const avatarUrl =
    senderPeer?.avatarUrl ||
    item.fromStudentAvatarUrl ||
    undefined;
  const displayName = senderPeer?.name || item.fromStudentName || "?";

  return (
    <article className="flex gap-3 py-3 sm:py-3.5 w-full">
      <div className="relative h-11 w-11 flex-shrink-0">
        <ProfileAvatarLink
          userId={item.fromStudentId}
          className="h-11 w-11 rounded-full overflow-hidden bg-gray-100 ring-1 ring-gray-200"
          ariaLabel={`Hồ sơ ${displayName}`}
        >
          {avatarUrl ? (
            <Image
              src={avatarUrl}
              alt=""
              width={44}
              height={44}
              sizes="44px"
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-gray-400 text-sm font-normal">
              {displayName.slice(0, 1).toUpperCase()}
            </div>
          )}
        </ProfileAvatarLink>
        <div className="absolute bottom-0 right-0 z-20 flex items-center justify-center min-w-[12px] min-h-[12px] translate-x-px translate-y-px">
          {showGreenDot ? (
            <span
              className="block w-2.5 h-2.5 rounded-full bg-green-500 border-2 border-white shadow-sm"
              aria-hidden
            />
          ) : showTimeBadge ? (
            <span
              className="text-[7px] font-bold tabular-nums leading-none px-0.5 py-0.5 rounded-md bg-white border border-gray-200 text-gray-800 shadow-sm max-w-[28px] truncate"
              aria-hidden
            >
              {presenceShort}
            </span>
          ) : (
            <span
              className="block w-1.5 h-1.5 rounded-full bg-gray-300 border border-white shadow-sm"
              aria-hidden
            />
          )}
        </div>
      </div>
      <div className="min-w-0 flex-1 flex flex-col gap-0.5">
        <div className="flex flex-nowrap items-center gap-x-2 min-w-0">
          <span
            className={cn(
              "truncate min-w-0",
              isNew
                ? "font-semibold text-green-700"
                : "font-normal text-gray-800"
            )}
          >
            {displayName}
          </span>
          <span className="text-lg shrink-0 leading-none" title={item.reactionType}>
            {reaction}
          </span>
          {item.reactionValue != null && item.reactionValue > 0 ? (
            <span className="text-sm shrink-0 whitespace-nowrap text-amber-700 font-normal">
              +{item.reactionValue} 🍞
            </span>
          ) : null}
        </div>
        <div className="flex flex-nowrap items-center gap-x-1 min-w-0 text-xs text-gray-500 font-normal">
          <span className="shrink-0">{activitySubtitle}</span>
          {showStoryMeta || showSpeakingMeta ? (
            <>
              <span className="text-gray-300 shrink-0" aria-hidden>
                ·
              </span>
              <span className="min-w-0 flex-1 truncate">
                {showStoryMeta ? (
                  <StoryMetaLine
                    classId={item.classId}
                    storyOwnerId={item.storyOwnerId!}
                    storyId={item.storyId!}
                  />
                ) : showSpeakingMeta ? (
                  <SpeakingMetaLine speakingId={item.speakingId!} />
                ) : null}
              </span>
            </>
          ) : null}
          <span className="text-gray-300 shrink-0" aria-hidden>
            ·
          </span>
          <span className="shrink-0 whitespace-nowrap">
            {formatActivityDayMonth(item.createdAt)}
          </span>
        </div>
      </div>
    </article>
  );
}

function tsMillis(ts: number | Timestamp | null | undefined): number {
  if (!ts) return 0;
  if (typeof ts === "number") return ts;
  if (typeof ts.toMillis === "function") return ts.toMillis();
  return 0;
}

/** Gộp GV + HS mọi lớp một hàng; trùng userId thì lấy online / lastSeen “tốt” nhất */
function mergeClassPanelsToRows(panels: PeerPanel[]): PeerRow[] {
  const map = new Map<string, PeerRow>();
  for (const p of panels) {
    for (const row of [...p.teachers, ...p.students]) {
      const prev = map.get(row.userId);
      if (!prev) {
        map.set(row.userId, { ...row });
        continue;
      }
      const online = prev.online || row.online;
      const t1 = tsMillis(prev.lastSeen);
      const t2 = tsMillis(row.lastSeen);
      const lastSeen = t2 > t1 ? row.lastSeen : prev.lastSeen;
      map.set(row.userId, {
        ...prev,
        name: prev.name || row.name,
        avatarUrl: prev.avatarUrl || row.avatarUrl,
        role:
          prev.role === "teacher" || row.role === "teacher"
            ? "teacher"
            : "student",
        online,
        lastSeen,
      });
    }
  }
  return Array.from(map.values()).sort((a, b) => {
    const ra = a.role === "teacher" ? 0 : 1;
    const rb = b.role === "teacher" ? 0 : 1;
    if (ra !== rb) return ra - rb;
    const o = (b.online ? 1 : 0) - (a.online ? 1 : 0);
    if (o !== 0) return o;
    return a.name.localeCompare(b.name, "vi");
  });
}

/** Avatar/presence cho Messages: map toàn cục + đúng lớp của tin (classId) vì merge có thể thiếu ảnh. */
function resolveSenderPeer(
  item: IAdmiration,
  peerByUserId: Map<string, PeerRow>,
  classPanels: PeerPanel[]
): PeerRow | null {
  const uid = (item.fromStudentId || "").trim();
  if (!uid) return null;

  const globalPeer = peerByUserId.get(uid) ?? null;

  let classPeer: PeerRow | null = null;
  if (item.classId) {
    const cid = String(item.classId).trim();
    const panel = classPanels.find((p) => p.classId === cid);
    if (panel) {
      classPeer =
        panel.teachers.find((t) => t.userId === uid) ??
        panel.students.find((s) => s.userId === uid) ??
        null;
    }
  }

  if (!globalPeer && !classPeer) return null;

  const presence = globalPeer ?? classPeer!;
  return {
    ...presence,
    name:
      (classPeer?.name || globalPeer?.name || item.fromStudentName || "?").trim() ||
      "?",
    avatarUrl:
      classPeer?.avatarUrl ||
      globalPeer?.avatarUrl ||
      item.fromStudentAvatarUrl,
    online: globalPeer?.online ?? classPeer?.online ?? false,
    lastSeen: globalPeer?.lastSeen ?? classPeer?.lastSeen ?? null,
  };
}

export default function MessagesFeed() {
  const { session } = useAuth();
  const userId = session?.user?.id;
  const isTeacher = session?.user?.role === "teacher";

  const { data: teacherClasses, isPending: isTeacherClassesPending } =
    useTeacherClasses(isTeacher ? userId : undefined);
  const { data: studentClasses, isPending: isStudentClassesPending } =
    useStudentClasses(!isTeacher ? userId : undefined);

  const enrolledClasses: IClass[] = isTeacher
    ? (teacherClasses ?? [])
    : (studentClasses ?? []);
  const classes = useMemo(() => {
    if (!userId) return [];
    return enrolledClasses;
  }, [userId, enrolledClasses]);

  const isClassesPending =
    !!userId &&
    classes.length === 0 &&
    (isTeacher ? isTeacherClassesPending : isStudentClassesPending);

  const { classPanels } = usePeerPresence(classes, userId);

  const [activities, setActivities] = useState<IAdmiration[]>([]);
  const [unreadCutoffMs, setUnreadCutoffMs] = useState(0);

  const mergedPeerRows = useMemo(
    () => mergeClassPanelsToRows(classPanels),
    [classPanels]
  );
  const peerByUserId = useMemo(() => {
    const m = new Map<string, PeerRow>();
    for (const r of mergedPeerRows) m.set(r.userId, r);
    return m;
  }, [mergedPeerRows]);

  useLayoutEffect(() => {
    if (!userId) {
      setUnreadCutoffMs(0);
      return;
    }
    setUnreadCutoffMs(getLastSeenInboxMs(userId));
  }, [userId]);

  useEffect(() => {
    if (!userId) {
      setActivities([]);
      return;
    }
    const unsub = subscribeToAdmirations(userId, setActivities);
    const raf = requestAnimationFrame(() => {
      markInboxSeenNow(userId);
    });
    return () => {
      cancelAnimationFrame(raf);
      unsub();
    };
  }, [userId]);

  const sortedActivities = useMemo(
    () =>
      [...activities].sort(
        (a, b) => b.createdAt.getTime() - a.createdAt.getTime()
      ),
    [activities]
  );

  if (isClassesPending) {
    return (
      <section className="mt-6" aria-busy="true">
        <h2 className="text-lg font-semibold text-gray-900 mb-3">Messages</h2>
        <div className="flex gap-2 py-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-12 flex-1 rounded-lg bg-gray-200 animate-pulse" />
          ))}
        </div>
      </section>
    );
  }

  if (!userId) {
    return null;
  }

  return (
    <section className="mt-6">
      {classes.length > 0 ? (
        <div className="mb-4 space-y-3">
          {classes.map((classItem) => (
            <ClassRankBoard
              key={classItem.id}
              classLabel={classItem.name}
              rank={classItem.rank}
            />
          ))}
        </div>
      ) : null}
      <h2 className="text-lg font-semibold text-gray-900 mb-3">Messages</h2>
      {sortedActivities.length === 0 ? (
        <p className="text-sm text-gray-600 py-4">
          Chưa có hoạt động mới: ngưỡng mộ hoặc reaction story sẽ hiện tại
          đây.
        </p>
      ) : (
        <ul className="border-t border-gray-100 divide-y divide-gray-100">
          {sortedActivities.map((item) => (
            <li key={item.id} className="min-w-0">
              <ActivityCard
                item={item}
                isNew={item.createdAt.getTime() > unreadCutoffMs}
                senderPeer={resolveSenderPeer(item, peerByUserId, classPanels)}
              />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
