"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  FiAward,
  FiCornerUpLeft,
  FiMaximize2,
  FiMinus,
  FiPlus,
  FiX,
} from "react-icons/fi";
import {
  getServerNow,
  lastNameOf,
  PlayerAvatar,
  TURN_THINK_MS,
  useCountdown,
  useFinalizeRoom,
  useSharedState,
  type MultiplayerContext,
  type PlayerRole,
} from "../../realtime";
import { UserBreadBadge } from "../../components/UserBreadBadge";
import { TimeoutResultModal } from "../../components/TimeoutResultModal";
import { useCaroSettings } from "../hooks/useCaroSettings";
import {
  BoardState,
  CARO_SETTINGS,
  PlayerSymbol,
  Position,
  WinningLine,
} from "../types";
import { checkDraw, checkWin } from "../utils/ai";
import { sounds } from "../utils/sounds";
import {
  CARO_ZOOM_MAX,
  CARO_ZOOM_MIN,
  CARO_ZOOM_STEP,
  clampCaroZoom,
} from "../utils/zoom";
import "./caro.css";
import CaroBoard from "./CaroBoard";

interface CaroNetState {
  size: number;
  /** Flattened board: '.' empty, 'X' or 'O'. Length = size*size. */
  cells: string;
  turn: PlayerSymbol;
  status: "playing" | "won" | "draw";
  winner: "X" | "O" | "";
  last: number;
  /** Lịch sử các ô đã đánh theo thứ tự (index trên bàn cờ) — phục vụ Đi lại. */
  moves?: number[];
  /**
   * Yêu cầu Đi lại đang chờ đối thủ đồng ý (null = không có).
   * `remaining`: số ms còn lại của lượt hiện tại lúc bấm xin — để khôi phục
   * đúng số giây sau khi xử lý (không reset 15s ⇒ chặn câu giờ).
   */
  undo?: { by: "p1" | "p2"; remaining: number } | null;
  /**
   * moves.length lúc bị từ chối đi lại — không cho xin lại cùng trạng thái bàn cờ.
   * Reset tự nhiên khi có nước mới (moves.length thay đổi).
   */
  undoDeclinedAt?: Partial<Record<"p1" | "p2", number>>;
  /** Server-ms: hết hạn lượt hiện tại (15s suy nghĩ). */
  deadline?: number;
  /** Lý do thắng — "timeout" khi đối thủ hết giờ (để hiện popup). */
  winReason?: "line" | "timeout";
}

const EMPTY = ".";

function cellsToBoard(cells: string, size: number): BoardState {
  const board: BoardState = [];
  for (let r = 0; r < size; r++) {
    const row: (PlayerSymbol | null)[] = [];
    for (let c = 0; c < size; c++) {
      const ch = cells[r * size + c];
      row.push(ch === "X" || ch === "O" ? ch : null);
    }
    board.push(row);
  }
  return board;
}

