export type LearnTabId = "vocabulary" | "speaking";

export function parseLearnTabParam(tab?: string | null): LearnTabId {
  return tab === "speaking" ? "speaking" : "vocabulary";
}

export function resolveLearnTab(
  pathname: string,
  tabParam: string | null
): LearnTabId {
  if (pathname.startsWith("/speaking-upload")) return "speaking";
  if (pathname.startsWith("/flashcard")) return "vocabulary";
  if (tabParam === "speaking" || tabParam === "vocabulary") return tabParam;
  return "vocabulary";
}

export function isLearnRoute(pathname: string): boolean {
  return (
    pathname.startsWith("/learn") || pathname.startsWith("/stories")
  );
}

export function readClientLearnTabParam(): string | null {
  if (typeof window === "undefined") return null;
  return new URLSearchParams(window.location.search).get("tab");
}

export function buildLearnTabUrl(tabId: LearnTabId): string {
  const params = new URLSearchParams();
  params.set("tab", tabId);
  return `/learn?${params.toString()}`;
}
