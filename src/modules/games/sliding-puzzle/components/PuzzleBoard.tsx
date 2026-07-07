"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { SlidingPuzzleStatus, SlidingPuzzleTile } from "../types";

interface PuzzleBoardProps {
  tiles: SlidingPuzzleTile[];
  status: SlidingPuzzleStatus;
  selectedImageUrl: string;
  showNumbersOnPicture: boolean;
  onTileClick: (tile: SlidingPuzzleTile) => void;
}

const SIZE = 3;
const COMMIT_RATIO = 0.4;
const TAP_MAX_MOVEMENT = 6;
const BOARD_PADDING_PX = 8;

type DragState = {
  tileId: number;
  axis: "x" | "y";
  dir: 1 | -1;
  startX: number;
  startY: number;
  offset: number;
  pointerId: number;
  maxDistance: number;
};

export const PuzzleBoard: React.FC<PuzzleBoardProps> = ({
  tiles,
  status,
  selectedImageUrl,
  showNumbersOnPicture,
  onTileClick,
}) => {
  const boardRef = useRef<HTMLDivElement>(null);
  const [tileSize, setTileSize] = useState(0);
  const [drag, setDrag] = useState<DragState | null>(null);

  const emptyTile = tiles.find((t) => t.isEmpty);

  const isAdjacent = useCallback(
    (tile: SlidingPuzzleTile) => {
      if (!emptyTile) return false;
      const rowDiff = Math.abs(tile.currentRow - emptyTile.currentRow);
      const colDiff = Math.abs(tile.currentCol - emptyTile.currentCol);
      return (rowDiff === 1 && colDiff === 0) || (rowDiff === 0 && colDiff === 1);
    },
    [emptyTile]
  );

  useEffect(() => {
    const update = () => {
      if (boardRef.current) {
        const inner = boardRef.current.clientWidth - BOARD_PADDING_PX * 2;
        setTileSize(inner / SIZE);
      }
    };
    update();
    if (!boardRef.current) return;
    const observer = new ResizeObserver(update);
    observer.observe(boardRef.current);
    return () => observer.disconnect();
  }, []);

  const handlePointerDown = (
    e: React.PointerEvent<HTMLButtonElement>,
    tile: SlidingPuzzleTile
  ) => {
    if (status !== "playing") return;
    if (tile.isEmpty) return;
    if (!emptyTile || !isAdjacent(tile)) return;
    if (tileSize === 0) return;

    let axis: "x" | "y";
    let dir: 1 | -1;
    if (emptyTile.currentRow !== tile.currentRow) {
      axis = "y";
      dir = emptyTile.currentRow > tile.currentRow ? 1 : -1;
    } else {
      axis = "x";
      dir = emptyTile.currentCol > tile.currentCol ? 1 : -1;
    }

    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // ignore — capture not supported, drag still works while pointer stays on element
    }

    setDrag({
      tileId: tile.id,
      axis,
      dir,
      startX: e.clientX,
      startY: e.clientY,
      offset: 0,
      pointerId: e.pointerId,
      maxDistance: 0,
    });
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (!drag || e.pointerId !== drag.pointerId) return;
    const rawX = e.clientX - drag.startX;
    const rawY = e.clientY - drag.startY;
    const raw = drag.axis === "x" ? rawX : rawY;
    const clamped =
      drag.dir === 1
        ? Math.max(0, Math.min(tileSize, raw))
        : Math.max(-tileSize, Math.min(0, raw));
    const totalMovement = Math.hypot(rawX, rawY);
    setDrag((prev) =>
      prev && prev.pointerId === e.pointerId
        ? {
            ...prev,
            offset: clamped,
            maxDistance: Math.max(prev.maxDistance, totalMovement),
          }
        : prev
    );
  };

  const finishPointer = (
    e: React.PointerEvent<HTMLButtonElement>,
    cancelled: boolean
  ) => {
    if (!drag || e.pointerId !== drag.pointerId) return;
    try {
      e.currentTarget.releasePointerCapture(drag.pointerId);
    } catch {
      // ignore
    }
    const tile = tiles.find((t) => t.id === drag.tileId);
    const passedThreshold =
      Math.abs(drag.offset) >= tileSize * COMMIT_RATIO;
    const isTap = drag.maxDistance < TAP_MAX_MOVEMENT;

    if (!cancelled && tile && (passedThreshold || isTap)) {
      onTileClick(tile);
    }
    setDrag(null);
  };

  return (
    <div className="flex flex-col items-center gap-3 w-full">
      <div className="relative w-full max-w-[420px] sm:max-w-[300px]">
        <div
          ref={boardRef}
          className="relative w-full aspect-square rounded-2xl p-2 bg-sky-100 border-2 border-sky-200 shadow-sm overflow-hidden"
          style={{ touchAction: "none" }}
        >
          {tiles.map((tile) => {
            const isMovable = isAdjacent(tile) && status === "playing";
            const tileSizePercent = 100 / SIZE;
            const topPercent = tile.currentRow * tileSizePercent;
            const leftPercent = tile.currentCol * tileSizePercent;

            const bgSizePercent = SIZE * 100;
            const bgPosX = (tile.correctCol / (SIZE - 1)) * 100;
            const bgPosY = (tile.correctRow / (SIZE - 1)) * 100;

            const isGoalReached =
              tile.currentRow === tile.correctRow &&
              tile.currentCol === tile.correctCol;

            const isCorrectHighlight =
              isGoalReached && !tile.isEmpty && status === "playing";

            const shouldHide = tile.isEmpty && status !== "won";
            const isThisDragging = drag?.tileId === tile.id;
            const transformValue = isThisDragging
              ? drag.axis === "x"
                ? `translate3d(${drag.offset}px, 0, 0)`
                : `translate3d(0, ${drag.offset}px, 0)`
              : "translate3d(0, 0, 0)";

            return (
              <button
                key={tile.id}
                type="button"
                onPointerDown={(e) => handlePointerDown(e, tile)}
                onPointerMove={handlePointerMove}
                onPointerUp={(e) => finishPointer(e, false)}
                onPointerCancel={(e) => finishPointer(e, true)}
                style={{
                  position: "absolute",
                  top: `${topPercent}%`,
                  left: `${leftPercent}%`,
                  width: `calc(${tileSizePercent}% - 6px)`,
                  height: `calc(${tileSizePercent}% - 6px)`,
                  margin: "3px",
                  transform: transformValue,
                  transition: isThisDragging
                    ? "transform 0ms linear, box-shadow 180ms ease-out"
                    : "top 220ms cubic-bezier(0.22, 1, 0.36, 1), left 220ms cubic-bezier(0.22, 1, 0.36, 1), transform 220ms cubic-bezier(0.22, 1, 0.36, 1), box-shadow 180ms ease-out",
                  touchAction: "none",
                  zIndex: isThisDragging ? 10 : 1,
                  willChange: isThisDragging ? "transform" : "auto",
                  WebkitTapHighlightColor: "transparent",
                }}
                className={`
                  group select-none rounded-xl overflow-hidden text-center relative flex items-center justify-center
                  focus:outline-none bg-white
                  ${isThisDragging ? "shadow-xl" : "shadow-sm"}
                  ${shouldHide ? "pointer-events-none opacity-0" : "opacity-100"}
                  ${isMovable ? "cursor-grab active:cursor-grabbing" : "cursor-default"}
                  ${
                    isCorrectHighlight
                      ? "ring-2 ring-emerald-400"
                      : isMovable
                        ? "ring-2 ring-amber-300"
                        : ""
                  }
                `}
              >
                <div
                  className="absolute inset-0 transition-transform duration-300 group-hover:scale-105 pointer-events-none"
                  style={{
                    backgroundImage: `url(${selectedImageUrl})`,
                    backgroundSize: `${bgSizePercent}% ${bgSizePercent}%`,
                    backgroundPosition: `${bgPosX}% ${bgPosY}%`,
                    backgroundRepeat: "no-repeat",
                  }}
                />

                {showNumbersOnPicture && (
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <div className="px-2 py-0.5 rounded-md bg-white/90 text-slate-800 font-bold text-sm shadow">
                      {tile.value}
                    </div>
                  </div>
                )}

                {isGoalReached && !showNumbersOnPicture && (
                  <div className="absolute top-1.5 right-1.5 w-2.5 h-2.5 rounded-full bg-amber-400 border-2 border-white shadow pointer-events-none" />
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default PuzzleBoard;
