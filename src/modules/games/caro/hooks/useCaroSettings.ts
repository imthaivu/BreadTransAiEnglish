import { db } from "@/lib/firebase/client";
import { useQuery } from "@tanstack/react-query";
import { doc, getDoc } from "firebase/firestore";
import { CARO_SETTINGS, CaroSettings } from "../types";

const COLLECTION = "gameSettings";
const GAME_ID = "caro";

const SETTINGS_FIELDS: Array<keyof CaroSettings> = [
  "boardSize",
  "winLength",
  "aiThinkMinMs",
  "aiThinkMaxMs",
  "easyTopKMoves",
  "easyRandomChancePct",
  "mediumTopKMoves",
  "mediumRandomChancePct",
  "historyMaxRecords",
];

const sanitize = (raw: Record<string, unknown>): CaroSettings => {
  const next: CaroSettings = { ...CARO_SETTINGS };
  for (const key of SETTINGS_FIELDS) {
    const value = raw[key];
    if (typeof value === "number" && Number.isFinite(value)) {
      next[key] = value;
    }
  }
  // Bảo đảm tính hợp lệ tối thiểu để game không vỡ khi admin gõ giá trị lạ.
  if (next.aiThinkMaxMs < next.aiThinkMinMs) {
    next.aiThinkMaxMs = next.aiThinkMinMs;
  }
  if (next.winLength > next.boardSize) {
    next.winLength = next.boardSize;
  }
  return next;
};

export const caroSettingsQueryKey = ["gameSettings", GAME_ID] as const;

const fetchCaroSettings = async (): Promise<CaroSettings> => {
  try {
    const snap = await getDoc(doc(db, COLLECTION, GAME_ID));
    if (!snap.exists()) return CARO_SETTINGS;
    return sanitize(snap.data() as Record<string, unknown>);
  } catch {
    return CARO_SETTINGS;
  }
};

export const useCaroSettings = () => {
  return useQuery<CaroSettings>({
    queryKey: caroSettingsQueryKey,
    queryFn: fetchCaroSettings,
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    placeholderData: CARO_SETTINGS,
  });
};
