export interface SubtitleCue {
  index: number;
  startMs: number;
  endMs: number;
  text: string;
}

/** Lấy phần timestamp (bỏ cue settings VTT/SRT như `align:start`). */
function parseTimestampPart(raw: string): string {
  return raw.trim().split(/\s+/)[0] ?? "";
}

function parseTimestamp(raw: string): number {
  const ts = parseTimestampPart(raw);
  if (!ts) return 0;

  const hms = ts.match(/^(\d+):(\d{2}):(\d{2})[,.](\d{1,3})$/);
  if (hms) {
    const msPart = hms[4].padEnd(3, "0").slice(0, 3);
    return (
      Number(hms[1]) * 3_600_000 +
      Number(hms[2]) * 60_000 +
      Number(hms[3]) * 1_000 +
      Number(msPart)
    );
  }

  // MM:SS,mmm (không có giờ)
  const ms = ts.match(/^(\d{1,2}):(\d{2})[,.](\d{1,3})$/);
  if (ms) {
    const msPart = ms[3].padEnd(3, "0").slice(0, 3);
    return Number(ms[1]) * 60_000 + Number(ms[2]) * 1_000 + Number(msPart);
  }

  return 0;
}

const TIMESTAMP_PATTERN = String.raw`\d{1,2}:\d{2}:\d{2}[,.]\d{1,3}`;

/** Dạng gộp 1 dòng: `1 00:00:14,770 --> 00:00:19,110 Text... 2 00:00:20...` */
const INLINE_CUE_HEADER = new RegExp(
  String.raw`\b(\d+)\s+(${TIMESTAMP_PATTERN})\s*-->\s*(${TIMESTAMP_PATTERN})\s*`,
  "g"
);

function isIndexLine(line: string): boolean {
  return /^\d+$/.test(line.trim());
}

function parseTimestampLine(
  line: string
): { startMs: number; endMs: number } | null {
  const trimmed = line.trim();
  const timeMatch = trimmed.match(/^(.+?)\s*-->\s*(.+)$/);
  if (!timeMatch) return null;

  const startMs = parseTimestamp(timeMatch[1]);
  const endMs = parseTimestamp(timeMatch[2]);
  if (endMs <= startMs) return null;

  return { startMs, endMs };
}

/** Lấy text của cue sau dòng timestamp, dừng trước header cue kế (index hoặc timestamp). */
function extractCueText(lines: string[], timestampLineIdx: number): string {
  const textLines: string[] = [];

  for (let j = timestampLineIdx + 1; j < lines.length; j += 1) {
    const line = lines[j];
    if (parseTimestampLine(line)) break;
    if (isIndexLine(line) && j + 1 < lines.length && parseTimestampLine(lines[j + 1])) {
      break;
    }
    textLines.push(line);
  }

  return textLines.join("\n").trim();
}

/**
 * Parse SRT/VTT theo dòng timestamp (anchor), không phụ thuộc dòng trống.
 * Tránh gộp cue khi cue trước thiếu text và không có blank line (data cũ).
 */
function parseBlockSubtitles(content: string): SubtitleCue[] {
  const lines = content.split(/\r?\n/);
  const timestampLineIndices: number[] = [];

  for (let i = 0; i < lines.length; i += 1) {
    if (parseTimestampLine(lines[i])) timestampLineIndices.push(i);
  }

  if (timestampLineIndices.length === 0) return [];

  const cues: SubtitleCue[] = [];
  let autoIndex = 1;

  for (const tsLineIdx of timestampLineIndices) {
    const timing = parseTimestampLine(lines[tsLineIdx]);
    if (!timing) continue;

    const index =
      tsLineIdx > 0 && isIndexLine(lines[tsLineIdx - 1])
        ? Number(lines[tsLineIdx - 1].trim())
        : autoIndex;

    const text = extractCueText(lines, tsLineIdx);
    autoIndex = Math.max(autoIndex, index) + 1;

    if (!text) continue;

    cues.push({
      index,
      startMs: timing.startMs,
      endMs: timing.endMs,
      text,
    });
  }

  return cues;
}

function parseInlineSubtitles(content: string): SubtitleCue[] {
  const matches = [...content.matchAll(INLINE_CUE_HEADER)];
  if (matches.length === 0) return [];

  const cues: SubtitleCue[] = [];
  for (let i = 0; i < matches.length; i += 1) {
    const match = matches[i];
    const textStart = match.index! + match[0].length;
    const textEnd =
      i + 1 < matches.length ? matches[i + 1].index! : content.length;
    const text = content.slice(textStart, textEnd).trim();
    if (!text) continue;

    const startMs = parseTimestamp(match[2]);
    const endMs = parseTimestamp(match[3]);
    if (endMs <= startMs) continue;

    cues.push({
      index: Number(match[1]),
      startMs,
      endMs,
      text,
    });
  }

  return cues;
}

/** Parse SRT/VTT hoặc dạng gộp (index + timestamp + text trên cùng dòng). */
export function parseSubtitles(content: string): SubtitleCue[] {
  let trimmed = content.trim();
  if (!trimmed) return [];

  if (trimmed.startsWith("WEBVTT")) {
    trimmed = trimmed.replace(/^WEBVTT[^\n]*\n+/, "").trim();
  }

  const blockCues = parseBlockSubtitles(trimmed);
  if (blockCues.length > 0) return blockCues.sort((a, b) => a.startMs - b.startMs);

  const inlineCues = parseInlineSubtitles(trimmed);
  return inlineCues.sort((a, b) => a.startMs - b.startMs);
}

