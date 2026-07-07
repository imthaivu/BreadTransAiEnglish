"use client";

import { off, onValue } from "firebase/database";
import { useEffect, useRef, useState } from "react";
import {
  FiAward,
  FiBookOpen,
  FiPlay,
  FiRotateCcw,
} from "react-icons/fi";
import { LeaderboardEntry, SkyHighGameStatus } from "../types";
import { skyHighAudio } from "../utils/audio";
import { SKY_HIGH_SCORES_KEY } from "../utils/data";
import HowToPlay from "./HowToPlay";
import Leaderboard from "./Leaderboard";
import SkyHighGame from "./SkyHighGame";
import type { MultiplayerGameProps } from "../../realtime";
import { connectedInfoRef } from "../../realtime/paths";
import { SkyHighMultiplayer } from "./SkyHighMultiplayer";
import { GambleWarning } from "../../components/GambleWarning";
import { SCORE_GAMBLE_THRESHOLD } from "@/lib/games/rewards";

export default function SkyHigh({
  multiplayer,
  soloMode,
  onRankedStart,
  onSoloResult,
  replayLocked,
}: MultiplayerGameProps = {}) {
  if (multiplayer) {
    return <SkyHighMultiplayer multiplayer={multiplayer} />;
  }
  return (
    <SkyHighSolo
      soloMode={soloMode}
      onRankedStart={onRankedStart}
      onSoloResult={onSoloResult}
      replayLocked={replayLocked}
    />
  );
}

