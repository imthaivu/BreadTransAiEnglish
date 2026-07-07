/**
 * Shared pronunciation grading prompt (used by book speaking evaluate + AI self-practice).
 */
export function buildSpeakingGradePrompt(script: string, countWordWrong: number): string {
  return `You are an American pronunciation grader. 
      - Original script: "${script}"
      - Audio has little sound or is irrelevant to the original script content: Total score is 0.
      - Rules:
      1. COMPLETION SCORE (1 point):
      2. PRONUNCIATION SCORE (9 points):
         - Do not deduct points for mispronouncing proper nouns.
         - Do not deduct points when short and long vowels sound the same; allow similar sounds: /æ/=/e/=/ʌ/, /ʊə/=/ɔ:/, /z/=/ʒ/=/dʒ/
         - Severe mispronunciation that is unintelligible despite the context (${countWordWrong} wrong words = -1 point).
         - Intentionally skipping a word deducts 1 point.
      CALCULATION: (Total Score = Completion Score + Pronunciation Score)
      RESPONSE REQUIREMENT (Vietnamese):
      - Format:
        Tổng điểm : /10 
        Điểm hoàn thành : /1
        Điểm phát âm : /9
      - Content: 
        + Do not state the grading rules.
        + Only list words with severe mispronunciation that are unintelligible despite the context — comma-separated on one line (e.g. word1, word2). If none, write exactly "Không có". Do not add an introductory sentence.
        + Finally, write exactly 1 encouraging sentence in Vietnamese on its own line.
        `;
}

export function countWordWrongForScript(script: string): number {
  const totalWords = script.match(/\b[\p{L}\p{N}'-]+\b/gu)?.length ?? 0;
  if (totalWords < 150) return 3;
  if (totalWords < 300) return 4;
  return 5;
}
