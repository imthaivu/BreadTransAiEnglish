"use client";

import { Card } from "@/components/ui/Card";
import { useLearnSelection } from "@/components/layout/LearnSelectionProvider";
import { LessonScriptPanel } from "@/modules/speaking-upload/components/LessonScriptPanel";
import { Word, ReviewWord } from "../types";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import FlashcardCard from "./FlashcardCard";
import Confetti from "./Confetti";
import { useState, useEffect, useRef } from "react";
import { imagePreloader } from "../utils/imagePreloader";
import { useAuth } from "@/lib/auth/context";

interface WordListPreviewProps {
  words: Word[];
  reviewWords?: ReviewWord[];
  onSpeak?: (text: string) => void;
  currentIndex?: number;
  isAutoPlaying?: boolean;
  showImages?: boolean;
  onShowImagesChange?: (value: boolean) => void;
}

export const WordListPreview = ({
  words,
  reviewWords = [],
  onSpeak,
  currentIndex = -1,
  isAutoPlaying = false,
  showImages = false,
  onShowImagesChange,
}: WordListPreviewProps) => {
  const {
    canStartVocab,
    startVocabFlashcard,
    startVocabQuiz,
    selectedBook,
    selectedLesson,
  } = useLearnSelection();
  const { profile, session } = useAuth();
  const [contentView, setContentView] = useState<"vocabs" | "script">("vocabs");
  const [selectedWord, setSelectedWord] = useState<Word | null>(null);
  const [imageUrls, setImageUrls] = useState<Record<string, string | null>>({});
  const [learnedCount, setLearnedCount] = useState(0);
  const [showScrollConfetti, setShowScrollConfetti] = useState(false);
  const [showVictoryBurst, setShowVictoryBurst] = useState(false);
  const [burstKey, setBurstKey] = useState(0);
  const wordRefs = useRef<(HTMLDivElement | null)[]>([]);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const hasCelebratedRef = useRef(false);
  const avatarUrl = profile?.avatarUrl || session?.user?.image || "";
  
  // Tạo Map để tra cứu nhanh số lần ôn
  const reviewWordsMap = new Map<string, number>();
  reviewWords.forEach((rw) => {
    reviewWordsMap.set(rw.word, rw.needReview);
  });

  // Auto-scroll to current word when auto-playing
  useEffect(() => {
    if (isAutoPlaying && currentIndex >= 0 && currentIndex < words.length) {
      const wordElement = wordRefs.current[currentIndex];
      if (wordElement) {
        wordElement.scrollIntoView({
          behavior: "smooth",
          block: "center",
        });
      }
    }
  }, [currentIndex, isAutoPlaying, words.length]);

  useEffect(() => {
    if (!showImages || words.length === 0) {
      return;
    }

    let cancelled = false;

    const loadImages = async () => {
      const uniqueWords = Array.from(new Set(words.map((item) => item.word)));
      const entries = await Promise.all(
        uniqueWords.map(async (word) => [word, await imagePreloader.getImageUrl(word)] as const)
      );

      if (cancelled) return;

      setImageUrls((prev) => {
        const next = { ...prev };
        entries.forEach(([word, url]) => {
          next[word] = url;
        });
        return next;
      });
    };

    void loadImages();

    return () => {
      cancelled = true;
    };
  }, [showImages, words]);

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const maxScroll = container.scrollHeight - container.clientHeight;
    if (words.length === 0) {
      setLearnedCount(0);
      return;
    }

    if (maxScroll <= 0) {
      setLearnedCount(words.length);
      return;
    }

    const progressRatio = container.scrollTop / maxScroll;
    const nextCount = Math.max(1, Math.min(words.length, Math.floor(progressRatio * words.length) + 1));
    setLearnedCount(nextCount);
  }, [words]);

  useEffect(() => {
    if (!showScrollConfetti) return;
    const timer = setTimeout(() => setShowScrollConfetti(false), 2800);
    return () => clearTimeout(timer);
  }, [showScrollConfetti]);

  useEffect(() => {
    if (!showVictoryBurst) return;
    const timer = setTimeout(() => setShowVictoryBurst(false), 2200);
    return () => clearTimeout(timer);
  }, [showVictoryBurst]);

  const triggerCelebrate = () => {
    setBurstKey((prev) => prev + 1);
    setShowScrollConfetti(true);
    setShowVictoryBurst(true);
  };

  // Override Modal body min-height để modal vừa đủ content
  useEffect(() => {
    if (selectedWord) {
      const style = document.createElement("style");
      style.textContent = `
        .flashcard-modal-fit-content > div > div:last-child {
          min-height: 0 !important;
          height: auto !important;
        }
      `;
      document.head.appendChild(style);
      return () => {
        document.head.removeChild(style);
      };
    }
  }, [selectedWord]);

  useEffect(() => {
    setContentView("vocabs");
  }, [selectedBook, selectedLesson]);

  const showVocabs = contentView === "vocabs";

  return (
    <>
      <Card className="border-none shadow-none">
        <div className="mb-4 grid grid-cols-[1fr_auto_1fr] items-center gap-2">
          <div
            className="inline-flex justify-self-start rounded-lg bg-gray-100 p-0.5"
            role="group"
            aria-label="Nội dung bài học"
          >
            <button
              type="button"
              aria-pressed={contentView === "vocabs"}
              onClick={() => setContentView("vocabs")}
              className={`rounded-md px-2 py-1 text-xs font-semibold transition-colors sm:px-2.5 sm:text-sm ${
                contentView === "vocabs"
                  ? "bg-white text-gray-900 shadow-sm"
                  : "text-gray-600 hover:text-gray-900"
              }`}
            >
              Vocabs
            </button>
            <button
              type="button"
              aria-pressed={contentView === "script"}
              onClick={() => setContentView("script")}
              className={`rounded-md px-2 py-1 text-xs font-semibold transition-colors sm:px-2.5 sm:text-sm ${
                contentView === "script"
                  ? "bg-white text-gray-900 shadow-sm"
                  : "text-gray-600 hover:text-gray-900"
              }`}
            >
              Script
            </button>
          </div>
          <div className="flex items-stretch gap-2 w-[11.5rem] sm:w-[13rem]">
          <Button
              type="button"
              variant="primary"
              size="sm"
              className="flex-1 min-w-0"
              disabled={!canStartVocab}
              onClick={startVocabQuiz}
            >
              Test
            </Button>
            <Button
              type="button"
              variant="primary"
              size="sm"
              className="flex-1 min-w-0"
              disabled={!canStartVocab}
              onClick={startVocabFlashcard}
            >
              Ôn
            </Button>
            
          </div>
          <label
            className={`inline-flex items-center justify-self-end gap-2 text-sm font-medium text-gray-700 select-none ${
              showVocabs ? "" : "invisible pointer-events-none"
            }`}
          >
            <input
              type="checkbox"
              checked={showImages}
              onChange={(e) => onShowImagesChange?.(e.target.checked)}
              className="h-4 w-4 accent-blue-600 cursor-pointer"
            />
            Ảnh
          </label>
        </div>
        
        {showVocabs ? (
        <div
          ref={scrollContainerRef}
          onScroll={(e) => {
            const target = e.currentTarget;
            const maxScroll = target.scrollHeight - target.clientHeight;

            if (words.length === 0) {
              setLearnedCount(0);
              return;
            }

            if (maxScroll <= 0) {
              setLearnedCount(words.length);
              if (!hasCelebratedRef.current && words.length > 0) {
                hasCelebratedRef.current = true;
                triggerCelebrate();
              }
              return;
            }

            const progressRatio = target.scrollTop / maxScroll;
            const nextCount = Math.max(1, Math.min(words.length, Math.floor(progressRatio * words.length) + 1));
            setLearnedCount(nextCount);

            if (progressRatio >= 0.98) {
              if (!hasCelebratedRef.current) {
                hasCelebratedRef.current = true;
                triggerCelebrate();
              }
            } else if (hasCelebratedRef.current) {
              hasCelebratedRef.current = false;
            }
          }}
          className="max-h-[60vh] overflow-y-auto"
        >
          {words.length > 0 ? (
            <div className="space-y-2">
              {words.map((word, index) => (
                <div
                  key={`${word.word}-${index}`}
                  className="relative"
                >
                  <div
                    ref={(el) => {
                      wordRefs.current[index] = el;
                    }}
                    onClick={() => {
                      if (!isAutoPlaying) {
                        if (onSpeak) {
                          // Phát âm 3 lần với delay
                          onSpeak(word.word);
                          setTimeout(() => {
                            onSpeak(word.word);
                          }, 800);
                          setTimeout(() => {
                            onSpeak(word.word);
                          }, 1600);
                        }
                        setSelectedWord(word);
                      }
                    }}
                    className={`relative flex items-start gap-3 p-1 rounded-lg border transition-colors ${
                      currentIndex === index && isAutoPlaying
                        ? "bg-blue-100 border-blue-400 shadow-md"
                        : "bg-gray-50 border-gray-200 hover:bg-gray-100 cursor-pointer active:bg-gray-200"
                    }`}
                  >
                    <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="text-lg font-bold text-gray-900">
                        {word.word}
                      </h3>
                      {reviewWordsMap.has(word.word) && (
                        <span className="text-xs font-semibold text-orange-600 bg-orange-50 px-1.5 py-0.5 rounded">
                          {reviewWordsMap.get(word.word)} times
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <p className="text-sm text-gray-600">{word.ipa}</p>
                      {onSpeak && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            onSpeak(word.word);
                          }}
                          onMouseDown={(e) => {
                            e.stopPropagation();
                          }}
                          className="px-2 py-1 h-7 text-sm hover:bg-blue-50 active:bg-blue-100"
                        >
                          🔊
                        </Button>
                      )}
                    </div>
                    <p className="text-base text-gray-800 font-medium mt-1">
                      {word.mean}
                    </p>
                  </div>
                  {showImages && (
                    <div className="shrink-0">
                      <div className="w-[100px] h-[100px]">
                        {imageUrls[word.word] ? (
                          <img
                            src={imageUrls[word.word] || ""}
                            alt={word.word}
                            width={100}
                            height={100}
                            className="w-[100px] h-[100px] rounded-md object-cover border border-gray-200"
                            loading="lazy"
                          />
                        ) : (
                          <div className="w-[100px] h-[100px] rounded-md border border-dashed border-gray-300 bg-gray-100 flex items-center justify-center text-[10px] text-gray-500 text-center px-1">
                            No image
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-center text-gray-500 py-8">
              Không có từ nào để hiển thị
            </p>
          )}
        </div>
        ) : (
          <div className="max-h-[60vh] overflow-y-auto">
            <LessonScriptPanel
              selectedBook={selectedBook}
              selectedLesson={selectedLesson}
              vocabulary={words}
            />
          </div>
        )}
      </Card>

      {/* Flashcard Modal */}
      {selectedWord && (
        <Modal
          open={!!selectedWord}
          onClose={() => setSelectedWord(null)}
          maxWidth="md"
          showHeader={false}
          hideCloseButton={false}
          overlayClassName="bg-black/60"
          className="p-0 w-auto max-w-md flashcard-modal-fit-content"
        >
          <div className="relative flex flex-col justify-center items-center p-2 gap-2">
            <FlashcardCard
              data={selectedWord}
              onAnswer={() => {}}
              onSpeak={onSpeak || (() => {})}
              showImage={true}
            />
            {/* Nghĩa hiển thị bên dưới */}
            <div className="text-center px-3 py-1.5 bg-blue-50 rounded-lg border border-blue-200 w-full">
              <p className="text-base font-semibold text-gray-800">
                {selectedWord.mean}
              </p>
            </div>
          </div>
        </Modal>
      )}
      {showVictoryBurst && (
        <div className="fixed inset-0 pointer-events-none z-[10000] overflow-hidden">
          <div
            key={`cheer-text-${burstKey}`}
            className="celebration-text-burst"
            style={{ left: "50%", bottom: "14vh" }}
          >
            CHIẾN LUÔN!
          </div>
          {avatarUrl && (
            <img
              key={`avatar-burst-${burstKey}`}
              src={avatarUrl}
              alt="avatar celebration"
              className="celebration-avatar-burst"
              style={{ left: "50%", bottom: "6vh" }}
            />
          )}
          {Array.from({ length: 8 }).map((_, index) => (
            <div
              key={`flame-${burstKey}-${index}`}
              className="celebration-flame-burst"
              style={{
                left: `calc(50% + ${(index - 3.5) * 18}px)`,
                bottom: "4vh",
                animationDelay: `${index * 0.06}s`,
              }}
            >
              🔥
            </div>
          ))}
        </div>
      )}
      <Confetti show={showScrollConfetti} duration={2800} intensity="high" />
    </>
  );
};

