"use client";

import { ChangeEvent, useEffect, useRef, useState } from "react";
import {
  LuClock,
  LuHourglass,
  LuImage,
  LuShuffle,
  LuUpload,
  LuX,
} from "react-icons/lu";
import {
  SlidingPuzzleDifficulty,
  SlidingPuzzleHighScore,
  SlidingPuzzleStatus,
  SlidingPuzzleTile,
} from "../types";
import { useClassPuzzleImages } from "../hooks/useClassPuzzleImages";
import { slidingPuzzleAudio } from "../utils/audio";
import Leaderboard from "./Leaderboard";
import PuzzleBoard from "./PuzzleBoard";
import VictoryModal from "./VictoryModal";
import type { MultiplayerGameProps } from "../../realtime";
import { SlidingPuzzleMultiplayer } from "./SlidingPuzzleMultiplayer";
import { UserBreadBadge } from "../../components/UserBreadBadge";

const SIZE = 3;
const SCORES_STORAGE_KEY = "breadtrans.sliding_puzzle.scores";

const DIFFICULTY_OPTIONS: {
  id: SlidingPuzzleDifficulty;
  label: string;
  sub: string;
}[] = [
  { id: "easy", label: "Dễ", sub: "6 phút" },
  { id: "medium", label: "Vừa", sub: "2 phút" },
  { id: "hard", label: "Khó", sub: "30s" },
];

// Số bánh thắng được theo độ khó (đồng bộ với src/lib/games/rewards.ts).
const DIFFICULTY_BREAD: Record<SlidingPuzzleDifficulty, number> = {
  easy: 2,
  medium: 5,
  hard: 8,
};
const BREAD_IMAGE = "/assets/images/dorayaki.png";

const getDifficultyTimeLimit = (diff: SlidingPuzzleDifficulty) => {
  switch (diff) {
    case "easy":
      return 360;
    case "medium":
      return 120;
    case "hard":
      return 30;
  }
};

const createScoreId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;

const dedupeScoresById = (scores: SlidingPuzzleHighScore[]) => {
  const seen = new Set<string>();
  return scores.filter((score) => {
    if (seen.has(score.id)) return false;
    seen.add(score.id);
    return true;
  });
};

const FALLBACK_IMAGE = "/assets/images/doraemon.png";

export default function SlidingPuzzle({
  multiplayer,
  soloMode,
  onRankedStart,
  onSoloResult,
  replayLocked,
}: MultiplayerGameProps = {}) {
  if (multiplayer) {
    return <SlidingPuzzleMultiplayer multiplayer={multiplayer} />;
  }
  return (
    <SlidingPuzzleSolo
      soloMode={soloMode}
      onRankedStart={onRankedStart}
      onSoloResult={onSoloResult}
      replayLocked={replayLocked}
    />
  );
}

