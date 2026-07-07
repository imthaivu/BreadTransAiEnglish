"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  lastNameOf,
  otherRole,
  PlayerAvatar,
  useCountdown,
  useFinalizeRoom,
  useOpponentState,
  usePublishState,
  useRoom,
  type MultiplayerContext,
  type PlayerRole,
} from "../../realtime";
import { SKY_HIGH_KO_SCORE_GAP, SkyHighGameStatus } from "../types";
import { skyHighAudio } from "../utils/audio";
import SkyHighGame from "./SkyHighGame";

interface OppState {
  score: number;
  done: boolean;
}

type EndReason = "timeout" | "ko" | "collapse" | null;

/**
 * Sky High in head-to-head mode. Both players stack independently; scores sync
 * live. Knockout when leading by SKY_HIGH_KO_SCORE_GAP suitcases or opponent
 * times out on a drop turn (15s).
 */
export function SkyHighMultiplayer({
  multiplayer,
}: {
  multiplayer: MultiplayerContext;
}) {
  const { roomId, role, isHost } = multiplayer;
  const oppRole = otherRole(role);
  const [gameStatus, setGameStatus] = useState<SkyHighGameStatus>("menu");
  const [myScore, setMyScore] = useState(0);
  const [myFinal, setMyFinal] = useState<number | null>(null);
  const [timerResetKey, setTimerResetKey] = useState(0);
  const [endReason, setEndReason] = useState<EndReason>(null);

  const publish = usePublishState(roomId, role);
  const opp = useOpponentState<OppState>(roomId, role);
  const meta = useRoom(roomId);
  const countdown = useCountdown(multiplayer.startAt);
  const startedRef = useRef(false);
  const wasPresenceOfflineRef = useRef(false);

  useEffect(() => {
    skyHighAudio.setMute(false);
  }, []);

  // Auto-start when the countdown finishes.
  useEffect(() => {
    if (countdown === 0 && !startedRef.current && multiplayer.startAt) {
      startedRef.current = true;
      setGameStatus("playing");
      setEndReason(null);
    }
  }, [countdown, multiplayer.startAt]);

  // Reset đồng hồ thả vali khi presence online lại sau mất kết nối.
  const myPresenceOffline = meta?.presence?.[role]?.online === false;
  useEffect(() => {
    if (gameStatus !== "playing") {
      wasPresenceOfflineRef.current = false;
      return;
    }
    if (wasPresenceOfflineRef.current && !myPresenceOffline) {
      setTimerResetKey((k) => k + 1);
    }
    wasPresenceOfflineRef.current = myPresenceOffline;
  }, [myPresenceOffline, gameStatus]);

  const handleScoreChange = useCallback(
    (score: number) => {
      setMyScore(score);
      publish("score", score);
    },
    [publish]
  );

  const handleGameOver = useCallback(
    (finalScore: number) => {
      setMyFinal(finalScore);
      setGameStatus("gameover");
      publish("score", finalScore);
      publish("done", true);
    },
    [publish]
  );

  const handleDropTimeout = useCallback(() => {
    setEndReason("timeout");
  }, []);

  const handleCollapseGameOver = useCallback(
    (finalScore: number) => {
      setEndReason((prev) => prev ?? "collapse");
      handleGameOver(finalScore);
    },
    [handleGameOver]
  );

  const oppScore = opp?.score ?? 0;
  const iDone = myFinal !== null;
  const oppDone = opp?.done === true;
  const myPts = myFinal ?? myScore;
  const theirPts = oppScore;

  // Knockout theo chênh lệch điểm khi đang chơi.
  useEffect(() => {
    if (gameStatus !== "playing" || iDone) return;
    if (myScore >= oppScore + SKY_HIGH_KO_SCORE_GAP) {
      setEndReason("ko");
      setMyFinal(myScore);
      setGameStatus("gameover");
      publish("score", myScore);
      publish("done", true);
    } else if (oppScore >= myScore + SKY_HIGH_KO_SCORE_GAP) {
      setEndReason("ko");
      handleGameOver(myScore);
    }
  }, [
    gameStatus,
    iDone,
    myScore,
    oppScore,
    publish,
    handleGameOver,
  ]);

  let result: "win" | "lose" | "draw" | null = null;
  let resultSubtitle: string | null = null;

  if (iDone && oppDone) {
    if (myPts > theirPts) result = "win";
    else if (myPts < theirPts) result = "lose";
    else result = "draw";
  } else if (iDone && !oppDone) {
    if (myPts >= theirPts + SKY_HIGH_KO_SCORE_GAP) {
      result = "win";
      resultSubtitle = `Knockout! +${SKY_HIGH_KO_SCORE_GAP} vali`;
    } else {
      result = "lose";
      resultSubtitle =
        endReason === "timeout"
          ? "Hết giờ thả!"
          : endReason === "ko"
            ? `Knockout — đối thủ dẫn ${SKY_HIGH_KO_SCORE_GAP} vali`
            : "Tháp đổ!";
    }
  } else if (!iDone && oppDone) {
    result = "win";
    resultSubtitle = "Đối thủ thua trước!";
  }

  let finalWinnerRole: PlayerRole | "draw" | null = null;
  if (iDone && oppDone) {
    if (myPts > theirPts) finalWinnerRole = role;
    else if (myPts < theirPts) finalWinnerRole = oppRole;
    else finalWinnerRole = "draw";
  } else if (iDone && !oppDone) {
    if (myPts >= theirPts + SKY_HIGH_KO_SCORE_GAP) finalWinnerRole = role;
    else finalWinnerRole = oppRole;
  } else if (!iDone && oppDone) {
    finalWinnerRole = role;
  } else if (gameStatus === "playing") {
    if (myScore >= oppScore + SKY_HIGH_KO_SCORE_GAP) finalWinnerRole = role;
    else if (oppScore >= myScore + SKY_HIGH_KO_SCORE_GAP) {
      finalWinnerRole = oppRole;
    }
  }

  useFinalizeRoom({ roomId, isHost, winnerRole: finalWinnerRole });

  return (
    <div className="relative mx-auto w-full max-w-2xl font-sans">
      {/* Opponent live score bar */}
      <div className="mb-2 flex items-center justify-between gap-3 rounded-xl bg-white/10 px-3 py-2 text-white">
        <div className="flex items-center gap-2">
          <PlayerAvatar
            name={lastNameOf(multiplayer.self.name)}
            color={multiplayer.self.color}
            avatarUrl={multiplayer.self.avatarUrl}
            size={32}
          />
          <div className="leading-tight">
            <div className="text-[10px] font-bold text-sky-300">Bạn</div>
            <span className="text-lg font-black tabular-nums">{myScore}</span>
          </div>
        </div>
        <span className="text-[10px] uppercase tracking-widest text-white/50">
          vali · KO +{SKY_HIGH_KO_SCORE_GAP}
        </span>
        <div className="flex items-center gap-2">
          <div className="text-right leading-tight">
            <div className="max-w-[90px] truncate text-[10px] font-bold text-rose-300">
              {lastNameOf(multiplayer.opponent.name)}
              {opp?.done ? " ✓" : ""}
            </div>
            <span className="text-lg font-black tabular-nums text-rose-300">
              {oppScore}
            </span>
          </div>
          <PlayerAvatar
            name={lastNameOf(multiplayer.opponent.name)}
            color={multiplayer.opponent.color}
            avatarUrl={multiplayer.opponent.avatarUrl}
            size={32}
          />
        </div>
      </div>

      <div className="relative mx-auto aspect-[480/820] max-h-[80vh] w-full max-w-[480px]">
        <SkyHighGame
          gameStatus={gameStatus}
          setGameStatus={setGameStatus}
          onGameOver={handleCollapseGameOver}
          onScoreChange={handleScoreChange}
          timerResetKey={timerResetKey}
          onDropTimeout={handleDropTimeout}
        />

        {gameStatus === "menu" && (
          <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 bg-slate-950/50 text-white">
            <div className="text-6xl font-black text-amber-300 tabular-nums drop-shadow">
              {countdown && countdown > 0 ? countdown : "GO!"}
            </div>
            <p className="text-xs font-semibold text-white/70">
              Xếp vali cao hơn {multiplayer.opponent.name}!
            </p>
            <p className="text-[10px] text-white/50">
              15s/lượt thả · dẫn {SKY_HIGH_KO_SCORE_GAP} vali = knockout
            </p>
          </div>
        )}

        {gameStatus === "gameover" && (
          <div className="absolute inset-0 z-20 flex items-center justify-center p-4">
            <div className="w-[260px] space-y-3 rounded-2xl border border-white/70 bg-white/90 px-5 py-6 text-center shadow-xl backdrop-blur-md">
              {result === null ? (
                <>
                  <h2 className="text-xs font-bold uppercase tracking-[0.2em] text-slate-500">
                    Xong!
                  </h2>
                  <div className="text-5xl font-black tabular-nums text-slate-900">
                    {myFinal}
                  </div>
                  <p className="text-xs text-slate-500">
                    Chờ {multiplayer.opponent.name} hoàn thành…
                  </p>
                </>
              ) : (
                <>
                  <h2
                    className={`text-2xl font-black ${
                      result === "win"
                        ? "text-emerald-600"
                        : result === "lose"
                          ? "text-rose-600"
                          : "text-slate-600"
                    }`}
                  >
                    {result === "win"
                      ? "🏆 Bạn thắng!"
                      : result === "lose"
                        ? "Bạn thua!"
                        : "Hòa!"}
                  </h2>
                  {resultSubtitle && (
                    <p className="text-xs font-semibold text-slate-500">
                      {resultSubtitle}
                    </p>
                  )}
                  <p className="text-sm font-bold text-slate-700">
                    {myPts} - {theirPts}
                  </p>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
