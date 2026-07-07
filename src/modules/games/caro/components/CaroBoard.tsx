"use client";

import { motion } from "framer-motion";
import { CSSProperties, useEffect, useRef } from "react";
import { BoardState, PlayerSymbol, Position, WinningLine } from "../types";
import { CARO_ZOOM_STEP, clampCaroZoom } from "../utils/zoom";
import { sounds } from "../utils/sounds";

interface CaroBoardProps {
  board: BoardState;
  onCellClick: (row: number, col: number) => void;
  currentPlayer: PlayerSymbol;
  winningLine: WinningLine | null;
  disabled: boolean;
  lastMove: Position | null;
  zoom: number;
  onZoomChange: (next: number) => void;
}

export default function CaroBoard({
  board,
  onCellClick,
  currentPlayer,
  winningLine,
  disabled,
  lastMove,
  zoom,
  onZoomChange,
}: CaroBoardProps) {
  const size = board.length;

  const zoomRef = useRef(zoom);
  useEffect(() => {
    zoomRef.current = zoom;
  }, [zoom]);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const node = containerRef.current;
    if (!node) return;

    const getDist = (touches: TouchList) => {
      const a = touches[0];
      const b = touches[1];
      return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
    };

    let pinchStart: { startDist: number; startZoom: number } | null = null;

    const onWheel = (e: globalThis.WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      const direction = e.deltaY < 0 ? 1 : -1;
      onZoomChange(clampCaroZoom(zoomRef.current + direction * CARO_ZOOM_STEP));
    };

    const onTouchStart = (e: globalThis.TouchEvent) => {
      if (e.touches.length === 2) {
        pinchStart = {
          startDist: getDist(e.touches),
          startZoom: zoomRef.current,
        };
      }
    };

    const onTouchMove = (e: globalThis.TouchEvent) => {
      if (e.touches.length === 2 && pinchStart) {
        e.preventDefault();
        const dist = getDist(e.touches);
        const ratio = dist / pinchStart.startDist;
        onZoomChange(clampCaroZoom(pinchStart.startZoom * ratio));
      }
    };

    const onTouchEnd = (e: globalThis.TouchEvent) => {
      if (e.touches.length < 2) pinchStart = null;
    };

    node.addEventListener("wheel", onWheel, { passive: false });
    node.addEventListener("touchstart", onTouchStart, { passive: true });
    node.addEventListener("touchmove", onTouchMove, { passive: false });
    node.addEventListener("touchend", onTouchEnd, { passive: true });
    node.addEventListener("touchcancel", onTouchEnd, { passive: true });

    return () => {
      node.removeEventListener("wheel", onWheel);
      node.removeEventListener("touchstart", onTouchStart);
      node.removeEventListener("touchmove", onTouchMove);
      node.removeEventListener("touchend", onTouchEnd);
      node.removeEventListener("touchcancel", onTouchEnd);
    };
  }, []);

  const isWinningCell = (r: number, c: number) => {
    if (!winningLine) return false;
    return winningLine.positions.some(
      (pos) => pos.row === r && pos.col === c
    );
  };

  const isLastMoveCell = (r: number, c: number) => {
    if (!lastMove) return false;
    return lastMove.row === r && lastMove.col === c;
  };

  const renderSymbol = (value: "X" | "O" | null, isWin: boolean) => {
    if (!value) return null;

    if (value === "X") {
      return (
        <svg
          viewBox="0 0 40 40"
          className={`w-full h-full p-1.5 ${
            isWin ? "drop-shadow-[0_2px_4px_rgba(25,91,241,0.4)]" : ""
          }`}
        >
          <motion.line
            x1="8"
            y1="8"
            x2="32"
            y2="32"
            stroke="#1d4ed8"
            strokeWidth="3.2"
            strokeLinecap="round"
            initial={{ pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: 0.18, ease: "easeOut" }}
          />
          <motion.line
            x1="32"
            y1="8"
            x2="8"
            y2="32"
            stroke="#1e40af"
            strokeWidth="2.8"
            strokeLinecap="round"
            initial={{ pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: 0.18, delay: 0.12, ease: "easeOut" }}
          />
        </svg>
      );
    }
    return (
      <svg
        viewBox="0 0 40 40"
        className={`w-full h-full p-1.5 ${
          isWin ? "drop-shadow-[0_2px_4px_rgba(220,38,38,0.4)]" : ""
        }`}
      >
        <motion.path
          d="M 20, 7 
             C 31, 7   33, 14  33, 20
             C 33, 26  30, 33  20, 33
             C 10, 33  7,  26  7,  20
             C 7,  14  10, 7   20, 7 Z"
          fill="none"
          stroke="#dc2626"
          strokeWidth="3"
          strokeLinecap="round"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 0.3, ease: "easeInOut" }}
        />
      </svg>
    );
  };

  // Toạ độ A,B,C... rồi đổi sang AA,AB... khi vượt qua 26 cột.
  const colLabel = (col: number): string => {
    if (col < 26) return String.fromCharCode(65 + col);
    const first = String.fromCharCode(65 + Math.floor(col / 26) - 1);
    const second = String.fromCharCode(65 + (col % 26));
    return `${first}${second}`;
  };

  return (
    <div
      ref={containerRef}
      className="relative select-none max-w-full overflow-auto rounded-xl border border-[#d2c9bd] bg-[#fbfaf6] shadow-xl p-3 sm:p-5 md:p-6 flex justify-center touch-pan-x touch-pan-y"
      style={{ ["--caro-cell-zoom" as keyof CSSProperties]: zoom } as CSSProperties}
    >
      <div className="flex select-none" style={{ width: "fit-content" }}>
        <div
          className="caro-board-grid relative border-t border-l border-blue-200/60 bg-[#fdfdfc] shrink-0"
          style={{
            gridTemplateColumns: `repeat(${size}, calc(var(--caro-cell-size) * var(--caro-cell-zoom, 1)))`,
          }}
        >
            {board.map((rowArr, r) =>
              rowArr.map((cellValue, c) => {
                const isWinCell = isWinningCell(r, c);
                const isLastCell = isLastMoveCell(r, c);

                return (
                  <button
                    id={`caro-cell-${r}-${c}`}
                    key={`${r}-${c}`}
                    type="button"
                    onClick={() => {
                      if (!disabled && !cellValue) {
                        onCellClick(r, c);
                      }
                    }}
                    onMouseEnter={() => {
                      if (!disabled && !cellValue) {
                        sounds.playClick();
                      }
                    }}
                    disabled={disabled || cellValue !== null}
                    className={`
                      caro-cell relative isolate border-r border-b border-blue-200/50
                      outline-none transition-all duration-150 flex items-center justify-center shrink-0
                      ${cellValue ? "cursor-default" : "hover:bg-blue-50/40 cursor-pointer"}
                    `}
                    title={`Ô ${colLabel(c)}${r + 1}`}
                  >
                    {isWinCell && (
                      <motion.div
                        className="absolute inset-[2px] bg-yellow-200/65 rounded-sm -z-10"
                        initial={{ scale: 0, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        transition={{ type: "spring", stiffness: 100, damping: 10 }}
                      />
                    )}

                    {isLastCell && !isWinCell && (
                      <div className="absolute inset-[3px] border-2 border-sky-400/70 bg-sky-200/55 rounded-md -z-10 pointer-events-none" />
                    )}

                    {!cellValue && !disabled && (
                      <div className="absolute inset-0 opacity-0 hover:opacity-20 flex items-center justify-center transition-opacity pointer-events-none">
                        {currentPlayer === "X" ? (
                          <span className="text-blue-700 font-sans text-xl sm:text-2xl font-bold">
                            X
                          </span>
                        ) : (
                          <span className="text-red-700 font-sans text-xl sm:text-2xl font-bold">
                            O
                          </span>
                        )}
                      </div>
                    )}

                    {renderSymbol(cellValue, isWinCell)}
                  </button>
                );
              })
            )}

            {winningLine && (
              <div className="absolute inset-0 pointer-events-none z-10 overflow-hidden">
                <svg className="w-full h-full absolute inset-0">
                  <motion.line
                    x1={`${
                      ((winningLine.positions[0].col + 0.5) / size) * 100
                    }%`}
                    y1={`${
                      ((winningLine.positions[0].row + 0.5) / size) * 100
                    }%`}
                    x2={`${
                      ((winningLine.positions[winningLine.positions.length - 1]
                        .col +
                        0.5) /
                        size) *
                      100
                    }%`}
                    y2={`${
                      ((winningLine.positions[winningLine.positions.length - 1]
                        .row +
                        0.5) /
                        size) *
                      100
                    }%`}
                    stroke="#e11d48"
                    strokeWidth="4"
                    strokeLinecap="round"
                    initial={{ pathLength: 0 }}
                    animate={{ pathLength: 1 }}
                    transition={{
                      delay: 0.35,
                      duration: 0.4,
                      ease: "easeOut",
                    }}
                  />
                  <motion.line
                    x1={`${
                      ((winningLine.positions[0].col + 0.51) / size) * 100
                    }%`}
                    y1={`${
                      ((winningLine.positions[0].row + 0.49) / size) * 100
                    }%`}
                    x2={`${
                      ((winningLine.positions[winningLine.positions.length - 1]
                        .col +
                        0.51) /
                        size) *
                      100
                    }%`}
                    y2={`${
                      ((winningLine.positions[winningLine.positions.length - 1]
                        .row +
                        0.49) /
                        size) *
                      100
                    }%`}
                    stroke="#be123c"
                    strokeWidth="2"
                    strokeLinecap="round"
                    initial={{ pathLength: 0 }}
                    animate={{ pathLength: 1 }}
                    transition={{
                      delay: 0.45,
                      duration: 0.3,
                      ease: "easeOut",
                    }}
                  />
                </svg>
              </div>
            )}
        </div>
      </div>
    </div>
  );
}
