type TranslatorAvailability = "available" | "downloadable" | "unavailable";

type TranslatorInstance = {
  translate: (text: string) => Promise<string>;
};

type TranslatorConstructor = {
  availability: (options: {
    sourceLanguage: string;
    targetLanguage: string;
  }) => Promise<TranslatorAvailability>;
  create: (options: {
    sourceLanguage: string;
    targetLanguage: string;
  }) => Promise<TranslatorInstance>;
};

declare global {
  // Chrome / Edge built-in Translator API (desktop)
  // eslint-disable-next-line no-var
  var Translator: TranslatorConstructor | undefined;
}

const SOURCE_LANG = "en";
const TARGET_LANG = "vi";

const translationCache = new Map<string, string>();
let translatorPromise: Promise<TranslatorInstance | null> | null = null;

export function isBrowserTranslatorSupported(): boolean {
  return typeof window !== "undefined" && "Translator" in globalThis;
}

export async function ensureBrowserTranslator(): Promise<TranslatorInstance | null> {
  if (!isBrowserTranslatorSupported() || !globalThis.Translator) {
    return null;
  }

  if (!translatorPromise) {
    translatorPromise = (async () => {
      try {
        const options = {
          sourceLanguage: SOURCE_LANG,
          targetLanguage: TARGET_LANG,
        };
        const availability = await globalThis.Translator!.availability(options);
        if (availability === "unavailable") {
          return null;
        }
        return await globalThis.Translator!.create(options);
      } catch (error) {
        console.warn("[browser-translator] init failed:", error);
        return null;
      }
    })();
  }

  return translatorPromise;
}

export async function translateEnToVi(
  text: string,
  vocabMeanByWord?: Map<string, string>
): Promise<string | null> {
  const normalized = text.trim().toLowerCase();
  if (!normalized) return null;

  const vocabHit = vocabMeanByWord?.get(normalized);
  if (vocabHit) return vocabHit;

  if (translationCache.has(normalized)) {
    return translationCache.get(normalized) ?? null;
  }

  const translator = await ensureBrowserTranslator();
  if (!translator) return null;

  try {
    const result = (await translator.translate(text.trim())).trim();
    if (result) {
      translationCache.set(normalized, result);
    }
    return result || null;
  } catch (error) {
    console.warn(`[browser-translator] translate failed for "${text}":`, error);
    return null;
  }
}
