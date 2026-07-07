import { useEffect, useMemo } from "react";
import { imagePreloader } from "./imagePreloader";

/**
 * Hook to preload images for the next N words in the deck
 */
export function useImagePreloader(
  deck: Array<{ word: string }>,
  currentIndex: number,
  preloadCount: number = 10
) {
  // Memoize words to preload to avoid recalculating on every render
  const wordsToPreload = useMemo(() => {
    if (deck.length === 0) return [];

    const words: string[] = [];
    for (let i = 1; i <= preloadCount; i++) {
      const nextIndex = currentIndex + i;
      if (nextIndex < deck.length) {
        words.push(deck[nextIndex].word);
      }
    }

    // Also preload words that wrap around if near the end
    if (currentIndex + preloadCount >= deck.length) {
      const remaining = preloadCount - words.length;
      for (let i = 0; i < remaining; i++) {
        words.push(deck[i].word);
      }
    }

    return words;
  }, [deck, currentIndex, preloadCount]);

  useEffect(() => {
    if (wordsToPreload.length > 0) {
      imagePreloader.preloadWords(wordsToPreload).catch((error) => {
        console.error("Failed to preload images:", error);
      });
    }
  }, [wordsToPreload]);
}

