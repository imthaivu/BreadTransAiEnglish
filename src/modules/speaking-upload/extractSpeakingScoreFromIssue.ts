/**
 * Parse "Tổng điểm … /10" từ nhận xét AI — đồng bộ với OverallProgressTable / speaking-upload hooks.
 */
export function extractSpeakingScoreFromIssue(issue: string | null | undefined): number | null {
  if (!issue) return null;
  const match = issue.match(/Tổng điểm[^\d]*(\d+(?:[.,]\d+)?)\s*\/?\s*10/i);
  if (!match?.[1]) return null;
  const parsed = Number(match[1].replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
}
