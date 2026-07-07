import {
  FieldValue,
  type DocumentSnapshot,
  type Transaction,
} from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import type { AwardMeta } from "./award";

export function userRef(userId: string) {
  return adminDb().collection("users").doc(userId);
}

/** Ghi currency + increment balance trong cùng Firestore transaction (exactly-once). */
export function txAwardBread(
  tx: Transaction,
  params: {
    userId: string;
    amount: number;
    reason: string;
    actorId: string;
    actorName: string;
    actorRole: string;
    type: "add" | "subtract";
    meta?: AwardMeta;
    userSnap: DocumentSnapshot;
  }
): void {
  const {
    userId,
    amount,
    reason,
    actorId,
    actorName,
    actorRole,
    type,
    meta,
    userSnap,
  } = params;
  if (!userSnap.exists) {
    throw new Error("USER_NOT_FOUND");
  }
  const delta = type === "add" ? amount : -amount;
  const currencyRef = adminDb().collection("currency").doc();
  tx.update(userRef(userId), {
    totalBanhRan: FieldValue.increment(delta),
    updatedAt: new Date(),
  });
  tx.set(currencyRef, {
    studentId: userId,
    studentName: userSnap.data()?.displayName ?? "Học sinh",
    userId: actorId,
    userName: actorName,
    userRole: actorRole,
    amount,
    reason: meta?.gameId ? `[Game ${meta.gameId}] ${reason}` : reason,
    type,
    classId: null,
    gameMeta: meta ?? null,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
}
