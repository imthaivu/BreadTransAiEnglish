import { adminDb, getAdminRtdb } from "@/lib/firebase/admin";
import type { AwardMeta } from "./award";
import { resolvePvpWinner, type PvpRoomMeta } from "./pvp-resolve";
import { txAwardBread, userRef } from "./tx-award";
import type { GameBattleDoc } from "./types";
import { PVP_STAKE, PVP_WIN } from "./types";

function battleRef(roomId: string) {
  return adminDb().collection("gameBattles").doc(roomId);
}

type RoomMeta = PvpRoomMeta & {
  players: {
    p1: { id: string; name: string } | null;
    p2: { id: string; name: string } | null;
  };
};

async function readRoomMeta(roomId: string): Promise<RoomMeta | null> {
  const snap = await getAdminRtdb().ref(`rooms/${roomId}/meta`).get();
  if (!snap.exists()) return null;
  return snap.val() as RoomMeta;
}

async function readRoomState(roomId: string): Promise<unknown> {
  const snap = await getAdminRtdb().ref(`rooms/${roomId}/state`).get();
  if (!snap.exists()) return null;
  return snap.val();
}

export async function startBattle(params: {
  roomId: string;
  userId: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const { roomId, userId } = params;

  const existing = await battleRef(roomId).get();
  if (existing.exists) {
    const data = existing.data() as GameBattleDoc;
    if (data.status === "escrowed" || data.status === "settled") {
      return { ok: true };
    }
  }

  const meta = await readRoomMeta(roomId);
  if (!meta) return { ok: false, error: "ROOM_NOT_FOUND" };
  if (meta.status !== "playing" && meta.status !== "finished") {
    return { ok: false, error: "ROOM_NOT_READY" };
  }

  const p1 = meta.players.p1;
  const p2 = meta.players.p2;
  if (!p1?.id || !p2?.id) {
    return { ok: false, error: "MISSING_PLAYERS" };
  }
  if (userId !== p1.id && userId !== p2.id) {
    return { ok: false, error: "NOT_A_PLAYER" };
  }

  const gameMeta: AwardMeta = { roomId, gameId: meta.gameId, mode: "pvp" };
  const nowIso = new Date().toISOString();

  try {
    await adminDb().runTransaction(async (tx) => {
      const battleSnap = await tx.get(battleRef(roomId));
      if (battleSnap.exists) {
        const data = battleSnap.data() as GameBattleDoc;
        if (data.status === "escrowed" || data.status === "settled") {
          return;
        }
      }

      const p1Snap = await tx.get(userRef(p1.id));
      const p2Snap = await tx.get(userRef(p2.id));
      if (!p1Snap.exists || !p2Snap.exists) {
        throw new Error("USER_NOT_FOUND");
      }

      const p1Balance = Number(p1Snap.data()?.totalBanhRan ?? 0);
      const p2Balance = Number(p2Snap.data()?.totalBanhRan ?? 0);
      if (p1Balance < PVP_STAKE || p2Balance < PVP_STAKE) {
        throw new Error("INSUFFICIENT_BALANCE");
      }

      txAwardBread(tx, {
        userId: p1.id,
        amount: PVP_STAKE,
        reason: `Cọc đấu solo (${meta.gameId})`,
        actorId: p1.id,
        actorName: p1Snap.data()?.displayName ?? p1.name,
        actorRole: "student",
        type: "subtract",
        meta: gameMeta,
        userSnap: p1Snap,
      });
      txAwardBread(tx, {
        userId: p2.id,
        amount: PVP_STAKE,
        reason: `Cọc đấu solo (${meta.gameId})`,
        actorId: p2.id,
        actorName: p2Snap.data()?.displayName ?? p2.name,
        actorRole: "student",
        type: "subtract",
        meta: gameMeta,
        userSnap: p2Snap,
      });

      tx.set(
        battleRef(roomId),
        {
          roomId,
          gameId: meta.gameId,
          p1: p1.id,
          p2: p2.id,
          stake: PVP_STAKE,
          status: "escrowed",
          createdAt: nowIso,
          escrowedAt: nowIso,
        },
        { merge: true }
      );
    });
  } catch (err) {
    if (err instanceof Error && err.message === "INSUFFICIENT_BALANCE") {
      return { ok: false, error: "INSUFFICIENT_BALANCE" };
    }
    throw err;
  }

  return { ok: true };
}

function rewardForSettledBattle(
  battle: GameBattleDoc,
  userId: string
): number {
  if (battle.winnerRole === "draw") {
    return userId === battle.p1 || userId === battle.p2 ? PVP_STAKE : 0;
  }
  return battle.winnerUserId === userId ? PVP_WIN : 0;
}

export async function settleBattle(params: {
  roomId: string;
  userId: string;
}): Promise<{ ok: true; reward?: number } | { ok: false; error: string }> {
  const { roomId, userId } = params;

  const meta = await readRoomMeta(roomId);
  if (!meta || meta.status !== "finished") {
    return { ok: false, error: "ROOM_NOT_FINISHED" };
  }

  const state = await readRoomState(roomId);
  const winnerRole = resolvePvpWinner({ meta, state });
  if (winnerRole == null) {
    return { ok: false, error: "WINNER_NOT_RESOLVED" };
  }

  const isDraw = winnerRole === "draw";
  const gameMeta: AwardMeta = { roomId, gameId: meta.gameId, mode: "pvp" };

  try {
    const result = await adminDb().runTransaction(async (tx) => {
      const battleSnap = await tx.get(battleRef(roomId));
      if (!battleSnap.exists) {
        throw new Error("BATTLE_NOT_FOUND");
      }
      const battle = battleSnap.data() as GameBattleDoc;

      if (userId !== battle.p1 && userId !== battle.p2) {
        throw new Error("NOT_A_PLAYER");
      }

      if (battle.status === "settled") {
        return { alreadySettled: true as const, battle };
      }
      if (battle.status !== "escrowed") {
        throw new Error("BATTLE_NOT_ESCROWED");
      }

      const settledAt = new Date().toISOString();

      if (isDraw) {
        const p1Snap = await tx.get(userRef(battle.p1));
        const p2Snap = await tx.get(userRef(battle.p2));

        txAwardBread(tx, {
          userId: battle.p1,
          amount: PVP_STAKE,
          reason: `Hoàn cọc hòa (${meta.gameId})`,
          actorId: "system",
          actorName: "Hệ thống",
          actorRole: "admin",
          type: "add",
          meta: gameMeta,
          userSnap: p1Snap,
        });
        txAwardBread(tx, {
          userId: battle.p2,
          amount: PVP_STAKE,
          reason: `Hoàn cọc hòa (${meta.gameId})`,
          actorId: "system",
          actorName: "Hệ thống",
          actorRole: "admin",
          type: "add",
          meta: gameMeta,
          userSnap: p2Snap,
        });

        tx.update(battleRef(roomId), {
          status: "settled",
          winnerRole: "draw",
          winnerUserId: null,
          settledWinnerRole: "draw",
          settledAt,
        });

        return {
          alreadySettled: false as const,
          battle: {
            ...battle,
            status: "settled" as const,
            winnerRole: "draw" as const,
            winnerUserId: null,
          },
        };
      }

      const winnerId = winnerRole === "p1" ? battle.p1 : battle.p2;
      const winnerSnap = await tx.get(userRef(winnerId));
      const winnerName =
        winnerSnap.data()?.displayName ??
        (winnerRole === "p1" ? meta.players.p1?.name : meta.players.p2?.name) ??
        "Học sinh";

      txAwardBread(tx, {
        userId: winnerId,
        amount: PVP_WIN,
        reason: `Thắng đấu solo (${meta.gameId})`,
        actorId: winnerId,
        actorName: winnerName,
        actorRole: "student",
        type: "add",
        meta: gameMeta,
        userSnap: winnerSnap,
      });

      tx.update(battleRef(roomId), {
        status: "settled",
        winnerRole,
        winnerUserId: winnerId,
        settledWinnerRole: winnerRole,
        settledAt,
      });

      return {
        alreadySettled: false as const,
        battle: {
          ...battle,
          status: "settled" as const,
          winnerRole,
          winnerUserId: winnerId,
        },
      };
    });

    const battle = result.battle;
    return {
      ok: true,
      reward: rewardForSettledBattle(battle, userId),
    };
  } catch (err) {
    if (err instanceof Error) {
      if (err.message === "BATTLE_NOT_FOUND") {
        return { ok: false, error: "BATTLE_NOT_FOUND" };
      }
      if (err.message === "BATTLE_NOT_ESCROWED") {
        return { ok: false, error: "BATTLE_NOT_ESCROWED" };
      }
      if (err.message === "NOT_A_PLAYER") {
        return { ok: false, error: "NOT_A_PLAYER" };
      }
    }
    throw err;
  }
}
