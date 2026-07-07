export interface ParsedIssueSpeaking {
  totalScoreLine: string | null;
  completionScoreLine: string | null;
  pronunciationScoreLine: string | null;
  mispronouncedWords: string[];
  encouragement: string | null;
}

const VIETNAMESE_CHAR_RE =
  /[ăâđêôơưưỷỹỵáàảãạắằẳẵặéèẻẽẹếềểễệíìỉĩịóòỏõọốồổỗộớờởỡợúùủũụứừửữựýỳỷỹỵ]/i;

const ENGLISH_WORD_RE = /^[a-zA-Z][a-zA-Z'-]*$/;

function isScoreLine(line: string): boolean {
  return /^(Tổng điểm|Điểm hoàn thành|Điểm phát âm)\s*:/i.test(line);
}

function isNoWordsLine(line: string): boolean {
  return /^không\s+có\.?$/i.test(line.trim());
}

function isLikelyWordList(line: string): boolean {
  const parts = line
    .split(/[,;]/)
    .map((p) => p.trim())
    .filter(Boolean);
  return parts.length >= 1 && parts.every((p) => ENGLISH_WORD_RE.test(p));
}

function extractEnglishWords(line: string): string[] {
  if (isNoWordsLine(line)) return [];

  if (isLikelyWordList(line)) {
    return line
      .split(/[,;]/)
      .map((p) => p.trim())
      .filter((p) => ENGLISH_WORD_RE.test(p));
  }

  const words: string[] = [];
  const tokens = line.split(/[,;•·]|\s+-\s+/).map((t) => t.trim()).filter(Boolean);
  for (const token of tokens) {
    const cleaned = token.replace(/^[-•·]\s*/, "").trim();
    if (ENGLISH_WORD_RE.test(cleaned)) {
      words.push(cleaned);
    }
  }
  return words;
}

/**
 * Parse AI speaking feedback — scores, mispronounced English words, encouragement.
 */
export function parseIssueSpeaking(issue: string | null | undefined): ParsedIssueSpeaking {
  const empty: ParsedIssueSpeaking = {
    totalScoreLine: null,
    completionScoreLine: null,
    pronunciationScoreLine: null,
    mispronouncedWords: [],
    encouragement: null,
  };

  if (!issue?.trim()) return empty;

  const lines = issue
    .split(/\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  let totalScoreLine: string | null = null;
  let completionScoreLine: string | null = null;
  let pronunciationScoreLine: string | null = null;
  const contentLines: string[] = [];

  for (const line of lines) {
    if (/^Tổng điểm/i.test(line)) {
      totalScoreLine = line;
      continue;
    }
    if (/^Điểm hoàn thành/i.test(line)) {
      completionScoreLine = line;
      continue;
    }
    if (/^Điểm phát âm/i.test(line)) {
      pronunciationScoreLine = line;
      continue;
    }
    if (isScoreLine(line)) continue;
    contentLines.push(line);
  }

  let encouragement: string | null = null;
  let wordLines = contentLines;

  if (contentLines.length > 0) {
    const last = contentLines[contentLines.length - 1];
    const lastIsVietnamese = VIETNAMESE_CHAR_RE.test(last);
    const lastIsWordList = isLikelyWordList(last);

    if (lastIsVietnamese && !lastIsWordList) {
      encouragement = last;
      wordLines = contentLines.slice(0, -1);
    }
  }

  const mispronouncedWords = [
    ...new Set(wordLines.flatMap((line) => extractEnglishWords(line))),
  ];

  return {
    totalScoreLine,
    completionScoreLine,
    pronunciationScoreLine,
    mispronouncedWords,
    encouragement,
  };
}
