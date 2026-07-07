import { db } from "@/lib/firebase/client";
import { useQuery } from "@tanstack/react-query";
import { doc, getDoc } from "firebase/firestore";
import { SKY_HIGH_SETTINGS, SkyHighSettings } from "../types";

const COLLECTION = "gameSettings";
const GAME_ID = "sky-high";

const SETTINGS_FIELDS: Array<keyof SkyHighSettings> = [
  "maxSwingAngle",
  "dropGravity",
  "perfectThreshold",
  "windCooldownMinFrames",
  "windDurationMinFrames",
  "birdSpawnRatePer10k",
];

const sanitize = (raw: Record<string, unknown>): SkyHighSettings => {
  const next: SkyHighSettings = { ...SKY_HIGH_SETTINGS };
  for (const key of SETTINGS_FIELDS) {
    const value = raw[key];
    if (typeof value === "number" && Number.isFinite(value)) {
      next[key] = value;
    }
  }
  return next;
};

export const skyHighSettingsQueryKey = ["gameSettings", GAME_ID] as const;

const fetchSkyHighSettings = async (): Promise<SkyHighSettings> => {
  try {
    const snap = await getDoc(doc(db, COLLECTION, GAME_ID));
    if (!snap.exists()) return SKY_HIGH_SETTINGS;
    return sanitize(snap.data() as Record<string, unknown>);
  } catch {
    // Firestore offline / rules lỗi: fallback defaults để game vẫn chạy.
    return SKY_HIGH_SETTINGS;
  }
};

export const useSkyHighSettings = () => {
  return useQuery<SkyHighSettings>({
    queryKey: skyHighSettingsQueryKey,
    queryFn: fetchSkyHighSettings,
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    placeholderData: SKY_HIGH_SETTINGS,
  });
};
