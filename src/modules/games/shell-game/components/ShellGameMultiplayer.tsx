"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  createSeededRandom,
  generateSeed,
  getServerNow,
  lastNameOf,
  otherRole,
  PlayerAvatar,
  TURN_THINK_MS,
  useAtomicClaim,
  useCountdown,
  useFinalizeRoom,
  useSharedState,
  type MultiplayerContext,
  type PlayerColor,
  type PlayerRole,
} from "../../realtime";
import { useShellGameSettings } from "../hooks/useShellGameSettings";
import { Cup, GamePhase, SHELL_GAME_SETTINGS } from "../types";
import { getLevelConfig } from "../utils/levels";
import { sounds } from "../utils/sound";
import { GAME_THEMES } from "../utils/themes";
import { CupComponent } from "./CupComponent";

const POSITIONS = ["15%", "50%", "85%"];
const TARGET_SCORE = 3;

const defaultCups: Cup[] = [
  { id: "cup-0", originalId: "cup-0", index: 0, isLifting: false },
  { id: "cup-1", originalId: "cup-1", index: 1, isLifting: false },
  { id: "cup-2", originalId: "cup-2", index: 2, isLifting: false },
];

interface ShellState {
  round: { n: number; seed: number } | null;
  scores: { p1: number; p2: number };
  claims: Record<string, { role: "p1" | "p2"; cupId: string }>;
  /** Server-ms: hết hạn chọn ly (15s suy nghĩ). */
  selectDeadline?: number;
}

