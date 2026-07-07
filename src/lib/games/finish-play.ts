import { adminDb } from "@/lib/firebase/admin";
import { getUserBalance } from "./award";
import { isPlausibleResult, scoreToBread } from "./rewards";
import { getPlayDoc, isPlayExpired, playRef } from "./tickets";
import { txAwardBread, userRef } from "./tx-award";
import type { GamePlayDoc, SoloResultPayload } from "./types";

export async function finishRankedPlay(params: {
  userId: string;
  playToken: string;
  result: SoloResultPayload;
  displayName: string;
}): Promise<
  | { ok: true; reward: number; newBalance: number }
  | { ok: false; error: string }
> {
  const play = await getPlayDoc(params.playToken);
  if (!play) return { ok: false, error: "PLAY_NOT_FOUND" };
  if (play.userId !== params.userId) return { ok: false, error: "NOT_OWNER" };
  if (play.status === "finished") {
    return {
      ok: true,
      reward: play.reward ?? 0,
      newBalance: await getUserBalance(params.userId),
    };
  }

  const trustedResult: SoloResultPayload =
    play.gameId === "caro" || play.gameId === "sliding-puzzle"
      ? { ...params.result, difficulty: play.difficulty }
      : params.result;

  try {
    const txResult = await adminDb().runTransaction(async (tx) => {
      const playSnap = await tx.get(playRef(params.playToken));
      if (!playSnap.exists) {
        throw new Error("PLAY_NOT_FOUND");
      }
      const playData = playSnap.data() as GamePlayDoc;

      if (playData.userId !== params.userId) {
        throw new Error("NOT_OWNER");
      }
      if (playData.status === "finished") {
        return {
          idempotent: true as const,
          reward: playData.reward ?? 0,
        };
      }
      if (playData.status !== "active") {
        throw new Error("PLAY_INVALID");
      }
      if (isPlayExpired(playData)) {
        tx.update(playRef(params.playToken), { status: "expired" });
        throw new Error("PLAY_EXPIRED");
      }

      const finishedAt = new Date().toISOString();
      const gameMeta = {
        gameId: playData.gameId,
        playToken: params.playToken,
        mode: "ranked" as const,
      };

      if (!isPlausibleResult(playData.gameId, trustedResult, playData.difficulty)) {
        tx.update(playRef(params.playToken), {
          status: "finished",
          finishedAt,
          result: trustedResult,
          reward: 0,
        });
        throw new Error("INVALID_RESULT");
      }

      let appliedReward = scoreToBread(playData.gameId, trustedResult);
      const userSnap = await tx.get(userRef(params.userId));
      if (!userSnap.exists) {
        throw new Error("USER_NOT_FOUND");
      }

      if (trustedResult.won && appliedReward !== 0) {
        const isPenalty = appliedReward < 0;
        let amount = Math.abs(appliedReward);
        if (isPenalty) {
          const balance = Number(userSnap.data()?.totalBanhRan ?? 0);
          amount = Math.min(amount, balance);
          appliedReward = -amount;
        }
        if (amount > 0) {
          txAwardBread(tx, {
            userId: params.userId,
            amount,
            reason: isPenalty
              ? `Phạt điểm lẻ game ${playData.gameId}`
              : `Thắng game ${playData.gameId}`,
            actorId: params.userId,
            actorName: params.displayName,
            actorRole: "student",
            type: isPenalty ? "subtract" : "add",
            meta: gameMeta,
            userSnap,
          });
        } else {
          appliedReward = 0;
        }
      } else {
        appliedReward = 0;
      }

      tx.update(playRef(params.playToken), {
        status: "finished",
        finishedAt,
        result: trustedResult,
        reward: appliedReward,
      });

      return {
        idempotent: false as const,
        reward: appliedReward,
      };
    });

    const newBalance = await getUserBalance(params.userId);
    return {
      ok: true,
      reward: txResult.reward,
      newBalance,
    };
  } catch (err) {
    if (err instanceof Error) {
      const code = err.message;
      if (
        code === "PLAY_NOT_FOUND" ||
        code === "NOT_OWNER" ||
        code === "PLAY_INVALID" ||
        code === "PLAY_EXPIRED" ||
        code === "INVALID_RESULT"
      ) {
        return { ok: false, error: code };
      }
    }
    throw err;
  }
}

export type { SoloResultPayload };
