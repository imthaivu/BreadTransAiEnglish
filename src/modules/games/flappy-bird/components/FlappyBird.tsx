"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FiPlay, FiRotateCcw } from "react-icons/fi";
import { useFlappyBirdSettings } from "../hooks/useFlappyBirdSettings";
import { useFlappyBirdCharacters } from "../hooks/useFlappyBirdCharacters";
import {
  GameState,
  Pipe,
  GAME_SETTINGS,
  GameSettings,
  getEffectiveRainForecastFrames,
} from "../types";
import { flappyBirdAudio } from "../utils/audio";
import { UserBreadBadge } from "../../components/UserBreadBadge";
import { GambleWarning } from "../../components/GambleWarning";
import { SCORE_GAMBLE_THRESHOLD } from "@/lib/games/rewards";
import {
  createSeededRandom,
  getServerNow,
  useCountdown,
  useFinalizeRoom,
  usePositionSync,
  type MultiplayerGameProps,
  type PlayerRole,
} from "../../realtime";

/** Live payload synced between the two birds. */
interface BirdSyncState {
  y: number;
  v: number;
  alive: boolean;
  score: number;
}

const DEFAULT_BIRD_COLORS = {
  blue: { body: "#3b82f6", wing: "#2563eb" },
  red: { body: "#ef4444", wing: "#dc2626" },
} as const;

/** Build a circular avatar sprite (offscreen canvas) from a loaded image. */
function makeCircularSprite(img: HTMLImageElement): HTMLCanvasElement | null {
  const c = document.createElement("canvas");
  c.width = BIRD_SPRITE_SIZE;
  c.height = BIRD_SPRITE_SIZE;
  const cx = c.getContext("2d");
  if (!cx) return null;
  const radius = BIRD_SPRITE_SIZE / 2 - 2;
  const center = BIRD_SPRITE_SIZE / 2;
  cx.save();
  cx.beginPath();
  cx.arc(center, center, radius, 0, Math.PI * 2);
  cx.closePath();
  cx.clip();
  const side = Math.min(img.width, img.height);
  const sx = (img.width - side) / 2;
  const sy = (img.height - side) / 2;
  cx.drawImage(img, sx, sy, side, side, center - radius, center - radius, radius * 2, radius * 2);
  cx.restore();
  // No baked border here — the player-color ring is painted at draw time so the
  // blue/red identity shows as a clean outline around the avatar.
  return c;
}

/**
 * Vẽ chim Flappy tại gốc toạ độ (0,0) — dùng chung cho chim của mình lẫn đối thủ
 * để cả hai đều có cánh + mỏ. Ưu tiên avatar; màu xanh dương/đỏ chỉ là viền.
 */
