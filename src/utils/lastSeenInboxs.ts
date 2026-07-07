/** localStorage key — map userId -> số ms lần cuối mở Inbox */
export const LAST_SEEN_INBOXS_KEY = "lastSeenInboxs";

const CUSTOM_EVENT = "breadtrans-lastSeenInboxs";

type LastSeenMap = Record<string, number>;

function readMap(): LastSeenMap {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(LAST_SEEN_INBOXS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return {};
    const out: LastSeenMap = {};
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      const n = typeof v === "number" ? v : Number(v);
      if (Number.isFinite(n) && n > 0) out[k] = n;
    }
    return out;
  } catch {
    return {};
  }
}

/** Mốc so sánh: tin có time > ms này được tính là chưa đọc. Chưa có key → 0 (coi mọi tin hiện có là chưa đọc). */
export function getLastSeenInboxMs(userId: string): number {
  if (!userId) return 0;
  return readMap()[userId] ?? 0;
}

export function markInboxSeenNow(userId: string): void {
  if (!userId || typeof window === "undefined") return;
  try {
    const m = readMap();
    m[userId] = Date.now();
    localStorage.setItem(LAST_SEEN_INBOXS_KEY, JSON.stringify(m));
    window.dispatchEvent(new CustomEvent(CUSTOM_EVENT));
  } catch {
    // ignore quota / private mode
  }
}
