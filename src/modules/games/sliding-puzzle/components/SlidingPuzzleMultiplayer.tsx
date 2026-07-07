"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { LuClock, LuTrophy } from "react-icons/lu";
import {
  createSeededRandom,
  lastNameOf,
  otherRole,
  PlayerAvatar,
  useAtomicClaim,
  useCountdown,
  useFinalizeRoom,
  useSharedState,
  type MultiplayerContext,
  type PlayerRole,
} from "../../realtime";
import { SlidingPuzzleStatus, SlidingPuzzleTile } from "../types";
import { slidingPuzzleAudio } from "../utils/audio";
import PuzzleBoard from "./PuzzleBoard";

const SIZE = 3;
const FALLBACK_IMAGE = "/assets/images/doraemon.png";

interface PuzzleNetState {
  winner?: "p1" | "p2";
  p1?: { matrix: number[]; done: boolean };
  p2?: { matrix: number[]; done: boolean };
}

function solvedTiles(): SlidingPuzzleTile[] {
  const tiles: SlidingPuzzleTile[] = [];
  const count = SIZE * SIZE;
  for (let i = 0; i < count; i++) {
    const row = Math.floor(i / SIZE);
    const col = i % SIZE;
    tiles.push({
      id: i,
      value: i + 1,
      correctRow: row,
      correctCol: col,
      currentRow: row,
      currentCol: col,
      isEmpty: i === count - 1,
    });
  }
  return tiles;
}

/** Deterministic shuffle (seeded) so both players start from the same board. */
function shuffledTiles(seed: number): SlidingPuzzleTile[] {
  const rng = createSeededRandom(seed);
  const tiles = solvedTiles();
  const empty = tiles.find((t) => t.isEmpty)!;
  let lastId = -1;
  for (let step = 0; step < 85; step++) {
    const neighbors: { r: number; c: number }[] = [];
    if (empty.currentRow > 0)
      neighbors.push({ r: empty.currentRow - 1, c: empty.currentCol });
    if (empty.currentRow < SIZE - 1)
      neighbors.push({ r: empty.currentRow + 1, c: empty.currentCol });
    if (empty.currentCol > 0)
      neighbors.push({ r: empty.currentRow, c: empty.currentCol - 1 });
    if (empty.currentCol < SIZE - 1)
      neighbors.push({ r: empty.currentRow, c: empty.currentCol + 1 });
    let candidates = neighbors
      .map((p) => tiles.find((t) => t.currentRow === p.r && t.currentCol === p.c)!)
      .filter((t) => t.id !== lastId);
    if (candidates.length === 0) {
      candidates = neighbors.map(
        (p) => tiles.find((t) => t.currentRow === p.r && t.currentCol === p.c)!
      );
    }
    const pick = candidates[Math.floor(rng() * candidates.length)];
    const tr = empty.currentRow;
    const tc = empty.currentCol;
    empty.currentRow = pick.currentRow;
    empty.currentCol = pick.currentCol;
    pick.currentRow = tr;
    pick.currentCol = tc;
    lastId = pick.id;
  }
  return tiles;
}

function tilesToMatrix(tiles: SlidingPuzzleTile[]): number[] {
  const m = new Array(SIZE * SIZE).fill(8);
  tiles.forEach((t) => {
    m[t.currentRow * SIZE + t.currentCol] = t.id;
  });
  return m;
}

function isSolved(tiles: SlidingPuzzleTile[]): boolean {
  return tiles.every(
    (t) => t.currentRow === t.correctRow && t.currentCol === t.correctCol
  );
}

