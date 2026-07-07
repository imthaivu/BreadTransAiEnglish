"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  FiAlertTriangle,
  FiAward,
  FiLoader,
  FiWifiOff,
  FiX,
} from "react-icons/fi";
import { Caro } from "../caro";
import { FlappyBird } from "../flappy-bird";
import { ShellGame } from "../shell-game";
import { SkyHigh } from "../sky-high";
import { SlidingPuzzle } from "../sliding-puzzle";
import { useAuth } from "@/lib/auth/context";
import { otherRole, useRoom, useRoomPresence } from "../realtime/hooks";
import {
  areAllPresentPlayersOffline,
  claimDisconnectWin,
  destroyRoom,
  FINISHED_ROOM_TTL_MS,
  forfeitRoom,
  getDisconnectGraceMs,
  getOpponentDisconnectedElapsed,
  isOpponentDisconnected,
  PLAYING_ABANDON_MS,
} from "../realtime/room";
import { getServerNow } from "../realtime/serverTime";
import { lastNameOf, PlayerAvatar } from "../realtime/PlayerAvatar";
import {
  GAME_TITLES,
  type MultiplayerContext,
  type MultiplayerGameId,
  type PlayerRole,
  type RoomMeta,
  type WinnerReason,
} from "../realtime/types";
import { useGameBattle } from "../hooks";
import { INVITE_TTL_MS } from "./invitations";
import { GAME_PREVIEWS, ScaledPreview } from "../components/GamePreviews";
import { RewardPopup } from "../components/RewardPopup";
import { PVP_STAKE, PVP_WIN } from "@/lib/games/types";
import toast from "react-hot-toast";

interface GameHostProps {
  roomId: string;
  role: PlayerRole;
  inviteeBusy?: "learn" | "game";
  onExit: () => void;
}

const DISCONNECT_BANNER_DEBOUNCE_MS = 500;
/** Timeout khi chưa nhận snapshot RTDB đầu tiên. */
const LOADING_TIMEOUT_MS = 15_000;
/** Timeout khi kẹt màn chờ ctx / phòng hỏng. */
const STUCK_WAITING_TIMEOUT_MS = 6_000;

/**
 * Full-screen overlay that renders the active multiplayer game. Shows a waiting
 * screen until the opponent joins, then mounts the game with its multiplayer
 * context. Mounted globally by MultiplayerProvider.
 *
 * Xử lý mất kết nối kiểu "thật":
 * - Người chơi mất mạng/đóng tab → presence flip offline nhưng PHÒNG VẪN CÒN.
 *   Khi họ quay lại lobby, MultiplayerProvider tự rejoin và chơi tiếp.
 * - Nếu mất kết nối quá `DISCONNECT_GRACE_MS`, đối thủ còn online sẽ tự động
 *   claim chiến thắng qua transaction.
 * - Bấm "Thoát" khi đang chơi = xử thua (forfeit).
 * - Bấm "Thoát" khi đang chờ hoặc đã kết thúc = xoá phòng + đóng overlay.
 * - Phòng `finished` tự dọn sau FINISHED_ROOM_TTL_MS hoặc khi cả hai offline.
 * - Phòng `playing` bỏ dở (cả hai offline) tự dọn sau PLAYING_ABANDON_MS.
 */