function drawFlappyBird(
  ctx: CanvasRenderingContext2D,
  opts: {
    sprite: HTMLCanvasElement | null;
    /** Màu fallback khi không có avatar + màu viền/cánh khi có avatar */
    colors: { body: string; wing: string } | null;
    flapAmt: number;
  }
): void {
  const { sprite, colors, flapAmt } = opts;
  const AVATAR_RADIUS = 15;
  if (sprite) {
    ctx.drawImage(
      sprite,
      -AVATAR_RADIUS,
      -AVATAR_RADIUS,
      AVATAR_RADIUS * 2,
      AVATAR_RADIUS * 2
    );

    // Cánh vỗ (đặt sau avatar nhưng vẽ chìm xuống dưới một chút)
    const wingY = 2 + flapAmt * 0.5;
    ctx.save();
    ctx.globalAlpha = 0.82;
    ctx.fillStyle = "#eab308";
    ctx.strokeStyle = "#0f172a";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-2, -3);
    ctx.quadraticCurveTo(-10, wingY - 6, -19, wingY - 1);
    ctx.quadraticCurveTo(-16, wingY + 3, -12, wingY + 6);
    ctx.quadraticCurveTo(-7, wingY + 5, -2, 4);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.strokeStyle = "rgba(15, 23, 42, 0.45)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(-3, 0);
    ctx.quadraticCurveTo(-9, wingY + 1, -16, wingY + 1);
    ctx.stroke();
    ctx.restore();

    // Mỏ
    ctx.fillStyle = "#f97316";
    ctx.strokeStyle = "#0f172a";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(11, -2);
    ctx.lineTo(21, 1);
    ctx.lineTo(11, 4);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Viền màu xanh dương/đỏ bao quanh avatar (vẽ sau cùng để luôn rõ)
    ctx.strokeStyle = colors ? colors.body : "#0f172a";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(0, 0, AVATAR_RADIUS, 0, Math.PI * 2);
    ctx.stroke();
    return;
  }

  // Fallback: chim tô màu khi không có avatar
  ctx.fillStyle = colors ? colors.body : "#facc15";
  ctx.strokeStyle = "#0f172a";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(0, 0, 15, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.arc(-2, 3, 11, Math.PI * 0.15, Math.PI * 1.05);
  ctx.fill();

  ctx.fillStyle = colors ? colors.wing : "#eab308";
  ctx.beginPath();
  ctx.ellipse(-7, 1, 9, 6 + flapAmt * 0.4, -0.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.arc(6, -4, 5, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = "#000000";
  ctx.beginPath();
  ctx.arc(8, -4, 2, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#f97316";
  ctx.beginPath();
  ctx.moveTo(11, -2);
  ctx.lineTo(21, 1);
  ctx.lineTo(11, 4);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  color: string;
  size: number;
  alpha: number;
  life: number;
  maxLife: number;
}

interface Cloud {
  x: number;
  y: number;
  speed: number;
  scale: number;
}

interface RainDrop {
  x: number;
  y: number;
  /** Vận tốc ngang (âm = bay sang trái theo hướng gió) */
  vx: number;
  /** Vận tốc dọc rơi xuống */
  vy: number;
  /** Độ dài đường mưa, đơn vị px */
  length: number;
}

/** Lịch mưa deterministic (online) — cả hai client dùng chung seed + server time. */
interface RainEvent {
  forecastStart: number;
  rainStart: number;
  rainEnd: number;
}

const RAIN_SCHEDULE_SALT = 0x8badf00d;
/** Solo pity: bật dự báo từ cột này để giọt mưa đầu tiên muộn nhất ~cột 3 */
const RAIN_PITY_FORECAST_SCORE = 2;

function spawnRainDrops(dropCount: number, rng: () => number): RainDrop[] {
  const n = Math.max(0, Math.min(500, Math.floor(dropCount)));
  const drops: RainDrop[] = [];
  for (let i = 0; i < n; i++) {
    drops.push({
      x: rng() * (CANVAS_W + 80) - 40,
      y: rng() * CANVAS_H,
      vx: -2.2 - rng() * 1.6,
      vy: 11 + rng() * 4,
      length: 8 + rng() * 6,
    });
  }
  return drops;
}

/** Sinh lịch mưa từ seed phòng — hai máy cùng thấy dự báo/mưa/sấm ở cùng thời điểm. */
function buildRainSchedule(seed: number, weather: GameSettings): RainEvent[] {
  if (weather.rainEnabled < 1) return [];
  const rng = createSeededRandom((seed ^ RAIN_SCHEDULE_SALT) >>> 0);
  const events: RainEvent[] = [];
  let t = 180 + rng() * 360;
  const maxT = 3600 * 15;
  while (t < maxT) {
    const minD = Math.max(0, weather.rainMinDurationFrames);
    const maxD = Math.max(minD, weather.rainMaxDurationFrames);
    const duration = minD + rng() * (maxD - minD);
    const forecast = getEffectiveRainForecastFrames(weather);
    const gap = 400 + rng() * 800;
    events.push({
      forecastStart: t,
      rainStart: t + forecast,
      rainEnd: t + forecast + duration,
    });
    t += forecast + duration + gap;
  }
  return events;
}

function findRainEventAt(
  serverStep: number,
  schedule: RainEvent[]
): RainEvent | null {
  for (let i = 0; i < schedule.length; i++) {
    const ev = schedule[i];
    if (serverStep >= ev.forecastStart && serverStep < ev.rainEnd) return ev;
  }
  return null;
}

/**
 * Tính lại toàn bộ ống từ seed + thời gian server — hai máy luôn thấy cùng
 * layout dù vào trận sớm/muộn hay FPS khác nhau.
 */
function buildMultiplayerPipes(
  serverStep: number,
  seed: number,
  settings: GameSettings
): Pipe[] {
  const rng = createSeededRandom(seed);
  const interval = settings.pipeSpawnInterval;
  const speed = settings.pipeSpeed;
  const pipeWidth = settings.pipeWidth;
  const gapSize = Math.max(115, settings.pipeGap);
  const minHeight = 50;
  const maxHeight = 380;
  const pipes: Pipe[] = [];

  for (let i = 0; ; i++) {
    const spawnStep = i * interval;
    if (spawnStep > serverStep) break;
    const topHeight = minHeight + rng() * (maxHeight - minHeight);
    const bottomHeight = CANVAS_H - GROUND_H - topHeight - gapSize;
    const startX = i === 0 ? 450 : 420;
    const x = startX - speed * (serverStep - spawnStep);
    if (x <= -pipeWidth - 20) continue;
    pipes.push({
      x,
      topHeight,
      bottomHeight,
      passed: false,
      spawnIndex: i,
    });
  }
  return pipes;
}

function getMultiplayerServerStep(startAt: number): number {
  return Math.max(0, (getServerNow() - startAt) / TARGET_FRAME_MS);
}

const HIGH_SCORE_KEY = "breadtrans.flappy_bird.high_score";
const CHARACTER_KEY = "breadtrans.flappy_bird.character_id";
const DEFAULT_CHARACTER_ID = "default";
/** Kích thước sprite chim/avatar lưu sẵn trong offscreen canvas */
const BIRD_SPRITE_SIZE = 64;

/** Lấy tên riêng (last name kiểu VN): "Nguyễn Văn A" → "A" */
const getFirstName = (fullName: string): string => {
  const parts = fullName.trim().split(/\s+/);
  return parts[parts.length - 1] || fullName;
};

const CANVAS_W = 400;
const CANVAS_H = 720;
const GROUND_H = 80;
const GROUND_Y = CANVAS_H - GROUND_H;
const BIRD_MAX_Y = GROUND_Y - 40;
/** Chuẩn hóa physics theo 60fps — Safari iOS thường ~30fps nên không dùng frame-count thuần */
const TARGET_FRAME_MS = 1000 / 60;

export default function FlappyBird({
  multiplayer,
  soloMode,
  onRankedStart,
  onSoloResult,
  replayLocked = false,
}: MultiplayerGameProps = {}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [gameState, setGameState] = useState<GameState>(GameState.START);
  const [score, setScore] = useState(0);
  const [highScore, setHighScore] = useState(0);
  const [isNewRecord, setIsNewRecord] = useState(false);
  /** Tăng mỗi lần vượt mốc kỉ lục để retrigger hiệu ứng CSS lóe vàng */
  const [recordBurst, setRecordBurst] = useState(0);
  /** Hiện cảnh báo "điểm lẻ sẽ bị trừ bánh" khi vượt mốc cờ bạc (lượt có vé) */
  const [gambleWarn, setGambleWarn] = useState(false);
  /** Chỉ bật cảnh báo 1 lần/lượt để tránh setState mỗi frame */
  const gambleWarnRef = useRef(false);

  // ----- Multiplayer wiring -----
  const isMp = !!multiplayer;
  const isMpRef = useRef(isMp);
  isMpRef.current = isMp;
  const mpRef = useRef(multiplayer);
  mpRef.current = multiplayer;
  const countdown = useCountdown(multiplayer?.startAt ?? null);
  const { publish, opponentRef } = usePositionSync<BirdSyncState>(
    multiplayer?.roomId ?? "",
    multiplayer?.role ?? "p1"
  );
  const publishRef = useRef(publish);
  publishRef.current = publish;
  const opponentSyncRef = opponentRef;
  /** Seeded RNG for deterministic pipes (shared between both clients). */
  const rngRef = useRef<() => number>(Math.random);
  const aliveRef = useRef(true);
  const lastPublishTsRef = useRef(0);
  const mpStartedRef = useRef(false);
  const soloResultSentRef = useRef(false);
  const onSoloResultRef = useRef(onSoloResult);
  onSoloResultRef.current = onSoloResult;
  const onRankedStartRef = useRef(onRankedStart);
  onRankedStartRef.current = onRankedStart;
  const replayLockedRef = useRef(replayLocked);
  replayLockedRef.current = replayLocked;
  const soloModeRef = useRef(soloMode);
  soloModeRef.current = soloMode;
  // Mỗi lần chơi = 1 vé. Ván đầu đã trừ vé khi vào game.
  const rankedRoundRef = useRef(soloMode === "ranked");
  const selfMpSpriteRef = useRef<HTMLCanvasElement | null>(null);
  const oppSpriteRef = useRef<HTMLCanvasElement | null>(null);
  const [mpResult, setMpResult] = useState<"win" | "lose" | "draw" | null>(null);

  useEffect(() => {
    if (multiplayer) {
      rngRef.current = createSeededRandom(multiplayer.seed);
    } else {
      rngRef.current = Math.random;
    }
  }, [multiplayer?.seed, multiplayer]);

  // Load self/opponent avatar sprites for multiplayer (fallback to colored bird).
  useEffect(() => {
    if (!multiplayer) return;
    const load = (
      url: string | null,
      ref: React.MutableRefObject<HTMLCanvasElement | null>
    ) => {
      if (!url) {
        ref.current = null;
        return;
      }
      const img = new Image();
      img.referrerPolicy = "no-referrer";
      img.onload = () => {
        ref.current = makeCircularSprite(img);
      };
      img.onerror = () => {
        ref.current = null;
      };
      img.src = url;
    };
    load(multiplayer.self.avatarUrl, selfMpSpriteRef);
    load(multiplayer.opponent.avatarUrl, oppSpriteRef);
  }, [multiplayer]);

  // Khi vào trận online, publish ngay vị trí mặc định để đối thủ có thể "thấy"
  // mình ngay từ màn countdown — không phải đợi đến lúc PLAYING. Nếu thiếu
  // publish ban đầu, máy load chậm hơn sẽ không vẽ chim đối thủ cho tới khi cả
  // hai cùng vào PLAYING.
  useEffect(() => {
    if (!multiplayer) return;
    publishRef.current({
      y: birdYRef.current,
      v: 0,
      alive: true,
      score: 0,
    });
  }, [multiplayer]);

  const birdYRef = useRef(300);
  const birdVelocityRef = useRef(0);
  const pipesRef = useRef<Pipe[]>([]);
  /** Online: chỉ số ống đã được tính điểm (pipes rebuild mỗi frame). */
  const scoredPipeIndicesRef = useRef<Set<number>>(new Set());
  const frameCountRef = useRef(0);
  const particlesRef = useRef<Particle[]>([]);
  const cloudsRef = useRef<Cloud[]>([]);
  const rainDropsRef = useRef<RainDrop[]>([]);
  const rainScheduleRef = useRef<RainEvent[]>([]);
  const isRainingRef = useRef(false);
  /** Số frame còn lại của trận mưa hiện tại (>0 khi đang mưa) */
  const rainTimerRef = useRef(0);
  /** Số frame còn lại của giai đoạn "dự báo" trước khi mưa rơi thật (>0 = đang cảnh báo) */
  const rainForecastTimerRef = useRef(0);
  /** Tổng số frame của trận dự báo hiện tại — dùng để vẽ progress bar */
  const rainForecastTotalRef = useRef(0);
  /** Độ dài trận mưa kế tiếp đã được "định sẵn" lúc bắt đầu forecast */
  const pendingRainDurationRef = useRef(0);
  /** Solo: trận hiện tại đã từng dự báo/mưa chưa (cho pity timer) */
  const rainEverStartedRef = useRef(false);
  /** Online: các trận mưa đã giới thiệu dự báo (key = rainStart của event) */
  const mpSeenRainEventsRef = useRef<Set<number>>(new Set());
  /** Solo: điểm sẽ đạt được sau khi vượt ống vừa sinh (tăng dần từ 1) */
  const soloPipeSeqRef = useRef(0);
  /** Số frame còn lại chim bị ướt — vẫn tick xuống cả khi đã tạnh */
  const wetTimerRef = useRef(0);
  /** Số frame ánh chớp sáng còn lại (đếm về 0) */
  const lightningFlashRef = useRef(0);
  const gameStateRef = useRef<GameState>(gameState);
  const scoreRef = useRef<number>(score);
  const highScoreRef = useRef<number>(highScore);
  const shakeFramesRef = useRef(0);
  const pipeSpawnTimerRef = useRef(0);
  const isNewRecordRef = useRef(false);
  /** Chặn touch + ghost mousedown gọi jump 2 lần trên mobile */
  const lastPointerInputAtRef = useRef(0);
  /** Settings game (admin có thể chỉnh trên Firestore), fallback defaults */
  const settingsRef = useRef<GameSettings>(GAME_SETTINGS);

  const [selectedCharacterId, setSelectedCharacterId] = useState<string>(
    DEFAULT_CHARACTER_ID
  );
  /** Avatar đã được vẽ sẵn vào offscreen canvas (tròn, có viền). Null = dùng chim CSS */
  const characterSpriteRef = useRef<HTMLCanvasElement | null>(null);

  const { characters } = useFlappyBirdCharacters();

  const { data: liveSettings } = useFlappyBirdSettings();
  useEffect(() => {
    if (liveSettings) {
      settingsRef.current = liveSettings;
    }
  }, [liveSettings]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = localStorage.getItem(HIGH_SCORE_KEY);
      const parsed = raw ? Number(raw) : 0;
      if (!Number.isNaN(parsed)) {
        setHighScore(parsed);
      }
    } catch {
      // ignore localStorage errors
    }
    try {
      const savedId = localStorage.getItem(CHARACTER_KEY);
      if (savedId) setSelectedCharacterId(savedId);
    } catch {
      // ignore
    }
  }, []);

  const selectedCharacter = useMemo(() => {
    if (selectedCharacterId === DEFAULT_CHARACTER_ID) return null;
    return characters.find((c) => c.id === selectedCharacterId) ?? null;
  }, [characters, selectedCharacterId]);

  useEffect(() => {
    if (!selectedCharacter) {
      characterSpriteRef.current = null;
      return;
    }
    let cancelled = false;
    const img = new Image();
    /**
     * KHÔNG đặt `crossOrigin="anonymous"` — avatar Firebase Storage không trả
     * header CORS, sẽ fail load. Canvas tainted vẫn vẽ được, chỉ chặn `getImageData`
     * mà game không cần.
     */
    img.referrerPolicy = "no-referrer";
    img.onload = () => {
      if (cancelled) return;
      const c = document.createElement("canvas");
      c.width = BIRD_SPRITE_SIZE;
      c.height = BIRD_SPRITE_SIZE;
      const cx = c.getContext("2d");
      if (!cx) return;
      const radius = BIRD_SPRITE_SIZE / 2 - 2;
      const center = BIRD_SPRITE_SIZE / 2;
      cx.save();
      cx.beginPath();
      cx.arc(center, center, radius, 0, Math.PI * 2);
      cx.closePath();
      cx.clip();
      const side = Math.min(img.width, img.height);
      const sx = (img.width - side) / 2;
      const sy = (img.height - side) / 2;
      cx.drawImage(
        img,
        sx,
        sy,
        side,
        side,
        center - radius,
        center - radius,
        radius * 2,
        radius * 2
      );
      cx.restore();
      cx.strokeStyle = "#0f172a";
      cx.lineWidth = 3;
      cx.beginPath();
      cx.arc(center, center, radius, 0, Math.PI * 2);
      cx.stroke();
      characterSpriteRef.current = c;
    };
    img.onerror = () => {
      if (!cancelled) characterSpriteRef.current = null;
    };
    img.src = selectedCharacter.url;
    return () => {
      cancelled = true;
    };
  }, [selectedCharacter]);

  const handleSelectCharacter = useCallback((id: string) => {
    setSelectedCharacterId(id);
    try {
      localStorage.setItem(CHARACTER_KEY, id);
    } catch {
      // ignore
    }
  }, []);

  // Resolve the winner once both birds are down (multiplayer).
  useEffect(() => {
    if (!isMp || gameState !== GameState.GAMEOVER || mpResult) return;
    const interval = setInterval(() => {
      const opp = opponentSyncRef.current;
      if (!opp || opp.alive) return; // opponent still flying — wait
      const myScore = scoreRef.current;
      const oppScore = opp.score ?? 0;
      setMpResult(
        myScore > oppScore ? "win" : myScore < oppScore ? "lose" : "draw"
      );
      clearInterval(interval);
    }, 250);
    return () => clearInterval(interval);
  }, [isMp, gameState, mpResult, opponentSyncRef]);

  // Position sync throttle có thể ghi đè alive:false bằng bản alive:true trễ
  // (last-write-wins trên RTDB). Republish trạng thái chết để server settle đúng.
  useEffect(() => {
    if (!isMp || gameState !== GameState.GAMEOVER) return;
    const publishDeath = () => {
      publishRef.current({
        y: birdYRef.current,
        v: birdVelocityRef.current,
        alive: false,
        score: scoreRef.current,
      });
    };
    publishDeath();
    const interval = setInterval(publishDeath, 250);
    return () => clearInterval(interval);
  }, [isMp, gameState]);

  // Host đánh dấu phòng `finished` ngay khi đã có kết quả — tránh việc người
  // thua đóng tab và kích hoạt disconnect-claim lật ngược kết quả.
  const myRole = multiplayer?.role ?? "p1";
  const finalWinnerRole: PlayerRole | "draw" | null = mpResult
    ? mpResult === "draw"
      ? "draw"
      : mpResult === "win"
        ? myRole
        : myRole === "p1"
          ? "p2"
          : "p1"
    : null;
  useFinalizeRoom({
    roomId: multiplayer?.roomId ?? "",
    isHost: multiplayer?.isHost ?? false,
    winnerRole: finalWinnerRole,
  });

  useEffect(() => {
    gameStateRef.current = gameState;
  }, [gameState]);

  useEffect(() => {
    scoreRef.current = score;
  }, [score]);

  useEffect(() => {
    highScoreRef.current = highScore;
  }, [highScore]);

  useEffect(() => {
    const list: Cloud[] = [];
    for (let i = 0; i < 5; i++) {
      list.push({
        x: Math.random() * 400,
        y: 40 + Math.random() * 100,
        speed: 0.15 + Math.random() * 0.2,
        scale: 0.6 + Math.random() * 0.6,
      });
    }
    cloudsRef.current = list;
  }, []);

  const persistHighScore = useCallback((value: number) => {
    if (typeof window === "undefined") return;
    try {
      localStorage.setItem(HIGH_SCORE_KEY, String(value));
    } catch {
      // ignore localStorage errors
    }
  }, []);

  const resetGame = useCallback(() => {
    // In multiplayer, re-seed so the pipe sequence is identical on both clients.
    if (isMpRef.current && multiplayer) {
      rngRef.current = createSeededRandom(multiplayer.seed);
      rainScheduleRef.current = buildRainSchedule(
        multiplayer.seed,
        settingsRef.current
      );
    } else {
      rainScheduleRef.current = [];
    }
    aliveRef.current = true;
    birdYRef.current = 320;
    birdVelocityRef.current = 0;
    scoredPipeIndicesRef.current = new Set();
    if (isMpRef.current && multiplayer?.startAt) {
      pipesRef.current = buildMultiplayerPipes(
        getMultiplayerServerStep(multiplayer.startAt),
        multiplayer.seed,
        settingsRef.current
      );
    } else {
      const firstTopHeight = 200;
      const firstBottomHeight =
        CANVAS_H - GROUND_H - firstTopHeight - settingsRef.current.pipeGap;
      pipesRef.current = [
        {
          x: 450,
          topHeight: firstTopHeight,
          bottomHeight: firstBottomHeight,
          passed: false,
          scoreValue: 1,
        },
      ];
      soloPipeSeqRef.current = 1;
    }
    frameCountRef.current = 0;
    pipeSpawnTimerRef.current = 0;
    particlesRef.current = [];
    rainDropsRef.current = [];
    isRainingRef.current = false;
    rainTimerRef.current = 0;
    rainForecastTimerRef.current = 0;
    rainForecastTotalRef.current = 0;
    pendingRainDurationRef.current = 0;
    rainEverStartedRef.current = false;
    mpSeenRainEventsRef.current = new Set();
    wetTimerRef.current = 0;
    lightningFlashRef.current = 0;
    isNewRecordRef.current = false;
    setIsNewRecord(false);
    gambleWarnRef.current = false;
    setGambleWarn(false);
    scoreRef.current = 0;
    setScore(0);
    // Solo ranked: chơi lại từ màn GAME OVER ⇒ tiêu vé tiếp (hết vé ⇒ tập luyện).
    if (!isMpRef.current && soloModeRef.current === "ranked") {
      soloResultSentRef.current = false;
      if (gameStateRef.current === GameState.GAMEOVER) {
        rankedRoundRef.current = false;
        void (async () => {
          const ok = onRankedStartRef.current
            ? await onRankedStartRef.current()
            : false;
          rankedRoundRef.current = ok;
        })();
      }
    }
    setGameState(GameState.PLAYING);
  }, [multiplayer]);

  const jump = useCallback(() => {
    // In multiplayer the match auto-starts after the countdown and has no
    // manual replay; taps only flap while playing.
    if (isMpRef.current) {
      if (gameStateRef.current === GameState.PLAYING && aliveRef.current) {
        flappyBirdAudio.play("jump");
        birdVelocityRef.current = settingsRef.current.jumpVelocity;
      }
      return;
    }
    flappyBirdAudio.play("jump");
    if (gameStateRef.current === GameState.START) {
      resetGame();
      return;
    }
    if (gameStateRef.current === GameState.GAMEOVER) {
      // Chặn chơi lại (kể cả phím/chạm) khi popup phần thưởng đang hiện.
      if (replayLockedRef.current) return;
      resetGame();
      return;
    }
    if (gameStateRef.current === GameState.PLAYING) {
      birdVelocityRef.current = settingsRef.current.jumpVelocity;
      const birdX = 100;
      for (let i = 0; i < 6; i++) {
        particlesRef.current.push({
          x: birdX - 5,
          y: birdYRef.current + 8,
          vx: -1 - Math.random() * 2,
          vy: -1 + Math.random() * 2,
          color: "rgba(255, 255, 255, 0.7)",
          size: 3 + Math.random() * 4,
          alpha: 1,
          life: 0,
          maxLife: 20 + Math.random() * 15,
        });
      }
    }
  }, [resetGame]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === "Space" || e.code === "ArrowUp") {
        e.preventDefault();
        jump();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [jump]);

  // Bắt đầu trận đúng lúc `startAt` (server time), không phụ thuộc React
  // countdown tick — tránh một người vào sớm chơi trước khi đối thủ kịp load.
  useEffect(() => {
    if (!isMp || !multiplayer?.startAt) return;
    const startAt = multiplayer.startAt;
    const tryStart = () => {
      if (mpStartedRef.current) return;
      if (getServerNow() >= startAt) {
        mpStartedRef.current = true;
        resetGame();
      }
    };
    tryStart();
    const id = setInterval(tryStart, 32);
    return () => clearInterval(id);
  }, [isMp, multiplayer?.startAt, resetGame]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx =
      canvas.getContext("2d", { alpha: false, desynchronized: true }) ??
      canvas.getContext("2d");
    if (!ctx) return;

    const skyGrads: CanvasGradient[] = [];
    const getSkyTier = (s: number) => (s < 10 ? 0 : s < 25 ? 1 : 2);
    const ensureSkyGrad = (tier: number) => {
      if (skyGrads[tier]) return skyGrads[tier];
      const g = ctx.createLinearGradient(0, 0, 0, CANVAS_H);
      if (tier === 0) {
        g.addColorStop(0, "#38bdf8");
        g.addColorStop(0.6, "#bae6fd");
        g.addColorStop(1, "#f0f9ff");
      } else if (tier === 1) {
        g.addColorStop(0, "#1e1b4b");
        g.addColorStop(0.4, "#4338ca");
        g.addColorStop(0.7, "#be123c");
        g.addColorStop(1, "#f59e0b");
      } else {
        g.addColorStop(0, "#030712");
        g.addColorStop(0.5, "#0b0f19");
        g.addColorStop(1, "#1e1b4b");
      }
      skyGrads[tier] = g;
      return g;
    };

    let animationId: number;
    let lastTs = 0;

    const triggerGameOver = () => {
      if (gameStateRef.current === GameState.GAMEOVER) return;
      flappyBirdAudio.play("hit");
      shakeFramesRef.current = 15;

      const birdY = birdYRef.current;
      for (let i = 0; i < 22; i++) {
        const speed = 2 + Math.random() * 5;
        const angle = Math.random() * Math.PI * 2;
        particlesRef.current.push({
          x: 100,
          y: birdY,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed - 1.5,
          color: i % 2 === 0 ? "#facc15" : i % 3 === 0 ? "#ffffff" : "#f97316",
          size: 4 + Math.random() * 5,
          alpha: 1,
          life: 0,
          maxLife: 35 + Math.random() * 25,
        });
      }

      setScore(scoreRef.current);
      setGameState(GameState.GAMEOVER);
      const finalScore = scoreRef.current;
      if (finalScore > highScoreRef.current) {
        setHighScore(finalScore);
        persistHighScore(finalScore);
      }

      if (
        soloModeRef.current === "ranked" &&
        rankedRoundRef.current &&
        !soloResultSentRef.current &&
        onSoloResultRef.current
      ) {
        soloResultSentRef.current = true;
        onSoloResultRef.current({ won: true, score: finalScore });
      }

      // Multiplayer: broadcast death immediately so the opponent can resolve.
      if (isMpRef.current) {
        aliveRef.current = false;
        publishRef.current({
          y: birdYRef.current,
          v: birdVelocityRef.current,
          alive: false,
          score: finalScore,
        });
      }
    };

    const render = (ts: number) => {
      if (!lastTs) {
        lastTs = ts;
        animationId = requestAnimationFrame(render);
        return;
      }
      let dt = ts - lastTs;
      lastTs = ts;
      if (dt > 80) dt = 80;
      const step = dt / TARGET_FRAME_MS;

      frameCountRef.current += step;

      let dx = 0;
      let dy = 0;
      if (shakeFramesRef.current > 0) {
        dx = (Math.random() - 0.5) * 8;
        dy = (Math.random() - 0.5) * 8;
        shakeFramesRef.current -= step;
      }

      ctx.save();
      ctx.translate(dx, dy);

      const currentScore = scoreRef.current;
      ctx.fillStyle = ensureSkyGrad(getSkyTier(currentScore));
      ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

      if (currentScore >= 25) {
        ctx.fillStyle = "#ffffff";
        for (let i = 0; i < 15; i++) {
          const starX = (Math.sin(i * 12345) * 0.5 + 0.5) * CANVAS_W;
          const starY = (Math.cos(i * 54321) * 0.5 + 0.5) * 240;
          const sparkle = 0.5 + Math.sin(frameCountRef.current * 0.1 + i) * 0.5;
          ctx.globalAlpha = sparkle;
          ctx.fillRect(starX, starY, 1.5, 1.5);
        }
        ctx.globalAlpha = 1.0;
      }

      // Tiến độ forecast 0..1 — dùng để darken bầu trời + mây mượt khi sắp mưa
      const forecastProgress =
        rainForecastTotalRef.current > 0
          ? 1 -
            Math.max(
              0,
              Math.min(
                1,
                rainForecastTimerRef.current / rainForecastTotalRef.current
              )
            )
          : 0;

      // Mây xám hơn khi đang mưa (nuốt bớt sự rực rỡ của nền)
      const baseCloudColor =
        currentScore < 10
          ? "rgba(255, 255, 255, 0.75)"
          : "rgba(219, 234, 254, 0.25)";
      ctx.fillStyle = isRainingRef.current
        ? "rgba(148, 163, 184, 0.85)"
        : forecastProgress > 0
          ? `rgba(${Math.round(255 - 107 * forecastProgress)}, ${Math.round(
              255 - 92 * forecastProgress
            )}, ${Math.round(255 - 92 * forecastProgress)}, ${
              0.75 + forecastProgress * 0.1
            })`
          : baseCloudColor;
      cloudsRef.current.forEach((cloud) => {
        if (gameStateRef.current === GameState.PLAYING) {
          cloud.x -= cloud.speed * step;
          if (cloud.x < -100 * cloud.scale) {
            cloud.x = 420;
            cloud.y = 40 + Math.random() * 120;
          }
        }
        ctx.beginPath();
        const cx = cloud.x;
        const cy = cloud.y;
        const r = 18 * cloud.scale;
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.arc(cx + r * 0.8, cy - r * 0.5, r * 1.2, 0, Math.PI * 2);
        ctx.arc(cx + r * 1.6, cy, r * 0.9, 0, Math.PI * 2);
        ctx.arc(cx + r * 0.8, cy + r * 0.5, r * 0.8, 0, Math.PI * 2);
        ctx.closePath();
        ctx.fill();
      });

      // Lớp tối phủ bầu trời: full khi đang mưa, fade dần khi đang dự báo
      const skyDarkenIntensity = isRainingRef.current
        ? 1
        : forecastProgress > 0
          ? forecastProgress * 0.85
          : 0;
      if (skyDarkenIntensity > 0) {
        const stormGrad = ctx.createLinearGradient(0, 0, 0, CANVAS_H);
        stormGrad.addColorStop(
          0,
          `rgba(15, 23, 42, ${0.45 * skyDarkenIntensity})`
        );
        stormGrad.addColorStop(
          0.6,
          `rgba(30, 41, 59, ${0.28 * skyDarkenIntensity})`
        );
        stormGrad.addColorStop(
          1,
          `rgba(51, 65, 85, ${0.15 * skyDarkenIntensity})`
        );
        ctx.fillStyle = stormGrad;
        ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
      }

      if (gameStateRef.current === GameState.PLAYING) {
        const weatherSet = settingsRef.current;
        const rainEnabled = weatherSet.rainEnabled >= 1;

        // 1) Cập nhật trạng thái mưa
        if (rainEnabled) {
          if (isMpRef.current && mpRef.current?.startAt) {
            const serverStep = Math.max(
              0,
              (getServerNow() - mpRef.current.startAt) / TARGET_FRAME_MS
            );
            const active = findRainEventAt(
              serverStep,
              rainScheduleRef.current
            );
            if (active) {
              const eventKey = active.rainStart;
              const forecastFrames =
                getEffectiveRainForecastFrames(weatherSet);

              if (serverStep < active.rainStart) {
                mpSeenRainEventsRef.current.add(eventKey);
                isRainingRef.current = false;
                rainDropsRef.current = [];
                rainForecastTimerRef.current = active.rainStart - serverStep;
                rainForecastTotalRef.current = Math.max(1, forecastFrames);
              } else if (!mpSeenRainEventsRef.current.has(eventKey)) {
                // Client vào trận muộn — ép dự báo cục bộ trước giọt mưa đầu tiên
                isRainingRef.current = false;
                rainDropsRef.current = [];
                if (rainForecastTimerRef.current <= 0) {
                  rainForecastTimerRef.current = forecastFrames;
                  rainForecastTotalRef.current = forecastFrames;
                }
                rainForecastTimerRef.current -= step;
                if (rainForecastTimerRef.current <= 0) {
                  rainForecastTimerRef.current = 0;
                  rainForecastTotalRef.current = 0;
                  mpSeenRainEventsRef.current.add(eventKey);
                  if (serverStep < active.rainEnd) {
                    isRainingRef.current = true;
                    rainDropsRef.current = spawnRainDrops(
                      weatherSet.rainDropCount,
                      rngRef.current
                    );
                  }
                }
              } else {
                if (!isRainingRef.current && serverStep < active.rainEnd) {
                  isRainingRef.current = true;
                  rainDropsRef.current = spawnRainDrops(
                    weatherSet.rainDropCount,
                    rngRef.current
                  );
                }
                if (serverStep >= active.rainEnd) {
                  isRainingRef.current = false;
                  rainDropsRef.current = [];
                }
                rainForecastTimerRef.current = 0;
                rainForecastTotalRef.current = 0;
                if (
                  isRainingRef.current &&
                  rngRef.current() * 10000 <
                    weatherSet.lightningChancePer10k * step
                ) {
                  lightningFlashRef.current = Math.max(
                    lightningFlashRef.current,
                    8
                  );
                  flappyBirdAudio.playThunder();
                }
              }
            } else if (
              isRainingRef.current ||
              rainForecastTimerRef.current > 0
            ) {
              isRainingRef.current = false;
              rainTimerRef.current = 0;
              rainForecastTimerRef.current = 0;
              rainForecastTotalRef.current = 0;
              rainDropsRef.current = [];
            }
          } else if (isRainingRef.current) {
            rainTimerRef.current -= step;
            // Sấm chớp: ngẫu nhiên mỗi frame, scale theo step để 30fps cũng cùng tần suất
            if (
              Math.random() * 10000 <
              weatherSet.lightningChancePer10k * step
            ) {
              lightningFlashRef.current = Math.max(
                lightningFlashRef.current,
                8
              );
              flappyBirdAudio.playThunder();
            }
            if (rainTimerRef.current <= 0) {
              isRainingRef.current = false;
              rainTimerRef.current = 0;
              // Bắt đầu đếm ngược "ướt" — chim còn nặng thêm 1 lúc nữa
              wetTimerRef.current = Math.max(0, weatherSet.wetDurationFrames);
            }
          } else if (rainForecastTimerRef.current > 0) {
            // Đang trong giai đoạn "dự báo thời tiết" — đếm ngược, chưa rơi mưa
            rainForecastTimerRef.current -= step;
            if (rainForecastTimerRef.current <= 0) {
              // Hết dự báo → bắt đầu mưa thật
              rainForecastTimerRef.current = 0;
              rainForecastTotalRef.current = 0;
              isRainingRef.current = true;
              rainTimerRef.current = pendingRainDurationRef.current;
              pendingRainDurationRef.current = 0;
              const dropCount = Math.max(
                0,
                Math.min(500, Math.floor(weatherSet.rainDropCount))
              );
              const drops: RainDrop[] = [];
              for (let i = 0; i < dropCount; i++) {
                drops.push({
                  x: Math.random() * (CANVAS_W + 80) - 40,
                  y: Math.random() * CANVAS_H,
                  vx: -2.2 - Math.random() * 1.6,
                  vy: 11 + Math.random() * 4,
                  length: 8 + Math.random() * 6,
                });
              }
              rainDropsRef.current = drops;
            }
          } else {
            const pityReached =
              scoreRef.current >= RAIN_PITY_FORECAST_SCORE &&
              !rainEverStartedRef.current;
            const diceHit =
              Math.random() * 10000 <
              weatherSet.rainStartChancePer10k * step;

            if (pityReached || diceHit) {
              rainEverStartedRef.current = true;
              // Trúng dice hoặc pity → khởi động dự báo (mưa sau forecast frames)
              const minD = Math.max(0, weatherSet.rainMinDurationFrames);
              const maxD = Math.max(minD, weatherSet.rainMaxDurationFrames);
              pendingRainDurationRef.current =
                minD + Math.random() * (maxD - minD);
              const forecast = getEffectiveRainForecastFrames(weatherSet);
              rainForecastTimerRef.current = forecast;
              rainForecastTotalRef.current = forecast;
            }
          }
        } else if (
          isRainingRef.current ||
          rainForecastTimerRef.current > 0
        ) {
          // Admin tắt mưa giữa game → dừng ngay cả forecast và mưa thật
          isRainingRef.current = false;
          rainTimerRef.current = 0;
          rainForecastTimerRef.current = 0;
          rainForecastTotalRef.current = 0;
          pendingRainDurationRef.current = 0;
          rainDropsRef.current = [];
        }

        // Giữ chim luôn "ướt" trong lúc mưa, tick xuống khi đã tạnh
        if (isRainingRef.current) {
          wetTimerRef.current = Math.max(
            wetTimerRef.current,
            weatherSet.wetDurationFrames
          );
        } else if (wetTimerRef.current > 0) {
          wetTimerRef.current = Math.max(0, wetTimerRef.current - step);
        }

        // 2) Trọng lực — chim ướt sẽ nặng hơn theo multiplier admin cấu hình.
        // Đang mưa = luôn ướt (bất kể wetDurationFrames); wetDurationFrames chỉ
        // quyết định còn ướt thêm bao lâu SAU khi tạnh.
        const isWet = isRainingRef.current || wetTimerRef.current > 0;
        const gravityMult = isWet
          ? Math.max(1, weatherSet.wetGravityMultiplier)
          : 1;
        birdVelocityRef.current += weatherSet.gravity * gravityMult * step;
        birdYRef.current += birdVelocityRef.current * step;

        if (birdYRef.current < 15) {
          birdYRef.current = 15;
          birdVelocityRef.current = 0;
        }

        if (birdYRef.current > BIRD_MAX_Y) {
          birdYRef.current = BIRD_MAX_Y;
          triggerGameOver();
        }
      } else if (gameStateRef.current === GameState.START) {
        birdYRef.current =
          320 + Math.sin(frameCountRef.current * 0.08) * 14;
      }

      const liveSet = settingsRef.current;
      const pipeWidth = liveSet.pipeWidth;

      if (gameStateRef.current === GameState.PLAYING) {
        const mp = mpRef.current;
        const mpActive =
          isMpRef.current && mp?.startAt && getServerNow() >= mp.startAt;

        if (mpActive && mp.startAt != null) {
          const serverStep = getMultiplayerServerStep(mp.startAt);
          pipesRef.current = buildMultiplayerPipes(
            serverStep,
            mp.seed,
            liveSet
          );
        } else if (!isMpRef.current) {
          pipeSpawnTimerRef.current += step;
          if (pipeSpawnTimerRef.current >= liveSet.pipeSpawnInterval) {
            pipeSpawnTimerRef.current -= liveSet.pipeSpawnInterval;
            const gapSize = Math.max(
              115,
              liveSet.pipeGap - Math.floor(currentScore / 4) * 3
            );
            const minHeight = 50;
            const maxHeight = 380;
            const topHeight =
              minHeight + rngRef.current() * (maxHeight - minHeight);
            const bottomHeight = CANVAS_H - GROUND_H - topHeight - gapSize;

            soloPipeSeqRef.current += 1;
            pipesRef.current.push({
              x: 420,
              topHeight,
              bottomHeight,
              passed: false,
              scoreValue: soloPipeSeqRef.current,
            });
          }

          const soloPipes = pipesRef.current;
          for (let i = soloPipes.length - 1; i >= 0; i--) {
            soloPipes[i].x -= liveSet.pipeSpeed * step;
            if (soloPipes[i].x < -pipeWidth - 20) {
              soloPipes.splice(i, 1);
            }
          }
        }

        const pipes = pipesRef.current;
        for (let i = 0; i < pipes.length; i++) {
          const pipe = pipes[i];
          const pipeScoreKey =
            mpActive && pipe.spawnIndex != null ? pipe.spawnIndex : i;

          const awardPoint = () => {
            if (mpActive) {
              if (scoredPipeIndicesRef.current.has(pipeScoreKey)) return;
              scoredPipeIndicesRef.current.add(pipeScoreKey);
            } else if (pipe.passed) {
              return;
            } else {
              pipe.passed = true;
            }
            const newScore = scoreRef.current + 1;
            scoreRef.current = newScore;
            // Lượt có vé: vừa vượt mốc cờ bạc → bật cảnh báo điểm lẻ trừ bánh
            if (
              !isMpRef.current &&
              soloModeRef.current === "ranked" &&
              !gambleWarnRef.current &&
              newScore > SCORE_GAMBLE_THRESHOLD
            ) {
              gambleWarnRef.current = true;
              setGambleWarn(true);
            }
            if (
              newScore > highScoreRef.current &&
              highScoreRef.current > 0 &&
              !isNewRecordRef.current
            ) {
              isNewRecordRef.current = true;
              setIsNewRecord(true);
            }
            // Lóe sáng đúng khoảnh khắc vượt qua mốc kỉ lục
            if (
              highScoreRef.current > 0 &&
              newScore === highScoreRef.current + 1
            ) {
              setRecordBurst((n) => n + 1);
            }
            flappyBirdAudio.play("point");

            for (let p = 0; p < 8; p++) {
              particlesRef.current.push({
                x: 100,
                y: birdYRef.current,
                vx: -1.5 + Math.random() * 3,
                vy: -3 - Math.random() * 3,
                color: "#fbbf24",
                size: 2.5 + Math.random() * 3,
                alpha: 1,
                life: 0,
                maxLife: 25 + Math.random() * 15,
              });
            }
          };

          if (pipe.x + pipeWidth / 2 < 100) {
            awardPoint();
          }

          const birdX = 100;
          const birdRadiusHeight = liveSet.birdHeight / 2 - 2;
          const birdRadiusWidth = liveSet.birdWidth / 2 - 2;

          const insideX =
            birdX + birdRadiusWidth > pipe.x &&
            birdX - birdRadiusWidth < pipe.x + pipeWidth;
          const insideTopY =
            birdYRef.current - birdRadiusHeight < pipe.topHeight;
          const insideBottomY =
            birdYRef.current + birdRadiusHeight >
            CANVAS_H - GROUND_H - pipe.bottomHeight;

          if (insideX && (insideTopY || insideBottomY)) {
            triggerGameOver();
          }
        }
      }

      // Mốc kỉ lục: ống mà khi vượt qua sẽ phá kỉ lục hiện tại (chỉ khi đã có kỉ lục)
      const recordScore = highScoreRef.current + 1;
      const hasRecordTarget =
        highScoreRef.current > 0 && currentScore < recordScore;

      pipesRef.current.forEach((pipe) => {
        const pipeScoreValue =
          pipe.scoreValue ??
          (pipe.spawnIndex != null ? pipe.spawnIndex + 1 : undefined);
        const isRecordPipe =
          hasRecordTarget && pipeScoreValue === recordScore;

        ctx.fillStyle = isRecordPipe
          ? "#facc15"
          : currentScore < 10
            ? "#22c55e"
            : currentScore < 25
              ? "#ea580c"
              : "#64748b";
        ctx.strokeStyle = isRecordPipe ? "#a16207" : "#0f172a";
        ctx.lineWidth = 3.5;

        ctx.fillRect(pipe.x, 0, pipeWidth, pipe.topHeight);
        ctx.strokeRect(pipe.x, -5, pipeWidth, pipe.topHeight + 5);

        const lipHeight = 24;
        const lipOffset = 4;
        ctx.fillRect(
          pipe.x - lipOffset,
          pipe.topHeight - lipHeight,
          pipeWidth + lipOffset * 2,
          lipHeight
        );
        ctx.strokeRect(
          pipe.x - lipOffset,
          pipe.topHeight - lipHeight,
          pipeWidth + lipOffset * 2,
          lipHeight
        );

        const bottomY = CANVAS_H - GROUND_H - pipe.bottomHeight;
        ctx.fillRect(pipe.x, bottomY, pipeWidth, pipe.bottomHeight);
        ctx.strokeRect(pipe.x, bottomY, pipeWidth, pipe.bottomHeight + 10);

        ctx.fillRect(
          pipe.x - lipOffset,
          bottomY,
          pipeWidth + lipOffset * 2,
          lipHeight
        );
        ctx.strokeRect(
          pipe.x - lipOffset,
          bottomY,
          pipeWidth + lipOffset * 2,
          lipHeight
        );

        ctx.fillStyle = "rgba(255, 255, 255, 0.25)";
        ctx.fillRect(pipe.x + 8, 0, 8, pipe.topHeight);
        ctx.fillRect(pipe.x + 8, bottomY, 8, pipe.bottomHeight);

        // Cúp kỉ lục: huy hiệu vàng phát sáng, nhịp đập giữa khe hở
        if (isRecordPipe) {
          const gapCenterX = pipe.x + pipeWidth / 2;
          const gapCenterY = (pipe.topHeight + bottomY) / 2;
          const pulse = 1 + Math.sin(frameCountRef.current * 0.18) * 0.12;
          ctx.save();

          const haloR = 36 * pulse;
          const halo = ctx.createRadialGradient(
            gapCenterX,
            gapCenterY,
            0,
            gapCenterX,
            gapCenterY,
            haloR
          );
          halo.addColorStop(0, "rgba(253, 224, 71, 0.95)");
          halo.addColorStop(0.5, "rgba(250, 204, 21, 0.45)");
          halo.addColorStop(1, "rgba(250, 204, 21, 0)");
          ctx.fillStyle = halo;
          ctx.beginPath();
          ctx.arc(gapCenterX, gapCenterY, haloR, 0, Math.PI * 2);
          ctx.fill();

          // Đồng xu vàng nền cho cúp nổi bật
          ctx.beginPath();
          ctx.arc(gapCenterX, gapCenterY, 17, 0, Math.PI * 2);
          ctx.fillStyle = "#fde047";
          ctx.fill();
          ctx.lineWidth = 2.5;
          ctx.strokeStyle = "#a16207";
          ctx.stroke();

          ctx.shadowColor = "rgba(161, 98, 7, 0.55)";
          ctx.shadowBlur = 4;
          ctx.font = `${Math.round(
            22 * pulse
          )}px 'Apple Color Emoji','Segoe UI Emoji','Noto Color Emoji',sans-serif`;
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText("🏆", gapCenterX, gapCenterY + 1);
          ctx.restore();
        }
      });

      // Hạt mưa: vẫn rơi cả khi GAMEOVER cho đẹp, chỉ đứng yên ở START.
      // Khi đã tạnh (isRaining=false) thì KHÔNG tái sinh giọt nữa — để chúng rơi
      // hết khỏi màn hình rồi biến mất, tránh "mưa ảo" rơi mãi sau khi tạnh.
      const drops = rainDropsRef.current;
      if (drops.length > 0) {
        const animateDrops = gameStateRef.current !== GameState.START;
        const recycleDrops = isRainingRef.current;
        ctx.strokeStyle = "rgba(186, 230, 253, 0.72)";
        ctx.lineWidth = 1.25;
        ctx.beginPath();
        for (let i = drops.length - 1; i >= 0; i--) {
          const d = drops[i];
          if (animateDrops) {
            d.x += d.vx * step;
            d.y += d.vy * step;
            if (d.y > GROUND_Y - 2 || d.x < -40) {
              if (recycleDrops) {
                d.x = Math.random() * (CANVAS_W + 80) - 40;
                d.y = -20 - Math.random() * 40;
              } else {
                // Đã tạnh: giọt ra khỏi màn hình thì bỏ hẳn, không sinh lại.
                drops.splice(i, 1);
                continue;
              }
            }
          }
          // Vẽ thành 1 path duy nhất → tiết kiệm nhiều lệnh stroke()
          const speed = Math.hypot(d.vx, d.vy) || 1;
          const tailX = d.x - (d.vx / speed) * d.length;
          const tailY = d.y - (d.vy / speed) * d.length;
          ctx.moveTo(d.x, d.y);
          ctx.lineTo(tailX, tailY);
        }
        ctx.stroke();
      }

      const particles = particlesRef.current;
      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.life += step;
        p.alpha = 1 - p.life / p.maxLife;
        p.x += p.vx * step;
        p.y += p.vy * step;
        p.vy += 0.05 * step;

        if (p.life >= p.maxLife || p.alpha <= 0) {
          particles.splice(i, 1);
          continue;
        }

        ctx.globalAlpha = p.alpha;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;

      ctx.save();
      const birdX = 100;
      const birdY = birdYRef.current;
      let targetRotation = birdVelocityRef.current * 0.07;
      if (targetRotation > 1.1) targetRotation = 1.1;
      if (targetRotation < -0.5) targetRotation = -0.5;

      ctx.translate(birdX, birdY);
      ctx.rotate(targetRotation);

      const flapAmt =
        gameStateRef.current === GameState.PLAYING
          ? Math.sin(frameCountRef.current * 0.45) * 8
          : Math.sin(frameCountRef.current * 0.15) * 6;

      const charSprite = isMpRef.current
        ? selfMpSpriteRef.current
        : characterSpriteRef.current;
      const selfBirdColors =
        isMpRef.current && mpRef.current
          ? DEFAULT_BIRD_COLORS[mpRef.current.self.color]
          : null;
      drawFlappyBird(ctx, {
        sprite: charSprite,
        colors: selfBirdColors,
        flapAmt,
      });

      // Hiệu ứng "ướt": giọt nước nhỏ giọt + ánh phản xạ lam — vẽ trong scope translate của chim.
      // Đang mưa = luôn ướt; sau khi tạnh thì còn ướt trong wetTimer frame nữa.
      if (isRainingRef.current || wetTimerRef.current > 0) {
        const dripPhase = (frameCountRef.current * 0.35) % 18;
        ctx.fillStyle = "rgba(56, 189, 248, 0.85)";
        ctx.strokeStyle = "rgba(8, 47, 73, 0.55)";
        ctx.lineWidth = 1;

        ctx.beginPath();
        ctx.arc(-7, 9 + dripPhase, 2.4, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(6, 11 + ((dripPhase + 9) % 18), 2, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(-1, 7 + ((dripPhase + 14) % 18), 1.6, 0, Math.PI * 2);
        ctx.fill();

        // Ánh phản xạ lam mỏng nằm trên đỉnh đầu — gợi cảm giác lông ướt sũng
        ctx.globalAlpha = 0.35;
        ctx.fillStyle = "#38bdf8";
        ctx.beginPath();
        ctx.ellipse(-3, -8, 9, 3, -0.3, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
      }

      ctx.restore();

      // Opponent "ghost" bird (multiplayer): drawn at the same x with no
      // collision against the local bird — only visual.
      if (isMpRef.current) {
        const opp = opponentSyncRef.current;
        if (opp && typeof opp.y === "number") {
          ctx.save();
          ctx.globalAlpha = opp.alive ? 0.92 : 0.35;
          ctx.translate(birdX, opp.y);
          let oppRot = (opp.v ?? 0) * 0.07;
          if (oppRot > 1.1) oppRot = 1.1;
          if (oppRot < -0.5) oppRot = -0.5;
          ctx.rotate(oppRot);
          const oppFlap =
            gameStateRef.current === GameState.PLAYING
              ? Math.sin(frameCountRef.current * 0.45 + Math.PI) * 8
              : Math.sin(frameCountRef.current * 0.15 + Math.PI) * 6;
          drawFlappyBird(ctx, {
            sprite: oppSpriteRef.current,
            colors: DEFAULT_BIRD_COLORS[mpRef.current?.opponent.color ?? "red"],
            flapAmt: oppFlap,
          });
          ctx.restore();
        }
      }

      // Throttled position broadcast — phát cả ở màn START (countdown) để đối
      // thủ load chậm hơn vẫn nhìn thấy chim mình đang hover, không bị "trận
      // ma" (mình thấy đối thủ vô hình).
      const broadcastNow =
        isMpRef.current &&
        aliveRef.current &&
        (gameStateRef.current === GameState.PLAYING ||
          gameStateRef.current === GameState.START) &&
        ts - lastPublishTsRef.current >= 100;
      if (broadcastNow) {
        lastPublishTsRef.current = ts;
        publishRef.current({
          y: birdYRef.current,
          v: birdVelocityRef.current,
          alive: true,
          score: scoreRef.current,
        });
      }

      const groundY = GROUND_Y;
      ctx.fillStyle = "#e2e8f0";
      ctx.fillRect(0, groundY, CANVAS_W, GROUND_H);

      ctx.lineWidth = 4;
      ctx.strokeStyle = "#0f172a";
      ctx.strokeRect(-5, groundY, CANVAS_W + 10, GROUND_H + 5);

      ctx.fillStyle = "#cbd5e1";
      const offset =
        (gameStateRef.current === GameState.PLAYING
          ? frameCountRef.current * liveSet.pipeSpeed
          : 0) % 20;
      for (let s = -20; s < CANVAS_W + 20; s += 20) {
        ctx.beginPath();
        ctx.moveTo(s - offset, groundY + 4);
        ctx.lineTo(s - offset + 12, groundY + 4);
        ctx.lineTo(s - offset + 4, groundY + 76);
        ctx.lineTo(s - offset - 8, groundY + 76);
        ctx.closePath();
        ctx.fill();
      }

      ctx.fillStyle = "#16a34a";
      ctx.fillRect(0, groundY, CANVAS_W, 14);
      ctx.strokeRect(-5, groundY, CANVAS_W + 10, 14);

      ctx.fillStyle = "#22c55e";
      ctx.fillRect(0, groundY + 4, CANVAS_W, 5);

      // Ánh chớp sét: phủ trắng toàn màn hình, đếm về 0 theo step
      if (lightningFlashRef.current > 0) {
        const flashAlpha = Math.min(0.6, 0.6 * (lightningFlashRef.current / 8));
        ctx.fillStyle = `rgba(255, 255, 255, ${flashAlpha})`;
        ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
        lightningFlashRef.current = Math.max(
          0,
          lightningFlashRef.current - step
        );
      }

      if (gameStateRef.current === GameState.PLAYING) {
        // Banner "Dự báo mưa": chỉ hiện trong giai đoạn forecast
        if (rainForecastTimerRef.current > 0 && rainForecastTotalRef.current > 0) {
          const remainSec = rainForecastTimerRef.current / 60;
          const blink = 0.55 + Math.sin(frameCountRef.current * 0.45) * 0.45;
          ctx.save();
          ctx.translate(CANVAS_W / 2, 28);
          // Khung nền
          ctx.fillStyle = `rgba(15, 23, 42, ${0.7 + blink * 0.2})`;
          ctx.strokeStyle = `rgba(250, 204, 21, ${0.8 + blink * 0.2})`;
          ctx.lineWidth = 2;
          const bw = 168;
          const bh = 32;
          ctx.fillRect(-bw / 2, -bh / 2, bw, bh);
          ctx.strokeRect(-bw / 2, -bh / 2, bw, bh);
          // Text
          ctx.fillStyle = `rgba(254, 240, 138, ${0.85 + blink * 0.15})`;
          ctx.font = "bold 12px 'JetBrains Mono', monospace";
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText(
            `⛈ SẮP MƯA · ${remainSec.toFixed(1)}s`,
            0,
            -2
          );
          // Progress bar đếm ngược (đầy → cạn)
          const remainPct = Math.max(
            0,
            Math.min(
              1,
              rainForecastTimerRef.current / rainForecastTotalRef.current
            )
          );
          ctx.fillStyle = "rgba(15, 23, 42, 0.6)";
          ctx.fillRect(-bw / 2 + 6, bh / 2 - 7, bw - 12, 3);
          ctx.fillStyle = "#fbbf24";
          ctx.fillRect(-bw / 2 + 6, bh / 2 - 7, (bw - 12) * remainPct, 3);
          ctx.restore();
        }

        // Huy hiệu "ướt": báo người chơi biết chim đang nặng hơn.
        // Hiện khi đang mưa (thanh đầy, "MƯA TO") hoặc còn ướt sau mưa (đếm ngược, "ƯỚT").
        if (isRainingRef.current || wetTimerRef.current > 0) {
          const wetMax = Math.max(1, settingsRef.current.wetDurationFrames);
          const pct = isRainingRef.current
            ? 1
            : Math.min(1, wetTimerRef.current / wetMax);
          ctx.save();
          ctx.translate(14, 14);
          ctx.fillStyle = "rgba(8, 47, 73, 0.55)";
          ctx.fillRect(0, 0, 78, 16);
          ctx.fillStyle = "#38bdf8";
          ctx.fillRect(2, 2, 74 * pct, 12);
          ctx.fillStyle = "#ffffff";
          ctx.font = "bold 9px 'JetBrains Mono', monospace";
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText(isRainingRef.current ? "MƯA TO" : "ƯỚT", 39, 9);
          ctx.restore();
        }

        ctx.font = "bold 44px 'Space Grotesk', sans-serif";
        ctx.textAlign = "center";

        ctx.fillStyle = "rgba(15, 23, 42, 0.2)";
        ctx.fillText(String(currentScore), CANVAS_W / 2, 72);
        ctx.fillStyle = "#ffffff";
        ctx.fillText(String(currentScore), CANVAS_W / 2, 68);

        // Multiplayer HUD: own vs opponent score.
        if (isMpRef.current && mpRef.current) {
          const opp = opponentSyncRef.current;
          ctx.font = "bold 14px 'JetBrains Mono', monospace";
          ctx.textAlign = "left";
          ctx.fillStyle = DEFAULT_BIRD_COLORS[mpRef.current.opponent.color].body;
          ctx.fillText(`Đối thủ: ${opp?.score ?? 0}`, 12, 28);
        }

        if (isNewRecordRef.current) {
          ctx.save();
          const beatAnim = 1 + Math.sin(frameCountRef.current * 0.15) * 0.05;
          ctx.translate(CANVAS_W / 2, 105);
          ctx.scale(beatAnim, beatAnim);
          ctx.font = "bold 13px 'JetBrains Mono', monospace";
          ctx.fillStyle = "#f59e0b";
          ctx.fillText("🏆 KỶ LỤC MỚI 🏆", 0, 0);
          ctx.restore();
        }
      }

      ctx.restore();
      animationId = requestAnimationFrame(render);
    };

    animationId = requestAnimationFrame(render);
    return () => {
      cancelAnimationFrame(animationId);
    };
  }, [persistHighScore]);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (e.pointerType === "mouse" && e.button !== 0) return;
      e.preventDefault();

      const now = performance.now();
      if (now - lastPointerInputAtRef.current < 120) return;
      lastPointerInputAtRef.current = now;

      jump();
    },
    [jump]
  );

  return (
    <div
      ref={containerRef}
      className="relative flex flex-col items-center justify-center w-full p-1 sm:p-2 rounded-3xl select-none"
    >
      <div className="relative overflow-hidden rounded-[24px] sm:rounded-[38px] shadow-2xl border-[5px] sm:border-[8px] border-[#3C8DA0] bg-sky-300 w-full max-w-[480px]">
        <canvas
          ref={canvasRef}
          width={CANVAS_W}
          height={CANVAS_H}
          onPointerDown={handlePointerDown}
          className="block w-full h-auto max-h-[88vh] aspect-[5/9] cursor-pointer touch-none bg-sky-300 [transform:translateZ(0)]"
        />

        {recordBurst > 0 && (
          <div
            key={recordBurst}
            onAnimationEnd={() => setRecordBurst(0)}
            className="fb-record-burst pointer-events-none absolute inset-0 z-40"
          >
            <span className="fb-record-burst__label">🏆 KỶ LỤC! 🏆</span>
          </div>
        )}

        <UserBreadBadge
          variant="light"
          className="absolute top-3 right-3 sm:top-4 sm:right-4 z-30"
        />

        <GambleWarning
          show={
            !isMp &&
            soloMode === "ranked" &&
            gameState === GameState.PLAYING &&
            gambleWarn
          }
          className="bottom-3 left-1/2 -translate-x-1/2"
        />

        <style jsx>{`
          .fb-record-burst {
            background: radial-gradient(
              circle at 25% 50%,
              rgba(253, 224, 71, 0.65),
              rgba(250, 204, 21, 0) 62%
            );
            animation: fbRecordFlash 0.9s ease-out forwards;
            display: flex;
            align-items: center;
            justify-content: center;
          }
          .fb-record-burst__label {
            font-weight: 900;
            letter-spacing: 0.12em;
            color: #fff7cc;
            text-shadow: 0 2px 6px rgba(161, 98, 7, 0.9),
              0 0 18px rgba(250, 204, 21, 0.9);
            font-size: clamp(16px, 5vw, 26px);
            animation: fbRecordPop 0.9s cubic-bezier(0.18, 1.4, 0.4, 1) forwards;
          }
          @keyframes fbRecordFlash {
            0% {
              opacity: 0;
            }
            18% {
              opacity: 1;
            }
            100% {
              opacity: 0;
            }
          }
          @keyframes fbRecordPop {
            0% {
              transform: scale(0.4) translateY(8px);
              opacity: 0;
            }
            25% {
              transform: scale(1.15) translateY(0);
              opacity: 1;
            }
            70% {
              transform: scale(1) translateY(0);
              opacity: 1;
            }
            100% {
              transform: scale(1.05) translateY(-10px);
              opacity: 0;
            }
          }
        `}</style>

        {isMp && gameState === GameState.START && (
          <div className="absolute inset-0 bg-slate-950/60 flex flex-col justify-center items-center text-center p-6 text-white gap-3">
            <div className="flex items-center gap-4">
              <PlayerChip
                name="Bạn"
                color={multiplayer!.self.color}
                avatarUrl={multiplayer!.self.avatarUrl}
              />
              <span className="text-lg font-black text-white/70">VS</span>
              <PlayerChip
                name={getFirstName(multiplayer!.opponent.name)}
                color={multiplayer!.opponent.color}
                avatarUrl={multiplayer!.opponent.avatarUrl}
              />
            </div>
            <div className="text-7xl font-black text-amber-300 drop-shadow-lg tabular-nums">
              {countdown && countdown > 0 ? countdown : "GO!"}
            </div>
            <p className="text-xs font-semibold text-white/70">
              Bay cao hơn đối thủ để thắng!
            </p>
          </div>
        )}

        {!isMp && gameState === GameState.START && (
          <div
            onPointerDown={handlePointerDown}
            className="absolute inset-0 bg-slate-950/55 flex flex-col justify-center items-center text-center p-6 text-white cursor-pointer select-none touch-none gap-4"
          >
            <button
              type="button"
              onPointerDown={(e) => {
                e.stopPropagation();
                e.preventDefault();
                lastPointerInputAtRef.current = performance.now();
                resetGame();
              }}
              className="flex items-center gap-2 bg-sky-400 text-white font-black px-8 py-3.5 rounded-2xl shadow-[0_5px_0_#0369a1] hover:bg-sky-300 hover:shadow-[0_3px_0_#0369a1] active:translate-y-1 active:shadow-none transition-all text-xs uppercase tracking-widest"
            >
              <FiPlay className="w-4 h-4 fill-white text-white" /> Chơi
            </button>

            {highScore > 0 && (
              <span className="text-xl font-mono font-bold text-amber-200 drop-shadow">
                🏆 {highScore}
              </span>
            )}

            <div
              onPointerDown={(e) => e.stopPropagation()}
              className="mx-auto mt-1 inline-flex flex-col items-center bg-slate-900/55 border border-white/15 rounded-2xl px-3 py-2 cursor-default"
            >
              <div className="text-[10px] font-black uppercase tracking-widest text-amber-200/90 mb-1.5 text-center">
                Nhân vật
              </div>
              <div className="flex gap-3 justify-center">
                <CharacterOption
                  isSelected={selectedCharacterId === DEFAULT_CHARACTER_ID}
                  label="Chim"
                  onSelect={() => handleSelectCharacter(DEFAULT_CHARACTER_ID)}
                >
                  <div className="w-10 h-10 rounded-full bg-yellow-400 border-2 border-slate-900 flex items-center justify-center text-base">
                    🐤
                  </div>
                </CharacterOption>

                {characters.map((c) => (
                  <CharacterOption
                    key={c.id}
                    isSelected={selectedCharacterId === c.id}
                    label={getFirstName(c.name)}
                    onSelect={() => handleSelectCharacter(c.id)}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={c.url}
                      alt={c.name}
                      referrerPolicy="no-referrer"
                      className="w-10 h-10 rounded-full object-cover border-2 border-slate-900 bg-slate-200"
                    />
                  </CharacterOption>
                ))}
              </div>
            </div>
          </div>
        )}

        {isMp && gameState === GameState.GAMEOVER && (
          <div className="absolute inset-0 bg-slate-950/70 flex flex-col justify-center items-center p-6 text-white">
            <div className="w-full max-w-[300px] bg-white text-slate-900 p-5 rounded-[24px] border-4 border-[#3C8DA0] shadow-2xl text-center space-y-3">
              {mpResult === null ? (
                <>
                  <h2 className="text-xl font-black uppercase tracking-widest text-[#3C8DA0]">
                    Bạn rớt rồi!
                  </h2>
                  <p className="text-sm text-slate-500">
                    Đang chờ đối thủ kết thúc...
                  </p>
                  <div className="text-3xl font-black text-[#E86101] tabular-nums">
                    {score}
                  </div>
                </>
              ) : (
                <>
                  <h2
                    className={`text-2xl font-black uppercase tracking-widest ${
                      mpResult === "win"
                        ? "text-emerald-600"
                        : mpResult === "lose"
                          ? "text-rose-600"
                          : "text-slate-600"
                    }`}
                  >
                    {mpResult === "win"
                      ? "🏆 Bạn thắng!"
                      : mpResult === "lose"
                        ? "Bạn thua!"
                        : "Hòa!"}
                  </h2>
                  <div className="flex items-stretch justify-center gap-3">
                    <div className="flex-1 bg-sky-50 border border-sky-200 rounded-xl px-3 py-2">
                      <div className="text-[10px] font-bold uppercase tracking-widest text-sky-600/80">
                        Bạn
                      </div>
                      <div className="text-3xl font-black text-[#3C8DA0] tabular-nums">
                        {score}
                      </div>
                    </div>
                    <div className="flex-1 bg-rose-50 border border-rose-200 rounded-xl px-3 py-2">
                      <div className="text-[10px] font-bold uppercase tracking-widest text-rose-500/80">
                        Đối thủ
                      </div>
                      <div className="text-3xl font-black text-rose-600 tabular-nums">
                        {opponentSyncRef.current?.score ?? 0}
                      </div>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {!isMp && gameState === GameState.GAMEOVER && (
          <div className="absolute inset-0 bg-slate-950/65 flex flex-col justify-center items-center p-6 text-white">
            <div className="w-full max-w-[280px] bg-white text-slate-900 p-5 rounded-[24px] border-4 border-[#3C8DA0] shadow-2xl text-center space-y-3">
              <div className="flex flex-col items-center gap-1.5">
                <h2 className="text-2xl font-black uppercase tracking-widest text-[#3C8DA0]">
                  Game Over
                </h2>
                {isNewRecord && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-100 border border-amber-300 text-[10px] font-black uppercase tracking-widest text-amber-700">
                    🏆 Kỷ lục mới
                  </span>
                )}
              </div>

              <div className="flex items-stretch justify-center gap-3">
                <div className="flex-1 bg-orange-50 border border-orange-200 rounded-xl px-3 py-2">
                  <div className="text-[10px] font-bold uppercase tracking-widest text-orange-500/80">
                    Điểm
                  </div>
                  <div className="text-3xl font-black text-[#E86101] leading-none mt-0.5 tabular-nums">
                    {score}
                  </div>
                </div>
                <div className="flex-1 bg-sky-50 border border-sky-200 rounded-xl px-3 py-2">
                  <div className="text-[10px] font-bold uppercase tracking-widest text-sky-600/80">
                    🏆 Kỷ lục
                  </div>
                  <div className="text-3xl font-black text-[#3C8DA0] leading-none mt-0.5 tabular-nums">
                    {Math.max(score, highScore)}
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={resetGame}
                disabled={replayLocked}
                className="w-full flex items-center justify-center gap-2 bg-sky-400 text-white font-black px-5 py-3 rounded-2xl shadow-[0_5px_0_#0369a1] hover:bg-sky-300 hover:shadow-[0_3px_0_#0369a1] active:translate-y-1 active:shadow-none transition-all text-xs uppercase tracking-widest disabled:opacity-50 disabled:pointer-events-none"
              >
                <FiRotateCcw className="w-4 h-4 text-white" /> Chơi lại
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function PlayerChip({
  name,
  color,
  avatarUrl,
}: {
  name: string;
  color: "blue" | "red";
  avatarUrl: string | null;
}) {
  const ring = color === "blue" ? "ring-sky-400" : "ring-rose-400";
  const bg = color === "blue" ? "bg-sky-500" : "bg-rose-500";
  return (
    <div className="flex flex-col items-center gap-1">
      {avatarUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={avatarUrl}
          alt={name}
          referrerPolicy="no-referrer"
          className={`h-14 w-14 rounded-full object-cover ring-4 ${ring}`}
        />
      ) : (
        <div
          className={`flex h-14 w-14 items-center justify-center rounded-full ${bg} text-xl font-black text-white ring-4 ${ring}`}
        >
          {name.charAt(0).toUpperCase()}
        </div>
      )}
      <span className="max-w-[80px] truncate text-xs font-bold text-white">
        {name}
      </span>
    </div>
  );
}

interface CharacterOptionProps {
  isSelected: boolean;
  label: string;
  onSelect: () => void;
  children: React.ReactNode;
}

function CharacterOption({
  isSelected,
  label,
  onSelect,
  children,
}: CharacterOptionProps) {
  return (
    <button
      type="button"
      onPointerDown={(e) => {
        e.stopPropagation();
        e.preventDefault();
        onSelect();
      }}
      title={label}
      className={`shrink-0 flex flex-col items-center gap-1 p-1 rounded-xl transition-all cursor-pointer ${
        isSelected
          ? "bg-amber-300/30 ring-2 ring-amber-300 scale-105"
          : "hover:bg-white/10"
      }`}
    >
      {children}
      <span
        className={`text-[9px] font-bold uppercase tracking-wide leading-none max-w-[64px] truncate ${
          isSelected ? "text-amber-200" : "text-white/80"
        }`}
      >
        {label}
      </span>
    </button>
  );
}