export function ShellGameMultiplayer({
  multiplayer,
}: {
  multiplayer: MultiplayerContext;
}) {
  const { roomId, role, isHost } = multiplayer;
  const isHostRef = useRef(isHost);
  useEffect(() => {
    isHostRef.current = isHost;
  }, [isHost]);
  const { data: liveSettings } = useShellGameSettings();
  const settingsRef = useRef(liveSettings ?? SHELL_GAME_SETTINGS);
  useEffect(() => {
    settingsRef.current = liveSettings ?? SHELL_GAME_SETTINGS;
  }, [liveSettings]);

  const { state, patch, init } = useSharedState<ShellState>(roomId);
  const stateRef = useRef<ShellState | null>(null);
  stateRef.current = state;
  const claim = useAtomicClaim(roomId);

  const [theme] = useState(GAME_THEMES[0]);
  const [phase, setPhase] = useState<GamePhase>("IDLE");
  const phaseRef = useRef<GamePhase>("IDLE");
  const setPhaseBoth = useCallback((p: GamePhase) => {
    phaseRef.current = p;
    setPhase(p);
  }, []);

  const [cups, setCups] = useState<Cup[]>(defaultCups);
  const [ballCupId, setBallCupId] = useState("cup-1");
  const ballCupIdRef = useRef("cup-1");
  const [selectedCupId, setSelectedCupId] = useState<string | null>(null);
  const [currentShuffleIndex, setCurrentShuffleIndex] = useState(-1);
  const [totalShuffles, setTotalShuffles] = useState(0);

  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const lastRunRoundRef = useRef(-1);
  const resolvedRoundRef = useRef(-1);
  const initializedRef = useRef(false);

  const clearTimers = useCallback(() => {
    timersRef.current.forEach(clearTimeout);
    timersRef.current = [];
  }, []);
  const later = useCallback((fn: () => void, ms: number) => {
    const t = setTimeout(fn, ms);
    timersRef.current.push(t);
  }, []);

  useEffect(() => () => clearTimers(), [clearTimers]);

  // Host seeds the very first round.
  useEffect(() => {
    if (!isHost || initializedRef.current) return;
    if (state === null) {
      initializedRef.current = true;
      init({
        round: { n: 1, seed: generateSeed() },
        scores: { p1: 0, p2: 0 },
        claims: {},
      });
    } else {
      initializedRef.current = true;
    }
  }, [isHost, state, init]);

  // Deterministic round runner (identical sequence on both clients via seed).
  const runRound = useCallback(
    (n: number, seed: number) => {
      clearTimers();
      const rng = createSeededRandom(seed);
      const cupIds = ["cup-0", "cup-1", "cup-2"];
      const ball = cupIds[Math.floor(rng() * 3)];
      setBallCupId(ball);
      ballCupIdRef.current = ball;
      setSelectedCupId(null);
      setCups(defaultCups.map((c) => ({ ...c, isLifting: false })));
      setPhaseBoth("REVEALING");

      const s = settingsRef.current;
      const reveal = s.revealDurationMs;
      const cover = s.coverDurationMs;

      later(() => {
        sounds.playLift();
        setCups((prev) =>
          prev.map((c) =>
            c.originalId === ball ? { ...c, isLifting: true } : c
          )
        );
      }, 400);

      later(() => {
        sounds.playLower();
        setCups((prev) => prev.map((c) => ({ ...c, isLifting: false })));
        setPhaseBoth("COVERING");
      }, 400 + reveal);

      later(() => {
        setPhaseBoth("SHUFFLING");
        const config = getLevelConfig(Math.min(8, n), settingsRef.current);
        setTotalShuffles(config.shufflesCount);
        setCups([...defaultCups]);
        let step = 0;
        const swap = () => {
          if (step >= config.shufflesCount) {
            setCurrentShuffleIndex(-1);
            setPhaseBoth("SELECTING");
            if (isHostRef.current) {
              patch({ selectDeadline: getServerNow() + TURN_THINK_MS });
            }
            return;
          }
          const from = Math.floor(rng() * 3);
          let to = Math.floor(rng() * 3);
          while (to === from) to = Math.floor(rng() * 3);
          sounds.playShuffle();
          setCurrentShuffleIndex(step);
          setCups((prev) =>
            prev.map((cup) => {
              if (cup.index === from) return { ...cup, index: to };
              if (cup.index === to) return { ...cup, index: from };
              return cup;
            })
          );
          step++;
          later(swap, config.speedMs);
        };
        swap();
      }, 400 + reveal + cover);
    },
    [clearTimers, later, patch, setPhaseBoth]
  );

  // Trigger the runner whenever a new round number appears.
  useEffect(() => {
    const r = state?.round;
    if (!r) return;
    if (lastRunRoundRef.current === r.n) return;
    lastRunRoundRef.current = r.n;
    runRound(r.n, r.seed);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state?.round?.n]);

  const roundN = state?.round?.n ?? 0;
  const roundClaim = roundN ? state?.claims?.[roundN] : undefined;
  const selectDeadline = state?.selectDeadline ?? null;
  const selectSeconds = useCountdown(
    phase === "SELECTING" ? selectDeadline : null
  );

  const timedOutSelectRef = useRef<number | null>(null);
  useEffect(() => {
    if (!isHost || phase !== "SELECTING" || !selectDeadline || !roundN) return;
    if (roundClaim) return;

    const check = () => {
      if (getServerNow() < selectDeadline) return;
      if (timedOutSelectRef.current === selectDeadline) return;
      timedOutSelectRef.current = selectDeadline;
      const sc = stateRef.current?.scores ?? { p1: 0, p2: 0 };
      if ((sc.p1 ?? 0) >= TARGET_SCORE || (sc.p2 ?? 0) >= TARGET_SCORE) {
        return;
      }
      patch({
        round: { n: roundN + 1, seed: generateSeed() },
        selectDeadline: 0,
      });
    };
    check();
    const id = setInterval(check, 250);
    return () => clearInterval(id);
  }, [isHost, phase, selectDeadline, roundN, roundClaim, patch]);

  // Reveal + resolve once the round has been claimed by either player.
  useEffect(() => {
    if (!roundClaim || !roundN) return;
    if (resolvedRoundRef.current === roundN) return;
    resolvedRoundRef.current = roundN;
    clearTimers();
    setSelectedCupId(roundClaim.cupId);
    setPhaseBoth("RESULT");
    setCups((prev) =>
      prev.map((c) =>
        c.id === roundClaim.cupId || c.originalId === ballCupIdRef.current
          ? { ...c, isLifting: true }
          : c
      )
    );
    const correct = roundClaim.cupId === ballCupIdRef.current;
    sounds.playLift();
    if (correct) sounds.playCorrect();
    else sounds.playIncorrect();

    if (isHost) {
      const t = setTimeout(() => {
        const sc = stateRef.current?.scores ?? { p1: 0, p2: 0 };
        if ((sc.p1 ?? 0) < TARGET_SCORE && (sc.p2 ?? 0) < TARGET_SCORE) {
          patch({ round: { n: roundN + 1, seed: generateSeed() } });
        }
      }, 2200);
      timersRef.current.push(t);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roundClaim, roundN]);

  const handleSelectCup = useCallback(
    async (cupId: string) => {
      if (phaseRef.current !== "SELECTING") return;
      const n = stateRef.current?.round?.n;
      if (!n) return;
      const won = await claim(`claims/${n}`, { role, cupId });
      if (won) {
        const correct = cupId === ballCupIdRef.current;
        const scores = {
          ...(stateRef.current?.scores ?? { p1: 0, p2: 0 }),
        };
        const beneficiary = correct ? role : otherRole(role);
        scores[beneficiary] = (scores[beneficiary] ?? 0) + 1;
        patch({ scores });
      }
    },
    [claim, patch, role]
  );

  const scores = state?.scores ?? { p1: 0, p2: 0 };
  const myScore = scores[role] ?? 0;
  const oppScore = scores[otherRole(role)] ?? 0;
  const finished =
    (scores.p1 ?? 0) >= TARGET_SCORE || (scores.p2 ?? 0) >= TARGET_SCORE;
  const iWon = finished && myScore > oppScore;

  const finalWinnerRole: PlayerRole | "draw" | null = finished
    ? scores.p1 > scores.p2
      ? "p1"
      : scores.p2 > scores.p1
        ? "p2"
        : "draw"
    : null;
  useFinalizeRoom({ roomId, isHost, winnerRole: finalWinnerRole });

  const progress =
    currentShuffleIndex === -1 || totalShuffles === 0
      ? 0
      : Math.floor((currentShuffleIndex / totalShuffles) * 100);

  return (
    <div className="mx-auto w-full max-w-3xl">
      {/* Scoreboard */}
      <div className="mb-2 flex flex-col items-center gap-1">
        <div className="flex items-center justify-center gap-4 text-white">
          <ScoreChip
            label="Bạn"
            name={lastNameOf(multiplayer.self.name)}
            color={multiplayer.self.color}
            avatarUrl={multiplayer.self.avatarUrl}
            score={myScore}
          />
          <span className="text-sm font-black text-white/60 tabular-nums">
            {phase === "SELECTING" && selectSeconds != null ? (
              <span
                className={
                  selectSeconds <= 5 ? "text-rose-300" : "text-amber-200"
                }
              >
                {selectSeconds > 0 ? `${selectSeconds}s` : "Hết giờ!"}
              </span>
            ) : (
              "VS"
            )}
          </span>
          <ScoreChip
            label="Đối thủ"
            name={lastNameOf(multiplayer.opponent.name)}
            color={multiplayer.opponent.color}
            avatarUrl={multiplayer.opponent.avatarUrl}
            score={oppScore}
          />
        </div>
        <p className="text-[11px] font-medium text-white/50">
          Ai {TARGET_SCORE} điểm trước thắng
        </p>
      </div>

      <div
        className={`relative h-[clamp(480px,72vh,620px)] overflow-hidden rounded-3xl border-2 border-amber-300/70 bg-gradient-to-b p-3 shadow-xl sm:border-4 sm:p-4 md:p-6 ${theme.tableBg}`}
      >
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.7)_0%,transparent_70%)]" />
        <div
          className={`absolute inset-3 rounded-[1.8rem] border border-dashed ${theme.feltColor}`}
        />

        <div className="absolute inset-x-0 bottom-4 top-10 md:top-12">
          {cups.map((cup) => {
            let isCorrectResult: boolean | null = null;
            if (phase === "RESULT") {
              isCorrectResult = cup.originalId === ballCupId;
            }
            return (
              <CupComponent
                key={cup.id}
                cup={cup}
                hasBall={cup.originalId === ballCupId}
                theme={theme}
                isSelectable={phase === "SELECTING"}
                isSelected={selectedCupId === cup.id}
                isCorrect={isCorrectResult}
                positions={POSITIONS}
                onSelect={() => handleSelectCup(cup.id)}
              />
            );
          })}
        </div>

        <AnimatePresence>
          {phase === "SHUFFLING" && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className="absolute left-3 right-3 top-3 z-30"
            >
              <div className="h-1.5 w-full overflow-hidden rounded-full border border-amber-200 bg-amber-100/80 shadow-inner">
                <motion.div
                  animate={{ width: `${progress}%` }}
                  className="h-full rounded-full bg-gradient-to-r from-amber-500 via-orange-400 to-yellow-400"
                />
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {phase === "RESULT" && roundClaim && !finished && (
          <div className="absolute inset-x-0 top-3 z-30 flex justify-center">
            <span className="rounded-full bg-white/90 px-3 py-1 text-xs font-bold text-slate-700 shadow">
              {roundClaim.role === role
                ? roundClaim.cupId === ballCupId
                  ? "Bạn mở trúng! +1"
                  : "Bạn mở trượt!"
                : roundClaim.cupId === ballCupId
                  ? "Đối thủ mở trúng!"
                  : "Đối thủ mở trượt — bạn +1"}
            </span>
          </div>
        )}

        <AnimatePresence>
          {finished && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="absolute inset-0 z-40 flex flex-col items-center justify-center rounded-3xl bg-amber-50/95 p-6 text-center backdrop-blur-md"
            >
              <h2
                className={`mb-2 text-3xl font-black ${
                  iWon ? "text-emerald-600" : "text-rose-600"
                }`}
              >
                {iWon ? "🏆 Bạn thắng!" : "Bạn thua!"}
              </h2>
              <p className="text-sm font-semibold text-slate-600">
                {myScore} - {oppScore}
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

function ScoreChip({
  label,
  name,
  color,
  avatarUrl,
  score,
}: {
  label: string;
  name: string;
  color: PlayerColor;
  avatarUrl: string | null;
  score: number;
}) {
  return (
    <div className="flex items-center gap-2 rounded-xl bg-white/10 px-3 py-1.5">
      <PlayerAvatar name={name} color={color} avatarUrl={avatarUrl} size={36} />
      <div className="text-left">
        <div className="text-[10px] uppercase tracking-wide text-white/60">
          {label}
        </div>
        <div className="max-w-[90px] truncate text-xs font-bold leading-tight text-white/90">
          {name}
        </div>
        <div className="text-lg font-black leading-none">{score}</div>
      </div>
    </div>
  );
}