export function GameHost({
  roomId,
  role,
  inviteeBusy,
  onExit,
}: GameHostProps) {
  const { profile } = useAuth();
  const uid = profile?.uid ?? null;
  const meta = useRoom(roomId);

  const [confirmForfeit, setConfirmForfeit] = useState(false);
  const [pendingExit, setPendingExit] = useState(false);
  const [stakeFailed, setStakeFailed] = useState(false);
  // Đang tính thưởng (popup hiện ngay ở trạng thái loading) / kết quả thưởng PvP.
  const [settlingReward, setSettlingReward] = useState(false);
  const [pvpReward, setPvpReward] = useState<{
    reward: number;
    won: boolean;
  } | null>(null);
  const [inviteSecondsLeft, setInviteSecondsLeft] = useState(
    INVITE_TTL_MS / 1000
  );

  const status = meta?.status ?? null;
  // Chỉ bật presence khi đã rời pha waiting: trong waiting, room.ts vẫn dùng
  // onDisconnect.remove() để dọn phòng mồ côi nếu chủ rời trước khi có khách.
  useRoomPresence(roomId, role, status === "playing" || status === "finished");
  const winnerRole = meta?.winnerRole ?? null;
  const winnerReason = meta?.winnerReason ?? null;
  const forfeitRole = meta?.forfeitRole ?? null;

  // Khi phòng biến mất (chủ rời lúc còn waiting, đã destroyRoom, hoặc index
  // userActiveRooms trỏ tới phòng đã chết) → tự đóng overlay.
  useEffect(() => {
    if (meta !== null) return;
    const t = setTimeout(() => onExit(), 400);
    return () => clearTimeout(t);
  }, [meta, onExit]);

  const oppRole: PlayerRole = otherRole(role);
  const myPresence = meta?.presence?.[role];
  const oppPresence = meta?.presence?.[oppRole];
  const opponentName = meta?.players?.[oppRole]?.name ?? "Đối thủ";
  const selfIsDisconnected = myPresence?.online === false;
  const oppExplicitlyOffline = oppPresence?.online === false;

  const oppDisconnected =
    status === "playing" && !!meta && isOpponentDisconnected(meta, oppRole);

  const disconnectGraceMs =
    meta && status === "playing" ? getDisconnectGraceMs(meta) : 30_000;

  const [oppOfflineSinceClient, setOppOfflineSinceClient] = useState<
    number | null
  >(null);
  useLayoutEffect(() => {
    if (oppExplicitlyOffline) {
      setOppOfflineSinceClient((prev) => prev ?? Date.now());
    } else {
      setOppOfflineSinceClient(null);
    }
  }, [oppExplicitlyOffline]);

  const [nowTick, setNowTick] = useState(0);
  useEffect(() => {
    if (!oppExplicitlyOffline && !oppDisconnected) return;
    const t = setInterval(() => setNowTick((n) => n + 1), 250);
    return () => clearInterval(t);
  }, [oppExplicitlyOffline, oppDisconnected]);

  const oppDisconnectElapsed = useMemo(() => {
    if (!oppExplicitlyOffline) return 0;

    let serverElapsed = 0;
    const since = oppPresence?.disconnectSince ?? oppPresence?.lastSeen;
    if (typeof since === "number" && since > 0) {
      const delta = getServerNow() - since;
      if (delta >= 0) serverElapsed = delta;
    }

    const clientElapsed = oppOfflineSinceClient
      ? Date.now() - oppOfflineSinceClient
      : 0;

    return Math.max(serverElapsed, clientElapsed);
  }, [oppPresence, oppExplicitlyOffline, oppOfflineSinceClient, nowTick]);

  const oppDisconnectedElapsed = useMemo(() => {
    if (!meta || status !== "playing" || !oppDisconnected) return 0;
    return getOpponentDisconnectedElapsed(meta, oppRole);
  }, [meta, status, oppRole, oppDisconnected, nowTick]); // eslint-disable-line react-hooks/exhaustive-deps

  const showDisconnectBanner =
    status === "playing" &&
    !selfIsDisconnected &&
    oppExplicitlyOffline &&
    oppDisconnectElapsed >= DISCONNECT_BANNER_DEBOUNCE_MS;
  const disconnectElapsedForUi = oppExplicitlyOffline
    ? oppDisconnectElapsed
    : oppDisconnectedElapsed;
  const disconnectRemainingMs = Math.max(
    0,
    disconnectGraceMs - disconnectElapsedForUi
  );

  // Tự claim thắng khi đối thủ mất mạng quá grace period. Dùng ref để chỉ gọi 1 lần.
  const claimedRef = useRef(false);
  const battleStartedRef = useRef(false);
  const battleStartErrorToastRef = useRef(false);
  const battleSettledRef = useRef(false);
  const stakeFailedHandledRef = useRef(false);
  const { start: startBattle, settle: settleBattle } = useGameBattle();
  const startBattleAsync = startBattle.mutateAsync;
  const settleBattleAsync = settleBattle.mutateAsync;
  useEffect(() => {
    if (status !== "playing") {
      claimedRef.current = false;
      return;
    }
    if (!oppDisconnected) {
      claimedRef.current = false;
      return;
    }
    if (disconnectRemainingMs > 0) return;
    if (claimedRef.current) return;
    claimedRef.current = true;
    void claimDisconnectWin({ roomId, byRole: role });
  }, [status, oppDisconnected, disconnectRemainingMs, roomId, role]);

  const p1Id = meta?.players?.p1?.id;
  const p2Id = meta?.players?.p2?.id;

  // Cọc bánh khi trận đấu solo bắt đầu (cả hai đã vào phòng).
  // Chỉ host (p1) gọi API — giảm tải, tránh đua giữa hai client. Tính đúng đắn
  // (exactly-once) đã được đảm bảo bằng transaction nguyên tử phía server.
  useEffect(() => {
    if (status !== "playing" || !p1Id || !p2Id) {
      if (status !== "playing") {
        battleStartedRef.current = false;
        battleStartErrorToastRef.current = false;
      }
      return;
    }
    if (role !== "p1") return;
    if (battleStartedRef.current) return;
    battleStartedRef.current = true;
    void startBattleAsync(roomId).catch((err) => {
      const code = (err as { code?: string })?.code;
      if (code === "INSUFFICIENT_BALANCE") {
        // Server kiểm tra cả hai người — báo một lần rồi huỷ phòng (không retry).
        setStakeFailed(true);
        return;
      }
      if (!battleStartErrorToastRef.current) {
        battleStartErrorToastRef.current = true;
        toast.error(
          err instanceof Error
            ? err.message
            : "Không đủ bánh để cọc trận đấu solo."
        );
      }
    });
  }, [status, p1Id, p2Id, roomId, role, startBattleAsync]);

  const winnerRoleForSettle = meta?.winnerRole ?? null;

  // Trả thưởng khi trận kết thúc. Mở RewardPopup NGAY ở trạng thái loading rồi
  // điền số bánh khi server tính xong — giống luồng ranked solo.
  useEffect(() => {
    if (status !== "finished") {
      battleSettledRef.current = false;
      setSettlingReward(false);
      setPvpReward(null);
      return;
    }
    if (battleSettledRef.current) return;
    battleSettledRef.current = true;
    const won = winnerRoleForSettle === role;
    setSettlingReward(true);
    void settleBattleAsync(roomId)
      .then((data) => {
        setPvpReward({ reward: data.reward, won });
      })
      .catch((err) => {
        toast.error(
          err instanceof Error ? err.message : "Không thể tổng kết thưởng."
        );
      })
      .finally(() => {
        setSettlingReward(false);
      });
  }, [status, winnerRoleForSettle, role, roomId, settleBattleAsync]);

  const ctx = useMemo<MultiplayerContext | null>(() => {
    if (!meta) return null;
    const self = meta.players?.[role];
    const opponent = meta.players?.[oppRole];
    if (!self || !opponent) return null;
    return {
      roomId,
      role,
      color: self.color,
      self,
      opponent,
      seed: meta.seed,
      hostId: meta.hostId,
      isHost: meta.hostId === self.id,
      startAt: meta.startAt,
    };
  }, [meta, role, oppRole, roomId]);

  const finishedCleanupRef = useRef(false);
  const brokenExitRef = useRef(false);

  useEffect(() => {
    if (status !== "finished") {
      finishedCleanupRef.current = false;
      return;
    }
    const t = setTimeout(() => {
      if (finishedCleanupRef.current) return;
      finishedCleanupRef.current = true;
      void destroyRoom(roomId, meta ?? undefined, uid).then(() => onExit());
    }, FINISHED_ROOM_TTL_MS);
    return () => clearTimeout(t);
  }, [status, roomId, meta, uid, onExit]);

  useEffect(() => {
    if (status !== "finished" || !meta) return;
    if (!areAllPresentPlayersOffline(meta)) return;
    const t = setTimeout(() => {
      if (finishedCleanupRef.current) return;
      finishedCleanupRef.current = true;
      void destroyRoom(roomId, meta, uid).then(() => onExit());
    }, 5_000);
    return () => clearTimeout(t);
  }, [status, meta, roomId, uid, onExit]);

  const playingCleanupRef = useRef(false);
  useEffect(() => {
    if (status !== "playing" || !meta) {
      playingCleanupRef.current = false;
      return;
    }
    if (!areAllPresentPlayersOffline(meta)) return;
    const t = setTimeout(() => {
      if (playingCleanupRef.current) return;
      playingCleanupRef.current = true;
      void destroyRoom(roomId, meta, uid).then(() => onExit());
    }, PLAYING_ABANDON_MS);
    return () => clearTimeout(t);
  }, [status, meta, roomId, uid, onExit]);

  const closeAndExit = useCallback(async () => {
    setPendingExit(true);
    try {
      if (status === "waiting" || status === "finished") {
        finishedCleanupRef.current = true;
        await destroyRoom(roomId, meta ?? undefined, uid);
      }
    } finally {
      onExit();
    }
  }, [roomId, onExit, status, meta, uid]);

  // Thoát dứt khoát + dọn phòng — dùng cho phòng "hỏng" (thiếu người chơi nên
  // không dựng được ctx) hoặc khi người dùng tự bấm thoát ở màn chờ kết nối.
  const forceExit = useCallback(async () => {
    if (brokenExitRef.current) return;
    brokenExitRef.current = true;
    setPendingExit(true);
    try {
      finishedCleanupRef.current = true;
      await destroyRoom(roomId, meta ?? undefined, uid);
    } catch {
      /* noop */
    } finally {
      onExit();
    }
  }, [roomId, meta, uid, onExit]);

  // Tránh đưa `forceExit` vào deps của các effect timeout/toast — meta RTDB đổi
  // liên tục sẽ tạo lại callback và kích hoạt lại effect (toast lặp, timer reset).
  const forceExitRef = useRef(forceExit);
  forceExitRef.current = forceExit;

  // Lời mời sống theo INVITE_TTL_MS: đếm ngược trên màn hình chờ và nếu đối thủ
  // không chấp nhận kịp, host tự huỷ lời mời (xoá phòng `waiting`) — bên kia
  // cũng tự ẩn popup khi phòng biến mất. Dùng đồng hồ cục bộ cho khớp 2 bên.
  useEffect(() => {
    if (status !== "waiting") {
      setInviteSecondsLeft(INVITE_TTL_MS / 1000);
      return;
    }
    const startedAt = Date.now();
    setInviteSecondsLeft(INVITE_TTL_MS / 1000);
    const interval = setInterval(() => {
      const remaining = INVITE_TTL_MS - (Date.now() - startedAt);
      setInviteSecondsLeft(Math.max(0, Math.ceil(remaining / 1000)));
      if (remaining <= 0) void closeAndExit();
    }, 250);
    return () => clearInterval(interval);
  }, [status, closeAndExit]);

  const doForfeit = useCallback(async () => {
    setPendingExit(true);
    try {
      await forfeitRoom({ roomId, role });
    } finally {
      setPendingExit(false);
      setConfirmForfeit(false);
    }
  }, [roomId, role]);

  const handleExitClick = useCallback(() => {
    if (status === "playing" && winnerRole == null) {
      setConfirmForfeit(true);
      return;
    }
    void closeAndExit();
  }, [status, winnerRole, closeAndExit]);

  const loading = meta === undefined;
  const waiting = !!meta && (status === "waiting" || !ctx);
  // Phòng "hỏng": đã có meta và không còn ở pha `waiting`, nhưng thiếu người
  // chơi nên không dựng được ctx (vd. đối thủ thoát đột ngột làm phòng mồ côi).
  const ctxBroken =
    !!meta && status !== null && status !== "waiting" && !ctx;

  // Timeout khi chưa nhận snapshot RTDB — tránh kẹt vĩnh viễn ở "Đang kết nối phòng…".
  useEffect(() => {
    if (meta !== undefined) return;
    const t = setTimeout(() => {
      toast.error("Không kết nối được phòng. Vui lòng thử lại.");
      void forceExitRef.current();
    }, LOADING_TIMEOUT_MS);
    return () => clearTimeout(t);
  }, [meta]);

  // Tự thoát khi kẹt màn chờ ctx (cả "Đang vào trận…" lẫn "Đối thủ đã rời phòng…").
  // Bỏ qua pha `waiting` (chờ chấp nhận lời mời) — đã có bộ đếm INVITE_TTL_MS lo.
  useEffect(() => {
    if (status === "finished" || status === "waiting") return;
    if (!waiting && !ctxBroken) return;
    const t = setTimeout(() => void forceExitRef.current(), STUCK_WAITING_TIMEOUT_MS);
    return () => clearTimeout(t);
  }, [status, waiting, ctxBroken]);

  // Cọc bánh thất bại vì có người không đủ 20 bánh → báo một lần và huỷ trận.
  useEffect(() => {
    if (!stakeFailed) {
      stakeFailedHandledRef.current = false;
      return;
    }
    if (stakeFailedHandledRef.current) return;
    stakeFailedHandledRef.current = true;
    toast.error(
      `Một người chơi không đủ ${PVP_STAKE} bánh để cọc — trận đấu solo đã huỷ.`
    );
    void forceExitRef.current();
  }, [stakeFailed]);
  const finished = status === "finished" && winnerRole != null;
  const iWon = finished && winnerRole === role;
  const iForfeited = finished && forfeitRole === role;
  // FinishedOverlay chỉ dành cho các nguyên nhân ngoài luồng game (forfeit /
  // mất kết nối). Khi game kết thúc theo luật (`reason === "win"|"draw"`), mỗi
  // game đã có UI kết quả riêng — không phủ overlay để tránh trùng lặp.
  const showFinishedOverlay =
    finished &&
    (winnerReason === "forfeit" || winnerReason === "disconnect");

  // Popup khoe bánh sau khi trận PvP kết thúc — hiện ngay (loading) rồi điền số
  // bánh. z cao hơn FinishedOverlay (z-[10001]) để luôn nổi lên trên.
  const rewardPopupEl = (
    <RewardPopup
      open={settlingReward || !!pvpReward}
      loading={settlingReward && !pvpReward}
      reward={pvpReward?.reward ?? 0}
      won={pvpReward?.won ?? false}
      zIndexClassName="z-[10050]"
      onClose={() => setPvpReward(null)}
    />
  );

  // Khi host vừa gửi lời mời và đang chờ đối thủ chấp nhận: thay vì overlay
  // toàn màn hình, chỉ hiện một popup gọn ở góc dưới (đối thủ + game + thưởng).
  if (meta && status === "waiting" && meta.players?.p1) {
    return (
      <WaitingInvitePopup
        gameId={meta.gameId}
        self={meta.players[role] ?? meta.players.p1}
        invitee={meta.invitee ?? null}
        inviteeBusy={inviteeBusy}
        secondsLeft={inviteSecondsLeft}
        pending={pendingExit}
        onCancel={() => void closeAndExit()}
      />
    );
  }

  // Short-circuit: trận đã kết thúc do forfeit/disconnect — hiện kết quả ngay,
  // không chờ dựng ctx hay mount game (tránh kẹt màn "Đang vào trận…").
  if (
    showFinishedOverlay &&
    meta?.players?.[role] &&
    meta?.players?.[oppRole]
  ) {
    return (
      <div className="fixed inset-0 z-[9998] flex flex-col bg-slate-900/95 backdrop-blur-sm">
        <div className="flex items-center justify-between gap-2 px-4 py-3">
          <div className="text-sm font-semibold text-white/80">Chơi PvP</div>
          <HostCloseButton
            label="Thoát"
            disabled={pendingExit}
            onClick={() => void closeAndExit()}
          />
        </div>
        <FinishedOverlay
          iWon={iWon}
          isDraw={winnerRole === "draw"}
          reason={winnerReason ?? "win"}
          iForfeited={iForfeited}
          opponent={meta.players[oppRole]!}
          self={meta.players[role]!}
          onClose={() => void closeAndExit()}
          pending={pendingExit}
        />
        {rewardPopupEl}
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[9998] flex flex-col bg-slate-900/95 backdrop-blur-sm">
      <div className="flex items-center justify-between gap-2 px-4 py-3">
        <div className="flex items-center gap-2 text-sm font-semibold text-white/80">
          <span>Chơi PvP</span>
          {myPresence?.online === false && status === "playing" && (
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/20 px-2 py-0.5 text-[10px] font-bold text-amber-200">
              <FiWifiOff className="h-3 w-3" /> Đang khôi phục kết nối…
            </span>
          )}
        </div>
        <HostCloseButton
          label={
            status === "playing" && winnerRole == null ? "Bỏ trận" : "Thoát"
          }
          disabled={pendingExit}
          onClick={handleExitClick}
        />
      </div>

      <div className="flex flex-1 items-start justify-center overflow-auto p-2">
        {loading ? (
          <div className="my-auto flex flex-col items-center gap-3 text-white">
            <FiLoader className="h-8 w-8 animate-spin text-amber-400" />
            <p className="text-sm font-medium">Đang kết nối phòng…</p>
            <HostCloseButton
              label="Thoát"
              disabled={pendingExit}
              onClick={() => void forceExit()}
              className="mt-1"
            />
          </div>
        ) : waiting ? (
          <div className="my-auto flex flex-col items-center gap-3 text-white">
            <FiLoader className="h-8 w-8 animate-spin text-amber-400" />
            <p className="text-sm font-medium">
              {ctxBroken ? "Đối thủ đã rời phòng…" : "Đang vào trận…"}
            </p>
            <HostCloseButton
              label="Thoát"
              disabled={pendingExit}
              onClick={() => void forceExit()}
              className="mt-1"
            />
          </div>
        ) : meta && ctx ? (
          <div className="w-full">
            {meta.gameId === "flappy-bird" ? (
              <FlappyBird multiplayer={ctx} />
            ) : meta.gameId === "shell-game" ? (
              <ShellGame multiplayer={ctx} />
            ) : meta.gameId === "caro" ? (
              <Caro multiplayer={ctx} />
            ) : meta.gameId === "sky-high" ? (
              <SkyHigh multiplayer={ctx} />
            ) : (
              <SlidingPuzzle multiplayer={ctx} />
            )}
          </div>
        ) : null}
      </div>

      {showDisconnectBanner && !finished && (
        <DisconnectBanner
          name={opponentName}
          remainingMs={disconnectRemainingMs}
        />
      )}

      {confirmForfeit && (
        <ForfeitConfirmDialog
          opponentName={opponentName}
          onCancel={() => setConfirmForfeit(false)}
          onConfirm={() => void doForfeit()}
          pending={pendingExit}
        />
      )}

      {showFinishedOverlay &&
        meta?.players?.[role] &&
        meta?.players?.[oppRole] && (
          <FinishedOverlay
            iWon={iWon}
            isDraw={winnerRole === "draw"}
            reason={winnerReason ?? "win"}
            iForfeited={iForfeited}
            opponent={meta.players[oppRole]!}
            self={meta.players[role]!}
            onClose={() => void closeAndExit()}
            pending={pendingExit}
          />
        )}

      {rewardPopupEl}
    </div>
  );
}

function HostCloseButton({
  label,
  disabled,
  onClick,
  className = "",
}: {
  label: string;
  disabled?: boolean;
  onClick: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-rose-500 text-white shadow-md ring-1 ring-rose-400/50 transition-all hover:bg-rose-600 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
    >
      <FiX className="h-5 w-5" strokeWidth={2.5} />
    </button>
  );
}

/**
 * Popup gọn ở góc dưới cho người GỬI lời mời solo trong lúc chờ đối thủ chấp
 * nhận. Hiển thị avatar hai bên, hình minh hoạ game và phần thưởng — kèm đồng
 * hồ đếm ngược và nút huỷ. Không chiếm toàn màn hình.
 */
function WaitingInvitePopup({
  gameId,
  self,
  invitee,
  inviteeBusy,
  secondsLeft,
  pending,
  onCancel,
}: {
  gameId: MultiplayerGameId;
  self: RoomMeta["players"]["p1"];
  invitee: { name: string; avatarUrl: string | null } | null;
  inviteeBusy?: "learn" | "game";
  secondsLeft: number;
  pending: boolean;
  onCancel: () => void;
}) {
  const Preview = GAME_PREVIEWS[gameId];
  const urgent = secondsLeft <= 10;
  const inviteeName = invitee?.name ?? "Đối thủ";
  const busyOnLearn = inviteeBusy === "learn";

  if (inviteeBusy) {
    return (
      <div className="fixed bottom-4 left-1/2 z-[9998] w-[min(92vw,340px)] -translate-x-1/2">
        <div className="overflow-hidden rounded-2xl border border-amber-200 bg-white shadow-2xl">
          <div className="flex items-center gap-3 px-3 py-3">
            <PlayerAvatar
              name={lastNameOf(inviteeName)}
              color="red"
              avatarUrl={invitee?.avatarUrl ?? null}
              size={44}
            />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-bold text-slate-800">
                {lastNameOf(inviteeName)}
              </p>
              <p className="truncate text-xs text-slate-500">
                {busyOnLearn ? "Đang học bài" : "Đang chơi game"}
                <span className="text-slate-300"> · </span>
                <span className="font-semibold text-amber-600">
                  {GAME_TITLES[gameId]}
                </span>
              </p>
              <p className="text-[11px] text-sky-600">Đã gửi Messages</p>
            </div>
            <div
              className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-black tabular-nums ${
                urgent ? "bg-rose-100 text-rose-600" : "bg-amber-100 text-amber-700"
              }`}
              title="Lời mời sẽ tự hết hạn"
            >
              {secondsLeft}
            </div>
          </div>
          <button
            type="button"
            onClick={onCancel}
            disabled={pending}
            className="flex w-full items-center justify-center gap-1.5 border-t border-slate-100 py-2.5 text-xs font-semibold text-slate-500 transition-colors hover:bg-slate-50 disabled:opacity-60"
          >
            <FiX className="h-3.5 w-3.5" /> Huỷ lời mời
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed bottom-4 left-1/2 z-[9998] w-[min(92vw,380px)] -translate-x-1/2">
      <div className="overflow-hidden rounded-3xl border border-amber-200 bg-white shadow-2xl">
        {/* Thanh tiêu đề gradient + đồng hồ */}
        <div className="flex items-center justify-between gap-2 bg-gradient-to-r from-amber-400 via-orange-400 to-amber-500 px-4 py-2.5">
          <div className="flex items-center gap-1.5 text-white">
            <FiLoader className="h-4 w-4 animate-spin" />
            <span className="text-sm font-bold">Đang mời đấu solo…</span>
          </div>
          <div
            className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-black tabular-nums shadow-inner ${
              urgent ? "bg-rose-600 text-white" : "bg-white/25 text-white"
            }`}
          >
            {secondsLeft}
          </div>
        </div>

        <div className="px-4 pb-3 pt-4">
          {/* Hai đấu thủ + phần thưởng */}
          <div className="flex items-center justify-center gap-3">
            <div className="flex flex-col items-center gap-1">
              <PlayerAvatar
                name={lastNameOf(self.name)}
                color="blue"
                avatarUrl={self.avatarUrl}
                size={56}
              />
              <span className="max-w-[92px] truncate text-[11px] font-bold text-slate-600">
                Bạn
              </span>
            </div>

            <div className="flex flex-col items-center gap-1.5">
              <span className="text-base font-black text-slate-300">VS</span>
              <div className="flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-1 text-xs font-black text-amber-700 ring-1 ring-amber-300">
                <span aria-hidden>🍞</span>
                <span>+{PVP_WIN}</span>
              </div>
            </div>

            <div className="flex flex-col items-center gap-1">
              <PlayerAvatar
                name={lastNameOf(inviteeName)}
                color="red"
                avatarUrl={invitee?.avatarUrl ?? null}
                size={56}
              />
              <span className="max-w-[92px] truncate text-[11px] font-bold text-slate-600">
                {lastNameOf(inviteeName)}
              </span>
            </div>
          </div>

          {/* Hình minh hoạ game + thông tin thưởng */}
          <div className="mt-4 flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-2.5">
            <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-xl border border-slate-200 shadow-sm">
              <ScaledPreview>
                <Preview />
              </ScaledPreview>
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-amber-600">
                Trò chơi
              </p>
              <p className="truncate text-sm font-black text-slate-800">
                {GAME_TITLES[gameId]}
              </p>
              <p className="mt-0.5 text-[11px] text-slate-500">
                Mỗi bên cọc{" "}
                <span className="font-bold text-slate-700">{PVP_STAKE}</span>{" "}
                bánh · thắng nhận{" "}
                <span className="font-bold text-amber-600">{PVP_WIN}</span> bánh
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onCancel}
            disabled={pending}
            className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white py-2 text-sm font-semibold text-slate-600 transition-colors hover:bg-slate-50 disabled:opacity-60"
          >
            <FiX className="h-4 w-4" /> Huỷ lời mời
          </button>
        </div>
      </div>
    </div>
  );
}