function SlidingPuzzleSolo({
  soloMode,
  onRankedStart,
  onSoloResult,
  replayLocked = false,
}: Pick<
  MultiplayerGameProps,
  "soloMode" | "onRankedStart" | "onSoloResult" | "replayLocked"
>) {
  const isRanked = soloMode === "ranked";
  // Ranked nhiều ván: mỗi ván chọn độ khó để tiêu 1 vé.
  // rankedNeedsDifficulty: đang chờ chọn độ khó (chưa bắt đầu ván).
  // rankedPaidRound = ván hiện tại đã tiêu vé (tính bánh).
  const [rankedNeedsDifficulty, setRankedNeedsDifficulty] = useState(isRanked);
  const [rankedPaidRound, setRankedPaidRound] = useState(false);
  const [rankedStarting, setRankedStarting] = useState(false);
  const rankedPaidRoundRef = useRef(false);
  const { images: classImages, isLoading: isLoadingClassImages } =
    useClassPuzzleImages();

  const [difficulty, setDifficulty] = useState<SlidingPuzzleDifficulty>("medium");
  const [selectedImageUrl, setSelectedImageUrl] =
    useState<string>(FALLBACK_IMAGE);

  const [tiles, setTiles] = useState<SlidingPuzzleTile[]>([]);
  const [timeRemaining, setTimeRemaining] = useState<number>(120);
  const [gameStatus, setGameStatus] = useState<SlidingPuzzleStatus>("idle");

  const showNumbersOnPicture =
    difficulty === "easy" && gameStatus === "playing";

  const [isVictoryModalOpen, setIsVictoryModalOpen] = useState(false);
  const [isDifficultyModalOpen, setIsDifficultyModalOpen] = useState(isRanked);
  const [highScores, setHighScores] = useState<SlidingPuzzleHighScore[]>([]);

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const solveIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const difficultyRef = useRef<SlidingPuzzleDifficulty>("medium");
  const hasAutoPickedImageRef = useRef(false);
  const scoreSavedForRoundRef = useRef(false);
  const soloResultSentRef = useRef(false);
  const gameStatusRef = useRef<SlidingPuzzleStatus>("idle");
  const onSoloResultRef = useRef(onSoloResult);
  const rankedStartingRef = useRef(false);

  useEffect(() => {
    rankedPaidRoundRef.current = rankedPaidRound;
  }, [rankedPaidRound]);

  const emitSoloResult = (won: boolean, diff: SlidingPuzzleDifficulty) => {
    if (
      !rankedPaidRoundRef.current ||
      soloResultSentRef.current ||
      !onSoloResultRef.current
    )
      return;
    soloResultSentRef.current = true;
    onSoloResultRef.current({ won, difficulty: diff });
  };

  useEffect(() => {
    gameStatusRef.current = gameStatus;
  }, [gameStatus]);

  useEffect(() => {
    onSoloResultRef.current = onSoloResult;
  }, [onSoloResult]);

  useEffect(() => {
    return () => {
      if (
        !rankedPaidRoundRef.current ||
        soloResultSentRef.current ||
        !onSoloResultRef.current ||
        gameStatusRef.current !== "playing"
      ) {
        return;
      }
      soloResultSentRef.current = true;
      onSoloResultRef.current({
        won: false,
        difficulty: difficultyRef.current,
      });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    difficultyRef.current = difficulty;
  }, [difficulty]);

  useEffect(() => {
    slidingPuzzleAudio.toggle(true);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const savedScores = localStorage.getItem(SCORES_STORAGE_KEY);
      if (savedScores) {
        const parsed = JSON.parse(savedScores) as SlidingPuzzleHighScore[];
        const unique = dedupeScoresById(parsed);
        setHighScores(unique);
        if (unique.length !== parsed.length) {
          localStorage.setItem(SCORES_STORAGE_KEY, JSON.stringify(unique));
        }
      }
    } catch {
      // ignore
    }
  }, []);

  /** Khi avatar lớp tải xong lần đầu, chọn ngẫu nhiên 1 avatar làm ảnh mặc định. */
  useEffect(() => {
    if (hasAutoPickedImageRef.current) return;
    if (classImages.length === 0) return;
    const random = classImages[Math.floor(Math.random() * classImages.length)];
    setSelectedImageUrl(random.url);
    hasAutoPickedImageRef.current = true;
  }, [classImages]);

  const stopTimer = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  const clearSolveInterval = () => {
    if (solveIntervalRef.current) {
      clearInterval(solveIntervalRef.current);
      solveIntervalRef.current = null;
    }
  };

  const createSolvedTiles = (): SlidingPuzzleTile[] => {
    const newTiles: SlidingPuzzleTile[] = [];
    const tileCount = SIZE * SIZE;

    for (let i = 0; i < tileCount; i++) {
      const row = Math.floor(i / SIZE);
      const col = i % SIZE;

      newTiles.push({
        id: i,
        value: i + 1,
        correctRow: row,
        correctCol: col,
        currentRow: row,
        currentCol: col,
        isEmpty: i === tileCount - 1,
      });
    }

    return newTiles;
  };

  const initializeSolvedBoard = (diff: SlidingPuzzleDifficulty) => {
    setTiles(createSolvedTiles());
    setTimeRemaining(getDifficultyTimeLimit(diff));
    setGameStatus("idle");
    scoreSavedForRoundRef.current = false;
    clearSolveInterval();
  };

  useEffect(() => {
    // Ở chế độ ranked: chỉ dựng bàn đã giải (idle) chờ người chơi chọn độ khó
    // để tiêu vé; không tự bắt đầu.
    initializeSolvedBoard("medium");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Chọn độ khó ⇒ tiêu 1 vé rồi xáo trộn để bắt đầu một ván tính bánh.
  // Hết vé (ok=false) ⇒ vẫn chơi nhưng là ván tập luyện (không tính bánh).
  const startRankedRound = async (d: SlidingPuzzleDifficulty) => {
    if (!onRankedStart || rankedStartingRef.current || replayLocked) return;
    rankedStartingRef.current = true;
    setRankedStarting(true);
    try {
      const ok = await onRankedStart(d);
      setRankedPaidRound(ok);
      rankedPaidRoundRef.current = ok;
      setRankedNeedsDifficulty(false);
      setDifficulty(d);
      difficultyRef.current = d;
      soloResultSentRef.current = false;
      handleShuffle(d);
    } finally {
      rankedStartingRef.current = false;
      setRankedStarting(false);
    }
  };

  useEffect(() => {
    return () => {
      stopTimer();
      clearSolveInterval();
    };
  }, []);

  const timerPausedForDifficultyPick =
    isRanked &&
    (rankedNeedsDifficulty || rankedStarting || isDifficultyModalOpen);

  useEffect(() => {
    if (gameStatus === "playing" && !timerPausedForDifficultyPick) {
      stopTimer();
      timerRef.current = setInterval(() => {
        setTimeRemaining((prev) => {
          if (prev <= 1) {
            stopTimer();
            setGameStatus("lost");
            clearSolveInterval();
            slidingPuzzleAudio.playLost();
            emitSoloResult(false, difficultyRef.current);
            setIsVictoryModalOpen(true);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    } else {
      stopTimer();
    }
    return () => {
      stopTimer();
    };
  }, [gameStatus, timerPausedForDifficultyPick]);

  const saveScore = (timeRem: number, timeSpnt: number) => {
    if (scoreSavedForRoundRef.current) return;
    scoreSavedForRoundRef.current = true;

    const newScore: SlidingPuzzleHighScore = {
      id: createScoreId(),
      difficulty: difficultyRef.current,
      timeRemaining: timeRem,
      timeSpent: timeSpnt,
      date: new Date().toISOString(),
    };

    setHighScores((prev) => {
      const updated = [newScore, ...prev];
      try {
        localStorage.setItem(SCORES_STORAGE_KEY, JSON.stringify(updated));
      } catch {
        // ignore
      }
      return updated;
    });
  };

  const handleClearScores = () => {
    setHighScores([]);
    try {
      localStorage.removeItem(SCORES_STORAGE_KEY);
    } catch {
      // ignore
    }
  };

  const handleShuffle = (nextDifficulty?: SlidingPuzzleDifficulty) => {
    const activeDifficulty = nextDifficulty ?? difficulty;

    if (
      isRanked &&
      nextDifficulty &&
      nextDifficulty !== difficultyRef.current &&
      gameStatusRef.current === "playing"
    ) {
      emitSoloResult(false, difficultyRef.current);
      return;
    }

    if (nextDifficulty) {
      setDifficulty(nextDifficulty);
      difficultyRef.current = nextDifficulty;
    }

    slidingPuzzleAudio.playClick();
    clearSolveInterval();

    const currentTiles =
      tiles.length > 0 ? [...tiles] : createSolvedTiles();
    currentTiles.forEach((t) => {
      t.currentRow = t.correctRow;
      t.currentCol = t.correctCol;
    });

    const getAdjacentIndexes = (emptyRow: number, emptyCol: number) => {
      const neighbors: { r: number; c: number }[] = [];
      if (emptyRow > 0) neighbors.push({ r: emptyRow - 1, c: emptyCol });
      if (emptyRow < SIZE - 1) neighbors.push({ r: emptyRow + 1, c: emptyCol });
      if (emptyCol > 0) neighbors.push({ r: emptyRow, c: emptyCol - 1 });
      if (emptyCol < SIZE - 1) neighbors.push({ r: emptyRow, c: emptyCol + 1 });
      return neighbors;
    };

    const emptyTile = currentTiles.find((t) => t.isEmpty)!;
    let lastSwappedId = -1;
    const totalMixSteps = 85;

    for (let step = 0; step < totalMixSteps; step++) {
      const adjacents = getAdjacentIndexes(
        emptyTile.currentRow,
        emptyTile.currentCol
      );
      let candidates = adjacents
        .map(
          (pos) =>
            currentTiles.find(
              (t) => t.currentRow === pos.r && t.currentCol === pos.c
            )!
        )
        .filter((t) => t.id !== lastSwappedId);

      if (candidates.length === 0) {
        candidates = adjacents.map(
          (pos) =>
            currentTiles.find(
              (t) => t.currentRow === pos.r && t.currentCol === pos.c
            )!
        );
      }

      const randomTile =
        candidates[Math.floor(Math.random() * candidates.length)];

      const tempRow = emptyTile.currentRow;
      const tempCol = emptyTile.currentCol;
      emptyTile.currentRow = randomTile.currentRow;
      emptyTile.currentCol = randomTile.currentCol;
      randomTile.currentRow = tempRow;
      randomTile.currentCol = tempCol;

      lastSwappedId = randomTile.id;
    }

    setTiles([...currentTiles]);
    setTimeRemaining(getDifficultyTimeLimit(activeDifficulty));
    setGameStatus("playing");
    scoreSavedForRoundRef.current = false;

    slidingPuzzleAudio.playShuffle();
  };

  const checkWinCondition = (currentTiles: SlidingPuzzleTile[]) => {
    const won = currentTiles.every(
      (t) => t.currentRow === t.correctRow && t.currentCol === t.correctCol
    );
    if (won) {
      setGameStatus("won");
      stopTimer();
      clearSolveInterval();
      slidingPuzzleAudio.playWin();

      const totalTimeLimit = getDifficultyTimeLimit(difficulty);
      const timeSpent = totalTimeLimit - timeRemaining;
      saveScore(timeRemaining, timeSpent);
      emitSoloResult(true, difficulty);
      setIsVictoryModalOpen(true);
    }
  };

  const handleTileClick = (clickedTile: SlidingPuzzleTile) => {
    if (gameStatus !== "playing") return;

    const currentTiles = [...tiles];
    const emptyTile = currentTiles.find((t) => t.isEmpty)!;

    const rowDiff = Math.abs(clickedTile.currentRow - emptyTile.currentRow);
    const colDiff = Math.abs(clickedTile.currentCol - emptyTile.currentCol);

    if ((rowDiff === 1 && colDiff === 0) || (rowDiff === 0 && colDiff === 1)) {
      const tempRow = clickedTile.currentRow;
      const tempCol = clickedTile.currentCol;

      clickedTile.currentRow = emptyTile.currentRow;
      clickedTile.currentCol = emptyTile.currentCol;

      emptyTile.currentRow = tempRow;
      emptyTile.currentCol = tempCol;

      setTiles(currentTiles);
      slidingPuzzleAudio.playSlide();

      checkWinCondition(currentTiles);
    }
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (gameStatus !== "playing") return;

      const emptyTile = tiles.find((t) => t.isEmpty);
      if (!emptyTile) return;

      let targetRow = emptyTile.currentRow;
      let targetCol = emptyTile.currentCol;

      const key = e.key.toLowerCase();

      if (key === "arrowup" || key === "w") {
        targetRow += 1;
      } else if (key === "arrowdown" || key === "s") {
        targetRow -= 1;
      } else if (key === "arrowleft" || key === "a") {
        targetCol += 1;
      } else if (key === "arrowright" || key === "d") {
        targetCol -= 1;
      } else {
        return;
      }

      if (
        targetRow >= 0 &&
        targetRow < SIZE &&
        targetCol >= 0 &&
        targetCol < SIZE
      ) {
        const targetTile = tiles.find(
          (t) => t.currentRow === targetRow && t.currentCol === targetCol
        );
        if (targetTile) {
          e.preventDefault();
          handleTileClick(targetTile);
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tiles, gameStatus]);

  const handleImageUpload = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      slidingPuzzleAudio.playClick();
      const reader = new FileReader();
      reader.onload = (event) => {
        if (event.target?.result) {
          setSelectedImageUrl(event.target.result as string);
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const formatTime = (secs: number) => {
    const mins = Math.floor(secs / 60);
    const remainingSecs = secs % 60;
    return `${mins}:${remainingSecs.toString().padStart(2, "0")}`;
  };

  const isTimeCritical = timeRemaining <= 10 && gameStatus === "playing";

  return (
    <div className="w-full max-w-3xl mx-auto bg-sky-50 text-slate-800 rounded-3xl border border-sky-200 overflow-hidden shadow-sm">
      <main className="px-4 sm:px-6 py-5 space-y-5">
        <header className="flex items-center justify-between gap-2">
          <div className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-white border border-sky-200 shadow-sm">
            {gameStatus === "playing" ? (
              <>
                <LuClock
                  className={`w-5 h-5 ${
                    isTimeCritical
                      ? "text-rose-500 animate-pulse"
                      : "text-sky-500"
                  }`}
                />
                <span
                  className={`text-xl font-mono font-bold leading-none tabular-nums ${
                    isTimeCritical ? "text-rose-600" : "text-slate-800"
                  }`}
                >
                  {formatTime(timeRemaining)}
                </span>
              </>
            ) : (
              <LuHourglass className="w-5 h-5 text-sky-500" />
            )}
          </div>

          <UserBreadBadge variant="light" />
        </header>

        <section className="flex flex-col items-center">
          <PuzzleBoard
            tiles={tiles}
            status={gameStatus}
            selectedImageUrl={selectedImageUrl}
            showNumbersOnPicture={showNumbersOnPicture}
            onTileClick={handleTileClick}
          />

          <div className="mt-5 flex flex-wrap gap-2 justify-center w-full max-w-[420px] sm:max-w-[300px]">
            {gameStatus === "playing" ? (
              <button
                type="button"
                onClick={() => {
                  slidingPuzzleAudio.playClick();
                  if (isRanked) {
                    emitSoloResult(false, difficultyRef.current);
                    stopTimer();
                    clearSolveInterval();
                    setGameStatus("lost");
                    setIsVictoryModalOpen(true);
                    return;
                  }
                  initializeSolvedBoard(difficulty);
                }}
                className="flex-1 min-w-[160px] flex items-center justify-center gap-2 py-3 px-5 text-white bg-rose-500 hover:bg-rose-600 font-semibold text-sm rounded-xl cursor-pointer transition shadow-md active:scale-95"
              >
                <LuX className="w-4 h-4" />
                <span>{isRanked ? "Bỏ cuộc" : "Kết thúc"}</span>
              </button>
            ) : (
              <button
                type="button"
                disabled={rankedStarting || replayLocked}
                onClick={() => {
                  if (replayLocked) return;
                  slidingPuzzleAudio.playClick();
                  setIsDifficultyModalOpen(true);
                }}
                className="flex-1 min-w-[160px] flex items-center justify-center gap-2 py-3 px-5 text-white bg-sky-500 hover:bg-sky-600 font-semibold text-sm rounded-xl cursor-pointer transition shadow-md active:scale-95 disabled:opacity-60 disabled:cursor-not-allowed"
              >
                <LuShuffle className="w-4 h-4" />
                <span>
                  {rankedStarting
                    ? "Đang dùng vé…"
                    : isRanked
                      ? "Chọn độ khó & dùng vé"
                      : gameStatus === "idle"
                        ? "Bắt đầu"
                        : "Chơi lại"}
                </span>
              </button>
            )}
          </div>

          {isRanked && gameStatus !== "playing" && !rankedStarting && (
            <p className="mt-3 text-center text-xs font-medium text-amber-700">
               Hết vé sẽ tự chuyển sang chơi tập luyện.
            </p>
          )}

          {isRanked && gameStatus === "playing" && !rankedPaidRound && (
            <p className="mt-3 text-center text-xs font-medium text-slate-500">
              Hết vé — đang chơi tập luyện (không tính bánh).
            </p>
          )}

          {gameStatus === "playing" && (
            <div className="mt-4 flex flex-col items-center gap-1.5">
             
              <div className="w-24 h-24 rounded-lg overflow-hidden border-2 border-sky-200 shadow-sm">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={selectedImageUrl}
                  alt="Ảnh mẫu"
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-cover"
                />
              </div>
            </div>
          )}
        </section>

        {gameStatus !== "playing" && (
          <section className="bg-white rounded-xl border border-sky-200 p-2.5">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-1.5">
                <LuImage className="w-3.5 h-3.5 text-sky-500" />
                <h3 className="font-semibold text-xs text-slate-800">
                  Chọn ảnh
                </h3>
              </div>
              <span className="text-[10px] text-slate-400">
                {classImages.length > 0
                  ? `${classImages.length} bạn`
                  : isLoadingClassImages
                    ? "Đang tải…"
                    : "Tải ảnh"}
              </span>
            </div>

            <div className="grid grid-cols-6 sm:grid-cols-8 gap-1.5">
              {classImages.map((img) => {
                const isActive = selectedImageUrl === img.url;
                return (
                  <button
                    key={img.id}
                    type="button"
                    onClick={() => {
                      slidingPuzzleAudio.playClick();
                      setSelectedImageUrl(img.url);
                    }}
                    title={img.name}
                    className={`group relative aspect-square rounded-lg overflow-hidden border transition-all ${
                      isActive
                        ? "border-amber-400 ring-1 ring-amber-200"
                        : "border-sky-100 hover:border-sky-300"
                    }`}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={img.url}
                      alt={img.name}
                      referrerPolicy="no-referrer"
                      className="w-full h-full object-cover transition duration-300 group-hover:scale-105"
                    />
                  </button>
                );
              })}

              <label className="relative aspect-square rounded-lg overflow-hidden border border-dashed border-sky-300 bg-sky-50 hover:bg-sky-100 flex flex-col items-center justify-center cursor-pointer transition">
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleImageUpload}
                  className="hidden"
                />
                <LuUpload className="w-3 h-3 text-sky-500 mb-0.5" />
                <span className="text-[9px] font-semibold text-sky-600">
                  Tải
                </span>
              </label>
            </div>
          </section>
        )}

        {gameStatus !== "playing" && (
          <Leaderboard scores={highScores} onClearScores={handleClearScores} />
        )}
      </main>

      {isDifficultyModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4"
          onClick={() => setIsDifficultyModalOpen(false)}
        >
          <div
            className="w-full max-w-xs bg-white rounded-3xl border border-sky-200 shadow-xl p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-center font-bold text-base text-slate-800 mb-1">
              Chọn mức độ
            </h3>
            
            <div className="grid grid-cols-1 gap-2">
              {DIFFICULTY_OPTIONS.map((level) => (
                <button
                  key={level.id}
                  type="button"
                  onClick={() => {
                    setIsDifficultyModalOpen(false);
                    if (isRanked) {
                      void startRankedRound(level.id);
                    } else {
                      handleShuffle(level.id);
                    }
                  }}
                  className="flex items-center justify-between px-4 py-3 rounded-xl border border-sky-200 bg-white hover:bg-sky-50 hover:border-sky-400 transition active:scale-95"
                >
                  <span className="flex flex-col items-start">
                    <span className="font-semibold text-sm text-slate-800">
                      {level.label}
                    </span>
                    
                  </span>
                  {isRanked && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-1 text-xs font-bold text-amber-700 ring-1 ring-amber-200">
                      +{DIFFICULTY_BREAD[level.id]}
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={BREAD_IMAGE}
                        alt="bánh"
                        className="h-4 w-4 object-contain"
                      />
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      <VictoryModal
        isOpen={isVictoryModalOpen}
        onClose={() => setIsVictoryModalOpen(false)}
        timeSpent={getDifficultyTimeLimit(difficulty) - timeRemaining}
        timeRemaining={timeRemaining}
        difficulty={difficulty}
        isWin={gameStatus === "won"}
        imageUrl={selectedImageUrl}
        onRestart={() => {
          setIsVictoryModalOpen(false);
          stopTimer();
          clearSolveInterval();
          if (isRanked) {
            setRankedNeedsDifficulty(true);
            setRankedPaidRound(false);
            rankedPaidRoundRef.current = false;
            soloResultSentRef.current = false;
            initializeSolvedBoard(difficulty);
          }
          setIsDifficultyModalOpen(true);
        }}
      />
    </div>
  );
}