export function msToSrtTime(ms: number): string {
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  const s = Math.floor((ms % 60_000) / 1_000);
  const millis = ms % 1_000;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")},${String(millis).padStart(3, "0")}`;
}

/** Ghép cue thành SRT chuẩn (index, time, text, cách nhau 1 dòng trống). */
export function cuesToSrt(cues: SubtitleCue[]): string {
  return cues
    .map((cue, i) => {
      const index = cue.index > 0 ? cue.index : i + 1;
      const start = msToSrtTime(cue.startMs);
      const end = msToSrtTime(cue.endMs);
      return `${index}\n${start} --> ${end}\n${cue.text}`;
    })
    .join("\n\n");
}

/** Chuẩn hoá sub raw (vd. studyphim gộp 1 dòng) thành SRT sạch. */
export function normalizeRawSubtitle(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  const cues = parseSubtitles(trimmed);
  if (cues.length > 0) return cuesToSrt(cues);
  return trimmed.replace(/\n{3,}/g, "\n\n").trim();
}

export function getActiveCue(
  cues: SubtitleCue[],
  currentTimeSec: number
): SubtitleCue | null {
  const t = currentTimeSec * 1_000;
  for (const cue of cues) {
    if (cue.endMs <= cue.startMs) continue;
    if (t >= cue.startMs && t < cue.endMs) return cue;
  }
  return null;
}

export interface BilingualSubtitleRow {
  index: number;
  startMs: number;
  endMs: number;
  eng: string;
  vi: string;
  pron: string;
}

function findCueByTimeOverlap(
  cues: SubtitleCue[],
  startMs: number,
  endMs: number
): SubtitleCue | null {
  for (const cue of cues) {
    if (cue.endMs <= cue.startMs) continue;
    const overlaps =
      startMs < cue.endMs && endMs > cue.startMs;
    if (overlaps) return cue;
  }
  return null;
}

function findCueByIndex(cues: SubtitleCue[], index: number): SubtitleCue | null {
  for (const cue of cues) {
    if (cue.index === index) return cue;
  }
  return null;
}

function pairCueText(
  anchor: SubtitleCue,
  otherCues: SubtitleCue[],
  byIndex: boolean,
  index: number
): string {
  const bySrtIndex = findCueByIndex(otherCues, anchor.index);
  if (bySrtIndex) return bySrtIndex.text;

  if (byIndex && index < otherCues.length) {
    return otherCues[index].text;
  }

  const overlap = findCueByTimeOverlap(otherCues, anchor.startMs, anchor.endMs);
  if (overlap) return overlap.text;

  return "";
}

/** Ghép sub ENG/VN/pronounce thành từng dòng song ngữ (anchor theo ENG, fallback VN). */
export function buildBilingualRows(
  engRaw?: string,
  vnRaw?: string,
  pronRaw?: string
): BilingualSubtitleRow[] {
  const engCues = parseSubtitles(engRaw ?? "");
  const vnCues = parseSubtitles(vnRaw ?? "");
  const pronCues = parseSubtitles(pronRaw ?? "");

  const anchorCues = engCues.length > 0 ? engCues : vnCues;
  if (anchorCues.length === 0) return [];

  const pairByIndex =
    engCues.length > 0 &&
    vnCues.length === engCues.length &&
    (pronCues.length === 0 || pronCues.length === engCues.length);

  return anchorCues.map((anchor, i) => {
    const eng =
      engCues.length > 0
        ? engCues[i]?.text ?? anchor.text
        : "";
    const vi =
      vnCues.length > 0
        ? pairCueText(anchor, vnCues, pairByIndex, i)
        : engCues.length === 0
          ? anchor.text
          : "";
    const pron =
      pronCues.length > 0
        ? pairCueText(anchor, pronCues, pairByIndex, i)
        : "";

    return {
      index: anchor.index > 0 ? anchor.index : i + 1,
      startMs: anchor.startMs,
      endMs: anchor.endMs,
      eng: eng.trim(),
      vi: vi.trim(),
      pron: pron.trim(),
    };
  });
}

/**
 * Active bilingual row at playback time (uses ENG timing when available).
 *
 * Khi đang ở khoảng lặng giữa hai câu (chưa tới câu mới), giữ nguyên câu gần
 * nhất đã bắt đầu thay vì trả về null — để UI luôn highlight câu vừa nói,
 * tránh hiện tượng không active câu nào.
 */
export function getActiveBilingualRow(
  rows: BilingualSubtitleRow[],
  currentTimeSec: number
): BilingualSubtitleRow | null {
  const t = currentTimeSec * 1_000;
  let lastStarted: BilingualSubtitleRow | null = null;
  for (const row of rows) {
    if (row.endMs <= row.startMs) continue;
    if (t >= row.startMs && t < row.endMs) return row;
    if (t >= row.startMs) lastStarted = row;
  }
  // Trước câu đầu tiên thì không có gì để active.
  return lastStarted;
}
