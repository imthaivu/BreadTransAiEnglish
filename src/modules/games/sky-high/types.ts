export interface SuitcaseType {
  id: string;
  name: string;
  width: number;
  height: number;
  color: string;
  borderColor: string;
  handleColor: string;
  hasStrap: boolean;
  pattern: "plain" | "striped" | "stickers" | "modern";
  stickerColors?: string[];
  weight: number;
}

export interface DroppedSuitcase {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  type: SuitcaseType;
  angle: number;
  vx: number;
  vy: number;
  vAngle: number;
  stable: boolean;
  offsetFromCenter: number;
  hasCheckedStable: boolean;
  /** Đã va Pierre trong lượt rơi này — tránh bắn hiệu ứng trùng. */
  hitByBird?: boolean;
}

export interface Particle {
  x: number;
  y: number;
  color: string;
  size: number;
  vx: number;
  vy: number;
  alpha: number;
  life: number;
  maxLife: number;
}

export interface FlyingText {
  id: string;
  text: string;
  x: number;
  y: number;
  color: string;
  alpha: number;
  scale: number;
}

export interface WindState {
  active: boolean;
  direction: number;
  strength: number;
  nextWindTime: number;
  warningDuration: number;
}

export interface BirdState {
  x: number;
  y: number;
  direction: number;
  speed: number;
  width: number;
  height: number;
  active: boolean;
  wingFlapValue: number;
  chatBubble: string;
  chatDuration: number;
}

export interface LeaderboardEntry {
  name: string;
  score: number;
  height: number;
  date: string;
}

export type SkyHighGameStatus =
  | "menu"
  | "playing"
  | "gameover"
  | "instructions";

/**
 * Cấu hình admin có thể chỉnh trên Firestore.
 * Cùng dạng record số như các game khác để tái sử dụng UI AdminGames.
 */
export interface SkyHighSettings {
  maxSwingAngle: number;
  dropGravity: number;
  perfectThreshold: number;
  windCooldownMinFrames: number;
  windDurationMinFrames: number;
  birdSpawnRatePer10k: number;
}

/** Chênh lệch điểm tối thiểu để knockout trong đấu solo PvP. */
export const SKY_HIGH_KO_SCORE_GAP = 3;

export const SKY_HIGH_SETTINGS: SkyHighSettings = {
  maxSwingAngle: 0.72,
  dropGravity: 0.06,
  perfectThreshold: 7.5,
  windCooldownMinFrames: 500,
  windDurationMinFrames: 360,
  birdSpawnRatePer10k: 40,
};
