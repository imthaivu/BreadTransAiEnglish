/**
 * Shared types for the realtime multiplayer layer (Firebase RTDB).
 * Used by both the lobby (invitations/rooms) and the per-game sync hooks.
 */

export type MultiplayerGameId =
  | "flappy-bird"
  | "shell-game"
  | "caro"
  | "sky-high"
  | "sliding-puzzle";

export type PlayerRole = "p1" | "p2";

/** Default colors when a player has no avatar. p1 = blue (host), p2 = red. */
export type PlayerColor = "blue" | "red";

export interface RoomPlayer {
  id: string;
  name: string;
  /** Avatar URL or null. RTDB does not accept `undefined`. */
  avatarUrl: string | null;
  color: PlayerColor;
}

export type RoomStatus = "waiting" | "playing" | "finished";

/**
 * Lý do kết thúc trận do GameHost ghi vào `meta`. Các game vẫn lưu thắng/thua
 * theo logic riêng trong `state` — `meta.winnerReason` chỉ dành cho các tình
 * huống ngắt trận (forfeit, mất kết nối) hoặc khi cần ghi nhận kết quả ở
 * tầng meta.
 */
export type WinnerReason = "win" | "forfeit" | "disconnect" | "draw";

/** Trạng thái online của một người chơi trong phòng (RTDB presence). */
export interface RoomPresence {
  online: boolean;
  /** serverTimestamp() — cập nhật khi online (heartbeat) hoặc khi offline. */
  lastSeen: number;
  /** serverTimestamp() — set khi chuyển offline, clear khi online lại. */
  disconnectSince?: number | null;
}

export interface RoomMeta {
  gameId: MultiplayerGameId;
  hostId: string;
  status: RoomStatus;
  /** serverTimestamp() */
  createdAt: number;
  /** Shared randomness so both clients render identical worlds (pipes, shuffle). */
  seed: number;
  /** Server time (ms) at which the match should start (after the 3s countdown). */
  startAt: number | null;
  players: {
    p1: RoomPlayer;
    p2: RoomPlayer | null;
  };
  /**
   * Thông tin người được mời (để host hiển thị avatar đối thủ ngay trong lúc
   * `waiting`, khi p2 chưa join). Có thể vắng với phòng cũ / không qua lời mời.
   */
  invitee?: { name: string; avatarUrl: string | null } | null;
  /** Set when the match ends. */
  winnerRole?: PlayerRole | "draw" | null;
  /** Vì sao trận kết thúc: thắng thường, bỏ trận, mất kết nối, hoà. */
  winnerReason?: WinnerReason | null;
  /** Vai trò người bị xử thua khi forfeit/disconnect (để UI hiển thị rõ ai bỏ). */
  forfeitRole?: PlayerRole | null;
  /** Trạng thái online của mỗi vai. Có thể vắng nếu chưa kịp ghi. */
  presence?: {
    p1?: RoomPresence;
    p2?: RoomPresence;
  };
}

export type InvitationStatus = "pending" | "accepted" | "declined";

export interface Invitation {
  id: string;
  fromId: string;
  fromName: string;
  fromAvatarUrl: string | null;
  toId: string;
  gameId: MultiplayerGameId;
  roomId: string;
  status: InvitationStatus;
  createdAt: number;
}

/**
 * Everything a game component needs to run in multiplayer mode.
 * Injected by the lobby's GameHost overlay.
 */
export interface MultiplayerContext {
  roomId: string;
  role: PlayerRole;
  color: PlayerColor;
  self: RoomPlayer;
  opponent: RoomPlayer;
  seed: number;
  hostId: string;
  isHost: boolean;
  /** Server time (ms) the match starts at, after the 3s countdown. */
  startAt: number | null;
}

/** Optional prop accepted by every game component to enable online play. */
export type SoloGameMode = "practice" | "ranked";

export type SoloResultPayload = {
  won: boolean;
  score?: number;
  level?: number;
  suitcases?: number;
  difficulty?: "easy" | "medium" | "hard";
};

export interface MultiplayerGameProps {
  multiplayer?: MultiplayerContext;
  /** Solo play mode — practice (free) or ranked (ticket consumed, bread reward). */
  soloMode?: SoloGameMode;
  playToken?: string;
  /**
   * Tiêu vé để mở lượt ranked. Với caro/sliding-puzzle, game tự gọi khi người
   * chơi chọn độ khó (chốt độ khó vào play doc). Trả về true nếu trừ vé thành
   * công (playToken sẽ được cập nhật qua prop).
   */
  onRankedStart?: (difficulty?: "easy" | "medium" | "hard") => Promise<boolean>;
  onSoloResult?: (result: SoloResultPayload) => void;
  /**
   * Khoá thao tác "Chơi lại" trong lúc popup phần thưởng đang hiện/đang tính.
   * Đảm bảo người chơi không vào ván mới trước khi xem xong số bánh kiếm được.
   */
  replayLocked?: boolean;
}

/**
 * Index trỏ tới phòng mà user đang chơi (lưu tại `userActiveRooms/{uid}`).
 * Cho phép tự rejoin sau khi reload/đăng nhập lại — không xoá khi disconnect.
 */
export interface UserActiveRoom {
  roomId: string;
  role: PlayerRole;
  gameId: MultiplayerGameId;
  /** serverTimestamp() khi index được tạo — phục vụ debug/garbage collection. */
  enteredAt: number;
}

export const GAME_TITLES: Record<MultiplayerGameId, string> = {
  "flappy-bird": "Flappy Bird",
  "shell-game": "Đảo Ly Tìm Bóng",
  caro: "Cờ Caro Giấy Tập",
  "sky-high": "Sky High",
  "sliding-puzzle": "Sliding Chrono 3x3",
};
