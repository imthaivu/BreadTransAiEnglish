"use client";

import { AnimatePresence, motion } from "framer-motion";
import React, { useEffect, useRef, useState } from "react";
import { FiPlay, FiRotateCcw, FiXCircle } from "react-icons/fi";
import { useShellGameSettings } from "../hooks/useShellGameSettings";
import { Cup, GamePhase, SHELL_GAME_SETTINGS, ShellGameStats } from "../types";
import { getLevelConfig } from "../utils/levels";
import { sounds } from "../utils/sound";
import { GAME_THEMES } from "../utils/themes";
import { CupComponent } from "./CupComponent";
import { UserBreadBadge } from "../../components/UserBreadBadge";
import { GambleWarning } from "../../components/GambleWarning";
import { SCORE_GAMBLE_THRESHOLD } from "@/lib/games/rewards";
import { TURN_THINK_MS, type MultiplayerGameProps } from "../../realtime";
import { ShellGameMultiplayer } from "./ShellGameMultiplayer";

const HIGH_SCORE_KEY = "breadtrans.shell_game.high_score";
const STATS_KEY = "breadtrans.shell_game.stats";

const POSITIONS = ["15%", "50%", "85%"];

const defaultCups: Cup[] = [
  { id: "cup-0", originalId: "cup-0", index: 0, isLifting: false },
  { id: "cup-1", originalId: "cup-1", index: 1, isLifting: false },
  { id: "cup-2", originalId: "cup-2", index: 2, isLifting: false },
];

export default function ShellGame({
  multiplayer,
  soloMode,
  onRankedStart,
  onSoloResult,
  replayLocked,
}: MultiplayerGameProps = {}) {
  if (multiplayer) {
    return <ShellGameMultiplayer multiplayer={multiplayer} />;
  }
  return (
    <ShellGameSolo
      soloMode={soloMode}
      onRankedStart={onRankedStart}
      onSoloResult={onSoloResult}
      replayLocked={replayLocked}
    />
  );
}