export function CaroMultiplayer({
  multiplayer,
}: {
  multiplayer: MultiplayerContext;
}) {
  const { roomId, role, isHost } = multiplayer;
  const { data: liveSettings } = useCaroSettings();
  const settings = liveSettings ?? CARO_SETTINGS;
  const boardSize = Math.max(5, Math.floor(settings.boardSize));
  const winLength = settings.winLength;

  const { state, patch, init } = useSharedState<CaroNetState>(roomId);
  const initializedRef = useRef(false);
  const [zoom, setZoom] = useState(1);

  // p1 = X (blue/host), p2 = O (red).
  const mySymbol: PlayerSymbol = role === "p1" ? "X" : "O";

  useEffect(() => {
    if (!isHost || initializedRef.current) return;
    if (state === null) {
      initializedRef.current = true;
      init({
        size: boardSize,
        cells: EMPTY.repeat(boardSize * boardSize),
        turn: "X",
        status: "playing",
        winner: "",
        last: -1,
        moves: [],
        undo: null,
        deadline: getServerNow() + TURN_THINK_MS,
      });
    } else {
      initializedRef.current = true;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isHost, state]);

  const size = state?.size ?? boardSize;
  const cells = state?.cells ?? EMPTY.repeat(size * size);
  const board = cellsToBoard(cells, size);
  const turn = state?.turn ?? "X";
  const status = state?.status ?? "playing";
  const winnerSymbol = state?.winner || null;
  const lastIdx = state?.last ?? -1;
  const lastMove: Position | null =
    lastIdx >= 0
      ? { row: Math.floor(lastIdx / size), col: lastIdx % size }
      : null;

  const winningLine: WinningLine | null =
    status === "won" && winnerSymbol
      ? checkWin(board, false, winLength)
      : null;

  const movesArr = state?.moves ?? [];
  const pendingUndo = state?.undo ?? null;
  const undoDeclinedAt = state?.undoDeclinedAt ?? {};
  const undoBlockedThisPosition =
    undoDeclinedAt[role] != null && undoDeclinedAt[role] === movesArr.length;
  const iRequestedUndo = pendingUndo != null && pendingUndo.by === role;
  const opponentRequestedUndo = pendingUndo != null && pendingUndo.by !== role;

  const myTurn =
    status === "playing" && turn === mySymbol && pendingUndo == null;

  const deadline = state?.deadline ?? null;
  const thinkSeconds = useCountdown(
    status === "playing" && pendingUndo == null ? deadline : null
  );

  const winReason = state?.winReason ?? null;
  const [timeoutModalOpen, setTimeoutModalOpen] = useState(false);
  useEffect(() => {
    if (status === "won" && winReason === "timeout") {
      setTimeoutModalOpen(true);
    } else if (status !== "won") {
      setTimeoutModalOpen(false);
    }
  }, [status, winReason]);

  const timedOutDeadlineRef = useRef<number | null>(null);
  useEffect(() => {
    if (!isHost || status !== "playing" || pendingUndo != null || !deadline) {
      return;
    }
    const check = () => {
      if (getServerNow() < deadline) return;
      if (timedOutDeadlineRef.current === deadline) return;
      timedOutDeadlineRef.current = deadline;
      const winner: PlayerSymbol = turn === "X" ? "O" : "X";
      patch({ status: "won", winner, winReason: "timeout" });
    };
    check();
    const id = setInterval(check, 250);
    return () => clearInterval(id);
  }, [isHost, status, pendingUndo, deadline, turn, patch]);

  // Sound feedback when the opponent moves.
  const prevLastRef = useRef(lastIdx);
  useEffect(() => {
    if (lastIdx !== prevLastRef.current && lastIdx >= 0) {
      prevLastRef.current = lastIdx;
      if (status === "won") sounds.playWinFanfare();
      else if (status === "draw") sounds.playDrawSound();
    }
  }, [lastIdx, status]);

  const handleCellClick = useCallback(
    (r: number, c: number) => {
      if (!myTurn) return;
      const idx = r * size + c;
      if (cells[idx] !== EMPTY) return;

      const nextCells =
        cells.substring(0, idx) + mySymbol + cells.substring(idx + 1);
      const nextBoard = cellsToBoard(nextCells, size);
      sounds.playWritePen(mySymbol === "O");

      const nextMoves = [...movesArr, idx];

      const win = checkWin(nextBoard, false, winLength);
      if (win) {
        patch({
          cells: nextCells,
          last: idx,
          moves: nextMoves,
          status: "won",
          winner: win.symbol,
        });
      } else if (checkDraw(nextBoard)) {
        patch({ cells: nextCells, last: idx, moves: nextMoves, status: "draw" });
      } else {
        patch({
          cells: nextCells,
          last: idx,
          moves: nextMoves,
          turn: mySymbol === "X" ? "O" : "X",
          deadline: getServerNow() + TURN_THINK_MS,
        });
      }
    },
    [myTurn, size, cells, mySymbol, winLength, patch, movesArr]
  );

  // ----- Đi lại (undo) cần đối thủ đồng ý -----
  // Người xin chỉ đi lại được khi đã có nước của chính mình trên bàn:
  // X có nước khi đã đánh ≥1 nước; O có nước khi đã đánh ≥2 nước.
  const requesterHasMove =
    mySymbol === "X" ? movesArr.length >= 1 : movesArr.length >= 2;

  const handleRequestUndo = useCallback(() => {
    if (
      status !== "playing" ||
      pendingUndo != null ||
      !requesterHasMove ||
      undoBlockedThisPosition
    ) {
      return;
    }
    // Chụp lại thời gian còn lại để khôi phục sau (không cấp thêm 15s mới).
    const remaining =
      deadline != null
        ? Math.max(0, deadline - getServerNow())
        : TURN_THINK_MS;
    patch({ undo: { by: role, remaining } });
  }, [status, pendingUndo, requesterHasMove, undoBlockedThisPosition, deadline, patch, role]);

  const handleRespondUndo = useCallback(
    (accept: boolean) => {
      if (!opponentRequestedUndo || pendingUndo == null) return;

      if (!accept) {
        // Từ chối ⇒ mặc kệ đồng hồ: chạy tiếp với đúng số giây còn lại lúc xin
        // (KHÔNG reset 15s ⇒ chặn câu giờ). Chặn xin lại cùng trạng thái bàn cờ.
        patch({
          undo: null,
          deadline: getServerNow() + (pendingUndo.remaining ?? 0),
          undoDeclinedAt: {
            ...undoDeclinedAt,
            [pendingUndo.by]: movesArr.length,
          },
        });
        return;
      }

      // Đồng ý ⇒ người xin đánh lại nên được cấp lượt 15s mới.
      const acceptedDeadline = getServerNow() + TURN_THINK_MS;

      const requesterSymbol: PlayerSymbol =
        pendingUndo.by === "p1" ? "X" : "O";
      const ms = [...movesArr];
      // Nước cuối do ai đánh: độ dài lẻ ⇒ X đánh cuối, chẵn ⇒ O đánh cuối.
      const lastSymbol: PlayerSymbol = ms.length % 2 === 1 ? "X" : "O";
      // Đối thủ chưa đánh lại (nước cuối là của người xin) ⇒ gỡ 1.
      // Đối thủ đã đánh rồi ⇒ gỡ 2 (nước đối thủ + nước người xin).
      const removeCount = lastSymbol === requesterSymbol ? 1 : 2;

      if (removeCount > ms.length) {
        // Không đủ nước để gỡ (người xin chưa thực sự có nước) ⇒ huỷ, giữ giờ.
        patch({
          undo: null,
          deadline: getServerNow() + (pendingUndo.remaining ?? 0),
        });
        return;
      }

      let nextCells = cells;
      for (let k = 0; k < removeCount; k++) {
        const removed = ms.pop();
        if (removed === undefined) break;
        nextCells =
          nextCells.substring(0, removed) +
          EMPTY +
          nextCells.substring(removed + 1);
      }

      // Sau khi gỡ, luôn quay về lượt của người xin để họ đánh lại.
      const nextTurn = requesterSymbol;
      const nextLast = ms.length > 0 ? ms[ms.length - 1] : -1;
      sounds.playUndoErase();
      patch({
        cells: nextCells,
        moves: ms,
        turn: nextTurn,
        last: nextLast,
        status: "playing",
        winner: "",
        undo: null,
        deadline: acceptedDeadline,
      });
    },
    [opponentRequestedUndo, pendingUndo, movesArr, cells, patch, undoDeclinedAt]
  );

  const canRequestUndo =
    status === "playing" &&
    pendingUndo == null &&
    requesterHasMove &&
    !undoBlockedThisPosition;

  const iWon = status === "won" && winnerSymbol === mySymbol;

  // Khi game tự kết thúc theo luật cờ, host đánh dấu meta.status = "finished"
  // để chặn luồng forfeit/disconnect không vô tình lật kết quả.
  const finalWinnerRole: PlayerRole | "draw" | null =
    status === "won"
      ? winnerSymbol === "X"
        ? "p1"
        : "p2"
      : status === "draw"
        ? "draw"
        : null;
  useFinalizeRoom({ roomId, isHost, winnerRole: finalWinnerRole });

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
                    status === "won"
                      ? "bg-amber-400"
                      : status === "draw"
                        ? "bg-slate-300"
                        : myTurn
                          ? "bg-emerald-400"
                          : "bg-slate-300"
                  }`}
                />
                <span
                  className={`relative inline-flex rounded-full h-2 w-2 ${
                    status === "won"
                      ? "bg-amber-500"
                      : status === "draw"
                        ? "bg-slate-400"
                        : myTurn
                          ? "bg-emerald-500"
                          : "bg-slate-400"
                  }`}
                />
              </span>
              {status === "playing" ? (
                <span className="font-medium inline-flex items-center gap-1.5">
                  {myTurn ? (
                    <span className="text-emerald-700">Lượt của bạn</span>
                  ) : (
                    <span className="text-slate-500">Chờ đối thủ…</span>
                  )}
                  {thinkSeconds != null && pendingUndo == null && (
                    <span
                      className={`tabular-nums font-bold ${
                        thinkSeconds <= 5
                          ? "text-rose-600"
                          : "text-sky-600"
                      }`}
                    >
                      {thinkSeconds}s
                    </span>
                  )}
                </span>
              ) : status === "won" ? (
                <span className="inline-flex items-center gap-1.5 font-bold text-amber-700">
                  <FiAward className="h-3.5 w-3.5" />
                  {iWon ? "Bạn thắng" : "Bạn thua"}
                </span>
              ) : (
                <span className="font-bold text-slate-600">Hòa</span>
              )}
            </div>

            <div className="flex items-center gap-1 bg-white/85 border border-[#d2c9bd] rounded-full shadow-sm backdrop-blur p-0.5">
              <button
                type="button"
                onClick={() => setZoom((z) => clampCaroZoom(z - CARO_ZOOM_STEP))}
                disabled={zoom <= CARO_ZOOM_MIN}
                aria-label="Thu nhỏ bàn cờ"
                className="w-7 h-7 flex items-center justify-center rounded-full text-slate-600 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                <FiMinus className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setZoom(1)}
                aria-label="Đặt lại kích thước"
                title="Đặt lại"
                className="px-1.5 h-7 flex items-center justify-center rounded-full text-[10px] font-mono font-bold text-slate-500 hover:bg-slate-100 transition-colors tabular-nums min-w-[40px]"
              >
                {Math.round(zoom * 100)}%
              </button>
              <button
                type="button"
                onClick={() => setZoom((z) => clampCaroZoom(z + CARO_ZOOM_STEP))}
                disabled={zoom >= CARO_ZOOM_MAX}
                aria-label="Phóng to bàn cờ"
                className="w-7 h-7 flex items-center justify-center rounded-full text-slate-600 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                <FiPlus className="w-3.5 h-3.5" />
              </button>
              <span className="hidden sm:block w-px h-4 bg-slate-200 mx-0.5" />
              <button
                type="button"
                onClick={() => setZoom(1)}
                aria-label="Khôi phục mặc định"
                title="Mặc định"
                className="hidden sm:flex w-7 h-7 items-center justify-center rounded-full text-slate-500 hover:bg-slate-100 transition-colors"
              >
                <FiMaximize2 className="w-3.5 h-3.5" />
              </button>
            </div>

            <UserBreadBadge variant="light" className="shrink-0" />
          </div>

          {/* Dashboard: players (you vs opponent) + actions */}
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-[#d2c9bd] bg-white/85 px-2.5 py-2 shadow-sm">
            <div className="flex items-center gap-2">
              <CaroPlayerTag
                name={lastNameOf(multiplayer.self.name)}
                color={multiplayer.self.color}
                avatarUrl={multiplayer.self.avatarUrl}
                symbol={mySymbol}
                active={status === "playing" && turn === mySymbol}
                label="Bạn"
              />
              <span className="text-xs font-black text-slate-400">VS</span>
              <CaroPlayerTag
                name={lastNameOf(multiplayer.opponent.name)}
                color={multiplayer.opponent.color}
                avatarUrl={multiplayer.opponent.avatarUrl}
                symbol={mySymbol === "X" ? "O" : "X"}
                active={status === "playing" && turn !== mySymbol}
                label="Đối thủ"
              />
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleRequestUndo}
                disabled={!canRequestUndo}
                title={
                  undoBlockedThisPosition
                    ? "Đối thủ đã từ chối — chờ thêm nước cờ mới"
                    : undefined
                }
                className="inline-flex items-center gap-1.5 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-700 shadow-sm transition-colors hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <FiCornerUpLeft className="h-3.5 w-3.5" />
                Đi lại
              </button>
            </div>
          </div>

          <div className="flex w-full flex-col gap-4">
            <CaroBoard
              board={board}
              onCellClick={handleCellClick}
              currentPlayer={turn}
              winningLine={winningLine}
              disabled={!myTurn}
              lastMove={lastMove}
              zoom={zoom}
              onZoomChange={setZoom}
            />

            {status !== "playing" && (
              <div className="flex flex-col items-center gap-2 rounded-xl border border-[#d2c9bd] bg-white p-4 shadow-sm">
                <p className="text-sm font-bold text-slate-700">
                  {status === "draw"
                    ? "Hòa!"
                    : iWon
                      ? "🏆 Bạn thắng!"
                      : "Bạn thua!"}
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      <TimeoutResultModal
        open={timeoutModalOpen}
        won={winnerSymbol === mySymbol}
        onClose={() => setTimeoutModalOpen(false)}
      />

      {/* Undo: waiting toast for the requester */}
      {iRequestedUndo && (
        <div className="fixed bottom-6 left-1/2 z-[10000] -translate-x-1/2 rounded-full border border-amber-300 bg-white px-4 py-2 text-xs font-bold text-amber-700 shadow-lg">
          Đang chờ đối thủ đồng ý đi lại…
        </div>
      )}

      {/* Undo: accept/decline prompt for the opponent */}
      {opponentRequestedUndo && (
        <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-slate-900/50 p-4">
          <div className="w-full max-w-[300px] space-y-3 rounded-2xl border-2 border-amber-300 bg-white p-5 text-center shadow-2xl">
            <div className="flex justify-center">
              <PlayerAvatar
                name={lastNameOf(multiplayer.opponent.name)}
                color={multiplayer.opponent.color}
                avatarUrl={multiplayer.opponent.avatarUrl}
                size={48}
              />
            </div>
            <p className="text-sm font-bold text-slate-700">
              {lastNameOf(multiplayer.opponent.name)} muốn đi lại nước vừa rồi.
            </p>
            <p className="text-xs text-slate-500">Bạn có đồng ý không?</p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => handleRespondUndo(false)}
                className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100"
              >
                <FiX className="h-3.5 w-3.5" /> Từ chối
              </button>
              <button
                type="button"
                onClick={() => handleRespondUndo(true)}
                className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-emerald-500 px-3 py-2 text-xs font-bold text-white hover:bg-emerald-600"
              >
                <FiCornerUpLeft className="h-3.5 w-3.5" /> Đồng ý
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function CaroPlayerTag({
  name,
  color,
  avatarUrl,
  symbol,
  active,
  label,
}: {
  name: string;
  color: "blue" | "red";
  avatarUrl: string | null;
  symbol: PlayerSymbol;
  active: boolean;
  label: string;
}) {
  return (
    <div
      className={`flex items-center gap-2 rounded-full border bg-white/85 px-2.5 py-1 shadow-sm transition-all ${
        active
          ? "border-emerald-400 ring-2 ring-emerald-300"
          : "border-[#d2c9bd]"
      }`}
    >
      <PlayerAvatar name={name} color={color} avatarUrl={avatarUrl} size={30} />
      <div className="text-left leading-tight">
        <div className="text-[9px] uppercase tracking-wide text-slate-400">
          {label}
        </div>
        <div className="max-w-[80px] truncate text-xs font-bold text-slate-700">
          {name}{" "}
          <span
            className={symbol === "X" ? "text-sky-600" : "text-rose-600"}
          >
            ({symbol})
          </span>
        </div>
      </div>
    </div>
  );
}
