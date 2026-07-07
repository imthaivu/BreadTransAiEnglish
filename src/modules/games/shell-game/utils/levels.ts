import {
  SHELL_GAME_SETTINGS,
  ShellGameLevelConfig,
  ShellGameSettings,
} from "../types";

interface DifficultyBracket {
  maxLevel: number;
  name: string;
  colorClass: string;
}

const DIFFICULTY_LADDER: DifficultyBracket[] = [
  {
    maxLevel: 2,
    name: "Dễ",
    colorClass: "bg-emerald-500/10 text-emerald-400 border-emerald-500/30",
  },
  {
    maxLevel: 4,
    name: "Bình Thường",
    colorClass: "bg-blue-500/10 text-blue-400 border-blue-500/30",
  },
  {
    maxLevel: 5,
    name: "Trung Bình",
    colorClass: "bg-yellow-500/10 text-yellow-400 border-yellow-500/30",
  },
  {
    maxLevel: 7,
    name: "Khó",
    colorClass: "bg-orange-500/10 text-orange-400 border-orange-500/30",
  },
  {
    maxLevel: 8,
    name: "Cực Khó",
    colorClass: "bg-red-500/10 text-red-500 border-red-500/30",
  },
  {
    maxLevel: 9,
    name: "Siêu Tốc",
    colorClass: "bg-purple-500/10 text-purple-400 border-purple-500/30",
  },
  {
    maxLevel: 10,
    name: "Thần Thánh",
    colorClass: "bg-pink-500/10 text-pink-400 border-pink-500/30",
  },
  {
    maxLevel: Number.POSITIVE_INFINITY,
    name: "Vô Hạn Tốc Độ",
    colorClass:
      "bg-rose-500/10 text-rose-500 border-rose-500/30 animate-pulse",
  },
];

const getDifficulty = (level: number): DifficultyBracket => {
  for (const bracket of DIFFICULTY_LADDER) {
    if (level <= bracket.maxLevel) return bracket;
  }
  return DIFFICULTY_LADDER[DIFFICULTY_LADDER.length - 1];
};

/**
 * Tính toán cấu hình của một level dựa trên `ShellGameSettings`.
 * Công thức tuyến tính: shuffles tăng dần, speedMs giảm dần, đều bị chặn min/max.
 */
export const getLevelConfig = (
  level: number,
  settings: ShellGameSettings = SHELL_GAME_SETTINGS
): ShellGameLevelConfig => {
  const safeLevel = Math.max(1, Math.floor(level));
  const stepsAboveOne = safeLevel - 1;

  const shufflesCount = Math.max(
    1,
    Math.min(
      settings.maxShuffles,
      settings.baseShufflesCount + stepsAboveOne * settings.shufflesPerLevel
    )
  );
  const speedMs = Math.max(
    settings.minSpeedMs,
    settings.baseSpeedMs - stepsAboveOne * settings.speedDecreasePerLevel
  );

  const difficulty = getDifficulty(safeLevel);

  return {
    level: safeLevel,
    shufflesCount,
    speedMs,
    difficultyName: difficulty.name,
    colorClass: difficulty.colorClass,
  };
};
