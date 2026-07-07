"use client";

import { useEffect, useRef, useState } from "react";
import {
  FiAward,
  FiCalendar,
  FiMaximize2,
  FiMinus,
  FiPlus,
} from "react-icons/fi";
import { useCaroSettings } from "../hooks/useCaroSettings";
import {
  CARO_ZOOM_MAX,
  CARO_ZOOM_MIN,
  CARO_ZOOM_STEP,
  clampCaroZoom,
} from "../utils/zoom";
import {
  BoardState,
  CARO_SETTINGS,
  CaroSettings,
  Difficulty,
  GameHistory,
  GameMode,
  GameStatus,
  Move,
  Position,
  WinningLine,
} from "../types";
import { checkDraw, checkWin, getBestMove } from "../utils/ai";
import { sounds } from "../utils/sounds";
import "./caro.css";
import CaroBoard from "./CaroBoard";
import CaroDashboard from "./CaroDashboard";
import { UserBreadBadge } from "../../components/UserBreadBadge";
import { TimeoutResultModal } from "../../components/TimeoutResultModal";
import { TURN_THINK_MS, type MultiplayerGameProps } from "../../realtime";
import { CaroMultiplayer } from "./CaroMultiplayer";

const SCORES_STORAGE_KEY = "breadtrans.caro.scores";
const JOURNAL_STORAGE_KEY = "breadtrans.caro.journal";

// Số bánh thắng được theo độ khó (đồng bộ với src/lib/games/rewards.ts).
const DIFFICULTY_BREAD: Record<Difficulty, number> = {
  easy: 2,
  medium: 5,
  hard: 8,
};
const BREAD_IMAGE = "/assets/images/dorayaki.png";

const createEmptyBoard = (size: number): BoardState =>
  Array(size)
    .fill(null)
    .map(() => Array<null>(size).fill(null));

const formatDate = (): string =>
  new Date().toLocaleDateString("vi-VN", {
    hour: "2-digit",
    minute: "2-digit",
    day: "2-digit",
    month: "2-digit",
  });

interface ScoreState {
  xWins: number;
  oWins: number;
  draws: number;
}

const initialScores: ScoreState = { xWins: 0, oWins: 0, draws: 0 };

export default function Caro({
  multiplayer,
  soloMode,
  onRankedStart,
  onSoloResult,
  replayLocked,
}: MultiplayerGameProps = {}) {
  if (multiplayer) {
    return <CaroMultiplayer multiplayer={multiplayer} />;
  }
  return (
    <CaroSolo
      soloMode={soloMode}
      onRankedStart={onRankedStart}
      onSoloResult={onSoloResult}
      replayLocked={replayLocked}
    />
  );
}

