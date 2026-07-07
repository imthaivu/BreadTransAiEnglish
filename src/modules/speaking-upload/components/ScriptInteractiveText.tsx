"use client";

import { Modal } from "@/components/ui/Modal";
import FlashcardCard from "@/modules/flashcard/components/FlashcardCard";
import type { Word } from "@/modules/flashcard/types";
import { useSpeechSynthesis } from "@/lib/speech/useSpeechSynthesis";
import { translateEnToVi } from "@/lib/translation/browser-translator";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ScriptWordDetail } from "./ScriptWordDetail";

const WORD_PATTERN = /\b[a-zA-Z]+(?:'[a-zA-Z]+)?\b/g;

interface ScriptInteractiveTextProps {
  text: string;
  vocabulary?: Pick<Word, "word" | "mean" | "ipa">[];
  lineMean?: string;
}

interface ActiveWordState {
  word: string;
  mean: string | null;
  isLoading: boolean;
  anchorRect: DOMRect | null;
  fromLine?: boolean;
}

function tokenizeLine(text: string): { key: string; value: string; isWord: boolean }[] {
  const parts: { key: string; value: string; isWord: boolean }[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  const regex = new RegExp(WORD_PATTERN);
  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push({
        key: `t-${lastIndex}`,
        value: text.slice(lastIndex, match.index),
        isWord: false,
      });
    }
    parts.push({
      key: `w-${match.index}-${match[0]}`,
      value: match[0],
      isWord: true,
    });
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    parts.push({
      key: `t-${lastIndex}`,
      value: text.slice(lastIndex),
      isWord: false,
    });
  }

  return parts;
}