function ShellGameSolo({
  soloMode,
  onRankedStart,
  onSoloResult,
  replayLocked = false,
}: Pick<
  MultiplayerGameProps,
  "soloMode" | "onRankedStart" | "onSoloResult" | "replayLocked"
>) {
  const { data: liveSettings } = useShellGameSettings();
  const settings = liveSettings ?? SHELL_GAME_SETTINGS;
  /**
   * Lưu settings vào ref để các timeout async (đang chờ chạy) đọc giá trị mới
   * nhất ngay cả khi admin vừa cập nhật giữa lúc đang chơi.
   */
  const settingsRef = useRef(settings);
  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);

  const [phase, setPhase] = useState<GamePhase>("IDLE");
  const [cups, setCups] = useState<Cup[]>(defaultCups);
  const [ballCupId, setBallCupId] = useState<string>("cup-1");

  const [stats, setStats] = useState<ShellGameStats>({
    score: 1,
    highScore: 0,
    level: 1,
    lives: 0,
    consecutiveWins: 0,
    highestLevel: 1,
    totalGames: 0,
    correctGuesses: 0,
    totalGuesses: 0,
  });

  const [currentTheme] = useState(GAME_THEMES[0]);
  const [currentShuffleIndex, setCurrentShuffleIndex] = useState(-1);
  const [totalShufflesForRound, setTotalShufflesForRound] = useState(0);
  const [selectedCupId, setSelectedCupId] = useState<string | null>(null);
  const [isCheckingResult, setIsCheckingResult] = useState(false);
  const [selectSecondsLeft, setSelectSecondsLeft] = useState<number | null>(
    null
  );

  const statsRef = useRef(stats);
  useEffect(() => {
    statsRef.current = stats;
  }, [stats]);

  const ballCupIdRef = useRef(ballCupId);
  const soloResultSentRef = useRef(false);
  // Mỗi phiên (tới khi Game Over) = 1 vé. Ván đầu đã trừ vé khi vào game.
  const rankedRoundRef = useRef(soloMode === "ranked");

  const emitSoloResult = (level: number) => {
    if (!rankedRoundRef.current || soloResultSentRef.current || !onSoloResult)
      return;
    soloResultSentRef.current = true;
    onSoloResult({ won: true, level });
  };
  useEffect(() => {
    ballCupIdRef.current = ballCupId;
  }, [ballCupId]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const savedHighScore = localStorage.getItem(HIGH_SCORE_KEY);
      const savedStats = localStorage.getItem(STATS_KEY);
      setStats((prev) => {
        const next = { ...prev };
        if (savedStats) {
          try {
            const parsed = JSON.parse(savedStats);
            const highestLevel = Number(parsed.highestLevel ?? 1) || 1;
            next.highestLevel = highestLevel;
            next.highScore = highestLevel;
            next.totalGames = Number(parsed.totalGames ?? 0) || 0;
            next.correctGuesses = Number(parsed.correctGuesses ?? 0) || 0;
            next.totalGuesses = Number(parsed.totalGuesses ?? 0) || 0;
          } catch {
            // ignore
          }
        } else if (savedHighScore) {
          const v = Number(savedHighScore);
          if (Number.isFinite(v) && v >= 1 && v <= 200) {
            next.highScore = Math.floor(v);
            next.highestLevel = Math.max(next.highestLevel, next.highScore);
          }
        }
        return next;
      });
    } catch {
      // ignore
    }
    sounds.setMute(false);
    sounds.setVolume(0.6);
  }, []);

  const saveStatsToLocalStorage = (updatedStats: ShellGameStats) => {
    if (typeof window === "undefined") return;
    try {
      localStorage.setItem(HIGH_SCORE_KEY, updatedStats.highScore.toString());
      localStorage.setItem(
        STATS_KEY,
        JSON.stringify({
          highScore: updatedStats.highScore,
          totalGames: updatedStats.totalGames,
          correctGuesses: updatedStats.correctGuesses,
          totalGuesses: updatedStats.totalGuesses,
          highestLevel: updatedStats.highestLevel,
        })
      );
    } catch {
      // ignore quota errors
    }
  };

  const startRound = () => {
    if (phase !== "IDLE" && phase !== "RESULT") return;
    sounds.playClick();

    setSelectedCupId(null);
    setIsCheckingResult(false);

    const cupIds = ["cup-0", "cup-1", "cup-2"];
    const randomBallCupId = cupIds[Math.floor(Math.random() * cupIds.length)];
    setBallCupId(randomBallCupId);
    ballCupIdRef.current = randomBallCupId;

    setCups((prev) => prev.map((c) => ({ ...c, isLifting: false })));
    setPhase("REVEALING");

    const reveal = settingsRef.current.revealDurationMs;
    const cover = settingsRef.current.coverDurationMs;

    setTimeout(() => {
      sounds.playLift();
      setCups((prev) =>
        prev.map((c) =>
          c.originalId === randomBallCupId ? { ...c, isLifting: true } : c
        )
      );
    }, 400);

    setTimeout(() => {
      sounds.playLower();
      setCups((prev) => prev.map((c) => ({ ...c, isLifting: false })));
      setPhase("COVERING");
    }, 400 + reveal);

    setTimeout(() => {
      runShuffleRoutine();
    }, 400 + reveal + cover);
  };

  const runShuffleRoutine = () => {
    setPhase("SHUFFLING");

    const currentSettings = settingsRef.current;
    const config = getLevelConfig(statsRef.current.level, currentSettings);
    setTotalShufflesForRound(config.shufflesCount);

    setCups([...defaultCups]);

    const selectRandomIndexesToSwap = (): [number, number] => {
      const from = Math.floor(Math.random() * 3);
      let to = Math.floor(Math.random() * 3);
      while (to === from) {
        to = Math.floor(Math.random() * 3);
      }
      return [from, to];
    };

    let step = 0;
    const interval = config.speedMs;

    const performSwapStep = () => {
      if (step >= config.shufflesCount) {
        setCurrentShuffleIndex(-1);
        setPhase("SELECTING");
        return;
      }

      const [idx1, idx2] = selectRandomIndexesToSwap();

      sounds.playShuffle();
      setCurrentShuffleIndex(step);

      setCups((prev) =>
        prev.map((cup) => {
          if (cup.index === idx1) return { ...cup, index: idx2 };
          if (cup.index === idx2) return { ...cup, index: idx1 };
          return cup;
        })
      );

      step++;
      setTimeout(performSwapStep, interval);
    };

    performSwapStep();
  };

  const handleSelectCup = (cupId: string) => {
    if (phase !== "SELECTING" || isCheckingResult) return;

    setSelectedCupId(cupId);
    setIsCheckingResult(true);
    setPhase("RESULT");
    sounds.playLift();

    setCups((prev) =>
      prev.map((c) => {
        if (c.id === cupId || c.originalId === ballCupId) {
          return { ...c, isLifting: true };
        }
        return c;
      })
    );

    const isCorrect = cupId === ballCupId;

    setTimeout(() => {
      const current = statsRef.current;

      if (isCorrect) {
        sounds.playCorrect();

        const nextLevel = current.level + 1;
        const nextHighScore = Math.max(nextLevel, current.highScore);
        const nextStreak = current.consecutiveWins + 1;
        const highestLvl = Math.max(nextLevel, current.highestLevel);

        const newStats: ShellGameStats = {
          ...current,
          score: nextLevel,
          highScore: nextHighScore,
          level: nextLevel,
          consecutiveWins: nextStreak,
          highestLevel: highestLvl,
          correctGuesses: current.correctGuesses + 1,
          totalGuesses: current.totalGuesses + 1,
        };

        setStats(newStats);
        saveStatsToLocalStorage(newStats);
        sounds.playLevelUp();
      } else {
        sounds.playIncorrect();

        const newStats: ShellGameStats = {
          ...current,
          lives: 0,
          consecutiveWins: 0,
          totalGuesses: current.totalGuesses + 1,
          totalGames: current.totalGames + 1,
        };
        setStats(newStats);
        saveStatsToLocalStorage(newStats);
        emitSoloResult(current.level);
        setPhase("GAME_OVER");
        sounds.playGameOver();
      }
      setIsCheckingResult(false);
    }, 850);
  };

  // Đồng hồ suy nghĩ 15s ở pha chọn ly — hết giờ tính là đoán sai.
  useEffect(() => {
    if (phase !== "SELECTING" || isCheckingResult) {
      setSelectSecondsLeft(null);
      return;
    }

    const deadline = Date.now() + TURN_THINK_MS;
    setSelectSecondsLeft(Math.ceil(TURN_THINK_MS / 1000));

    const onTimeout = () => {
      setIsCheckingResult(true);
      setPhase("RESULT");
      sounds.playLift();
      setCups((prev) =>
        prev.map((c) =>
          c.originalId === ballCupIdRef.current ? { ...c, isLifting: true } : c
        )
      );

      setTimeout(() => {
        const current = statsRef.current;
        const newStats: ShellGameStats = {
          ...current,
          lives: 0,
          consecutiveWins: 0,
          totalGuesses: current.totalGuesses + 1,
          totalGames: current.totalGames + 1,
        };
        setStats(newStats);
        saveStatsToLocalStorage(newStats);
        emitSoloResult(current.level);
        setPhase("GAME_OVER");
        sounds.playIncorrect();
        sounds.playGameOver();
        setIsCheckingResult(false);
      }, 850);
    };

    const tick = () => {
      const ms = deadline - Date.now();
      if (ms <= 0) {
        setSelectSecondsLeft(0);
        onTimeout();
        return;
      }
      setSelectSecondsLeft(Math.ceil(ms / 1000));
    };

    const id = setInterval(tick, 200);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, isCheckingResult]);

  const handleRestartFull = () => {
    // Chặn chơi lại khi popup phần thưởng đang hiện/đang tính.
    if (replayLocked) return;
    sounds.playClick();
    const cleanStats: ShellGameStats = {
      score: 1,
      highScore: stats.highScore,
      level: 1,
      lives: 0,
      consecutiveWins: 0,
      highestLevel: Math.max(1, stats.highestLevel),
      totalGames: stats.totalGames,
      correctGuesses: stats.correctGuesses,
      totalGuesses: stats.totalGuesses,
    };

    setStats(cleanStats);
    setSelectedCupId(null);
    setIsCheckingResult(false);
    setCups([...defaultCups]);
    setBallCupId("cup-1");
    setPhase("IDLE");
    soloResultSentRef.current = false;
    // Phiên mới: tiêu vé tiếp nếu còn; hết vé ⇒ chơi tập luyện (không tính bánh).
    if (soloMode === "ranked") {
      void (async () => {
        const ok = onRankedStart ? await onRankedStart() : false;
        rankedRoundRef.current = ok;
      })();
    }
  };

  const getProgressPercent = () => {
    if (currentShuffleIndex === -1 || totalShufflesForRound === 0) return 0;
    return Math.floor((currentShuffleIndex / totalShufflesForRound) * 100);
  };

  return (
    <div className="w-full max-w-3xl mx-auto">
      <div
        className={`relative rounded-3xl p-3 sm:p-4 md:p-6 border-2 sm:border-4 border-amber-300/70 overflow-hidden shadow-xl bg-gradient-to-b ${currentTheme.tableBg} h-[clamp(520px,82vh,680px)] md:h-[560px]`}
      >
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.7)_0%,transparent_70%)] pointer-events-none" />
        <div
          className={`absolute inset-3 rounded-[1.8rem] border border-dashed ${currentTheme.feltColor} transition-all duration-300`}
        />

        {/* HUD: cấp · kỷ lục · bánh */}
        <div className="absolute top-3 left-3 right-3 flex items-center justify-between gap-2 z-30">
          <div className="flex items-center gap-1.5 bg-white/85 border border-amber-200 rounded-lg px-2.5 py-1.5 backdrop-blur-sm shadow-sm">
            <span className="text-base font-extrabold text-amber-600 leading-none tabular-nums">
              Lv {stats.level}
            </span>
            {stats.highScore > 1 && (
              <>
                <span className="text-slate-300">·</span>
                <span className="text-xs font-bold text-slate-700 leading-none flex items-center gap-1">
                  <span aria-hidden="true">🏆</span>
                  <span className="tabular-nums">Lv {stats.highScore}</span>
                </span>
              </>
            )}
          </div>

          <UserBreadBadge variant="light" />
        </div>

        <GambleWarning
          show={
            soloMode === "ranked" &&
            phase !== "GAME_OVER" &&
            stats.level > SCORE_GAMBLE_THRESHOLD
          }
          score={stats.level}
          className="top-14 left-3"
        />

        {/* Cups */}
        <div className="absolute inset-x-0 bottom-4 top-16 md:top-20">
          {cups.map((cup) => {
            const isUnderSelectedCup = selectedCupId === cup.id;
            let isCorrectResult: boolean | null = null;
            if (phase === "RESULT" || phase === "GAME_OVER") {
              isCorrectResult = cup.originalId === ballCupId;
            }

            return (
              <CupComponent
                key={cup.id}
                cup={cup}
                hasBall={cup.originalId === ballCupId}
                theme={currentTheme}
                isSelectable={phase === "SELECTING" && !isCheckingResult}
                isSelected={isUnderSelectedCup}
                isCorrect={isCorrectResult}
                positions={POSITIONS}
                onSelect={() => handleSelectCup(cup.id)}
              />
            );
          })}
        </div>

        {/* Shuffle progress */}
        <AnimatePresence>
          {phase === "SHUFFLING" && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className="absolute top-16 left-3 right-3 z-30"
            >
              <div className="w-full bg-amber-100/80 border border-amber-200 h-1.5 rounded-full overflow-hidden shadow-inner">
                <motion.div
                  animate={{ width: `${getProgressPercent()}%` }}
                  className="bg-gradient-to-r from-amber-500 via-orange-400 to-yellow-400 h-full rounded-full"
                />
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Đồng hồ chọn ly */}
        <AnimatePresence>
          {phase === "SELECTING" && selectSecondsLeft != null && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className="absolute top-16 left-0 right-0 flex justify-center z-30"
            >
              <span
                className={`rounded-full border px-3 py-1 text-sm font-bold tabular-nums shadow-sm backdrop-blur-sm ${
                  selectSecondsLeft <= 5
                    ? "border-rose-200 bg-rose-50/90 text-rose-600"
                    : "border-amber-200 bg-white/90 text-amber-600"
                }`}
              >
                {selectSecondsLeft > 0
                  ? `Chọn ly: ${selectSecondsLeft}s`
                  : "Hết giờ!"}
              </span>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Play button */}
        {(phase === "IDLE" || phase === "RESULT") && (
          <div className="absolute inset-x-0 bottom-4 flex justify-center z-30">
            <button
              type="button"
              onClick={startRound}
              className="flex items-center gap-2 bg-gradient-to-r from-amber-400 via-orange-400 to-amber-500 hover:from-amber-300 hover:to-orange-400 text-white font-bold uppercase tracking-wider px-6 py-3 rounded-2xl shadow-lg hover:shadow-amber-400/40 transition-all text-sm border-t border-white/40"
            >
              <FiPlay className="w-4 h-4 fill-white" />
              <span>
                {phase === "RESULT" ? "Vòng kế tiếp" : "Chơi"}
              </span>
            </button>
          </div>
        )}

        {/* Game Over overlay */}
        <AnimatePresence>
          {phase === "GAME_OVER" && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-amber-50/95 flex flex-col items-center justify-center p-6 text-center backdrop-blur-md z-40 rounded-3xl border border-rose-200"
            >
              <div className="w-14 h-14 rounded-full bg-rose-100 border border-rose-200 text-rose-500 flex items-center justify-center mb-3 shadow-sm">
                <FiXCircle className="w-8 h-8" />
              </div>
              <h2 className="text-2xl font-extrabold text-slate-900 mb-1">
                Game Over
              </h2>
              <p className="text-xs text-slate-500 mb-4 flex items-center justify-center gap-2">
                <span>
                  Cấp đạt{" "}
                  <span className="text-amber-600 font-bold">Lv {stats.level}</span>
                </span>
                {stats.highScore > 1 && (
                  <>
                    <span className="text-slate-300">·</span>
                    <span className="flex items-center gap-1 text-slate-700 font-bold">
                      <span aria-hidden="true">🏆</span>
                      <span className="tabular-nums">Lv {stats.highScore}</span>
                    </span>
                  </>
                )}
              </p>
              <button
                type="button"
                onClick={handleRestartFull}
                disabled={replayLocked}
                className="flex items-center gap-2 bg-gradient-to-r from-amber-400 to-orange-500 hover:from-amber-300 hover:to-orange-400 text-white font-bold uppercase tracking-wider px-5 py-2.5 rounded-xl shadow-md transition-all text-xs disabled:opacity-50 disabled:pointer-events-none"
              >
                <FiRotateCcw className="w-4 h-4" />
                <span>Chơi lại</span>
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