export function SlidingPuzzleMultiplayer({
  multiplayer,
}: {
  multiplayer: MultiplayerContext;
}) {
  const { roomId, role, seed, isHost } = multiplayer;
  const { state, patch, init } = useSharedState<PuzzleNetState>(roomId);
  const claim = useAtomicClaim(roomId);
  const countdown = useCountdown(multiplayer.startAt);

  const [tiles, setTiles] = useState<SlidingPuzzleTile[]>(() =>
    shuffledTiles(seed)
  );
  const [moves, setMoves] = useState(0);
  const [status, setStatus] = useState<SlidingPuzzleStatus>("idle");
  const [elapsed, setElapsed] = useState(0);
  const startedRef = useRef(false);
  const initializedRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    slidingPuzzleAudio.toggle(true);
  }, []);

  // Host khởi tạo trạng thái phòng. Mỗi người sẽ tự ghép avatar của mình nên
  // không cần đồng bộ ảnh qua RTDB.
  useEffect(() => {
    if (!isHost || initializedRef.current) return;
    if (state === null) {
      initializedRef.current = true;
      init({});
      patch({ [`${role}/matrix`]: tilesToMatrix(tiles), [`${role}/done`]: false });
    } else {
      initializedRef.current = true;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isHost, state]);

  const myImage = multiplayer.self.avatarUrl ?? FALLBACK_IMAGE;
  const opponentImage = multiplayer.opponent.avatarUrl ?? FALLBACK_IMAGE;
  const winner = state?.winner || "";

  const finalWinnerRole: PlayerRole | "draw" | null = winner
    ? (winner as PlayerRole)
    : null;
  useFinalizeRoom({ roomId, isHost, winnerRole: finalWinnerRole });

  // Start playing when the countdown ends.
  useEffect(() => {
    if (countdown === 0 && !startedRef.current && multiplayer.startAt) {
      startedRef.current = true;
      setStatus("playing");
    }
  }, [countdown, multiplayer.startAt]);

  // Count-up timer while playing.
  useEffect(() => {
    if (status === "playing") {
      timerRef.current = setInterval(() => setElapsed((e) => e + 1), 1000);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      timerRef.current = null;
    };
  }, [status]);

  // React to the opponent solving first.
  useEffect(() => {
    if (!winner) return;
    if (winner === role) {
      setStatus("won");
    } else if (status !== "won") {
      setStatus("lost");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [winner]);

  const publishMatrix = useCallback(
    (next: SlidingPuzzleTile[]) => {
      patch({ [`${role}/matrix`]: tilesToMatrix(next) });
    },
    [patch, role]
  );

  const handleTileClick = useCallback(
    async (clicked: SlidingPuzzleTile) => {
      if (status !== "playing") return;
      const next = tiles.map((t) => ({ ...t }));
      const clickedTile = next.find((t) => t.id === clicked.id)!;
      const empty = next.find((t) => t.isEmpty)!;
      const rd = Math.abs(clickedTile.currentRow - empty.currentRow);
      const cd = Math.abs(clickedTile.currentCol - empty.currentCol);
      if (!((rd === 1 && cd === 0) || (rd === 0 && cd === 1))) return;

      const tr = clickedTile.currentRow;
      const tc = clickedTile.currentCol;
      clickedTile.currentRow = empty.currentRow;
      clickedTile.currentCol = empty.currentCol;
      empty.currentRow = tr;
      empty.currentCol = tc;

      setTiles(next);
      setMoves((m) => m + 1);
      slidingPuzzleAudio.playSlide();
      publishMatrix(next);

      if (isSolved(next)) {
        const won = await claim("winner", role);
        if (won) {
          patch({ winner: role, [`${role}/done`]: true });
          setStatus("won");
          slidingPuzzleAudio.playWin();
        } else {
          setStatus("lost");
        }
      }
    },
    [status, tiles, publishMatrix, claim, role, patch]
  );

  const oppMatrix = state?.[otherRole(role)]?.matrix;

  const formatTime = (secs: number) =>
    `${Math.floor(secs / 60)}:${(secs % 60).toString().padStart(2, "0")}`;

  const playable = status === "playing";

  return (
    <div className="mx-auto w-full max-w-3xl overflow-hidden rounded-3xl border border-sky-200 bg-sky-50 text-slate-800 shadow-sm">
      <header className="flex items-center justify-between border-b border-sky-200 bg-white px-4 py-3">
        <div className="flex items-center gap-2">
          <LuClock className="h-5 w-5 text-sky-500" />
          <span className="font-mono text-lg font-bold tabular-nums">
            {formatTime(elapsed)}
          </span>
          <span className="ml-3 text-xs text-slate-400">
            {moves} bước
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <PlayerAvatar
            name={lastNameOf(multiplayer.self.name)}
            color={multiplayer.self.color}
            avatarUrl={multiplayer.self.avatarUrl}
            size={28}
          />
          <span className="text-xs font-bold text-slate-600">
            {lastNameOf(multiplayer.self.name)}
          </span>
        </div>
      </header>

      <main className="grid grid-cols-1 gap-4 px-4 py-5 sm:grid-cols-[1fr_auto]">
        <section className="flex flex-col items-center">
          <div className="relative w-full max-w-[360px]">
            <PuzzleBoard
              tiles={tiles}
              status={status}
              selectedImageUrl={myImage}
              showNumbersOnPicture
              onTileClick={handleTileClick}
            />
            {!playable && status !== "won" && status !== "lost" && (
              <div className="absolute inset-0 z-20 flex items-center justify-center rounded-2xl bg-slate-950/50 text-6xl font-black text-amber-300">
                {countdown && countdown > 0 ? countdown : "GO!"}
              </div>
            )}
            {(status === "won" || status === "lost") && (
              <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-2 rounded-2xl bg-white/85 backdrop-blur-sm">
                <LuTrophy
                  className={`h-10 w-10 ${
                    status === "won" ? "text-amber-500" : "text-slate-400"
                  }`}
                />
                <p
                  className={`text-2xl font-black ${
                    status === "won" ? "text-emerald-600" : "text-rose-600"
                  }`}
                >
                  {status === "won" ? "Bạn thắng!" : "Bạn thua!"}
                </p>
              </div>
            )}
          </div>
        </section>

        {/* Opponent mini-map */}
        <section className="flex flex-col items-center gap-2">
          <div className="flex items-center gap-1.5">
            <PlayerAvatar
              name={lastNameOf(multiplayer.opponent.name)}
              color={multiplayer.opponent.color}
              avatarUrl={multiplayer.opponent.avatarUrl}
              size={28}
            />
            <span className="text-xs font-semibold text-slate-500">
              {lastNameOf(multiplayer.opponent.name)}
            </span>
          </div>
          <OpponentMiniMap matrix={oppMatrix} image={opponentImage} />
          {state?.[otherRole(role)]?.done && (
            <span className="text-[11px] font-bold text-rose-500">
              Đã xong!
            </span>
          )}
        </section>
      </main>
    </div>
  );
}

function OpponentMiniMap({
  matrix,
  image,
}: {
  matrix: number[] | undefined;
  image: string;
}) {
  const cells = useMemo(() => matrix ?? new Array(SIZE * SIZE).fill(-1), [
    matrix,
  ]);
  return (
    <div className="grid w-[132px] grid-cols-3 gap-0.5 rounded-lg border border-sky-200 bg-white p-1">
      {cells.map((id: number, idx: number) => {
        const empty = id === SIZE * SIZE - 1 || id < 0;
        if (empty) {
          return (
            <div
              key={idx}
              className="aspect-square rounded bg-slate-100"
            />
          );
        }
        // `id` cho biết mảnh nào đang nằm ở ô này; vị trí gốc của mảnh quyết định
        // phần ảnh được cắt ra (background-position).
        const correctRow = Math.floor(id / SIZE);
        const correctCol = id % SIZE;
        return (
          <div
            key={idx}
            className="relative aspect-square overflow-hidden rounded ring-1 ring-sky-200"
            style={{
              backgroundImage: `url(${image})`,
              backgroundSize: `${SIZE * 100}% ${SIZE * 100}%`,
              backgroundPosition: `${(correctCol / (SIZE - 1)) * 100}% ${
                (correctRow / (SIZE - 1)) * 100
              }%`,
            }}
          >
            <span className="absolute bottom-0 right-0 rounded-tl bg-black/45 px-1 text-[8px] font-bold leading-tight text-white">
              {id + 1}
            </span>
          </div>
        );
      })}
    </div>
  );
}