function DisconnectBanner({
  name,
  remainingMs,
}: {
  name: string;
  remainingMs: number;
}) {
  const seconds = Math.max(0, Math.ceil(remainingMs / 1000));
  return (
    <div className="pointer-events-none fixed inset-x-0 top-14 z-[10050] flex justify-center px-3">
      <div className="pointer-events-auto flex items-center gap-2 rounded-full border border-amber-300/60 bg-amber-500/95 px-4 py-2 text-xs font-semibold text-amber-950 shadow-lg backdrop-blur">
        <FiWifiOff className="h-4 w-4" />
        <span>
          {lastNameOf(name)} mất kết nối… tự xử thắng sau{" "}
          <span className="tabular-nums font-black">{seconds}s</span>
        </span>
      </div>
    </div>
  );
}

function ForfeitConfirmDialog({
  opponentName,
  onCancel,
  onConfirm,
  pending,
}: {
  opponentName: string;
  onCancel: () => void;
  onConfirm: () => void;
  pending: boolean;
}) {
  return (
    <div className="fixed inset-0 z-[10002] flex items-center justify-center bg-slate-950/70 p-4">
      <div className="w-full max-w-[320px] space-y-3 rounded-2xl border-2 border-rose-300 bg-white p-5 text-center shadow-2xl">
        <div className="flex justify-center text-rose-500">
          <FiAlertTriangle className="h-9 w-9" />
        </div>
        <h2 className="text-base font-black text-slate-800">
          Bỏ trận sẽ bị xử thua
        </h2>
        <p className="text-xs text-slate-500">
          Nếu thoát bây giờ, {lastNameOf(opponentName)} sẽ được tính thắng. Bạn
          có muốn tiếp tục không?
        </p>
        <div className="flex gap-2 pt-1">
          <button
            type="button"
            onClick={onCancel}
            disabled={pending}
            className="flex flex-1 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 disabled:opacity-60"
          >
            Ở lại chơi tiếp
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={pending}
            className="flex flex-1 items-center justify-center rounded-xl bg-rose-500 px-3 py-2 text-xs font-bold text-white hover:bg-rose-600 disabled:opacity-60"
          >
            Bỏ trận
          </button>
        </div>
      </div>
    </div>
  );
}

