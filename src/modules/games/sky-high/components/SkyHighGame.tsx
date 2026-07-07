"use client";

import React, { useEffect, useRef, useState } from "react";
import { FaSuitcase, FaWind } from "react-icons/fa";
import {
  FiChevronsLeft,
  FiChevronsRight,
  FiRotateCcw,
  FiZap,
} from "react-icons/fi";
import { TURN_THINK_MS } from "../../realtime";
import { useSkyHighSettings } from "../hooks/useSkyHighSettings";
import { UserBreadBadge } from "../../components/UserBreadBadge";
import {
  BirdState,
  DroppedSuitcase,
  FlyingText,
  Particle,
  SKY_HIGH_SETTINGS,
  SkyHighGameStatus,
  SkyHighSettings,
  SuitcaseType,
  WindState,
} from "../types";
import { skyHighAudio } from "../utils/audio";
import { getRandomSuitcase, getTierForHeight, PIERRE_QUOTES } from "../utils/data";

interface SkyHighGameProps {
  onGameOver: (finalScore: number) => void;
  gameStatus: SkyHighGameStatus;
  setGameStatus: (status: SkyHighGameStatus) => void;
  /** Optional live score reporter (used for multiplayer opponent bars). */
  onScoreChange?: (score: number) => void;
  /** Bật đồng hồ 15s mỗi lượt thả (mặc định: true). */
  dropTimerEnabled?: boolean;
  /** Tăng khi reconnect để reset deadline thả vali. */
  timerResetKey?: number;
  /** Gọi khi hết giờ thả (trước khi tháp sập). */
  onDropTimeout?: () => void;
}

const CANVAS_WIDTH = 480;
const CANVAS_HEIGHT = 820;
const GROUND_LINE_Y = CANVAS_HEIGHT - 70;
const CURB_Y = CANVAS_HEIGHT - 76;
const ZEBRA_Y = CANVAS_HEIGHT - 58;
const ROAD_MARK_Y = CANVAS_HEIGHT - 28;
const LAMP_TOP_Y = CANVAS_HEIGHT - 190;
const PLATFORM_Y = CANVAS_HEIGHT - 8;
// Giữ đầu dây con lắc luôn ở vị trí này trên màn hình (đo từ trên xuống).
// Nhờ vậy quãng rơi visual của vali luôn ~500px, không bị "pop" sát đỉnh tháp
// khi tháp lên cao (camera kéo lên) -> cảm giác gia tốc rơi từ tốn, mượt.
const SWING_TIP_SCREEN_Y = 160;

