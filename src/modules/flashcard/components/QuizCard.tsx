"use client";

import { Button } from "@/components/ui/Button";
import { useCallback, useEffect, useRef, useState } from "react";
import { Word } from "../types";
import { cn } from "@/utils";

interface QuizCardProps {
  data: Word;
  allData: Word[];
  onAnswer: (isCorrect: boolean, word?: Word) => void;
  timer?: number;
  onSpeak: (text: string) => void;
  playSound: (soundName: "correct" | "wrong") => void;
  hideWord?: boolean; // If true, hide the word text and only show audio (listen and choose)
}

export default function QuizCard({
  data,
  allData,
  onAnswer,
  timer = 5,
  onSpeak,
  playSound,
  hideWord = false,
}: QuizCardProps) {
  const [options, setOptions] = useState<string[]>([]);
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const actualTimer = hideWord ? 10 : timer;
  const [timeLeft, setTimeLeft] = useState(actualTimer);
  const [isAnswered, setIsAnswered] = useState(false);
  const [listenCount, setListenCount] = useState(0);
  const MAX_LISTEN_COUNT = 3;
  const timeOutRef = useRef(false);
  const onSpeakRef = useRef(onSpeak);
  const afterAnswerTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Keep onSpeak ref updated
  useEffect(() => {
    onSpeakRef.current = onSpeak;
  }, [onSpeak]);

  useEffect(() => {
    return () => {
      if (afterAnswerTimeoutRef.current) {
        clearTimeout(afterAnswerTimeoutRef.current);
        afterAnswerTimeoutRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    setIsAnswered(false);
    setSelectedOption(null);
    setTimeLeft(actualTimer);
    setListenCount(0); // Reset listen count when word changes
    timeOutRef.current = false;

    const correctAnswer = data.mean;
    // Build a unique pool of wrong answers (exclude current), then shuffle and pick
    const wrongPool = Array.from(
      new Set(
        allData.filter((d) => d.mean !== correctAnswer).map((d) => d.mean)
      )
    );
    for (let i = wrongPool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [wrongPool[i], wrongPool[j]] = [wrongPool[j], wrongPool[i]];
    }
    const wrongAnswers = wrongPool.slice(0, 2);

    const allOptions = [correctAnswer, ...wrongAnswers];
    const shuffled = allOptions.sort(() => Math.random() - 0.5);
    setOptions(shuffled);
    if (afterAnswerTimeoutRef.current) {
      clearTimeout(afterAnswerTimeoutRef.current);
      afterAnswerTimeoutRef.current = null;
    }
  }, [data.word, data.mean, allData, actualTimer]);

  useEffect(() => {
    if (isAnswered) {
      return;
    }

    if (timeLeft <= 0) {
      if (!timeOutRef.current) {
        timeOutRef.current = true;
        setIsAnswered(true);
        playSound("wrong");

        if (afterAnswerTimeoutRef.current) {
          clearTimeout(afterAnswerTimeoutRef.current);
        }
        afterAnswerTimeoutRef.current = setTimeout(() => {
          afterAnswerTimeoutRef.current = null;
          onAnswer(false, data);
        }, 500);
      }
      return;
    }

    const interval = setInterval(() => {
      setTimeLeft((prev) => prev - 1);
    }, 1000);

    return () => clearInterval(interval);
  }, [timeLeft, isAnswered, onAnswer, data, playSound]);

  useEffect(() => {
    // Normal mode: play once when the word changes.
    if (!hideWord) {
      const speakTimeout = setTimeout(() => {
        onSpeakRef.current(data.word);
      }, 200);
      return () => clearTimeout(speakTimeout);
    }

    // Listen-only mode: auto-play 3 times, once every 3 seconds.
    const timeouts: ReturnType<typeof setTimeout>[] = [];
    for (let i = 0; i < MAX_LISTEN_COUNT; i++) {
      timeouts.push(
        setTimeout(() => {
          onSpeakRef.current(data.word);
          setListenCount(i + 1);
        }, 200 + i * 3000)
      );
    }

    return () => timeouts.forEach((t) => clearTimeout(t));
  }, [data.word, hideWord]);

  const handleAnswer = useCallback(
    (option: string) => {
      if (isAnswered) return;

      setSelectedOption(option);
      setIsAnswered(true);

      const isCorrect = option === data.mean;
      playSound(isCorrect ? "correct" : "wrong");

      // For listen-only mode, move to next immediately after selection
      // For normal mode, keep the 1 second delay for visual feedback
      const delay = hideWord ? 300 : 1000;
      if (afterAnswerTimeoutRef.current) {
        clearTimeout(afterAnswerTimeoutRef.current);
      }
      afterAnswerTimeoutRef.current = setTimeout(() => {
        afterAnswerTimeoutRef.current = null;
        onAnswer(isCorrect, data);
      }, delay);
    },
    [isAnswered, data, onAnswer, playSound, hideWord]
  );

  return (
    <div className="flex justify-center items-center">
      <div className="w-full">
        <div className="md:p-6 mb-6 w-full relative">
          {hideWord ? (
            // Listen-only mode: Hide word text, show audio button and instruction
            <div className="text-center mb-6">
              <div className="flex flex-col items-center gap-2">
                <span className="text-4xl" aria-hidden>
                  🔊
                </span>
                {listenCount > 0 ? (
                  <p className="text-sm text-gray-500">
                    {listenCount >= MAX_LISTEN_COUNT
                      ? `Hết lượt`
                      : `Nghe lần ${listenCount}/${MAX_LISTEN_COUNT}`}
                  </p>
                ) : (
                  <p className="text-sm text-gray-500">Lắng nghe</p>
                )}
              </div>
            </div>
          ) : (
            // Normal mode: Show word text
            <>
              {!isAnswered && (
                <span
                  className={cn(
                    "absolute top-0 left-0 text-lg font-bold tabular-nums",
                    timeLeft <= 2 ? "text-red-500" : "text-yellow-500"
                  )}
                >
                  {timeLeft}s
                </span>
              )}

              <div className="text-center mb-4">
                <h2 className="text-2xl font-bold text-gray-800 mt-2">
                  {data.word}
                </h2>
                <p className="text-lg text-gray-600">{data.ipa}</p>
              </div>

              <div className="absolute top-0 right-0 text-center mb-4">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onSpeak(data.word)}
                  className="px-4 py-2"
                >
                  🔊
                </Button>
              </div>
            </>
          )}

          <div className="space-y-3">
            {options.map((option, index) => {
              let buttonClass =
                "w-full p-3 text-left rounded-lg border transition-all ";

              if (isAnswered) {
                if (selectedOption !== null) {
                  if (option === data.mean) {
                    buttonClass +=
                      "bg-green-100 border-green-500 text-green-800";
                  } else if (option === selectedOption) {
                    buttonClass += "bg-red-100 border-red-500 text-red-800";
                  } else {
                    buttonClass += "bg-gray-100 border-gray-300 text-gray-600";
                  }
                } else {
                  buttonClass += "bg-gray-100 border-gray-300 text-gray-600";
                }
              } else {
                buttonClass +=
                  "bg-white border-gray-300 hover:border-primary hover: bg-primary/10";
              }

              return (
                <button
                  key={index}
                  className={cn("select-none", buttonClass)}
                  onClick={() => handleAnswer(option)}
                  disabled={isAnswered}
                >
                  <span className="font-medium">
                    {String.fromCharCode(65 + index)}.
                  </span>{" "}
                  {option}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
