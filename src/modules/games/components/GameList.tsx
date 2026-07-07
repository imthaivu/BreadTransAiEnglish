"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import toast from "react-hot-toast";
import { FiArrowLeft } from "react-icons/fi";
import { useAuth } from "@/lib/auth/context";
import { appendGameInviteMessage } from "@/modules/classes/api/admiration";
import { Caro } from "../caro";
import { FlappyBird } from "../flappy-bird";
import { ShellGame } from "../shell-game";
import { SkyHigh } from "../sky-high";
import { SlidingPuzzle } from "../sliding-puzzle";
import { GAME_PREVIEWS, ScaledPreview } from "./GamePreviews";
import {
  RosterStrip,
  useMultiplayer,
  createInvitation,
  decodeDragPayload,
  INVITE_DND_TYPE,
  type SimplePlayer,
} from "../lobby";
import {
  destroyHostWaitingRoomIfStale,
  destroyOrphanWaitingRoom,
} from "../realtime/room";
import { MessagesFeed } from "../messages";
import { useRankedPlay } from "../hooks";
import { UserBreadBadge } from "./UserBreadBadge";
import { RewardPopup } from "./RewardPopup";
import { collectValidTickets } from "@/lib/games/ticket-utils";
import { formatRemainingTime } from "@/utils/presenceRelativeTime";
import { LuTicket } from "react-icons/lu";
import { useGlobalPresenceMap } from "@/modules/presence";
import { get } from "firebase/database";
import { userActiveRoomRef } from "../realtime/paths";
import type { SoloGameMode, SoloResultPayload } from "../realtime";
import type { GameDifficulty } from "@/lib/games/types";
import { PVP_STAKE, PVP_WIN } from "@/lib/games/types";

type GameId =
  | "flappy-bird"
  | "shell-game"
  | "caro"
  | "sky-high"
  | "sliding-puzzle";

const GAME_URL_PARAM = "game";

const GAME_IDS: GameId[] = [
  "flappy-bird",
  "shell-game",
  "caro",
  "sky-high",
  "sliding-puzzle",
];

function isGameId(value: unknown): value is GameId {
  return typeof value === "string" && GAME_IDS.includes(value as GameId);
}

interface GameListProps {
  onActiveGameChange?: (id: GameId | null) => void;
}

interface GameItem {
  id: GameId;
  title: string;
  Preview: React.FC;
}

const GAMES_REQUIRING_DIFFICULTY: GameId[] = ["caro", "sliding-puzzle"];

const GAMES: GameItem[] = [
  { id: "flappy-bird", title: "Flappy Bird", Preview: GAME_PREVIEWS["flappy-bird"] },
  { id: "shell-game", title: "Tìm bóng", Preview: GAME_PREVIEWS["shell-game"] },
  { id: "caro", title: "Cờ Caro", Preview: GAME_PREVIEWS.caro },
  { id: "sky-high", title: "Sky High", Preview: GAME_PREVIEWS["sky-high"] },
  {
    id: "sliding-puzzle",
    title: "Sliding 3x3",
    Preview: GAME_PREVIEWS["sliding-puzzle"],
  },
];

