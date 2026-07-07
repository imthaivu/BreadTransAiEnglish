import { Card } from "@/components/ui/Card";

import { playSound } from "@/lib/audio/soundManager";
import { Word } from "..";
import FlashcardCard from "./FlashcardCard";
import QuizCard from "./QuizCard";
import { useImagePreloader } from "../utils/useImagePreloader";

interface LearningViewProps {
  mode: "flashcard" | "quiz";
  deck: Word[];
  currentIndex: number;
  score: number;
  wrongWordsCount: number;
  onAnswer: (isCorrect: boolean, word?: Word) => void;
  onSpeak: (text: string) => void;
  hiddenWordIndices?: Set<number>; // Indices of words that should hide text in quiz mode
  onFlip?: (word: Word) => void; // Callback when flashcard is flipped
  showImage?: boolean; // Whether to show images in flashcard mode
}

export const LearningView = ({
  mode,
  deck,
  currentIndex,
  score,
  wrongWordsCount,
  onAnswer,
  onSpeak,
  hiddenWordIndices = new Set(),
  onFlip,
  showImage = true,
}: LearningViewProps) => {
  const currentWord = deck[currentIndex];
  const hideWord = mode === "quiz" && hiddenWordIndices.has(currentIndex);
  const accuracy =
    currentIndex > 0 ? Math.round((score / currentIndex) * 100) : 0;

  // Preload images for the next 10 words (only in flashcard mode with images enabled)
  useImagePreloader(mode === "flashcard" && showImage ? deck : [], currentIndex, 10);

  return (
    <Card className="md:p-2 mb-2 shadow-none border-none relative h-full">
      {/* Card Display */}
      <div className="mb-6 flex justify-center items-center">
        {mode === "flashcard" ? (
          <FlashcardCard
            key={currentWord.word}
            data={currentWord}
            onAnswer={onAnswer}
            onSpeak={onSpeak}
            onFlip={onFlip}
            showImage={showImage}
          />
        ) : (
          <QuizCard
            data={currentWord}
            allData={deck}
            onAnswer={onAnswer}
            timer={5}
            onSpeak={onSpeak}
            playSound={playSound}
            hideWord={hideWord}
          />
        )}
      </div>

      {mode === "flashcard" && (
        <>
          <div className="flex justify-center gap-6 mb-4">
            <div className="text-center">
              <div className="text-2xl font-bold text-red-600">
                {wrongWordsCount} Từ
              </div>
            </div>
          </div>

          <div className="max-w-xs mx-auto">
            <div className="flex justify-between items-center mb-1 text-xs md:text-base">
              <span className="font-medium text-gray-700">Chính xác</span>
              <span className="text-gray-600">{accuracy}%</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div
                className="bg-green-600 h-2 rounded-full transition-all duration-300"
                style={{ width: `${accuracy}%` }}
              />
            </div>
          </div>
        </>
      )}
    </Card>
  );
};