export default function SkyHighGame({
  onGameOver,
  gameStatus,
  setGameStatus,
  onScoreChange,
  dropTimerEnabled = true,
  timerResetKey = 0,
  onDropTimeout,
}: SkyHighGameProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const dropTimerEnabledRef = useRef(dropTimerEnabled);
  const onDropTimeoutRef = useRef(onDropTimeout);
  const lastHudDropSecondsRef = useRef(-1);
  const pausedDropRemainingRef = useRef<number | null>(null);

  useEffect(() => {
    dropTimerEnabledRef.current = dropTimerEnabled;
  }, [dropTimerEnabled]);
  useEffect(() => {
    onDropTimeoutRef.current = onDropTimeout;
  }, [onDropTimeout]);

  const { data: liveSettings } = useSkyHighSettings();
  const settingsRef = useRef<SkyHighSettings>(liveSettings ?? SKY_HIGH_SETTINGS);
  useEffect(() => {
    if (liveSettings) settingsRef.current = liveSettings;
  }, [liveSettings]);

  const [score, setScore] = useState(0);
  useEffect(() => {
    onScoreChange?.(score);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [score]);
  const [comboStreak, setComboStreak] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [activeWind, setActiveWind] = useState<
    { direction: number; strength: number } | null
  >(null);
  const [dropSecondsLeft, setDropSecondsLeft] = useState<number | null>(null);

  const resetDropTimer = () => {
    const s = stateRef.current;
    s.dropDeadline = Date.now() + TURN_THINK_MS;
    s.dropTimeoutFired = false;
    lastHudDropSecondsRef.current = -1;
    setDropSecondsLeft(Math.ceil(TURN_THINK_MS / 1000));
  };

  const stateRef = useRef({
    score: 0,
    heightMeters: 0,
    comboStreak: 0,
    bestStreak: 0,
    gameStatus: gameStatus,
    isPaused: false,
    stableSuitcases: [] as DroppedSuitcase[],
    droppingSuitcase: null as DroppedSuitcase | null,
    nextSuitcaseType: getRandomSuitcase(),
    pivotX: CANVAS_WIDTH / 2,
    pivotY: -200,
    ropeLength: 360,
    swingAngle: 0,
    swingDirection: 1,
    swingSpeed: 0.045,
    swingVelocity: 0,
    cameraOffset: 0,
    targetCameraOffset: 0,
    towerBalance: 0,
    particles: [] as Particle[],
    flyingTexts: [] as FlyingText[],
    windState: {
      active: false,
      direction: 1,
      strength: 0,
      nextWindTime: 600,
      warningDuration: 0,
    } as WindState,
    birdState: {
      x: -100,
      y: 200,
      direction: 1,
      speed: 2.5,
      width: 50,
      height: 35,
      active: false,
      wingFlapValue: 0,
      chatBubble: "",
      chatDuration: 0,
    } as BirdState,
    frameCount: 0,
    dropDeadline: null as number | null,
    dropTimeoutFired: false,
    platform: {
      x: CANVAS_WIDTH / 2,
      y: PLATFORM_Y,
      width: 170,
      height: 16,
      color: "#475569",
      borderColor: "#334155",
    },
  });

  const syncReactStates = () => {
    const s = stateRef.current;
    setScore(s.score);
    setComboStreak(s.comboStreak);
    if (s.windState.active) {
      setActiveWind({
        direction: s.windState.direction,
        strength: s.windState.strength,
      });
    } else {
      setActiveWind(null);
    }
  };

  const dropSuitcase = () => {
    const s = stateRef.current;
    if (s.gameStatus !== "playing" || s.isPaused || s.droppingSuitcase) return;

    skyHighAudio.playDrop();

    const swingX = s.pivotX + Math.sin(s.swingAngle) * s.ropeLength;
    const swingY = s.pivotY + Math.cos(s.swingAngle) * s.ropeLength;

    const hHalf = s.nextSuitcaseType.height / 2 + 3;
    const dropCenterX = swingX + Math.sin(s.swingAngle) * hHalf;
    const dropCenterY = swingY + Math.cos(s.swingAngle) * hHalf;

    const totalR = s.ropeLength + hHalf;
    const initialVx =
      totalR * (s.swingVelocity || 0) * Math.cos(s.swingAngle) * 0.22;
    const initialVy =
      1.8 - totalR * (s.swingVelocity || 0) * Math.sin(s.swingAngle) * 0.1;

    s.droppingSuitcase = {
      id: `dropped_${Date.now()}`,
      x: dropCenterX,
      y: dropCenterY,
      width: s.nextSuitcaseType.width,
      height: s.nextSuitcaseType.height,
      type: s.nextSuitcaseType,
      angle: 0,
      vx: initialVx,
      vy: Math.max(1.2, initialVy),
      vAngle: 0,
      stable: false,
      offsetFromCenter: 0,
      hasCheckedStable: false,
      hitByBird: false,
    };

    const currentId = s.nextSuitcaseType.id;
    s.nextSuitcaseType = getRandomSuitcase(currentId);
    s.dropDeadline = null;
    lastHudDropSecondsRef.current = -1;
    setDropSecondsLeft(null);
  };

  const restartGame = () => {
    skyHighAudio.playClick();

    const s = stateRef.current;
    s.score = 0;
    s.heightMeters = 0;
    s.comboStreak = 0;
    s.towerBalance = 0;
    s.stableSuitcases = [];
    s.droppingSuitcase = null;
    s.cameraOffset = 0;
    s.targetCameraOffset = 0;
    s.swingAngle = 0;
    s.swingSpeed = 0.045;
    s.swingVelocity = 0;
    s.particles = [];
    s.flyingTexts = [];
    s.windState.active = false;
    s.windState.nextWindTime = 300 + Math.random() * 300;
    s.windState.warningDuration = 0;
    s.birdState.active = false;
    s.dropDeadline = null;
    s.dropTimeoutFired = false;

    s.gameStatus = "playing";
    setGameStatus("playing");
    setIsPaused(false);
    s.isPaused = false;

    skyHighAudio.playLevelUp();
    syncReactStates();
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === "Space") {
        e.preventDefault();
        if (gameStatus === "playing") {
          dropSuitcase();
        } else if (gameStatus === "menu" || gameStatus === "gameover") {
          restartGame();
        }
      } else if (e.code === "KeyP" || e.code === "Escape") {
        if (gameStatus === "playing") {
          setIsPaused((prev) => {
            const next = !prev;
            stateRef.current.isPaused = next;
            return next;
          });
          skyHighAudio.playClick();
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameStatus]);

  useEffect(() => {
    const s = stateRef.current;
    const wasPlaying = s.gameStatus === "playing";
    const becomingPlaying = gameStatus === "playing" && !wasPlaying;

    if (becomingPlaying) {
      s.score = 0;
      s.heightMeters = 0;
      s.comboStreak = 0;
      s.towerBalance = 0;
      s.stableSuitcases = [];
      s.droppingSuitcase = null;
      s.cameraOffset = 0;
      s.targetCameraOffset = 0;
      s.swingAngle = 0;
      s.swingSpeed = 0.045;
      s.swingVelocity = 0;
      s.particles = [];
      s.flyingTexts = [];
      s.windState.active = false;
      s.windState.nextWindTime = 300 + Math.random() * 300;
      s.windState.warningDuration = 0;
      s.birdState.active = false;
      s.dropDeadline = null;
      s.dropTimeoutFired = false;
      lastHudDropSecondsRef.current = -1;
      setDropSecondsLeft(null);

      setIsPaused(false);
      s.isPaused = false;

      skyHighAudio.playLevelUp();
    }

    s.gameStatus = gameStatus;
    syncReactStates();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameStatus]);

  useEffect(() => {
    const s = stateRef.current;
    if (s.gameStatus !== "playing" || s.isPaused || s.droppingSuitcase) return;
    if (!dropTimerEnabledRef.current) return;
    resetDropTimer();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timerResetKey]);

  useEffect(() => {
    const s = stateRef.current;
    if (isPaused) {
      if (s.dropDeadline != null) {
        pausedDropRemainingRef.current = Math.max(
          0,
          s.dropDeadline - Date.now()
        );
      }
      return;
    }
    if (pausedDropRemainingRef.current != null) {
      s.dropDeadline = Date.now() + pausedDropRemainingRef.current;
      pausedDropRemainingRef.current = null;
      const secs = Math.max(0, Math.ceil((s.dropDeadline - Date.now()) / 1000));
      lastHudDropSecondsRef.current = secs;
      setDropSecondsLeft(secs > 0 ? secs : null);
    }
  }, [isPaused]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animFrameId = 0;

    const collideSuitcaseWithBird = (
      drop: DroppedSuitcase,
      bird: BirdState,
      prevX: number,
      prevY: number
    ): boolean => {
      if (drop.hitByBird) return false;

      const padX = 10;
      const padY = 14;
      // Bù quãng bay ngang trong 1 frame để không “xuyên” vali khi Pierre bay nhanh.
      const travelPad = bird.speed * 1.5;
      const bLeft =
        bird.x - bird.width / 2 - padX - (bird.direction < 0 ? travelPad : 0);
      const bRight =
        bird.x + bird.width / 2 + padX + (bird.direction > 0 ? travelPad : 0);
      const bTop = bird.y - bird.height / 2 - padY;
      const bBottom = bird.y + bird.height / 2 + padY;

      const overlaps = (cx: number, cy: number) => {
        const dLeft = cx - drop.width / 2;
        const dRight = cx + drop.width / 2;
        const dTop = cy - drop.height / 2;
        const dBottom = cy + drop.height / 2;
        return (
          dRight >= bLeft &&
          dLeft <= bRight &&
          dBottom >= bTop &&
          dTop <= bBottom
        );
      };

      if (overlaps(drop.x, drop.y)) return true;

      const dx = drop.x - prevX;
      const dy = drop.y - prevY;
      const dist = Math.hypot(dx, dy);
      if (dist < 0.5) return false;

      const steps = Math.min(12, Math.ceil(dist / 6));
      for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        if (overlaps(prevX + dx * t, prevY + dy * t)) return true;
      }
      return false;
    };

    const applyBirdHit = (drop: DroppedSuitcase, bird: BirdState) => {
      if (drop.hitByBird) return;
      drop.hitByBird = true;

      skyHighAudio.playPierreSquawk();
      bird.chatBubble = "Ối giời ơi thảm hại!";
      bird.chatDuration = 120;

      drop.vx = bird.direction * 4.5 + (Math.random() - 0.5) * 1.5;
      drop.vy = Math.min(drop.vy, 2.0);
      drop.vAngle =
        bird.direction * 0.12 + (Math.random() - 0.5) * 0.18;

      stateRef.current.flyingTexts.push({
        id: `pier_hit_${Date.now()}`,
        text: "💥 VA CHẠM PIERRE!",
        x: drop.x,
        y: drop.y - 20,
        color: "#f43f5e",
        alpha: 1.0,
        scale: 1.1,
      });

      for (let i = 0; i < 15; i++) {
        stateRef.current.particles.push({
          x: bird.x,
          y: bird.y,
          color: "#60a5fa",
          size: 2 + Math.random() * 4,
          vx: (Math.random() - 0.5) * 4,
          vy: (Math.random() - 0.5) * 4 - 1,
          alpha: 0.9,
          life: 1.0,
          maxLife: 40 + Math.floor(Math.random() * 30),
        });
      }
    };

    const triggerCollapse = (fromTimeout = false) => {
      const s = stateRef.current;
      if (s.gameStatus === "gameover") return;

      s.gameStatus = "gameover";
      s.comboStreak = 0;
      s.dropDeadline = null;
      lastHudDropSecondsRef.current = -1;
      setDropSecondsLeft(null);
      skyHighAudio.playCrash();

      if (fromTimeout) {
        onDropTimeoutRef.current?.();
        s.flyingTexts.push({
          id: `timeout_${Date.now()}`,
          text: "HẾT GIỜ! ⏱️",
          x: CANVAS_WIDTH / 2,
          y: 280,
          color: "#ef4444",
          alpha: 1.0,
          scale: 1.4,
        });
      }

      const strikeX = s.droppingSuitcase ? s.droppingSuitcase.x : CANVAS_WIDTH / 2;
      const strikeY = s.droppingSuitcase
        ? s.droppingSuitcase.y
        : CANVAS_HEIGHT - s.cameraOffset - 150;

      // Tháp đổ thật sự: các vali bung khỏi chồng và lộn nhào về phía nghiêng,
      // vali ở càng cao thì văng xa và xoay mạnh hơn (đòn bẩy + thế năng).
      const leanDir = s.towerBalance >= 0 ? 1 : -1;
      const stackLen = s.stableSuitcases.length;
      s.stableSuitcases.forEach((item, idx) => {
        item.stable = false;
        const heightFactor = stackLen > 0 ? (idx + 1) / stackLen : 0;
        item.vx = leanDir * (1.2 + heightFactor * 4.2) * (0.6 + Math.random() * 0.7);
        item.vy = -Math.random() * 2.5 - heightFactor * 2.2;
        item.vAngle =
          leanDir * (0.03 + heightFactor * 0.09) * (0.5 + Math.random());
      });

      for (let i = 0; i < 45; i++) {
        s.particles.push({
          x: Math.max(20, Math.min(CANVAS_WIDTH - 20, strikeX + (Math.random() - 0.5) * 60)),
          y: Math.max(50, Math.min(CANVAS_HEIGHT, strikeY + (Math.random() - 0.5) * 40)),
          color: ["#8c6239", "#5c3d21", "#e2e8f0", "#94a3b8", "#bfdbfe"][
            Math.floor(Math.random() * 5)
          ],
          size: 5 + Math.random() * 8,
          vx: (Math.random() - 0.5) * 9,
          vy: -Math.random() * 6 - 1.5,
          alpha: 1.0,
          life: 1.0,
          maxLife: 40 + Math.floor(Math.random() * 35),
        });
      }

      s.towerBalance = Math.min(100, Math.max(-100, s.towerBalance));
      syncReactStates();

      setTimeout(() => {
        onGameOver(s.score);
        setGameStatus("gameover");
      }, 2200);
    };

    const renderLoop = () => {
      const s = stateRef.current;
      const cfg = settingsRef.current;
      s.frameCount++;

      if (s.gameStatus === "playing" && !s.isPaused) {
        // Đồng hồ 15s mỗi lượt thả — dừng khi vali đang rơi.
        if (dropTimerEnabledRef.current) {
          const canDrop = !s.droppingSuitcase;
          if (canDrop) {
            if (s.dropDeadline == null) {
              s.dropDeadline = Date.now() + TURN_THINK_MS;
            }
            const msLeft = s.dropDeadline - Date.now();
            const secsLeft = Math.max(0, Math.ceil(msLeft / 1000));
            if (secsLeft !== lastHudDropSecondsRef.current) {
              lastHudDropSecondsRef.current = secsLeft;
              setDropSecondsLeft(secsLeft);
            }
            if (msLeft <= 0 && !s.dropTimeoutFired) {
              s.dropTimeoutFired = true;
              triggerCollapse(true);
            }
          } else {
            s.dropDeadline = null;
            if (lastHudDropSecondsRef.current !== -1) {
              lastHudDropSecondsRef.current = -1;
              setDropSecondsLeft(null);
            }
          }
        }

        // Đặt pivot trong toạ độ thế giới sao cho đầu dây con lắc luôn ở
        // SWING_TIP_SCREEN_Y trên màn hình -> vali rơi đúng từ cần cẩu xuống
        // đỉnh tháp, không "nhảy cóc" như khi pivot bị neo cứng ở -200.
        s.pivotY = SWING_TIP_SCREEN_Y - s.ropeLength - s.cameraOffset;

        const baseGravityOverLength = 0.0001;
        const acceleration = -baseGravityOverLength * Math.sin(s.swingAngle);

        s.swingVelocity = s.swingVelocity || 0;
        s.swingVelocity += acceleration;
        s.swingVelocity *= 0.9994;

        if (Math.abs(s.swingAngle) < 0.22) {
          s.swingVelocity += Math.sign(s.swingVelocity || 1) * 0.000008;
        }

        s.swingAngle += s.swingVelocity;

        const maxSwing = cfg.maxSwingAngle;
        if (Math.abs(s.swingAngle) > maxSwing) {
          s.swingAngle = Math.sign(s.swingAngle) * maxSwing;
          s.swingVelocity = -s.swingVelocity * 0.15;
        }

        if (s.windState.active) {
          const targetPivotX =
            CANVAS_WIDTH / 2 + s.windState.direction * s.windState.strength * 18;
          s.pivotX += (targetPivotX - s.pivotX) * 0.05;
        } else {
          s.pivotX += (CANVAS_WIDTH / 2 - s.pivotX) * 0.05;
        }

        if (!s.windState.active) {
          s.windState.nextWindTime--;
          if (s.windState.nextWindTime < 180) {
            s.windState.warningDuration = s.windState.nextWindTime;
          }
          if (s.windState.nextWindTime <= 0) {
            s.windState.active = true;
            s.windState.direction = Math.random() < 0.5 ? -1 : 1;
            s.windState.strength = 1.0 + Math.random() * 1.5;
            s.windState.nextWindTime =
              cfg.windDurationMinFrames + Math.random() * 240;
            skyHighAudio.playWindWhoosh();
            s.flyingTexts.push({
              id: `wind_txt_${Date.now()}`,
              text: `⚠️ GIÓ TO: ĐẨY LỆCH ${
                s.windState.direction > 0 ? "SANG PHẢI ➡️" : "SANG TRÁI ⬅️"
              }`,
              x: CANVAS_WIDTH / 2,
              y: 220,
              color: "#f59e0b",
              alpha: 1.0,
              scale: 1.1,
            });
          }
        } else {
          s.windState.nextWindTime--;
          // Gió đẩy nghiêng dần, nhưng nhờ lực hồi phục bên dưới nó chỉ giữ
          // tháp ở một độ lệch cân bằng (recoverable) chứ không tự dồn tới sập.
          s.towerBalance += s.windState.direction * s.windState.strength * 0.045;

          if (s.windState.nextWindTime <= 0) {
            s.windState.active = false;
            s.windState.nextWindTime =
              cfg.windCooldownMinFrames + Math.random() * 400;
            s.windState.warningDuration = 0;
          }
        }

        const birdSpawnChance = cfg.birdSpawnRatePer10k / 10000;
        if (
          s.score >= 4 &&
          !s.birdState.active &&
          Math.random() < birdSpawnChance
        ) {
          const direction = Math.random() < 0.5 ? 1 : -1;

          // Pierre bay trong toạ độ THẾ GIỚI (cùng hệ với vali rơi), ở một độ
          // cao nằm trong quãng rơi của vali để chắc chắn có thể bị thả trúng.
          const birdTarget =
            s.stableSuitcases.length > 0
              ? s.stableSuitcases[s.stableSuitcases.length - 1]
              : null;
          const stackTopWorldY = birdTarget
            ? birdTarget.y - birdTarget.height / 2
            : s.platform.y - s.platform.height / 2;
          const dropStartWorldY = 200;
          const span = stackTopWorldY - dropStartWorldY;
          const birdWorldY =
            span > 150
              ? dropStartWorldY + span * (0.3 + Math.random() * 0.4)
              : stackTopWorldY - 90;

          s.birdState = {
            x: direction > 0 ? -100 : CANVAS_WIDTH + 100,
            y: birdWorldY,
            direction,
            speed: 2.2 + Math.random() * 1.8,
            width: 55,
            height: 38,
            active: true,
            wingFlapValue: 0,
            chatBubble:
              PIERRE_QUOTES[Math.floor(Math.random() * PIERRE_QUOTES.length)],
            chatDuration: 180,
          };
          skyHighAudio.playPierreSquawk();
        }

        if (s.birdState.active) {
          s.birdState.x += s.birdState.direction * s.birdState.speed;
          s.birdState.wingFlapValue += 0.22;
          if (s.birdState.chatDuration > 0) s.birdState.chatDuration--;

          if (
            (s.birdState.direction > 0 && s.birdState.x > CANVAS_WIDTH + 120) ||
            (s.birdState.direction < 0 && s.birdState.x < -120)
          ) {
            s.birdState.active = false;
          }
        }

        if (s.droppingSuitcase) {
          const drop = s.droppingSuitcase;
          const prevDropX = drop.x;
          const prevDropY = drop.y;

          drop.vy += cfg.dropGravity;
          drop.y += drop.vy;

          let windXEffect = 0;
          if (s.windState.active) {
            windXEffect = s.windState.direction * s.windState.strength * 0.52;
          }
          drop.x += drop.vx + windXEffect;
          // Vali đang rơi nghiêng nhẹ theo hướng chuyển động ngang (quán tính
          // từ con lắc + gió) thay vì luôn thẳng đứng -> rơi tự nhiên hơn.
          const tiltTarget = Math.max(
            -0.32,
            Math.min(0.32, (drop.vx + windXEffect) * 0.05)
          );
          drop.angle += (tiltTarget - drop.angle) * 0.18;

          if (s.birdState.active) {
            if (
              collideSuitcaseWithBird(
                drop,
                s.birdState,
                prevDropX,
                prevDropY
              )
            ) {
              applyBirdHit(drop, s.birdState);
            }
          }

          if (drop.x < -drop.width || drop.x > CANVAS_WIDTH + drop.width) {
            drop.stable = false;
            drop.hasCheckedStable = true;
          }

          const hasStacked = s.stableSuitcases.length > 0;
          const target = hasStacked
            ? s.stableSuitcases[s.stableSuitcases.length - 1]
            : null;

          const targetTopY = target
            ? target.y - target.height / 2
            : s.platform.y - s.platform.height / 2;

          const dropBottomY = drop.y + drop.height / 2;

          if (!drop.hasCheckedStable && dropBottomY >= targetTopY) {
            drop.hasCheckedStable = true;

            const targetX = target ? target.x : s.platform.x;
            const targetWidth = target ? target.width : s.platform.width;

            const tLeft = targetX - targetWidth / 2;
            const tRight = targetX + targetWidth / 2;
            const dLeft = drop.x - drop.width / 2;
            const dRight = drop.x + drop.width / 2;

            // Cần đủ diện tích tựa lên bệ đỡ thì vali mới đứng được; chồng lấn
            // quá ít (mép chìa ra ngoài) thì trọng tâm hụt -> lật khỏi tháp.
            const overlapWidth =
              Math.min(dRight, tRight) - Math.max(dLeft, tLeft);
            // Tháp càng cao càng khó: mỗi 10 vali xếp thêm thì yêu cầu
            // diện tích đỡ tăng 0.04 (tối đa 0.9 để vẫn còn cơ hội đặt được).
            const supportRatio = Math.min(
              0.9,
              0.55 + Math.floor(s.stableSuitcases.length / 3) * 0.02
            );
            const minSupport = Math.min(drop.width, targetWidth) * supportRatio;
            const isOverlap = overlapWidth >= minSupport;

            if (isOverlap) {
              drop.stable = true;
              drop.y = targetTopY - drop.height / 2;
              drop.vy = 0;
              drop.vx = 0;
              drop.vAngle = 0;
              drop.angle = 0;

              const offset = drop.x - targetX;
              drop.offsetFromCenter = offset;

              const perfectThreshold = cfg.perfectThreshold;
              const isPerfect = Math.abs(offset) <= perfectThreshold;

              if (isPerfect) {
                const nextCombo = s.comboStreak + 1;
                s.comboStreak = nextCombo;
                if (nextCombo > s.bestStreak) s.bestStreak = nextCombo;

                s.flyingTexts.push({
                  id: `perfect_${Date.now()}`,
                  text: "HOÀN HẢO! ✨",
                  x: drop.x,
                  y: drop.y - 20,
                  color: "#fbbf24",
                  alpha: 1.0,
                  scale: 1.3,
                });

                for (let i = 0; i < 18; i++) {
                  const angle = Math.random() * Math.PI * 2;
                  const speed = 1.5 + Math.random() * 3.5;
                  s.particles.push({
                    x: drop.x,
                    y: drop.y + Math.random() * 10 - 5,
                    color: `hsl(${45 + Math.random() * 15}, 100%, ${
                      55 + Math.random() * 15
                    }%)`,
                    size: 4 + Math.random() * 5,
                    vx: Math.cos(angle) * speed,
                    vy: Math.sin(angle) * speed - 1.5,
                    alpha: 1.0,
                    life: 1.0,
                    maxLife: 30 + Math.floor(Math.random() * 25),
                  });
                }

                s.towerBalance *= 0.5;
                skyHighAudio.playLand(true, nextCombo);
                s.score += 1 + Math.min(3, Math.floor(nextCombo / 3));
              } else {
                s.comboStreak = 0;
                s.flyingTexts.push({
                  id: `landing_${Date.now()}`,
                  text: "+1",
                  x: drop.x,
                  y: drop.y - 15,
                  color: "#34d399",
                  alpha: 1.0,
                  scale: 1.0,
                });

                for (let i = 0; i < 8; i++) {
                  s.particles.push({
                    x: drop.x + (Math.random() - 0.5) * drop.width,
                    y: drop.y + drop.height / 2,
                    color: "#e2e8f0",
                    size: 3 + Math.random() * 4,
                    vx: (Math.random() - 0.5) * 1.5,
                    vy: -Math.random() * 1.2,
                    alpha: 0.8,
                    life: 1.0,
                    maxLife: 20 + Math.floor(Math.random() * 15),
                  });
                }

                // Mô-men lật = độ lệch x trọng lượng x đòn bẩy (vali càng
                // chồng cao thì đặt lệch càng tạo lực xoay lớn quanh đế tháp).
                const weightNormalized = drop.type.weight;
                const alignmentRatio = offset / (targetWidth / 2);
                const leverage = 1 + Math.min(1.5, s.stableSuitcases.length * 0.05);
                const rawDelta = alignmentRatio * weightNormalized * 7 * leverage;
                const balanceDelta = Math.max(-18, Math.min(18, rawDelta));
                s.towerBalance = Math.max(
                  -100,
                  Math.min(100, s.towerBalance + balanceDelta)
                );
                skyHighAudio.playLand(false);
                s.score += 1;
              }

              s.stableSuitcases.push(drop);
              s.droppingSuitcase = null;

              s.heightMeters = s.stableSuitcases.length * 1.5;

              const totalStackedHeight = s.stableSuitcases.reduce(
                (sum, item) => sum + item.height,
                0
              );
              s.targetCameraOffset = Math.max(0, totalStackedHeight - 205);

              if (s.score > 0 && s.score % 10 === 0) {
                skyHighAudio.playLevelUp();
                s.flyingTexts.push({
                  id: `lvlUp_${Date.now()}`,
                  text: "⚡ LÊN TẦNG KHÍ QUYỂN MỚI ⚡",
                  x: CANVAS_WIDTH / 2,
                  y: 300,
                  color: "#60a5fa",
                  alpha: 1.0,
                  scale: 1.2,
                });
              }
            } else {
              drop.stable = false;
              // Trượt và lật về phía mép chìa ra ngoài cho tự nhiên.
              const overhangDir = drop.x >= targetX ? 1 : -1;
              drop.vx = overhangDir * (1.8 + Math.random() * 1.2);
              drop.vAngle = overhangDir * (0.06 + Math.random() * 0.05);
              s.flyingTexts.push({
                id: `miss_${Date.now()}`,
                text: "HỤT RỒI! 😱",
                x: drop.x,
                y: drop.y - 10,
                color: "#ef4444",
                alpha: 1.0,
                scale: 1.2,
              });
            }
          }
        }

        if (
          s.droppingSuitcase &&
          !s.droppingSuitcase.stable &&
          s.droppingSuitcase.hasCheckedStable
        ) {
          const drop = s.droppingSuitcase;
          const prevTumbleX = drop.x;
          const prevTumbleY = drop.y;
          drop.vy += 0.15;
          drop.y += drop.vy;
          drop.x += drop.vx;

          if (s.birdState.active) {
            if (
              collideSuitcaseWithBird(
                drop,
                s.birdState,
                prevTumbleX,
                prevTumbleY
              )
            ) {
              applyBirdHit(drop, s.birdState);
            }
          }
          // Vali hụt thì lộn nhào (tumble) theo quán tính khi rơi xuống.
          if (!drop.vAngle) drop.vAngle = (drop.vx || 0.5) * 0.012;
          drop.angle += drop.vAngle;

          if (drop.y > CANVAS_HEIGHT + 150) {
            triggerCollapse();
          }
        }

        if (s.stableSuitcases.length > 0) {
          const stackCount = s.stableSuitcases.length;
          const absBalance = Math.abs(s.towerBalance);

          // Điểm lật: khi trọng tâm vượt khỏi mép đế thì trọng lực thắng và
          // tháp đổ không cứu được. Tháp càng cao càng mảnh nên lật sớm hơn.
          const criticalLean = Math.max(40, 70 - stackCount * 1.3);

          if (absBalance > criticalLean) {
            const topple =
              (absBalance - criticalLean) * 0.022 * (1 + stackCount * 0.05);
            s.towerBalance += Math.sign(s.towerBalance) * topple;
          } else if (s.towerBalance !== 0) {
            // Trong vùng đế đỡ kết cấu tự ổn định dần, nhưng hồi phục chậm nên
            // độ lệch vẫn tích tụ -> phải chủ động đặt vali bù chứ không tự khỏi.
            const settle = 0.995 + Math.min(0.003, stackCount * 0.0002);
            s.towerBalance *= settle;
            if (Math.abs(s.towerBalance) < 0.05) s.towerBalance = 0;
          }

          if (Math.abs(s.towerBalance) >= 100) {
            triggerCollapse();
          }
        }

        // Trong lúc vali đang rơi, đóng băng camera để tốc độ vali trên màn
        // hình không cộng dồn với tốc độ camera kéo lên -> cảm giác rơi đều
        // như lúc tháp còn thấp. Camera chỉ bám tháp giữa các lần thả.
        if (!s.droppingSuitcase) {
          s.cameraOffset += (s.targetCameraOffset - s.cameraOffset) * 0.075;
        }
      }

      s.particles = s.particles.filter((p) => {
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.08;
        p.life--;
        p.alpha = Math.max(0, p.life / p.maxLife);
        return p.life > 0;
      });

      s.flyingTexts = s.flyingTexts.filter((t) => {
        t.y -= 1.0;
        t.alpha -= 0.02;
        return t.alpha > 0;
      });

      // Chỉ chạy khi tháp đang đổ (gameover): các vali xếp bung ra và vali
      // đang treo cũng tự rơi xuống theo trọng lực collapse. Trong "playing"
      // đã có drop.vy += cfg.dropGravity ở trên rồi -> tránh cộng trùng làm
      // vali rơi nhanh ~5 lần thiết kế.
      if (s.gameStatus === "gameover") {
        s.stableSuitcases.forEach((item) => {
          if (!item.stable) {
            item.vy += 0.18;
            item.y += item.vy;
            item.x += item.vx;
            item.angle += item.vAngle;
          }
        });
        if (s.droppingSuitcase && !s.droppingSuitcase.stable) {
          const d = s.droppingSuitcase;
          d.vy += 0.18;
          d.y += d.vy;
          d.x += d.vx;
          d.angle += d.vAngle;
        }
      }

      if (s.frameCount % 8 === 0) syncReactStates();

      ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
      drawAtmosphereSky(ctx, s);

      ctx.save();
      ctx.translate(0, s.cameraOffset);
      drawPlatform(ctx, s);

      s.stableSuitcases.forEach((item, index) => {
        ctx.save();
        if (item.stable) {
          const heightRatio = index / Math.max(1, s.stableSuitcases.length);
          // Tháp nghiêng tĩnh theo trọng tâm: tầng càng cao lệch càng nhiều,
          // cho người chơi tín hiệu rõ ràng để đặt vali bù về phía ngược lại.
          const leanX = s.towerBalance * 0.32 * heightRatio;
          const leanAngle = (s.towerBalance / 100) * 0.12 * heightRatio;
          // Lắc lư nhẹ chồng lên độ nghiêng cho sống động.
          const time = s.frameCount * 0.035;
          const swayX =
            Math.sin(time + index * 0.28) *
            (1 + Math.abs(s.towerBalance) * 0.05) *
            heightRatio;
          ctx.translate(item.x + leanX + swayX, item.y);
          ctx.rotate(leanAngle);
        } else {
          ctx.translate(item.x, item.y);
          ctx.rotate(item.angle);
        }
        drawLuggageModel(ctx, 0, 0, item.width, item.height, item.type);
        ctx.restore();
      });

      if (
        s.droppingSuitcase &&
        s.droppingSuitcase.stable === false &&
        !s.droppingSuitcase.hasCheckedStable
      ) {
        drawLandingShadow(ctx, s);
      }

      if (s.droppingSuitcase) {
        const d = s.droppingSuitcase;
        ctx.save();
        ctx.translate(d.x, d.y);
        ctx.rotate(d.angle);
        drawLuggageModel(ctx, 0, 0, d.width, d.height, d.type);
        ctx.restore();
      }

      s.particles.forEach((p) => {
        ctx.save();
        ctx.globalAlpha = p.alpha;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      });

      s.flyingTexts.forEach((t) => {
        ctx.save();
        ctx.globalAlpha = t.alpha;
        ctx.fillStyle = t.color;
        ctx.strokeStyle = "#020617";
        ctx.lineWidth = 3;
        ctx.font = `bold ${Math.round(15 * t.scale)}px "Inter", sans-serif`;
        ctx.textAlign = "center";
        ctx.strokeText(t.text, t.x, t.y);
        ctx.fillText(t.text, t.x, t.y);
        ctx.restore();
      });

      // Pierre vẽ bên trong camera transform để cùng hệ toạ độ với vali.
      if (s.birdState.active) {
        drawBirdPierre(ctx, s.birdState);
      }

      // Cần cẩu cũng vẽ trong camera transform để pivotY (thế giới) khớp với
      // vị trí thực tế của vali rơi -> đầu dây và vali luôn nối liền mạch.
      if (s.gameStatus === "playing") {
        drawPendulumCrane(ctx, s);
      }

      ctx.restore();

      if (s.windState.active && s.gameStatus === "playing") {
        drawWindStreaks(ctx, s);
      }

      animFrameId = requestAnimationFrame(renderLoop);
    };

    animFrameId = requestAnimationFrame(renderLoop);
    return () => cancelAnimationFrame(animFrameId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameStatus, isPaused]);

  const drawWindStreaks = (
    ctx: CanvasRenderingContext2D,
    s: typeof stateRef.current
  ) => {
    const dir = s.windState.direction;
    const strength = s.windState.strength;
    // Số vệt và tốc độ tỉ lệ thuận với cường độ gió -> nhìn là biết gió mạnh/yếu.
    const streakCount = Math.round(10 + strength * 6);
    const baseSpeed = 3 + strength * 3.5;
    const tint = dir > 0 ? "226, 232, 240" : "191, 219, 254";

    ctx.save();
    ctx.lineCap = "round";

    for (let i = 0; i < streakCount; i++) {
      // Mỗi vệt có pha riêng, chạy ngang theo hướng gió và lặp lại liên tục.
      const seedY = (i * 53 + 30) % CANVAS_HEIGHT;
      const speed = baseSpeed * (0.6 + ((i * 17) % 10) / 14);
      const span = CANVAS_WIDTH + 160;
      const progress = (s.frameCount * speed + i * 130) % span;
      const x = dir > 0 ? progress - 80 : CANVAS_WIDTH + 80 - progress;
      const len = 26 + strength * 14 + ((i * 7) % 18);
      const wobble = Math.sin(s.frameCount * 0.05 + i) * 6;
      const y = seedY + wobble;
      const alpha = 0.12 + (strength / 2.5) * 0.22;

      ctx.strokeStyle = `rgba(${tint}, ${alpha})`;
      ctx.lineWidth = 1 + (i % 3) * 0.8;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + dir * len, y);
      ctx.stroke();
    }

    // Quầng sáng mờ ở mép màn hình phía gió đang đẩy tới -> chỉ rõ chiều gió.
    const edgeGrad =
      dir > 0
        ? ctx.createLinearGradient(CANVAS_WIDTH - 90, 0, CANVAS_WIDTH, 0)
        : ctx.createLinearGradient(90, 0, 0, 0);
    edgeGrad.addColorStop(0, "rgba(245, 158, 11, 0)");
    edgeGrad.addColorStop(1, `rgba(245, 158, 11, ${0.05 + strength * 0.04})`);
    ctx.fillStyle = edgeGrad;
    if (dir > 0) {
      ctx.fillRect(CANVAS_WIDTH - 90, 0, 90, CANVAS_HEIGHT);
    } else {
      ctx.fillRect(0, 0, 90, CANVAS_HEIGHT);
    }

    ctx.restore();
  };

  const drawLandingShadow = (
    ctx: CanvasRenderingContext2D,
    s: typeof stateRef.current
  ) => {
    const d = s.droppingSuitcase;
    if (!d) return;
    const hasStacked = s.stableSuitcases.length > 0;
    const target = hasStacked
      ? s.stableSuitcases[s.stableSuitcases.length - 1]
      : null;
    const targetTopY = target
      ? target.y - target.height / 2
      : s.platform.y - s.platform.height / 2;

    if (d.y < targetTopY - 20) {
      ctx.save();
      ctx.globalAlpha = 0.25;
      ctx.fillStyle = "#0f172a";
      ctx.beginPath();
      ctx.ellipse(d.x, targetTopY, d.width * 0.45, 6, 0, 0, Math.PI * 2);
      ctx.fill();

      ctx.globalAlpha = 0.08;
      ctx.strokeStyle = "#d97706";
      ctx.setLineDash([5, 5]);
      ctx.beginPath();
      ctx.moveTo(d.x, d.y + d.height / 2);
      ctx.lineTo(d.x, targetTopY);
      ctx.stroke();
      ctx.restore();
    }
  };

  const drawAtmosphereSky = (
    ctx: CanvasRenderingContext2D,
    s: typeof stateRef.current
  ) => {
    const tier = getTierForHeight(s.score);

    const grad = ctx.createLinearGradient(0, 0, 0, CANVAS_HEIGHT);
    grad.addColorStop(0, tier.themeColorStart);
    grad.addColorStop(1, tier.themeColorEnd);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    const pOffset = s.cameraOffset * 0.35;

    if (s.score < 15) {
      ctx.save();
      ctx.translate(0, s.cameraOffset);

      ctx.fillStyle = "rgba(148, 163, 184, 0.35)";
      const buildingsBg = [
        { x: 10, w: 60, h: 250 },
        { x: 90, w: 80, h: 320 },
        { x: 190, w: 70, h: 220 },
        { x: 280, w: 90, h: 290 },
        { x: 390, w: 75, h: 240 },
      ];
      buildingsBg.forEach((b) => {
        ctx.fillRect(b.x, GROUND_LINE_Y - b.h, b.w, b.h);
      });

      ctx.fillStyle = "rgba(100, 116, 139, 0.45)";
      const buildingsFg = [
        { x: -10, w: 50, h: 180 },
        { x: 50, w: 70, h: 240 },
        { x: 140, w: 60, h: 150 },
        { x: 230, w: 75, h: 190 },
        { x: 330, w: 85, h: 210 },
        { x: 430, w: 60, h: 160 },
      ];
      buildingsFg.forEach((b) => {
        ctx.fillRect(b.x, GROUND_LINE_Y - b.h, b.w, b.h);

        ctx.fillStyle = "rgba(254, 240, 138, 0.45)";
        const winCols = Math.floor(b.w / 16);
        const winRows = Math.floor(b.h / 24);
        for (let c = 0; c < winCols; c++) {
          for (let r = 0; r < winRows; r++) {
            if ((c + r * 3) % 2 === 0) {
              const wx = b.x + 6 + c * 14;
              const wy = GROUND_LINE_Y - b.h + 10 + r * 20;
              ctx.fillRect(wx, wy, 6, 8);
            }
          }
        }
        ctx.fillStyle = "rgba(100, 116, 139, 0.45)";
      });

      ctx.fillStyle = "#475569";
      ctx.fillRect(0, GROUND_LINE_Y, CANVAS_WIDTH, 500);

      ctx.fillStyle = "#cbd5e1";
      ctx.fillRect(0, CURB_Y, CANVAS_WIDTH, 6);

      ctx.fillStyle = "#64748b";
      for (let cx = 0; cx < CANVAS_WIDTH; cx += 40) {
        ctx.fillRect(cx, CURB_Y, 20, 6);
      }

      ctx.fillStyle = "rgba(255, 255, 255, 0.75)";
      const zebraStripes = [120, 160, 200, 240, 280, 320, 360];
      zebraStripes.forEach((zx) => {
        ctx.fillRect(zx - 15, ZEBRA_Y, 30, 14);
      });

      ctx.fillStyle = "#fef08a";
      for (let rx = 10; rx < CANVAS_WIDTH; rx += 60) {
        ctx.fillRect(rx, ROAD_MARK_Y, 35, 4);
      }

      const lamps = [35, CANVAS_WIDTH - 35];
      lamps.forEach((lx) => {
        ctx.strokeStyle = "#334155";
        ctx.lineWidth = 4;
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(lx, CURB_Y);
        ctx.lineTo(lx, LAMP_TOP_Y);
        const offset = lx < 100 ? 15 : -15;
        ctx.lineTo(lx + offset, LAMP_TOP_Y);
        ctx.stroke();

        ctx.fillStyle = "#475569";
        ctx.beginPath();
        ctx.arc(lx + offset, LAMP_TOP_Y, 6, 0, Math.PI * 2);
        ctx.fill();

        const glowRad = ctx.createRadialGradient(
          lx + offset,
          LAMP_TOP_Y + 2,
          1,
          lx + offset,
          LAMP_TOP_Y + 2,
          45
        );
        glowRad.addColorStop(0, "rgba(254, 240, 138, 0.45)");
        glowRad.addColorStop(1, "rgba(254, 240, 138, 0)");
        ctx.fillStyle = glowRad;
        ctx.beginPath();
        ctx.arc(lx + offset, LAMP_TOP_Y + 2, 45, 0, Math.PI * 2);
        ctx.fill();
      });

      ctx.restore();
    }

    if (s.score >= 5 && s.score < 30) {
      ctx.save();
      ctx.fillStyle = "#ffffff";
      ctx.globalAlpha = 0.35;

      const cloudY1 = 150 + (pOffset % CANVAS_HEIGHT);
      const cloudX1 = 100 + Math.sin(s.frameCount * 0.002) * 50;
      ctx.beginPath();
      ctx.arc(cloudX1, cloudY1, 30, 0, Math.PI * 2);
      ctx.arc(cloudX1 + 25, cloudY1 - 10, 35, 0, Math.PI * 2);
      ctx.arc(cloudX1 + 55, cloudY1, 25, 0, Math.PI * 2);
      ctx.fill();

      const cloudY2 = 380 + (pOffset % (CANVAS_HEIGHT - 100));
      const cloudX2 = 320 + Math.cos(s.frameCount * 0.0015) * 35;
      ctx.beginPath();
      ctx.arc(cloudX2, cloudY2, 20, 0, Math.PI * 2);
      ctx.arc(cloudX2 + 18, cloudY2 - 8, 26, 0, Math.PI * 2);
      ctx.arc(cloudX2 + 40, cloudY2, 18, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    if (s.score >= 25) {
      ctx.save();
      ctx.fillStyle = "#ffffff";

      const time = s.frameCount * 0.02;
      for (let i = 0; i < 20; i++) {
        const sx = (i * 77 + 23) % CANVAS_WIDTH;
        const sy = (i * 123 + pOffset) % CANVAS_HEIGHT;
        ctx.globalAlpha = 0.2 + Math.abs(Math.sin(time + i)) * 0.7;
        ctx.fillRect(sx, sy, 2, 2);
      }

      if (s.score >= 50) {
        ctx.globalAlpha = 0.85;
        ctx.fillStyle = "#fef08a";
        ctx.beginPath();
        ctx.arc(380, 160 + pOffset * 0.25, 32, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = tier.themeColorStart;
        ctx.beginPath();
        ctx.arc(368, 160 + pOffset * 0.25, 32, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
  };

  const drawPlatform = (
    ctx: CanvasRenderingContext2D,
    s: typeof stateRef.current
  ) => {
    const p = s.platform;
    ctx.save();

    ctx.fillStyle = "#334155";
    ctx.fillRect(p.x - p.width / 2 - 4, p.y - p.height / 2, p.width + 8, p.height);

    ctx.fillStyle = "#cbd5e1";
    ctx.fillRect(p.x - p.width / 2, p.y - p.height / 2 + 3, p.width, p.height - 7);

    ctx.fillStyle = "#94a3b8";
    ctx.fillRect(p.x - p.width / 2, p.y - p.height / 2 + 3, p.width, 3);

    ctx.fillStyle = "#1f2937";
    ctx.fillRect(p.x - 55, p.y + p.height / 2, 12, 10);
    ctx.fillRect(p.x + 43, p.y + p.height / 2, 12, 10);

    ctx.restore();
  };

  const drawPendulumCrane = (
    ctx: CanvasRenderingContext2D,
    s: typeof stateRef.current
  ) => {
    const swingX = s.pivotX + Math.sin(s.swingAngle) * s.ropeLength;
    const swingY = s.pivotY + Math.cos(s.swingAngle) * s.ropeLength;

    ctx.save();
    ctx.strokeStyle = "#64748b";
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    const startX = s.pivotX + Math.sin(s.swingAngle) * -120;
    const startY = s.pivotY + Math.cos(s.swingAngle) * -120;
    ctx.moveTo(startX, startY);
    ctx.lineTo(swingX, swingY);
    ctx.stroke();

    if (!s.droppingSuitcase) {
      ctx.save();
      ctx.translate(swingX, swingY);
      drawLuggageModel(
        ctx,
        0,
        s.nextSuitcaseType.height / 2 + 16,
        s.nextSuitcaseType.width,
        s.nextSuitcaseType.height,
        s.nextSuitcaseType,
        true
      );
      ctx.restore();
    }

    ctx.restore();
  };

  const drawLuggageModel = (
    ctx: CanvasRenderingContext2D,
    cx: number,
    cy: number,
    w: number,
    h: number,
    type: SuitcaseType,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _isHanging = false
  ) => {
    ctx.save();

    ctx.strokeStyle = type.handleColor;
    ctx.lineWidth = 5;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.arc(cx, cy - h / 2 - 2, 14, Math.PI, 0);
    ctx.stroke();

    ctx.fillStyle = "#94a3b8";
    ctx.beginPath();
    ctx.rect(cx - 16, cy - h / 2 - 5, 4, 6);
    ctx.rect(cx + 12, cy - h / 2 - 5, 4, 6);
    ctx.fill();

    ctx.fillStyle = type.color;
    ctx.strokeStyle = type.borderColor;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.roundRect(cx - w / 2, cy - h / 2, w, h, [12]);
    ctx.fill();
    ctx.stroke();

    if (type.pattern === "striped") {
      ctx.strokeStyle = type.borderColor;
      ctx.globalAlpha = 0.25;
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(cx - w * 0.25, cy - h / 2 + 2);
      ctx.lineTo(cx - w * 0.25, cy + h / 2 - 2);
      ctx.moveTo(cx, cy - h / 2 + 2);
      ctx.lineTo(cx, cy + h / 2 - 2);
      ctx.moveTo(cx + w * 0.25, cy - h / 2 + 2);
      ctx.lineTo(cx + w * 0.25, cy + h / 2 - 2);
      ctx.stroke();
      ctx.globalAlpha = 1.0;
    } else if (type.pattern === "stickers" && type.stickerColors) {
      ctx.save();
      const stColors = type.stickerColors;

      ctx.fillStyle = stColors[0] || "#fcd34d";
      ctx.translate(cx - w * 0.22, cy - h * 0.1);
      ctx.rotate(-0.2);
      ctx.fillRect(-10, -8, 20, 16);
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 1;
      ctx.strokeRect(-10, -8, 20, 16);

      ctx.restore();
      ctx.save();
      ctx.fillStyle = stColors[1] || "#f43f5e";
      ctx.translate(cx + w * 0.24, cy + h * 0.12);
      ctx.rotate(0.35);
      ctx.beginPath();
      ctx.arc(0, 0, 9, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 1;
      ctx.stroke();

      ctx.restore();
    } else if (type.pattern === "modern") {
      ctx.strokeStyle = "#ffffff";
      ctx.globalAlpha = 0.11;
      ctx.lineWidth = 3;
      ctx.beginPath();
      for (let offset = -w; offset < w; offset += 20) {
        ctx.moveTo(cx + offset - h / 2, cy - h / 2);
        ctx.lineTo(cx + offset + h / 2, cy + h / 2);
      }
      ctx.stroke();
      ctx.globalAlpha = 1.0;
    }

    if (type.hasStrap) {
      ctx.fillStyle = "#653b11";
      ctx.strokeStyle = "#3d1c02";
      ctx.lineWidth = 1;

      ctx.fillRect(cx - w * 0.3 - 4, cy - h / 2, 8, h);
      ctx.strokeRect(cx - w * 0.3 - 4, cy - h / 2, 8, h);
      ctx.fillRect(cx + w * 0.3 - 4, cy - h / 2, 8, h);
      ctx.strokeRect(cx + w * 0.3 - 4, cy - h / 2, 8, h);

      ctx.fillStyle = "#eab308";
      ctx.beginPath();
      ctx.arc(cx - w * 0.3, cy - h * 0.22, 3.5, 0, Math.PI * 2);
      ctx.arc(cx - w * 0.3, cy + h * 0.22, 3.5, 0, Math.PI * 2);
      ctx.arc(cx + w * 0.3, cy - h * 0.22, 3.5, 0, Math.PI * 2);
      ctx.arc(cx + w * 0.3, cy + h * 0.22, 3.5, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.strokeStyle = "#cbd5e1";
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(cx - w / 2 + 5, cy - h / 2 + 5, 6, Math.PI, Math.PI * 1.5);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(cx + w / 2 - 5, cy - h / 2 + 5, 6, Math.PI * 1.5, 0);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(cx - w / 2 + 5, cy + h / 2 - 5, 6, Math.PI * 0.5, Math.PI);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(cx + w / 2 - 5, cy + h / 2 - 5, 6, 0, Math.PI * 0.5);
    ctx.stroke();

    ctx.restore();
  };

  const drawBirdPierre = (
    ctx: CanvasRenderingContext2D,
    bird: BirdState
  ) => {
    ctx.save();
    ctx.translate(bird.x, bird.y);

    if (bird.direction < 0) ctx.scale(-1, 1);

    const flapAngle = Math.sin(bird.wingFlapValue) * 0.7;

    if (bird.chatDuration > 0 && bird.chatBubble) {
      ctx.save();
      if (bird.direction < 0) ctx.scale(-1, 1);

      ctx.fillStyle = "#ffffff";
      ctx.strokeStyle = "#475569";
      ctx.lineWidth = 1.5;

      const textWidth = ctx.measureText(bird.chatBubble).width;
      const bubbleW = textWidth + 18;
      const bubbleH = 26;
      const bx = -bubbleW / 2;
      const by = -bird.height - 25;

      ctx.beginPath();
      ctx.roundRect(bx, by, bubbleW, bubbleH, [8]);
      ctx.fill();
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(-5, by + bubbleH);
      ctx.lineTo(0, by + bubbleH + 6);
      ctx.lineTo(5, by + bubbleH);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = "#0f172a";
      ctx.font = "bold 11px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(bird.chatBubble, 0, by + bubbleH / 2);
      ctx.restore();
    }

    ctx.save();
    ctx.translate(-5, -6);
    ctx.rotate(-flapAngle - 0.2);
    ctx.fillStyle = "#adcbeb";
    ctx.beginPath();
    ctx.ellipse(0, -10, 10, 22, 0.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    ctx.fillStyle = "#60a5fa";
    ctx.strokeStyle = "#2563eb";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(0, 0, 16, 22, Math.PI / 3.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.ellipse(4, 5, 9, 13, Math.PI / 3, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#eab308";
    ctx.beginPath();
    ctx.moveTo(15, -4);
    ctx.lineTo(32, -1);
    ctx.lineTo(13, 5);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.arc(8, -8, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#000000";
    ctx.beginPath();
    ctx.arc(10, -8, 2.5, 0, Math.PI * 2);
    ctx.fill();

    ctx.save();
    ctx.translate(2, -2);
    ctx.rotate(flapAngle);
    ctx.fillStyle = "#3b82f6";
    ctx.beginPath();
    ctx.ellipse(0, -10, 8, 25, -0.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.restore();

    ctx.restore();
  };

  return (
    <div className="flex flex-col items-center font-sans w-full">
      <div className="relative w-full">
        <canvas
          ref={canvasRef}
          width={CANVAS_WIDTH}
          height={CANVAS_HEIGHT}
          onClick={dropSuitcase}
          className="w-full h-auto aspect-[480/820] max-h-[88vh] rounded-2xl shadow-sm border border-slate-200 bg-gradient-to-b from-sky-100 to-sky-200 block cursor-crosshair relative z-0 overflow-hidden"
          id="sky-high-game-canvas"
        />

        {gameStatus === "playing" && (
          <div
            className="absolute top-0 left-0 w-full p-3 z-10 pointer-events-none flex flex-col gap-2 select-none"
            id="game-hud-overlay"
          >
            <div className="flex justify-between items-center gap-2">
              <div className="bg-white/90 backdrop-blur px-2.5 py-1.5 rounded-lg border border-slate-200 pointer-events-auto flex items-center gap-1.5 shadow-sm">
                <FaSuitcase className="w-3.5 h-3.5 text-amber-500" />
                <span className="font-black text-sm text-slate-900 tabular-nums">
                  {score}
                </span>
              </div>

              <UserBreadBadge variant="light" />
            </div>

            <div className="flex justify-center">
              {dropSecondsLeft != null && dropSecondsLeft > 0 && (
                <div
                  className={`flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-black tabular-nums shadow-sm ${
                    dropSecondsLeft <= 3
                      ? "animate-pulse bg-rose-500 text-white"
                      : "bg-slate-900/80 text-amber-200"
                  }`}
                >
                  <span>⏱</span>
                  <span>{dropSecondsLeft}s</span>
                </div>
              )}
              {comboStreak > 1 && (
                <div className="flex items-center gap-1 py-0.5 px-2 bg-amber-400 text-slate-900 rounded shadow-sm animate-bounce text-[11px] font-black">
                  <FiZap className="w-3 h-3" />
                  <span>+{comboStreak}</span>
                </div>
              )}
            </div>

            {activeWind && (
              <div
                className={`absolute top-14 ${
                  activeWind.direction > 0 ? "right-2" : "left-2"
                } pointer-events-auto select-none`}
                id="wind-hud-alert"
              >
                <div className="flex items-center gap-1.5 bg-amber-400/95 backdrop-blur text-slate-900 pl-2 pr-2.5 py-1.5 rounded-xl shadow-md border-2 border-amber-500 animate-pulse">
                  {activeWind.direction < 0 && (
                    <FiChevronsLeft className="w-6 h-6 shrink-0 -mr-1" />
                  )}
                  <FaWind className="w-4 h-4 shrink-0" />
                  <div className="flex flex-col leading-tight">
                    <span className="text-[9px] font-extrabold uppercase tracking-wider">
                      Gió {activeWind.direction > 0 ? "→ Phải" : "Trái ←"}
                    </span>
                    <span className="text-[12px] font-black tabular-nums">
                      {activeWind.strength.toFixed(1)} m/s
                    </span>
                  </div>
                  {activeWind.direction > 0 && (
                    <FiChevronsRight className="w-6 h-6 shrink-0 -ml-1" />
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {gameStatus === "playing" && isPaused && (
          <div
            className="absolute inset-x-4 top-1/4 bg-white text-slate-900 p-5 rounded-2xl shadow-xl border border-slate-200 max-w-[360px] mx-auto z-20 text-center"
            id="pause-overlay-menu"
          >
            <h3 className="text-lg font-black text-slate-900 mb-1 uppercase">
              Tạm dừng
            </h3>
            <p className="text-xs text-slate-500 mb-5">
              <strong className="text-slate-900">{score}</strong> vali
            </p>
            <div className="space-y-2">
              <button
                type="button"
                onClick={() => {
                  setIsPaused(false);
                  stateRef.current.isPaused = false;
                  skyHighAudio.playClick();
                }}
                className="w-full py-2.5 bg-amber-400 hover:bg-amber-500 text-slate-900 font-black uppercase text-sm rounded-lg transition-colors shadow-sm"
              >
                Tiếp tục
              </button>
              <button
                type="button"
                onClick={restartGame}
                className="w-full py-2.5 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 font-semibold rounded-lg transition-colors text-sm flex items-center justify-center gap-1.5"
              >
                <FiRotateCcw className="w-4 h-4" />
                Chơi lại
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