function CaroSolo({
  soloMode,
  onRankedStart,
  onSoloResult,
  replayLocked = false,
}: Pick<
  MultiplayerGameProps,
  "soloMode" | "onRankedStart" | "onSoloResult" | "replayLocked"
>) {
  const isRanked = soloMode === "ranked";
  // Ranked nhiều ván: mỗi ván phải chọn độ khó để tiêu 1 vé.
  // - rankedNeedsDifficulty: đang chờ chọn độ khó (bàn cờ khoá).
  // - rankedPaidRound: ván hiện tại đã tiêu vé (tính bánh + khoá độ khó).
  const [rankedNeedsDifficulty, setRankedNeedsDifficulty] = useState(isRanked);
  const [rankedPaidRound, setRankedPaidRound] = useState(false);
  const [rankedStarting, setRankedStarting] = useState(false);
  // Popup chọn độ khó khi chơi có vé (giống SlidingPuzzle).
  const [difficultyPickerOpen, setDifficultyPickerOpen] = useState(isRanked);
  const rankedPaidRoundRef = useRef(false);
  useEffect(() => {
    rankedPaidRoundRef.current = rankedPaidRound;
  }, [rankedPaidRound]);
  const { data: liveSettings } = useCaroSettings();
  const settings: CaroSettings = liveSettings ?? CARO_SETTINGS;
  const settingsRef = useRef<CaroSettings>(settings);
  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);

  const boardSize = Math.max(5, Math.floor(settings.boardSize));

  const [board, setBoard] = useState<BoardState>(() =>
    createEmptyBoard(boardSize)
  );
  const boardSizeRef = useRef<number>(boardSize);

  // Khi admin đổi kích thước bàn cờ giữa lúc IDLE, làm mới board.
  useEffect(() => {
    if (boardSizeRef.current === boardSize) return;
    boardSizeRef.current = boardSize;
    setBoard(createEmptyBoard(boardSize));
    setMoveHistory([]);
    setWinningLine(null);
    setWinnerSymbol(null);
    setTimeoutModalOpen(false);
    setLastMove(null);
    setGameStatus("idle");
    setCurrentPlayer("X");
    setIsAiThinking(false);
  }, [boardSize]);

  const [currentPlayer, setCurrentPlayer] = useState<"X" | "O">("X");
  const [gameMode, setGameMode] = useState<GameMode>("PvE");
  const [difficulty, setDifficulty] = useState<Difficulty>("medium");
  const [blockTwoEnds, setBlockTwoEnds] = useState<boolean>(false);

  const [gameStatus, setGameStatus] = useState<GameStatus>("idle");
  const [winningLine, setWinningLine] = useState<WinningLine | null>(null);
  const [winnerSymbol, setWinnerSymbol] = useState<"X" | "O" | null>(null);
  const [lastMove, setLastMove] = useState<Position | null>(null);
  const [isAiThinking, setIsAiThinking] = useState<boolean>(false);
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
  const [timeoutModalOpen, setTimeoutModalOpen] = useState<boolean>(false);

  const [moveHistory, setMoveHistory] = useState<Move[]>([]);

  const [boardZoom, setBoardZoom] = useState<number>(1);

  const [scores, setScores] = useState<ScoreState>(initialScores);
  const [matchHistory, setMatchHistory] = useState<GameHistory[]>([]);
  const [hydrated, setHydrated] = useState<boolean>(false);
  const soloResultSentRef = useRef(false);
  const gameStatusRef = useRef<GameStatus>("idle");
  const moveHistoryRef = useRef<Move[]>([]);
  const difficultyRef = useRef<Difficulty>(difficulty);
  const onSoloResultRef = useRef(onSoloResult);

  // Chỉ ghi nhận kết quả khi ván hiện tại đã thực sự tiêu vé.
  const emitSoloResult = (won: boolean, diff: Difficulty) => {
    if (
      !rankedPaidRoundRef.current ||
      soloResultSentRef.current ||
      !onSoloResultRef.current
    )
      return;
    soloResultSentRef.current = true;
    onSoloResultRef.current({ won, difficulty: diff });
  };

  // Người chơi chọn độ khó ⇒ tiêu 1 vé và bắt đầu một ván tính bánh.
  // Hết vé (ok=false) ⇒ vẫn cho chơi nhưng là ván tập luyện (không tính bánh).
  const handleRankedPickDifficulty = async (d: Difficulty) => {
    if (!onRankedStart || rankedStarting || replayLocked) return;
    setRankedStarting(true);
    setDifficulty(d);
    difficultyRef.current = d;
    try {
      const ok = await onRankedStart(d);
      setRankedPaidRound(ok);
      rankedPaidRoundRef.current = ok;
      setRankedNeedsDifficulty(false);
      setDifficultyPickerOpen(false);
      setBoard(createEmptyBoard(boardSize));
      setMoveHistory([]);
      setWinningLine(null);
      setWinnerSymbol(null);
      setLastMove(null);
      setCurrentPlayer("X");
      setGameStatus("idle");
      soloResultSentRef.current = false;
    } finally {
      setRankedStarting(false);
    }
  };

  useEffect(() => {
    if (isRanked) {
      setGameMode("PvE");
    }
  }, [isRanked]);

  useEffect(() => {
    gameStatusRef.current = gameStatus;
  }, [gameStatus]);

  useEffect(() => {
    moveHistoryRef.current = moveHistory;
  }, [moveHistory]);

  useEffect(() => {
    difficultyRef.current = difficulty;
  }, [difficulty]);

  useEffect(() => {
    onSoloResultRef.current = onSoloResult;
  }, [onSoloResult]);

  useEffect(() => {
    return () => {
      if (
        !rankedPaidRoundRef.current ||
        soloResultSentRef.current ||
        !onSoloResultRef.current ||
        gameStatusRef.current !== "playing" ||
        moveHistoryRef.current.length === 0
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
    if (typeof window === "undefined") return;
    try {
      const savedScores = localStorage.getItem(SCORES_STORAGE_KEY);
      if (savedScores) {
        const parsed = JSON.parse(savedScores) as Partial<ScoreState>;
        setScores({
          xWins: Number(parsed.xWins) || 0,
          oWins: Number(parsed.oWins) || 0,
          draws: Number(parsed.draws) || 0,
        });
      }
      const savedJournal = localStorage.getItem(JOURNAL_STORAGE_KEY);
      if (savedJournal) {
        const parsed = JSON.parse(savedJournal);
        if (Array.isArray(parsed)) {
          setMatchHistory(parsed as GameHistory[]);
        }
      }
    } catch {
      // ignore
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated || typeof window === "undefined") return;
    try {
      localStorage.setItem(SCORES_STORAGE_KEY, JSON.stringify(scores));
    } catch {
      // ignore
    }
  }, [scores, hydrated]);

  useEffect(() => {
    if (!hydrated || typeof window === "undefined") return;
    try {
      localStorage.setItem(JOURNAL_STORAGE_KEY, JSON.stringify(matchHistory));
    } catch {
      // ignore
    }
  }, [matchHistory, hydrated]);

  useEffect(() => {
    sounds.setMute(false);
  }, []);

  const historyMax = Math.max(
    1,
    Math.floor(settingsRef.current.historyMaxRecords)
  );

  const handleResetScores = () => {
    sounds.playUndoErase();
    setScores(initialScores);
    setMatchHistory([]);
    if (typeof window !== "undefined") {
      localStorage.removeItem(SCORES_STORAGE_KEY);
      localStorage.removeItem(JOURNAL_STORAGE_KEY);
    }
  };

  const recordResult = (
    winner: "X" | "O" | "Draw",
    movesCount: number,
    mode: GameMode,
    diff: Difficulty
  ) => {
    setMatchHistory((prev) => {
      const newRecord: GameHistory = {
        id: Math.random().toString(36).substring(4, 9),
        winner,
        mode,
        difficulty: mode === "PvE" ? diff : undefined,
        movesCount,
        date: formatDate(),
      };
      return [newRecord, ...prev].slice(0, historyMax);
    });
  };

  const handleCellClick = (r: number, c: number) => {
    if (
      board[r][c] ||
      gameStatus === "won" ||
      gameStatus === "draw" ||
      isAiThinking
    )
      return;

    const activeStatus = gameStatus === "idle" ? "playing" : gameStatus;

    sounds.playWritePen(currentPlayer === "O");

    const symbolOfMove = currentPlayer;
    const newMove: Move = {
      position: { row: r, col: c },
      symbol: symbolOfMove,
      timestamp: Date.now(),
    };

    const nextBoard = board.map((rowArr, ri) =>
      rowArr.map((cellVal, ci) =>
        ri === r && ci === c ? symbolOfMove : cellVal
      )
    );

    setBoard(nextBoard);
    setLastMove({ row: r, col: c });
    setMoveHistory((prev) => [...prev, newMove]);

    const win = checkWin(
      nextBoard,
      blockTwoEnds,
      settingsRef.current.winLength
    );
    if (win) {
      sounds.playWinFanfare();
      setWinningLine(win);
      setWinnerSymbol(win.symbol);
      setGameStatus("won");

      setScores((prev) => ({
        ...prev,
        xWins: win.symbol === "X" ? prev.xWins + 1 : prev.xWins,
        oWins: win.symbol === "O" ? prev.oWins + 1 : prev.oWins,
      }));

      recordResult(win.symbol, moveHistory.length + 1, gameMode, difficulty);

      if (isRanked && gameMode === "PvE" && win.symbol === "X") {
        emitSoloResult(true, difficulty);
      }
    } else if (checkDraw(nextBoard)) {
      sounds.playDrawSound();
      setGameStatus("draw");
      setScores((prev) => ({ ...prev, draws: prev.draws + 1 }));
      recordResult("Draw", moveHistory.length + 1, gameMode, difficulty);
      if (isRanked && gameMode === "PvE") {
        emitSoloResult(false, difficulty);
      }
    } else {
      setCurrentPlayer(currentPlayer === "X" ? "O" : "X");
      setGameStatus(activeStatus);
    }
  };

  // Vòng lặp AI: chỉ chạy khi đang PvE và đến lượt máy.
  useEffect(() => {
    if (
      gameMode !== "PvE" ||
      gameStatus !== "playing" ||
      currentPlayer !== "O" ||
      isAiThinking
    ) {
      return;
    }

    setIsAiThinking(true);
    const nextMovesCount = moveHistory.length + 1;

    const currentSettings = settingsRef.current;
    const minMs = Math.max(0, currentSettings.aiThinkMinMs);
    const maxMs = Math.max(minMs, currentSettings.aiThinkMaxMs);
    const delay = minMs + Math.random() * (maxMs - minMs);

    const timer = setTimeout(() => {
      const aiMove = getBestMove(board, difficulty, "O", currentSettings);

      sounds.playWritePen(true);
      const nextBoard = board.map((rowArr, ri) =>
        rowArr.map((cellVal, ci) =>
          ri === aiMove.row && ci === aiMove.col ? "O" : cellVal
        )
      );

      const newMove: Move = {
        position: aiMove,
        symbol: "O",
        timestamp: Date.now(),
      };

      setBoard(nextBoard);
      setLastMove(aiMove);
      setMoveHistory((prev) => [...prev, newMove]);

      const win = checkWin(nextBoard, blockTwoEnds, currentSettings.winLength);
      if (win) {
        sounds.playWinFanfare();
        setWinningLine(win);
        setWinnerSymbol("O");
        setGameStatus("won");
        setScores((prev) => ({ ...prev, oWins: prev.oWins + 1 }));
        recordResult("O", nextMovesCount, gameMode, difficulty);
        if (isRanked && gameMode === "PvE") {
          emitSoloResult(false, difficulty);
        }
      } else if (checkDraw(nextBoard)) {
        sounds.playDrawSound();
        setGameStatus("draw");
        setScores((prev) => ({ ...prev, draws: prev.draws + 1 }));
        recordResult("Draw", nextMovesCount, gameMode, difficulty);
        if (isRanked && gameMode === "PvE") {
          emitSoloResult(false, difficulty);
        }
      } else {
        setCurrentPlayer("X");
      }

      setIsAiThinking(false);
    }, delay);

    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [board, gameMode, gameStatus, currentPlayer, difficulty, blockTwoEnds]);

  // Đồng hồ suy nghĩ 15s cho người chơi (đấu máy: chỉ tính lượt X; PvP: cả hai).
  // Không chạy khi ranked đang chờ chọn độ khó / tiêu vé — tránh thua trước khi bắt đầu.
  const humanTurnActive =
    (gameStatus === "playing" || gameStatus === "idle") &&
    !isAiThinking &&
    !(isRanked && (rankedNeedsDifficulty || rankedStarting)) &&
    (gameMode === "PvP" || currentPlayer === "X");

  useEffect(() => {
    if (!humanTurnActive) {
      setSecondsLeft(null);
      return;
    }

    const deadline = Date.now() + TURN_THINK_MS;
    setSecondsLeft(Math.ceil(TURN_THINK_MS / 1000));

    const onTimeout = () => {
      const winner: "X" | "O" = currentPlayer === "X" ? "O" : "X";
      sounds.playDrawSound();
      setGameStatus("won");
      setWinningLine(null);
      setWinnerSymbol(winner);
      setTimeoutModalOpen(true);
      setScores((prev) => ({
        ...prev,
        xWins: winner === "X" ? prev.xWins + 1 : prev.xWins,
        oWins: winner === "O" ? prev.oWins + 1 : prev.oWins,
      }));
      recordResult(winner, moveHistory.length, gameMode, difficulty);
      if (isRanked && gameMode === "PvE" && winner === "O") {
        emitSoloResult(false, difficulty);
      }
    };

    const tick = () => {
      const ms = deadline - Date.now();
      if (ms <= 0) {
        setSecondsLeft(0);
        onTimeout();
        return;
      }
      setSecondsLeft(Math.ceil(ms / 1000));
    };

    const id = setInterval(tick, 200);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [humanTurnActive, currentPlayer, gameMode, moveHistory.length]);

  const handleRestart = () => {
    // Chặn chơi lại khi popup phần thưởng đang hiện/đang tính.
    if (replayLocked) return;
    if (isRanked) {
      // Bỏ cuộc ván đang tính bánh ⇒ xử thua trước khi sang ván mới.
      if (rankedPaidRoundRef.current && !soloResultSentRef.current) {
        emitSoloResult(false, difficultyRef.current);
      }
      sounds.playUndoErase();
      setBoard(createEmptyBoard(boardSize));
      setCurrentPlayer("X");
      setGameStatus("idle");
      setWinningLine(null);
      setWinnerSymbol(null);
      setTimeoutModalOpen(false);
      setLastMove(null);
      setMoveHistory([]);
      setIsAiThinking(false);
      // Ván kế: chọn độ khó lại để tiêu vé tiếp (hết vé ⇒ tập luyện).
      setRankedPaidRound(false);
      rankedPaidRoundRef.current = false;
      soloResultSentRef.current = false;
      setRankedNeedsDifficulty(true);
      setDifficultyPickerOpen(true);
      return;
    }
    sounds.playUndoErase();
    setBoard(createEmptyBoard(boardSize));
    setCurrentPlayer("X");
    setGameStatus("idle");
    setWinningLine(null);
    setWinnerSymbol(null);
    setTimeoutModalOpen(false);
    setLastMove(null);
    setMoveHistory([]);
    setIsAiThinking(false);
  };

  const handleUndo = () => {
    if (
      moveHistory.length === 0 ||
      isAiThinking ||
      gameStatus === "won" ||
      gameStatus === "draw"
    )
      return;
    sounds.playUndoErase();

    let stepsToPop = 1;
    if (gameMode === "PvE" && moveHistory.length >= 2) {
      stepsToPop = 2;
    }

    const updatedHistory = moveHistory.slice(0, -stepsToPop);

    const restoredBoard = createEmptyBoard(boardSize);
    updatedHistory.forEach((move) => {
      restoredBoard[move.position.row][move.position.col] = move.symbol;
    });

    setBoard(restoredBoard);
    setMoveHistory(updatedHistory);

    setLastMove(
      updatedHistory.length > 0
        ? updatedHistory[updatedHistory.length - 1].position
        : null
    );
    setCurrentPlayer(
      updatedHistory.length > 0 &&
        updatedHistory[updatedHistory.length - 1].symbol === "X"
        ? "O"
        : "X"
    );

    if (updatedHistory.length === 0) {
      setGameStatus("idle");
    } else {
      setGameStatus("playing");
    }
  };

  const canUndo =
    moveHistory.length > 0 &&
    !isAiThinking &&
    gameStatus !== "won" &&
    gameStatus !== "draw";

  return (
    <div className="caro-root w-full">
      <div className="caro-wood-desk relative py-4 px-2 sm:px-4 md:py-6 flex flex-col items-center rounded-2xl">
        <div className="w-full max-w-6xl flex flex-col gap-3">
          {/* Top bar: status (left) · zoom (center) · bread badge (right) */}
          <div className="flex items-center justify-between gap-2">
            <div className="inline-flex items-center gap-2 bg-white/85 border border-[#d2c9bd] rounded-full px-3 py-1.5 shadow-sm text-xs sm:text-sm font-sans shrink-0">
              <span className="relative flex h-2 w-2">
                <span
                  className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${
                    gameStatus === "won"
                      ? "bg-amber-400"
                      : gameStatus === "draw"
                      ? "bg-slate-300"
                      : currentPlayer === "X"
                      ? "bg-sky-400"
                      : "bg-rose-400"
                  }`}
                />
                <span
                  className={`relative inline-flex rounded-full h-2 w-2 ${
                    gameStatus === "won"
                      ? "bg-amber-500"
                      : gameStatus === "draw"
                      ? "bg-slate-400"
                      : currentPlayer === "X"
                      ? "bg-sky-500"
                      : "bg-rose-500"
                  }`}
                />
              </span>

              {(gameStatus === "idle" || gameStatus === "playing") && (
                <span className="font-medium inline-flex items-center gap-1.5">
                  {currentPlayer === "X" ? (
                    <span className="text-sky-700">Bạn (X)</span>
                  ) : (
                    <span className="text-rose-700">
                      {gameMode === "PvE" ? "Máy" : "O"} (O)
                      {isAiThinking ? "…" : ""}
                    </span>
                  )}
                  {secondsLeft != null && (
                    <span
                      className={`tabular-nums font-bold ${
                        secondsLeft <= 5 ? "text-rose-600" : "text-sky-600"
                      }`}
                    >
                      {secondsLeft}s
                    </span>
                  )}
                </span>
              )}
              {gameStatus === "won" && winnerSymbol && (
                <span className="font-bold inline-flex items-center gap-1.5 text-amber-700">
                  <FiAward className="w-3.5 h-3.5" />
                  {winnerSymbol === "X" ? "Thắng" : "Thua"}
                </span>
              )}
              {gameStatus === "draw" && (
                <span className="font-bold text-slate-600">Hòa</span>
              )}
            </div>

            <div className="flex items-center gap-1 bg-white/85 border border-[#d2c9bd] rounded-full shadow-sm backdrop-blur p-0.5">
              <button
                type="button"
                onClick={() =>
                  setBoardZoom((z) => clampCaroZoom(z - CARO_ZOOM_STEP))
                }
                disabled={boardZoom <= CARO_ZOOM_MIN}
                aria-label="Thu nhỏ bàn cờ"
                className="w-7 h-7 flex items-center justify-center rounded-full text-slate-600 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                <FiMinus className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setBoardZoom(1)}
                aria-label="Đặt lại kích thước"
                title="Đặt lại"
                className="px-1.5 h-7 flex items-center justify-center rounded-full text-[10px] font-mono font-bold text-slate-500 hover:bg-slate-100 transition-colors tabular-nums min-w-[40px]"
              >
                {Math.round(boardZoom * 100)}%
              </button>
              <button
                type="button"
                onClick={() =>
                  setBoardZoom((z) => clampCaroZoom(z + CARO_ZOOM_STEP))
                }
                disabled={boardZoom >= CARO_ZOOM_MAX}
                aria-label="Phóng to bàn cờ"
                className="w-7 h-7 flex items-center justify-center rounded-full text-slate-600 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                <FiPlus className="w-3.5 h-3.5" />
              </button>
              <span className="hidden sm:block w-px h-4 bg-slate-200 mx-0.5" />
              <button
                type="button"
                onClick={() => setBoardZoom(1)}
                aria-label="Khôi phục mặc định"
                title="Mặc định"
                className="hidden sm:flex w-7 h-7 items-center justify-center rounded-full text-slate-500 hover:bg-slate-100 transition-colors"
              >
                <FiMaximize2 className="w-3.5 h-3.5" />
              </button>
            </div>

            <UserBreadBadge variant="light" className="shrink-0" />
          </div>

          <CaroDashboard
            mode={gameMode}
            difficulty={difficulty}
            blockTwoEnds={blockTwoEnds}
            canUndo={canUndo}
            rankedMode={isRanked}
            rankedLocked={
              rankedPaidRound &&
              gameStatus !== "won" &&
              gameStatus !== "draw"
            }
            onSetMode={(m) => {
              if (isRanked) return;
              setGameMode(m);
              handleRestart();
            }}
            onSetDifficulty={(d) => {
              if (isRanked) {
                if (rankedPaidRound) return;
                void handleRankedPickDifficulty(d);
                return;
              }
              setDifficulty(d);
              handleRestart();
            }}
            onSetBlockTwoEnds={(val) => {
              if (isRanked) return;
              setBlockTwoEnds(val);
            }}
            onRestart={handleRestart}
            onUndo={handleUndo}
          />

          <div className="flex flex-col gap-4 w-full">
            <div className="flex flex-col gap-4 w-full">
              {isRanked && (rankedNeedsDifficulty || rankedStarting) && (
                <div className="flex flex-col items-center gap-2 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-center text-sm font-semibold text-amber-800">
                  {rankedStarting ? (
                    "Đang dùng vé…"
                  ) : (
                    <>
                      
                      {!difficultyPickerOpen && (
                        <button
                          type="button"
                          onClick={() => setDifficultyPickerOpen(true)}
                          className="rounded-lg bg-amber-500 px-4 py-2 text-xs font-bold uppercase tracking-wide text-white transition hover:bg-amber-600 active:scale-95"
                        >
                          Chọn độ khó & dùng vé
                        </button>
                      )}
                    </>
                  )}
                </div>
              )}
              {isRanked &&
                !rankedNeedsDifficulty &&
                !rankedPaidRound &&
                !rankedStarting && (
                  <div className="rounded-xl border border-slate-300 bg-slate-50 px-4 py-3 text-center text-sm font-semibold text-slate-600">
                    Hết vé — đang chơi tập luyện (không tính bánh).
                  </div>
                )}
              <CaroBoard
                board={board}
                onCellClick={handleCellClick}
                currentPlayer={currentPlayer}
                winningLine={winningLine}
                disabled={
                  isAiThinking ||
                  gameStatus === "won" ||
                  gameStatus === "draw" ||
                  (isRanked && rankedNeedsDifficulty) ||
                  rankedStarting
                }
                lastMove={lastMove}
                zoom={boardZoom}
                onZoomChange={setBoardZoom}
              />

              {matchHistory.length > 0 && (
                <div className="bg-white border border-[#d2c9bd] rounded-xl p-4 shadow-sm">
                  <h4 className="text-sm font-bold text-slate-800 tracking-wide flex items-center gap-1.5 border-b border-slate-200 pb-2 mb-3">
                    <FiCalendar className="w-4 h-4 text-sky-500" />
                    Lịch sử đấu
                  </h4>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs font-sans text-slate-600">
                      <thead>
                        <tr className="border-b border-dashed border-slate-200 text-[#8d7c67] font-mono">
                          <th className="pb-1.5 font-bold">Mã</th>
                          <th className="pb-1.5 font-bold">Thời gian</th>
                          <th className="pb-1.5 font-bold">Chế độ</th>
                          <th className="pb-1.5 font-bold">Số nước</th>
                          <th className="pb-1.5 font-bold">Kết quả</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {matchHistory.map((h) => (
                          <tr key={h.id} className="hover:bg-slate-50/50">
                            <td className="py-2 font-mono text-slate-400">
                              #{h.id}
                            </td>
                            <td className="py-2 text-slate-500">{h.date}</td>
                            <td className="py-2">
                              {h.mode === "PvE" ? (
                                <span className="text-sky-700 bg-sky-50 border border-sky-200/30 px-1.5 py-0.5 rounded text-[10px]">
                                  Đấu Máy (
                                  {h.difficulty === "easy"
                                    ? "Dễ"
                                    : h.difficulty === "medium"
                                    ? "Vừa"
                                    : "Khó"}
                                  )
                                </span>
                              ) : (
                                <span className="text-indigo-700 bg-indigo-50 border border-indigo-200/30 px-1.5 py-0.5 rounded text-[10px]">
                                  Đối thủ PvP
                                </span>
                              )}
                            </td>
                            <td className="py-2 font-mono">
                              {h.movesCount} nước
                            </td>
                            <td className="py-2 font-bold">
                              {h.winner === "X" && (
                                <span className="text-blue-600">
                                  Bạn thắng
                                </span>
                              )}
                              {h.winner === "O" && (
                                <span className="text-red-600">
                                  {h.mode === "PvE" ? "Máy thắng" : "O thắng"}
                                </span>
                              )}
                              {h.winner === "Draw" && (
                                <span className="text-slate-500">Hòa</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <TimeoutResultModal
        open={timeoutModalOpen}
        won={gameMode === "PvP" ? true : winnerSymbol === "X"}
        title={
          gameMode === "PvP" && winnerSymbol
            ? `Quân ${winnerSymbol} thắng!`
            : undefined
        }
        message={
          gameMode === "PvP"
            ? "Phía bên kia đã hết thời gian suy nghĩ."
            : undefined
        }
        actionLabel="Chơi lại"
        onAction={handleRestart}
        onClose={() => setTimeoutModalOpen(false)}
      />

      {isRanked && difficultyPickerOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4"
          onClick={() => setDifficultyPickerOpen(false)}
        >
          <div
            className="w-full max-w-xs rounded-3xl border border-amber-200 bg-white p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="mb-1 text-center text-base font-bold text-slate-800">
              Chọn độ khó
            </h3>
           
            <div className="grid grid-cols-1 gap-2">
              {(
                [
                  { id: "easy", label: "Dễ" },
                  { id: "medium", label: "Vừa"},
                  { id: "hard", label: "Khó" },
                ] as { id: Difficulty; label: string; sub: string }[]
              ).map((lv) => (
                <button
                  key={lv.id}
                  type="button"
                  disabled={rankedStarting}
                  onClick={() => void handleRankedPickDifficulty(lv.id)}
                  className="flex items-center justify-between rounded-xl border border-amber-200 bg-white px-4 py-3 transition hover:border-amber-400 hover:bg-amber-50 active:scale-95 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <span className="flex flex-col items-start">
                    <span className="text-sm font-semibold text-slate-800">
                      {lv.label}
                    </span>
                    
                  </span>
                  <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-1 text-xs font-bold text-amber-700 ring-1 ring-amber-200">
                    +{DIFFICULTY_BREAD[lv.id]}
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={BREAD_IMAGE}
                      alt="bánh"
                      className="h-4 w-4 object-contain"
                    />
                  </span>
                </button>
              ))}
            </div>
            {rankedStarting && (
              <p className="mt-3 text-center text-xs font-medium text-amber-700">
                Đang dùng vé…
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