function usePrefersHover() {
  const [prefersHover, setPrefersHover] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(hover: hover) and (pointer: fine)");
    const update = () => setPrefersHover(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  return prefersHover;
}

export function ScriptInteractiveText({
  text,
  vocabulary = [],
  lineMean,
}: ScriptInteractiveTextProps) {
  const prefersHover = usePrefersHover();
  const { speak } = useSpeechSynthesis();
  const hidePopoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [hoverWord, setHoverWord] = useState<ActiveWordState | null>(null);
  const [modalWord, setModalWord] = useState<ActiveWordState | null>(null);

  const vocabMeanByWord = useMemo(() => {
    const map = new Map<string, string>();
    vocabulary.forEach((item) => {
      map.set(item.word.trim().toLowerCase(), item.mean);
    });
    return map;
  }, [vocabulary]);

  const vocabByWord = useMemo(() => {
    const map = new Map<string, Pick<Word, "word" | "mean" | "ipa">>();
    vocabulary.forEach((item) => {
      map.set(item.word.trim().toLowerCase(), item);
    });
    return map;
  }, [vocabulary]);

  const tokens = useMemo(() => tokenizeLine(text), [text]);

  const clearHidePopoverTimer = useCallback(() => {
    if (hidePopoverTimerRef.current) {
      clearTimeout(hidePopoverTimerRef.current);
      hidePopoverTimerRef.current = null;
    }
  }, []);

  const scheduleHidePopover = useCallback(() => {
    clearHidePopoverTimer();
    hidePopoverTimerRef.current = setTimeout(() => {
      setHoverWord(null);
    }, 120);
  }, [clearHidePopoverTimer]);

  const lookupWord = useCallback(
    async (
      word: string
    ): Promise<{ mean: string; fromLine?: boolean } | null> => {
      const vocabHit = vocabMeanByWord.get(word.toLowerCase());
      if (vocabHit) return { mean: vocabHit };

      const translated = await translateEnToVi(word, vocabMeanByWord);
      if (translated) return { mean: translated };

      const line = lineMean?.trim();
      if (line) return { mean: line, fromLine: true };

      return null;
    },
    [lineMean, vocabMeanByWord]
  );

  const showHoverPopover = useCallback(
    async (word: string, anchor: HTMLElement) => {
      if (!prefersHover) return;

      clearHidePopoverTimer();
      const rect = anchor.getBoundingClientRect();
      const vocabHit = vocabMeanByWord.get(word.toLowerCase());

      setHoverWord({
        word,
        mean: vocabHit ?? null,
        isLoading: !vocabHit,
        anchorRect: rect,
        fromLine: false,
      });

      speak(word);

      if (vocabHit) return;

      const result = await lookupWord(word);
      setHoverWord((prev) => {
        if (!prev || prev.word !== word) return prev;
        return {
          ...prev,
          mean: result?.mean ?? null,
          isLoading: false,
          fromLine: result?.fromLine,
        };
      });
    },
    [clearHidePopoverTimer, lookupWord, prefersHover, speak, vocabMeanByWord]
  );

  const showClickModal = useCallback(
    async (word: string) => {
      clearHidePopoverTimer();
      setHoverWord(null);

      const vocabHit = vocabMeanByWord.get(word.toLowerCase());
      setModalWord({
        word,
        mean: vocabHit ?? null,
        isLoading: !vocabHit,
        anchorRect: null,
        fromLine: false,
      });

      speak(word);

      if (vocabHit) return;

      const result = await lookupWord(word);
      setModalWord((prev) => {
        if (!prev || prev.word !== word) return prev;
        return {
          ...prev,
          mean: result?.mean ?? null,
          isLoading: false,
          fromLine: result?.fromLine,
        };
      });
    },
    [clearHidePopoverTimer, lookupWord, speak, vocabMeanByWord]
  );

  const modalFlashcardWord = useMemo((): Word | null => {
    if (!modalWord) return null;
    const vocab = vocabByWord.get(modalWord.word.toLowerCase());
    return {
      word: modalWord.word,
      ipa: vocab?.ipa ?? "",
      mean: modalWord.mean ?? vocab?.mean ?? "",
      book: "",
      lesson: 0,
    };
  }, [modalWord, vocabByWord]);

  return (
    <>
      <span className="leading-snug">
        {tokens.map((token) =>
          token.isWord ? (
            <button
              key={token.key}
              type="button"
              className="inline font-medium text-gray-900 dark:text-gray-100 rounded px-0.5 -mx-0.5 hover:bg-blue-100 hover:text-blue-800 dark:hover:bg-blue-900/40 dark:hover:text-blue-200 underline decoration-blue-300/60 decoration-dotted underline-offset-2 cursor-help"
              onMouseEnter={(e) => {
                if (prefersHover) {
                  void showHoverPopover(token.value, e.currentTarget);
                }
              }}
              onMouseLeave={() => {
                if (prefersHover) scheduleHidePopover();
              }}
              onClick={(e) => {
                e.preventDefault();
                if (!prefersHover) {
                  void showClickModal(token.value);
                }
              }}
              onFocus={(e) => {
                if (prefersHover) {
                  void showHoverPopover(token.value, e.currentTarget);
                }
              }}
              onBlur={() => {
                if (prefersHover) scheduleHidePopover();
              }}
            >
              {token.value}
            </button>
          ) : (
            <span key={token.key}>{token.value}</span>
          )
        )}
      </span>

      {hoverWord?.anchorRect && typeof document !== "undefined"
        ? createPortal(
            <div
              className="fixed z-[9999] pointer-events-none"
              style={{
                left: Math.min(
                  hoverWord.anchorRect.left,
                  window.innerWidth - 180
                ),
                top: hoverWord.anchorRect.bottom + 6,
              }}
              onMouseEnter={clearHidePopoverTimer}
              onMouseLeave={scheduleHidePopover}
            >
              <div className="pointer-events-auto w-[160px] rounded-xl border border-gray-200 bg-white shadow-lg">
                <ScriptWordDetail
                  word={hoverWord.word}
                  mean={hoverWord.mean}
                  isLoading={hoverWord.isLoading}
                  compact
                />
              </div>
            </div>,
            document.body
          )
        : null}

      {modalWord && modalFlashcardWord ? (
        <Modal
          open
          onClose={() => setModalWord(null)}
          maxWidth="md"
          showHeader={false}
          hideCloseButton={false}
          overlayClassName="bg-black/60"
          className="p-0 w-auto max-w-md"
        >
          <div className="relative flex flex-col justify-center items-center p-2 gap-2">
            <FlashcardCard
              data={modalFlashcardWord}
              onAnswer={() => {}}
              onSpeak={speak}
              showImage
            />
            <div className="text-center px-3 py-1.5 bg-blue-50 rounded-lg border border-blue-200 w-full min-h-[2.5rem] flex items-center justify-center">
              {modalWord.isLoading ? (
                <span className="text-sm text-gray-500">Đang dịch…</span>
              ) : modalWord.mean ? (
                <div>
                  {modalWord.fromLine ? (
                    <p className="text-[11px] text-gray-500 mb-1">Nghĩa cả câu</p>
                  ) : null}
                  <p className="text-base font-semibold text-gray-800">
                    {modalWord.mean}
                  </p>
                </div>
              ) : (
                <p className="text-sm text-gray-500">
                  Trình duyệt chưa hỗ trợ dịch từ này
                </p>
              )}
            </div>
          </div>
        </Modal>
      ) : null}
    </>
  );
}