function SkyHighSolo({
  soloMode,
  onRankedStart,
  onSoloResult,
  replayLocked = false,
}: Pick<
  MultiplayerGameProps,
  "soloMode" | "onRankedStart" | "onSoloResult" | "replayLocked"
>) {
  const [gameStatus, setGameStatus] = useState<SkyHighGameStatus>("menu");
  const [lastScore, setLastScore] = useState(0);
  // Điểm live (số vali) để hiện cảnh báo cờ bạc khi vượt mốc trong lượt có vé.
  const [liveScore, setLiveScore] = useState(0);
  const [personalBestScore, setPersonalBestScore] = useState(0);
  const [hasSubmitted, setHasSubmitted] = useState(false);
  const [showLeaderboard, setShowLeaderboard] = useState(false);
  const [soloResultSent, setSoloResultSent] = useState(false);
  // Mỗi lần chơi = 1 vé. Ván đầu đã trừ vé khi vào game.
  const rankedRoundRef = useRef(soloMode === "ranked");
  const [timerResetKey, setTimerResetKey] = useState(0);
  const wasConnectedRef = useRef(true);

  useEffect(() => {
    skyHighAudio.setMute(false);
  }, []);

  // Reset đồng hồ thả vali khi Firebase reconnect trong lúc đang chơi.
  useEffect(() => {
    if (gameStatus !== "playing") {
      wasConnectedRef.current = true;
      return;
    }
    const r = connectedInfoRef();
    const cb = onValue(r, (snap) => {
      const connected = snap.val() === true;
      if (!wasConnectedRef.current && connected) {
        setTimerResetKey((k) => k + 1);
      }
      wasConnectedRef.current = connected;
    });
    return () => off(r, "value", cb);
  }, [gameStatus]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const rawScores = localStorage.getItem(SKY_HIGH_SCORES_KEY);
      if (rawScores) {
        const parsed = JSON.parse(rawScores) as LeaderboardEntry[];
        if (parsed.length > 0) {
          const maxS = Math.max(...parsed.map((p) => p.score));
          setPersonalBestScore(maxS);
        }
      }
    } catch {
      // ignore parse error
    }
  }, [gameStatus, hasSubmitted]);

  const playClick = () => skyHighAudio.playClick();

  const handleStartGame = () => {
    // Chặn chơi lại khi popup phần thưởng đang hiện/đang tính.
    if (replayLocked && gameStatus === "gameover") return;
    playClick();
    // Chơi lại từ màn Game Over ⇒ tiêu vé tiếp (hết vé ⇒ tập luyện).
    const replaying = gameStatus === "gameover";
    setGameStatus("playing");
    setHasSubmitted(false);
    setShowLeaderboard(false);
    setSoloResultSent(false);
    if (soloMode === "ranked" && replaying) {
      rankedRoundRef.current = false;
      void (async () => {
        const ok = onRankedStart ? await onRankedStart() : false;
        rankedRoundRef.current = ok;
      })();
    }
  };

  const showCanvas =
    gameStatus === "menu" ||
    gameStatus === "playing" ||
    gameStatus === "gameover";

  const handleGameOver = (score: number) => {
    setLastScore(score);
    setGameStatus("gameover");

    if (
      soloMode === "ranked" &&
      rankedRoundRef.current &&
      !soloResultSent &&
      onSoloResult
    ) {
      setSoloResultSent(true);
      onSoloResult({ won: true, suitcases: score });
    }

    if (typeof window === "undefined") return;

    let scores: LeaderboardEntry[] = [];
    try {
      const rawScores = localStorage.getItem(SKY_HIGH_SCORES_KEY);
      if (rawScores) {
        scores = JSON.parse(rawScores) as LeaderboardEntry[];
      }
    } catch {
      scores = [];
    }

    const newEntry: LeaderboardEntry = {
      name: "",
      score,
      height: 0,
      date: new Date().toLocaleDateString("vi-VN", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }),
    };

    const maxPrevScore =
      scores.length > 0 ? Math.max(...scores.map((s) => s.score)) : 0;
    const isNewBest = score > maxPrevScore;

    scores.push(newEntry);
    try {
      localStorage.setItem(SKY_HIGH_SCORES_KEY, JSON.stringify(scores));
    } catch {
      // ignore storage quota errors
    }

    if (isNewBest || scores.length === 1) {
      setPersonalBestScore(score);
      setHasSubmitted(true);
      skyHighAudio.playLevelUp();
    } else {
      setHasSubmitted(false);
    }
  };

  return (
    <div
      className="w-full max-w-2xl mx-auto font-sans relative"
      id="sky-high-root"
    >
      {showCanvas && (
        <div className="relative w-full max-w-[480px] mx-auto aspect-[480/820] max-h-[88vh]">
          <SkyHighGame
            gameStatus={gameStatus}
            setGameStatus={setGameStatus}
            onGameOver={handleGameOver}
            onScoreChange={setLiveScore}
            timerResetKey={timerResetKey}
          />

          <GambleWarning
            show={
              soloMode === "ranked" &&
              gameStatus === "playing" &&
              liveScore > SCORE_GAMBLE_THRESHOLD
            }
            score={liveScore}
            className="top-14 left-3"
          />

          {gameStatus === "menu" && !showLeaderboard && (
            <div
              className="absolute inset-0 z-20 flex flex-col items-center justify-between p-4 sm:p-6 pointer-events-none"
              id="menu-overlay"
            >
              {personalBestScore > 0 ? (
                <div className="bg-white/90 border border-slate-200 px-3 py-1.5 rounded-xl flex items-center gap-1.5 text-sm font-black backdrop-blur shadow-sm pointer-events-auto text-amber-600">
                  <span aria-hidden="true">🏆</span>
                  <span className="tabular-nums">{personalBestScore}</span>
                  <span className="text-[10px] font-bold uppercase text-slate-500 tracking-widest ml-1">
                    vali
                  </span>
                </div>
              ) : (
                <span />
              )}

              <button
                type="button"
                onClick={handleStartGame}
                className="px-8 py-3.5 bg-yellow-400 hover:bg-yellow-500 text-slate-900 font-black text-base uppercase tracking-wide rounded-2xl transition-colors flex items-center justify-center gap-2 shadow-xl ring-4 ring-amber-300/40 pointer-events-auto"
              >
                <FiPlay className="w-5 h-5 fill-current" />
                Chơi
              </button>

              <div className="flex items-center justify-center gap-2 pointer-events-auto">
                <button
                  type="button"
                  onClick={() => {
                    playClick();
                    setGameStatus("instructions");
                  }}
                  aria-label="Cách chơi"
                  className="p-2.5 bg-white/90 hover:bg-white border border-slate-200 text-slate-600 rounded-lg transition-colors backdrop-blur shadow-sm"
                >
                  <FiBookOpen className="w-4 h-4 text-amber-500" />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    playClick();
                    setShowLeaderboard(true);
                  }}
                  aria-label="Bảng xếp hạng"
                  className="p-2.5 bg-white/90 hover:bg-white border border-slate-200 text-slate-600 rounded-lg transition-colors backdrop-blur shadow-sm"
                >
                  <FiAward className="w-4 h-4 text-emerald-500" />
                </button>
              </div>
            </div>
          )}

          {gameStatus === "menu" && showLeaderboard && (
            <div
              className="absolute inset-0 z-20 overflow-y-auto"
              id="leaderboard-overlay"
            >
              <div className="min-h-full flex items-center justify-center p-4">
                <div className="w-full max-w-md">
                  <Leaderboard
                    onClose={() => {
                      playClick();
                      setShowLeaderboard(false);
                    }}
                  />
                </div>
              </div>
            </div>
          )}

          {gameStatus === "gameover" && (
            <div
              className="absolute inset-0 z-20 flex items-center justify-center p-4"
              id="gameover-overlay"
            >
              <div
                className="w-[260px] rounded-2xl bg-white/90 border border-white/70 shadow-xl backdrop-blur-md px-5 py-6 text-center space-y-4"
                id="gameover-card"
              >
                <h2 className="text-xs font-bold tracking-[0.2em] text-slate-500 uppercase">
                  Game Over
                </h2>

                <div className="leading-none">
                  <div className="text-5xl font-black text-slate-900 tabular-nums">
                    {lastScore}
                  </div>
                  <div className="mt-1.5 text-[10px] font-bold uppercase tracking-widest text-slate-400">
                    vali
                  </div>
                </div>

                {hasSubmitted ? (
                  <div className="flex items-center justify-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-amber-600">
                    <span aria-hidden="true">🏆</span>
                    <span>Kỷ lục mới</span>
                  </div>
                ) : (
                  <div className="flex items-center justify-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-slate-500">
                    <span aria-hidden="true">🏆</span>
                    <span>Kỷ lục</span>
                    <span className="text-slate-900 tabular-nums">
                      {personalBestScore}
                    </span>
                  </div>
                )}

                <button
                  type="button"
                  onClick={handleStartGame}
                  disabled={replayLocked}
                  className="w-full py-2.5 bg-amber-400 hover:bg-amber-500 text-slate-900 font-black text-sm uppercase tracking-wide rounded-xl transition-colors flex items-center justify-center gap-1.5 disabled:opacity-50 disabled:pointer-events-none"
                >
                  <FiRotateCcw className="w-4 h-4" />
                  Chơi lại
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {gameStatus === "instructions" && (
        <main
          className="w-full px-2 sm:px-4 py-4 sm:py-5 flex flex-col justify-center items-center"
          id="sky-high-main-instructions"
        >
          <HowToPlay onStartGame={handleStartGame} />
        </main>
      )}
    </div>
  );
}
