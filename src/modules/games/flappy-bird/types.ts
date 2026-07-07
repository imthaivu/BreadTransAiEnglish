export enum GameState {
  START = "START",
  PLAYING = "PLAYING",
  GAMEOVER = "GAMEOVER",
}

export interface Pipe {
  x: number;
  topHeight: number;
  bottomHeight: number;
  passed: boolean;
  /** Chỉ số spawn deterministic (online) — ổn định khi rebuild pipes mỗi frame. */
  spawnIndex?: number;
  /** Điểm đạt được sau khi vượt qua ống này (solo) — dùng để đánh dấu mốc kỉ lục. */
  scoreValue?: number;
}

export interface GameSettings {
  gravity: number;
  jumpVelocity: number;
  pipeSpeed: number;
  pipeSpawnInterval: number;
  pipeGap: number;
  pipeWidth: number;
  birdWidth: number;
  birdHeight: number;
  /** 1 = bật mưa, 0 = tắt hoàn toàn hiệu ứng thời tiết */
  rainEnabled: number;
  /** Xác suất bắt đầu trận mưa mới mỗi frame, tính trên 10000 (chỉ áp dụng khi đang KHÔNG mưa) */
  rainStartChancePer10k: number;
  /** Số frame "dự báo thời tiết" hiển thị trước khi mưa thực sự rơi (120 ≈ 2 giây ở 60fps) */
  rainForecastFrames: number;
  /** Số frame ngắn nhất của 1 trận mưa */
  rainMinDurationFrames: number;
  /** Số frame dài nhất của 1 trận mưa */
  rainMaxDurationFrames: number;
  /** Số giọt mưa tối đa hiển thị trên màn hình cùng lúc */
  rainDropCount: number;
  /** Số frame chim còn ướt (chịu phạt trọng lực) sau khi mưa tạnh */
  wetDurationFrames: number;
  /** Hệ số nhân trọng lực khi chim đang ướt (>1 nghĩa là nặng hơn) */
  wetGravityMultiplier: number;
  /** Xác suất sấm chớp mỗi frame khi đang mưa, tính trên 10000 */
  lightningChancePer10k: number;
}

/** Sàn thời gian dự báo (frame) khi rainEnabled = 1 — tránh mưa bất ngờ không cảnh báo. */
export const RAIN_FORECAST_MIN_FRAMES = 60;

export function getEffectiveRainForecastFrames(settings: GameSettings): number {
  if (settings.rainEnabled < 1) {
    return Math.max(0, settings.rainForecastFrames);
  }
  return Math.max(RAIN_FORECAST_MIN_FRAMES, settings.rainForecastFrames);
}

export const GAME_SETTINGS: GameSettings = {
  gravity: 0.35,
  jumpVelocity: -6.5,
  pipeSpeed: 2.5,
  pipeSpawnInterval: 100,
  pipeGap: 140,
  pipeWidth: 60,
  birdWidth: 34,
  birdHeight: 24,
  rainEnabled: 1,
  rainStartChancePer10k: 20,
  rainForecastFrames: 120,
  rainMinDurationFrames: 300,
  rainMaxDurationFrames: 720,
  rainDropCount: 80,
  wetDurationFrames: 240,
  wetGravityMultiplier: 1.6,
  lightningChancePer10k: 25,
};
