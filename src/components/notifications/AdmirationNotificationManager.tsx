"use client";

import { useAdmirationNotifications, getReactionIcon } from "@/modules/classes/hooks";
import { getUserInfoFromLocalStorage } from "@/modules/classes/api/presence";
import { useAuth } from "@/lib/auth/context";
import { AdmirationParticleEffect } from "./AdmirationParticleEffect";
import { useMemo } from "react";

/**
 * Component to manage admiration notifications for students
 * Shows toast + particle effect (icon + 5 avatar bay lên như khói) when receiving admiration
 */
export function AdmirationNotificationManager() {
  const { session, role, profile } = useAuth();
  const studentId = role === "student" ? session?.user?.id : undefined;

  const latestAdmiration = useAdmirationNotifications(studentId);

  const effectProps = useMemo(() => {
    if (!latestAdmiration) return null;
    if (latestAdmiration.type === "gameInvite") return null;
    const senderInfo = getUserInfoFromLocalStorage(latestAdmiration.fromStudentId);
    const receiverInfo = studentId ? getUserInfoFromLocalStorage(studentId) : null;
    const senderAvatar = latestAdmiration.fromStudentAvatarUrl || senderInfo?.avatarUrl || "";
    const receiverAvatar = receiverInfo?.avatarUrl || profile?.avatarUrl || "";
    const senderName = senderInfo?.name || latestAdmiration.fromStudentName || "T";
    const receiverName = receiverInfo?.name || profile?.displayName || "N";
    const senderInitial = senderName ? senderName.slice(-1).toUpperCase() : "T";
    const receiverInitial = receiverName ? receiverName.slice(-1).toUpperCase() : "N";

    return {
      key: latestAdmiration.id,
      icon: getReactionIcon(latestAdmiration.reactionType),
      senderAvatarUrl: senderAvatar,
      receiverAvatarUrl: receiverAvatar,
      senderInitial,
      receiverInitial,
    };
  }, [latestAdmiration, studentId, profile?.avatarUrl, profile?.displayName]);

  return (
    <>
      {effectProps && (
        <AdmirationParticleEffect
          key={effectProps.key}
          icon={effectProps.icon}
          senderAvatarUrl={effectProps.senderAvatarUrl}
          receiverAvatarUrl={effectProps.receiverAvatarUrl}
          senderInitial={effectProps.senderInitial}
          receiverInitial={effectProps.receiverInitial}
        />
      )}
    </>
  );
}