export function GameList({ onActiveGameChange }: GameListProps = {}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [activeGameId, setActiveGameId] = useState<GameId | null>(() => {
    const param = searchParams.get(GAME_URL_PARAM);
    return isGameId(param) ? param : null;
  });
  const [dropTargetId, setDropTargetId] = useState<GameId | null>(null);
  const [soloMode, setSoloMode] = useState<SoloGameMode>("practice");
  const [playToken, setPlayToken] = useState<string | null>(null);
  // Công tắc "Dùng vé": bật thì bấm trò nào cũng chơi bằng vé (trừ vé).
  const [useTicketMode, setUseTicketMode] = useState(false);
  // Popup khoe số bánh kiếm được sau ván có vé.
  const [reward, setReward] = useState<{ reward: number; won: boolean } | null>(
    null
  );
  // Đang chờ server tính thưởng (popup hiện ngay ở trạng thái loading).
  const [rewardPending, setRewardPending] = useState(false);
  const { profile, refetchProfile } = useAuth();
  const { active, enterRoom } = useMultiplayer();
  const { start: startRanked, finish: finishRanked } = useRankedPlay();
  const presenceMap = useGlobalPresenceMap();

  // Cùng nguồn realtime với UserBreadBadge (onSnapshot profile) — không dùng React Query
  // vì cache vé có thể cũ khi GV cấp vé trong lúc học sinh đang ở màn game.
  const validTickets = useMemo(
    () => (profile ? collectValidTickets(profile) : []),
    [
      profile?.gameTickets,
      profile?.allowedTicket,
      profile?.ticketExpiresAt,
      profile?.ticketGrantedBy,
      profile?.ticketGrantedAt,
    ]
  );
  const ticketCount = validTickets.length;
  const hasTicket = ticketCount > 0;
  const nextExpiresAt = validTickets[0]?.expiresAt ?? null;
  const ticketRemaining = nextExpiresAt
    ? formatRemainingTime(nextExpiresAt)
    : null;

  // Lưu game đang chơi vào URL (?game=...) để reload vẫn giữ đúng game.
  const updateGameParam = useCallback(
    (id: GameId | null) => {
      const params = new URLSearchParams(searchParams.toString());
      if (id) {
        params.set(GAME_URL_PARAM, id);
      } else {
        params.delete(GAME_URL_PARAM);
      }
      const qs = params.toString();
      if (qs !== searchParams.toString()) {
        router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
      }
    },
    [router, pathname, searchParams]
  );

  const openGame = useCallback(
    (id: GameId, mode: SoloGameMode, token: string | null) => {
      setSoloMode(mode);
      setPlayToken(token);
      setActiveGameId(id);
      updateGameParam(id);
    },
    [updateGameParam]
  );

  const closeGame = useCallback(() => {
    setActiveGameId(null);
    setPlayToken(null);
    setSoloMode("practice");
    updateGameParam(null);
  }, [updateGameParam]);

  // Tắt công tắc nếu hết vé.
  useEffect(() => {
    if (!hasTicket && useTicketMode) setUseTicketMode(false);
  }, [hasTicket, useTicketMode]);

  // Vào game theo trạng thái công tắc Dùng Vé.
  const enterGame = useCallback(
    async (id: GameId) => {
      const wantRanked = useTicketMode && hasTicket;
      if (!wantRanked) {
        openGame(id, "practice", null);
        return;
      }
      if (GAMES_REQUIRING_DIFFICULTY.includes(id)) {
        // Vào lượt ranked chờ chọn độ khó; vé chỉ bị trừ khi chọn độ khó.
        openGame(id, "ranked", null);
        return;
      }
      try {
        const { playToken: token } = await startRanked.mutateAsync({ gameId: id });
        openGame(id, "ranked", token);
        toast.success("Đã dùng vé — thắng để nhận bánh!");
        refetchProfile();
      } catch (err) {
        toast.error(
          err instanceof Error ? err.message : "Không thể bắt đầu lượt có vé."
        );
        openGame(id, "practice", null);
      }
    },
    [useTicketMode, hasTicket, openGame, startRanked, refetchProfile]
  );

  // Game gọi để tiêu 1 vé cho ván kế tiếp (ván đầu, hoặc khi bấm "Chơi lại").
  // Trả về false nếu hết vé ⇒ game tự chuyển sang chơi tập luyện.
  const consumeTicketForRanked = useCallback(
    async (difficulty?: GameDifficulty) => {
      if (!activeGameId) return false;
      try {
        const { playToken: token } = await startRanked.mutateAsync({
          gameId: activeGameId,
          ...(difficulty ? { difficulty } : {}),
        });
        setPlayToken(token);
        toast.success("Đã dùng vé — thắng để nhận bánh!");
        refetchProfile();
        return true;
      } catch {
        setPlayToken(null);
        return false;
      }
    },
    [activeGameId, startRanked, refetchProfile]
  );

  const handleSoloResult = useCallback(
    async (result: SoloResultPayload) => {
      if (soloMode !== "ranked" || !playToken) return;
      // Mở popup ngay lập tức ở trạng thái loading để chặn "Chơi lại" trong lúc
      // chờ server tính thưởng (tránh popup đè lên ván chơi mới).
      setRewardPending(true);
      try {
        const data = await finishRanked.mutateAsync({ playToken, result });
        setReward({ reward: data.reward, won: !!result.won });
        refetchProfile();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Không thể nhận thưởng.");
        setRewardPending(false);
      }
    },
    [soloMode, playToken, finishRanked, refetchProfile]
  );

  // Khoá "Chơi lại" từ lúc kết thúc ván (popup đang tính) cho tới khi đóng popup.
  const replayLocked = soloMode === "ranked" && (rewardPending || !!reward);

  const closeReward = useCallback(() => {
    setReward(null);
    setRewardPending(false);
  }, []);

  const soloGameProps = {
    soloMode,
    playToken: playToken ?? undefined,
    onRankedStart: soloMode === "ranked" ? consumeTicketForRanked : undefined,
    onSoloResult: soloMode === "ranked" ? handleSoloResult : undefined,
    replayLocked,
  };

  // Remount khi đổi game hoặc đổi chế độ vào (KHÔNG theo playToken — để chơi lại
  // nhiều ván trong cùng một phiên mà không bị reset.
  const gameInstanceKey = `${activeGameId}-${soloMode}`;

  const sendInvite = async (gameId: GameId, target: SimplePlayer) => {
    if (!profile?.uid) return;
    if (target.id === profile.uid) {
      toast.error("Không thể tự mời chính mình");
      return;
    }
    if ((profile.totalBanhRan ?? 0) < PVP_STAKE) {
      toast.error(
        `Bạn cần ít nhất ${PVP_STAKE} bánh để mời đấu solo (thắng nhận ${PVP_WIN}).`
      );
      return;
    }
    try {
      const targetOnLearn =
        presenceMap[target.id]?.currentActivity?.tab === "Learn";
      let inviteeBusy: "learn" | "game" | undefined = targetOnLearn
        ? "learn"
        : undefined;
      if (!targetOnLearn) {
        const targetSnap = await get(userActiveRoomRef(target.id));
        if (targetSnap.exists()) inviteeBusy = "game";
      }

      if (active?.roomId) {
        await destroyOrphanWaitingRoom(active.roomId);
      }
      await destroyHostWaitingRoomIfStale({ hostUid: profile.uid });
      const { roomId, inviteId } = await createInvitation({
        from: {
          id: profile.uid,
          name: profile.displayName || "Học sinh",
          avatarUrl: profile.avatarUrl ?? null,
        },
        to: target,
        gameId,
      });
      enterRoom(roomId, "p1", gameId, { inviteeBusy });
      if (inviteeBusy) {
        void appendGameInviteMessage({
          toStudentId: target.id,
          toStudentName: target.name,
          fromStudentId: profile.uid,
          fromStudentName: profile.displayName || "Học sinh",
          fromStudentAvatarUrl: profile.avatarUrl ?? null,
          gameId,
          roomId,
          inviteId,
        });
      } else {
        toast.success(`Đã gửi lời mời tới ${target.name}`);
      }
    } catch {
      toast.error("Gửi lời mời thất bại. Kiểm tra kết nối Realtime Database.");
    }
  };

  const handleInviteDrop = async (e: React.DragEvent, gameId: GameId) => {
    e.preventDefault();
    setDropTargetId(null);
    const raw = e.dataTransfer.getData(INVITE_DND_TYPE);
    const target = decodeDragPayload(raw);
    if (!target) return;
    await sendInvite(gameId, target);
  };

  const handleTouchInviteDrop = (gameId: string, target: SimplePlayer) => {
    setDropTargetId(null);
    void sendInvite(gameId as GameId, target);
  };

  const handleTouchDragOver = (gameId: string | null) => {
    setDropTargetId(gameId as GameId | null);
  };

  useEffect(() => {
    onActiveGameChange?.(activeGameId);
  }, [activeGameId, onActiveGameChange]);

  useEffect(() => {
    return () => {
      onActiveGameChange?.(null);
    };
  }, [onActiveGameChange]);

  if (activeGameId) {
    return (
      <div className="py-2">
        <div className="flex items-center justify-start mb-3">
          <button
            type="button"
            onClick={closeGame}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 px-3 py-1.5 rounded-full transition-colors"
          >
            <FiArrowLeft className="w-3.5 h-3.5" /> Quay lại
          </button>
        </div>
        <div className="w-full flex justify-center">
          {activeGameId === "flappy-bird" ? (
            <FlappyBird key={gameInstanceKey} {...soloGameProps} />
          ) : activeGameId === "shell-game" ? (
            <ShellGame key={gameInstanceKey} {...soloGameProps} />
          ) : activeGameId === "caro" ? (
            <Caro key={gameInstanceKey} {...soloGameProps} />
          ) : activeGameId === "sky-high" ? (
            <SkyHigh key={gameInstanceKey} {...soloGameProps} />
          ) : (
            <SlidingPuzzle key={gameInstanceKey} {...soloGameProps} />
          )}
        </div>

        <RewardPopup
          open={rewardPending || !!reward}
          loading={rewardPending && !reward}
          reward={reward?.reward ?? 0}
          won={reward?.won ?? false}
          onClose={closeReward}
        />
      </div>
    );
  }

  return (
    <div className="py-2">
      <div className="mb-1.5 flex items-center justify-between gap-1.5">
        <button
          type="button"
          role="switch"
          aria-checked={useTicketMode}
          disabled={!hasTicket}
          onClick={() => setUseTicketMode((v) => !v)}
          title={
            hasTicket
              ? "Bật để chơi bằng vé (thắng nhận bánh)"
              : "Bạn chưa có vé"
          }
          className={`inline-flex h-6 items-center gap-1 rounded-full border pl-2 pr-1 text-[11px] font-semibold shadow-sm transition ${
            useTicketMode
              ? "border-amber-300 bg-amber-100 text-amber-800"
              : hasTicket
                ? "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                : "cursor-not-allowed border-slate-200 bg-slate-50 text-slate-300"
          }`}
        >
          <span className="tabular-nums text-green-500">
            {hasTicket ? `${ticketCount} vé` : "0 vé"}
          </span>
          {ticketRemaining && (
            <span className="font-medium opacity-70">· {ticketRemaining}</span>
          )}
          <span>Dùng</span>
          <span
            className={`relative h-3.5 w-6 shrink-0 rounded-full transition-colors ${
              useTicketMode ? "bg-amber-500" : "bg-slate-300"
            }`}
          >
            <span
              className={`absolute top-0.5 h-2.5 w-2.5 rounded-full bg-white shadow transition-all ${
                useTicketMode ? "left-3" : "left-0.5"
              }`}
            />
          </span>
        </button>
        <UserBreadBadge variant="light" only="bread" />
      </div>
     
     
      <RosterStrip
        onTouchInviteDrop={handleTouchInviteDrop}
        onTouchDragOver={handleTouchDragOver}
      />
      <div className="grid grid-cols-5 gap-2">
        {GAMES.map((game) => {
          const Preview = game.Preview;
          const isDropTarget = dropTargetId === game.id;
          return (
            <button
              key={game.id}
              type="button"
              data-invite-drop-target={game.id}
              onClick={() => void enterGame(game.id)}
              onDragOver={(e) => {
                if (e.dataTransfer.types.includes(INVITE_DND_TYPE)) {
                  e.preventDefault();
                  e.dataTransfer.dropEffect = "copy";
                  if (dropTargetId !== game.id) setDropTargetId(game.id);
                }
              }}
              onDragLeave={() => {
                if (dropTargetId === game.id) setDropTargetId(null);
              }}
              onDrop={(e) => handleInviteDrop(e, game.id)}
              aria-label={game.title}
              className="group flex flex-col items-stretch gap-1 text-left"
            >
              {/* Ảnh game (ô vuông) */}
              <div
                className={`relative aspect-square overflow-hidden rounded-2xl border bg-white hover:shadow-lg transition-all ${
                  isDropTarget
                    ? "border-amber-400 ring-2 ring-amber-400 scale-[1.03]"
                    : "border-slate-200 group-hover:border-amber-300"
                }`}
              >
                <ScaledPreview>
                  <Preview />
                </ScaledPreview>

                {isDropTarget && (
                  <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-amber-400/30">
                    <span className="rounded-full bg-white/90 px-3 py-1 text-xs font-bold text-amber-600 shadow">
                      Thả để mời chơi
                    </span>
                  </div>
                )}

                {/* Vành sáng khi hover */}
                <div className="pointer-events-none absolute inset-0 ring-0 group-hover:ring-2 group-hover:ring-amber-400/70 rounded-2xl transition-all" />
              </div>

              {/* Tiêu đề nằm ngoài ảnh */}
              <h3 className="px-0.5 text-[11px] leading-tight font-semibold text-slate-700 line-clamp-2">
                {game.title}
              </h3>
            </button>
          );
        })}
      </div>
      {profile?.role !== "teacher" ? <MessagesFeed /> : null}
    </div>
  );
}

export default GameList;