function FinishedOverlay({
  iWon,
  isDraw,
  reason,
  iForfeited,
  opponent,
  self,
  onClose,
  pending,
}: {
  iWon: boolean;
  isDraw: boolean;
  reason: WinnerReason;
  iForfeited: boolean;
  opponent: { name: string; color: "blue" | "red"; avatarUrl: string | null };
  self: { name: string; color: "blue" | "red"; avatarUrl: string | null };
  onClose: () => void;
  pending: boolean;
}) {
  const title = isDraw
    ? "Hoà"
    : iWon
      ? reason === "disconnect"
        ? "Đối thủ mất kết nối"
        : reason === "forfeit"
          ? "Đối thủ bỏ trận"
          : "Bạn thắng"
      : reason === "disconnect"
        ? "Bạn đã mất kết nối"
        : iForfeited
          ? "Bạn đã bỏ trận"
          : "Bạn thua";

  const subtitle = isDraw
    ? "Hai bên hoà nhau."
    : iWon
      ? reason === "disconnect"
        ? `${lastNameOf(opponent.name)} không kết nối lại kịp — bạn được tính thắng.`
        : reason === "forfeit"
          ? `${lastNameOf(opponent.name)} đã rời trận — bạn được tính thắng.`
          : "Chúc mừng!"
      : reason === "disconnect"
        ? "Trận đấu được xử cho đối thủ do bạn mất kết nối quá lâu."
        : iForfeited
          ? "Trận đấu được xử cho đối thủ vì bạn đã rời trận."
          : "Cố lên ván sau nhé.";

  return (
    <div className="fixed inset-0 z-[10001] flex items-center justify-center bg-slate-950/70 p-4">
      <div className="w-full max-w-[360px] space-y-4 rounded-2xl border-2 border-amber-300 bg-white p-5 text-center shadow-2xl">
        <div className="flex justify-center gap-3">
          <div className="flex flex-col items-center gap-1 opacity-90">
            <PlayerAvatar
              name={lastNameOf(self.name)}
              color={self.color}
              avatarUrl={self.avatarUrl}
              size={48}
            />
            <span className="max-w-[110px] truncate text-[10px] font-bold text-slate-500">
              Bạn
            </span>
          </div>
          <span className="self-center text-xs font-black text-slate-300">
            VS
          </span>
          <div className="flex flex-col items-center gap-1 opacity-90">
            <PlayerAvatar
              name={lastNameOf(opponent.name)}
              color={opponent.color}
              avatarUrl={opponent.avatarUrl}
              size={48}
            />
            <span className="max-w-[110px] truncate text-[10px] font-bold text-slate-500">
              {lastNameOf(opponent.name)}
            </span>
          </div>
        </div>
        <div className="flex flex-col items-center gap-1">
          {iWon && (
            <FiAward className="h-7 w-7 text-amber-500" aria-hidden="true" />
          )}
          <h2
            className={`text-xl font-black ${
              isDraw
                ? "text-slate-600"
                : iWon
                  ? "text-emerald-600"
                  : "text-rose-600"
            }`}
          >
            {title}
          </h2>
          <p className="text-xs text-slate-500">{subtitle}</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          disabled={pending}
          className="w-full rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-bold text-white hover:bg-slate-800 disabled:opacity-60"
        >
          Đóng
        </button>
      </div>
    </div>
  );
}
