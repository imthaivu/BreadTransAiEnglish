import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";

export type AwardMeta = {
  gameId?: string;
  playToken?: string;
  roomId?: string;
  mode?: "ranked" | "pvp";
};

export async function getUserBalance(userId: string): Promise<number> {
  const snap = await adminDb().collection("users").doc(userId).get();
  return Number(snap.data()?.totalBanhRan ?? 0);
}

/**
 * Award or deduct bread atomically via Admin SDK.
 * Positive amount = add, negative = subtract.
 */
export async function awardBread(params: {
  userId: string;
  amount: number;
  reason: string;
  actorId: string;
  actorName: string;
  actorRole: string;
  type: "add" | "subtract";
  meta?: AwardMeta;
}): Promise<{ newBalance: number }> {
  const { userId, amount, reason, actorId, actorName, actorRole, type, meta } =
    params;
  if (amount <= 0) {
    throw new Error("INVALID_AMOUNT");
  }

  const userRef = adminDb().collection("users").doc(userId);
  const currencyRef = adminDb().collection("currency").doc();

  let newBalance = 0;

  await adminDb().runTransaction(async (tx) => {
    const userSnap = await tx.get(userRef);
    if (!userSnap.exists) {
      throw new Error("USER_NOT_FOUND");
    }
    const current = Number(userSnap.data()?.totalBanhRan ?? 0);
    const delta = type === "add" ? amount : -amount;
    if (type === "subtract" && current < amount) {
      throw new Error("INSUFFICIENT_BALANCE");
    }
    newBalance = current + delta;

    tx.update(userRef, {
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
  });

  return { newBalance };
}
