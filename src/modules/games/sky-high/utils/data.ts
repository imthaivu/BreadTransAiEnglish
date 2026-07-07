import { SuitcaseType } from "../types";

export const SUITCASE_VARIETIES: SuitcaseType[] = [
  {
    id: "vintage_leather",
    name: "Vali Da Cổ Điển",
    width: 140,
    height: 70,
    color: "#8B4513",
    borderColor: "#5C2E0B",
    handleColor: "#3d1f07",
    hasStrap: true,
    pattern: "striped",
    weight: 1.2,
  },
  {
    id: "retro_teal",
    name: "Vali Retro Xanh Ngọc",
    width: 120,
    height: 64,
    color: "#008080",
    borderColor: "#004d4d",
    handleColor: "#b3d9d9",
    hasStrap: false,
    pattern: "stickers",
    stickerColors: ["#FFD700", "#FF2E93", "#1e90ff"],
    weight: 1.0,
  },
  {
    id: "trunk_heavy",
    name: "Thùng Gỗ Đại",
    width: 154,
    height: 80,
    color: "#CD853F",
    borderColor: "#8B4513",
    handleColor: "#4A2711",
    hasStrap: true,
    pattern: "plain",
    weight: 1.8,
  },
  {
    id: "neon_duffel",
    name: "Túi Thể Thao Neon",
    width: 110,
    height: 54,
    color: "#FF2E93",
    borderColor: "#c2005d",
    handleColor: "#ffdff0",
    hasStrap: false,
    pattern: "modern",
    weight: 0.8,
  },
  {
    id: "handbag_chic",
    name: "Túi Xách Sang Chảnh",
    width: 85,
    height: 50,
    color: "#9370DB",
    borderColor: "#4B0082",
    handleColor: "#E6E6FA",
    hasStrap: false,
    pattern: "plain",
    weight: 0.6,
  },
  {
    id: "yellow_summer",
    name: "Vali Hè Rực Rỡ",
    width: 130,
    height: 68,
    color: "#FFD700",
    borderColor: "#b89200",
    handleColor: "#fff9d6",
    hasStrap: true,
    pattern: "stickers",
    stickerColors: ["#FF2E93", "#70ff3b", "#00e5ff"],
    weight: 1.1,
  },
  {
    id: "modern_carbon",
    name: "Vali Carbon Hiện Đại",
    width: 125,
    height: 72,
    color: "#2F4F4F",
    borderColor: "#122020",
    handleColor: "#A9A9A9",
    hasStrap: false,
    pattern: "modern",
    weight: 1.3,
  },
];

export const PIERRE_QUOTES = [
  "Pierre: Cạp cạp!",
  "Pierre: Gió to nha ông bạn!",
  "Pierre: Coi chừng tôi đâm đó!",
  "Pierre: Vali này có mồi ngon không?",
  "Pierre: Bay cao quá đi~",
  "Pierre: Nhìn đường thả kìa!",
  "Pierre: Tránh ra nào!",
  "Pierre: Ối giời ơi suýt trúng!",
];

export interface BackgroundTier {
  minHeight: number;
  maxHeight: number;
  name: string;
  themeColorStart: string;
  themeColorEnd: string;
  elements: string[];
  description: string;
}

export const BACKGROUND_TIERS: BackgroundTier[] = [
  {
    minHeight: 0,
    maxHeight: 5,
    name: "Đường Phố Đô Thị",
    themeColorStart: "#38bdf8",
    themeColorEnd: "#bae6fd",
    elements: ["SoftCloud", "UrbanRoad", "SkyCitySilhouettes"],
    description: "Chuyến phiêu lưu bắt đầu ngay giữa lòng thành phố nhộn nhịp!",
  },
  {
    minHeight: 5,
    maxHeight: 15,
    name: "Bầu trời Trực Thăng",
    themeColorStart: "#bfdbfe",
    themeColorEnd: "#93c5fd",
    elements: ["SoftCloud", "AirBalloon", "WindIndicator"],
    description: "Bầu trời mát rượi, những cơn gió nhẹ bắt đầu xuất hiện.",
  },
  {
    minHeight: 15,
    maxHeight: 30,
    name: "Tầng Mây Trắng",
    themeColorStart: "#60a5fa",
    themeColorEnd: "#3b82f6",
    elements: ["CumulusCloud", "FlappingBird", "WindIndicator"],
    description: "Phía trên các đám mây dày đặc. Gió bắt đầu thổi mạnh đấy!",
  },
  {
    minHeight: 30,
    maxHeight: 50,
    name: "Đường bay Jetliner",
    themeColorStart: "#1d4ed8",
    themeColorEnd: "#1e3a8a",
    elements: ["JetPlane", "AltCloud", "WindIndicator"],
    description:
      "Độ cao bay thương mại. Chim Pierre thỉnh thoảng vẫn bay qua cực nhanh!",
  },
  {
    minHeight: 50,
    maxHeight: 80,
    name: "Cận Vũ Trụ (Aurora)",
    themeColorStart: "#111827",
    themeColorEnd: "#030712",
    elements: ["AuroraGlow", "TwinklingStar", "ShootingStar"],
    description: "Cận vũ trụ, không khí thưa thớt, sương mù óng ánh ảo diệu.",
  },
  {
    minHeight: 80,
    maxHeight: 1000000,
    name: "Không Gian Trạm Vũ Trụ",
    themeColorStart: "#020617",
    themeColorEnd: "#000000",
    elements: ["Satellite", "GoldenStar", "Moon", "Galaxy"],
    description: "Vượt ra ngoài tầng khí quyển! Bạn là nhà siêu vũ trụ vô địch!",
  },
];

export function getRandomSuitcase(excludeId?: string): SuitcaseType {
  const candidates = excludeId
    ? SUITCASE_VARIETIES.filter((v) => v.id !== excludeId)
    : SUITCASE_VARIETIES;
  const idx = Math.floor(Math.random() * candidates.length);
  return candidates[idx];
}

export function getTierForHeight(height: number): BackgroundTier {
  return (
    BACKGROUND_TIERS.find((t) => height >= t.minHeight && height < t.maxHeight) ||
    BACKGROUND_TIERS[BACKGROUND_TIERS.length - 1]
  );
}

export const SKY_HIGH_SCORES_KEY = "breadtrans.sky_high.personal_scores";
