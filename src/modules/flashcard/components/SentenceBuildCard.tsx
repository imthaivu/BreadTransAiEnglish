"use client";

import { Button } from "@/components/ui/Button";
import { SafeImage as Image } from "@/components/ui/SafeImage";
import { useEffect, useMemo, useRef, useState } from "react";
import { FiVolume2 } from "react-icons/fi";
import { DuobookSentence } from "../types";
import { playSound } from "@/lib/audio/soundManager";
import { cn } from "@/utils";
import { chunkSentence, isSentenceMatch, shuffle } from "../utils/sentenceChunk";

interface Tile {
  id: number;
  text: string;
}

interface SentenceBuildCardProps {
  sentence: DuobookSentence;
  /** true: hiện câu tiếng Anh + ráp câu tiếng Việt (mean); false: chỉ nghe + ráp câu tiếng Anh (script). */
  showText: boolean;
  onSpeak: (text: string) => void;
  /** Báo kết quả của câu hiện tại rồi parent chuyển câu tiếp theo. */
  onResult: (isCorrect: boolean) => void;
}

const AUTO_PLAY_TIMES = 2;

export default function SentenceBuildCard({
  sentence,
  showText,
  onSpeak,
  onResult,
}: SentenceBuildCardProps) {
  const target = showText ? sentence.mean : sentence.script;
  const audioText = sentence.script;

  const tiles = useMemo<Tile[]>(
    () => chunkSentence(target).map((text, id) => ({ id, text })),
    [target]
  );

  const [bank, setBank] = useState<Tile[]>(() => shuffle(tiles));
  const [answer, setAnswer] = useState<Tile[]>([]);
  const [checked, setChecked] = useState(false);
  const [isCorrect, setIsCorrect] = useState(false);
  const onSpeakRef = useRef(onSpeak);

  useEffect(() => {
    onSpeakRef.current = onSpeak;
  }, [onSpeak]);

  useEffect(() => {
    setBank(shuffle(tiles));
    setAnswer([]);
    setChecked(false);
    setIsCorrect(false);
  }, [tiles]);

  useEffect(() => {
    const timeouts: ReturnType<typeof setTimeout>[] = [];
    for (let i = 0; i < AUTO_PLAY_TIMES; i++) {
      timeouts.push(
        setTimeout(() => onSpeakRef.current(audioText), 250 + i * 2200)
      );
    }
    return () => timeouts.forEach((t) => clearTimeout(t));
  }, [audioText]);

  const pickTile = (tile: Tile) => {
    if (checked) return;
    setBank((prev) => prev.filter((t) => t.id !== tile.id));
    setAnswer((prev) => [...prev, tile]);
  };

  const removeTile = (tile: Tile) => {
    if (checked) return;
    setAnswer((prev) => prev.filter((t) => t.id !== tile.id));
    setBank((prev) => [...prev, tile]);
  };

  const handleCheck = () => {
    const built = answer.map((t) => t.text).join(" ");
    const correct = isSentenceMatch(built, target);
    setIsCorrect(correct);
    setChecked(true);
    playSound(correct ? "correct" : "wrong");
  };

  const handleContinue = () => {
    onResult(isCorrect);
  };

  return (
    <div className="w-full max-w-2xl sm:max-w-3xl lg:max-w-4xl mx-auto">
      <div className="flex items-end gap-3 mb-4 px-1">
        <Image
          src="/assets/images/character.png"
          alt=""
          width={88}
          height={88}
          className="w-[72px] h-[72px] sm:w-[88px] sm:h-[88px] object-contain flex-shrink-0"
          priority
        />
        <div className="flex-1 min-w-0 flex items-start gap-2 rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5">
          <button
            type="button"
            onClick={() => onSpeak(audioText)}
            aria-label="Nghe lại"
            className="flex-shrink-0 flex items-center justify-center w-9 h-9 rounded-lg border border-gray-300 text-primary hover:bg-primary/5 transition-colors bg-white"
          >
            <FiVolume2 className="w-5 h-5" />
          </button>
          {showText ? (
            <p className="flex-1 text-base font-semibold text-gray-800 leading-snug pt-0.5">
              {sentence.script}
            </p>
          ) : null}
        </div>
      </div>

      <div
        className={cn(
          "min-h-[64px] rounded-xl border-2 border-dashed p-2 mb-4 flex flex-wrap gap-2 content-start",
          checked && isCorrect && "border-green-400 bg-green-50",
          checked && !isCorrect && "border-red-400 bg-red-50",
          !checked && "border-gray-300 bg-gray-50"
        )}
      >
        {answer.map((tile) => (
          <button
            key={tile.id}
            onClick={() => removeTile(tile)}
            disabled={checked}
            className="px-3 py-2 rounded-lg bg-white border border-gray-300 text-sm md:text-base font-medium text-gray-800 shadow-sm select-none"
          >
            {tile.text}
          </button>
        ))}
      </div>

      <div className="min-h-[56px] flex flex-wrap gap-2 justify-center mb-4">
        {bank.map((tile) => (
          <button
            key={tile.id}
            onClick={() => pickTile(tile)}
            disabled={checked}
            className="px-3 py-2 rounded-lg bg-white border-2 border-gray-300 text-sm md:text-base font-medium text-gray-800 hover:border-primary transition-colors select-none"
          >
            {tile.text}
          </button>
        ))}
      </div>

      {checked && !isCorrect && (
        <div className="text-center mb-3">
          <p className="text-sm text-gray-500">Đáp án đúng:</p>
          <p className="text-base font-semibold text-green-700">{target}</p>
        </div>
      )}

      <div className="flex justify-center">
        {!checked ? (
          <Button
            onClick={handleCheck}
            disabled={answer.length === 0 || bank.length > 0}
            className="bg-primary text-white hover:bg-primary/90 disabled:bg-gray-400 px-8"
          >
            Kiểm tra
          </Button>
        ) : (
          <Button
            onClick={handleContinue}
            className={cn(
              "px-8 text-white",
              isCorrect
                ? "bg-green-600 hover:bg-green-700"
                : "bg-primary hover:bg-primary/90"
            )}
          >
            Tiếp tục
          </Button>
        )}
      </div>
    </div>
  );
}
