"use client";

import { Button } from "@/components/ui/Button";
import { memo, useCallback, useEffect, useRef, useState } from "react";
import { SafeImage as Image } from "@/components/ui/SafeImage";
import { Word } from "../types";
import { imagePreloader } from "../utils/imagePreloader";

interface FlashcardCardProps {
  data: Word;
  onAnswer: (isCorrect: boolean) => void;
  onSpeak: (text: string) => void;
  onFlip?: (word: Word) => void;
  showImage?: boolean; // Whether to show images
}

function FlashcardCardComp({ data, onAnswer, onSpeak, onFlip, showImage = true }: FlashcardCardProps) {
  const [isFlipped, setIsFlipped] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [hasMoved, setHasMoved] = useState(false);
  const [dragOffset, setDragOffset] = useState(0);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [imageLoading, setImageLoading] = useState(true);
  const hasFlippedRef = useRef(false);

  const cardRef = useRef<HTMLDivElement>(null);
  const dragStartPos = useRef({ x: 0, y: 0 });

  const onSpeakRef = useRef(onSpeak);
  useEffect(() => {
    onSpeakRef.current = onSpeak;
  }, [onSpeak]);

  useEffect(() => {
    onSpeakRef.current(data.word);
  }, [data.word]);

  // Load image when word changes (only if showImage is true)
  useEffect(() => {
    if (!showImage) {
      setImageUrl(null);
      setImageLoading(false);
      return;
    }
    
    setImageLoading(true);
    setImageUrl(null);
    
    imagePreloader.getImageUrl(data.word).then((url) => {
      setImageUrl(url);
      setImageLoading(false);
    }).catch(() => {
      setImageUrl(null);
      setImageLoading(false);
    });
  }, [data.word, showImage]);

  useEffect(() => {
    setIsFlipped(false);
    setDragOffset(0);
    setHasMoved(false);
    hasFlippedRef.current = false;
    if (cardRef.current) {
      cardRef.current.style.transition = "none";
      cardRef.current.style.transform = "translateX(0) rotateY(0deg)";
      void cardRef.current.offsetHeight;
      cardRef.current.style.transition = "transform 0.6s ease";
    }
  }, [data.word]);

  const handleDragStart = useCallback((clientX: number, clientY: number) => {
    if (cardRef.current) {
      cardRef.current.style.transition = "none";
    }
    dragStartPos.current = { x: clientX, y: clientY };
    setIsDragging(true);
    setHasMoved(false);
  }, []);

  const handleDragMove = useCallback(
    (clientX: number, clientY: number) => {
      if (!isDragging) return;

      const offsetX = clientX - dragStartPos.current.x;
      const offsetY = clientY - dragStartPos.current.y;

      if (!hasMoved && (Math.abs(offsetX) > 5 || Math.abs(offsetY) > 5)) {
        setHasMoved(true);
      }
      setDragOffset(offsetX);

      if (cardRef.current) {
        cardRef.current.style.transform = `translateX(${offsetX}px) rotate(${
          offsetX / 10
        }deg) ${isFlipped ? "rotateY(180deg)" : ""}`;
      }
    },
    [isDragging, isFlipped, hasMoved]
  );

  const handleDragEnd = useCallback(() => {
    if (!isDragging) return;

    setIsDragging(false);

    if (cardRef.current) {
      cardRef.current.style.transition = "transform 0.3s ease";
    }

    if (!hasMoved) {
      setIsFlipped((prev) => {
        const newFlipped = !prev;
        // Khi lật từ false sang true (lần đầu tiên), gọi onFlip
        if (!prev && newFlipped && !hasFlippedRef.current && onFlip) {
          hasFlippedRef.current = true;
          onFlip(data);
        }
        return newFlipped;
      });
      if (cardRef.current) {
        cardRef.current.style.transform = "";
      }
      return;
    }

    if (dragOffset > 100) {
      if (cardRef.current) {
        cardRef.current.style.transform = `translateX(100vw) rotate(90deg)`;
      }
      setTimeout(() => onAnswer(true), 300);
    } else if (dragOffset < -100) {
      if (cardRef.current) {
        cardRef.current.style.transform = `translateX(-100vw) rotate(-90deg)`;
      }
      setTimeout(() => onAnswer(false), 300);
    } else {
      setDragOffset(0);
      if (cardRef.current) {
        cardRef.current.style.transform = isFlipped ? "rotateY(180deg)" : "";
      }
    }
  }, [isDragging, hasMoved, dragOffset, onAnswer, isFlipped, data, onFlip]);

  useEffect(() => {
    const onPointerMove = (e: PointerEvent) =>
      handleDragMove(e.clientX, e.clientY);
    const onPointerUp = () => handleDragEnd();
    const onPointerCancel = () => handleDragEnd();

    if (isDragging) {
      document.addEventListener("pointermove", onPointerMove);
      document.addEventListener("pointerup", onPointerUp);
      document.addEventListener("pointercancel", onPointerCancel);
    }

    return () => {
      document.removeEventListener("pointermove", onPointerMove);
      document.removeEventListener("pointerup", onPointerUp);
      document.removeEventListener("pointercancel", onPointerCancel);
    };
  }, [isDragging, handleDragMove, handleDragEnd]);

  return (
    <div className="flex justify-center items-center w-full px-0">
      <div
        ref={cardRef}
        className="relative w-[85vw] sm:w-[400px] aspect-square cursor-pointer perspective-[1000px] select-none touch-none"
        onPointerDown={(e) => {
          try {
            (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
          } catch {}
          handleDragStart(e.clientX, e.clientY);
        }}
        style={{
          transformStyle: "preserve-3d",
          transform: isFlipped ? "rotateY(180deg)" : "rotateY(0deg)",
        }}
      >
        <div
          className="absolute inset-0 w-full h-full rounded-xl transition-transform duration-500 ease-in-out"
          style={{ transformStyle: "preserve-3d" }}
        >
          {/* ===== FRONT SIDE ===== */}
          <div
            className="absolute inset-0 w-full h-full bg-white rounded-xl flex flex-col text-black p-2 sm:p-4 shadow-lg"
            style={{ backfaceVisibility: "hidden" }}
          >
            {/* Image Section (1:1) - Only show if showImage is true */}
            {showImage && (
              <div className="relative w-full aspect-square rounded-lg overflow-hidden mb-3 sm:mb-4 bg-gray-200 flex items-center justify-center">
                {imageLoading ? (
                  <div className="flex items-center justify-center w-full h-full">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-700"></div>
                  </div>
                ) : imageUrl ? (
                  <Image
                    src={imageUrl}
                    alt={data.word}
                    fill
                    className="object-cover"
                    priority
                    unoptimized
                    sizes="(max-width: 768px) 100vw, 400px"
                  />
                ) : (
                  <div className="flex items-center justify-center w-full h-full bg-gray-300">
                    <span className="text-gray-500 text-xs sm:text-sm">No image</span>
                  </div>
                )}
              </div>
            )}
  
            {/* Word + IPA */}
            <div className={`text-center flex-1 flex flex-col justify-center px-2 ${!showImage ? 'mt-4' : ''}`}>
              <h2
                className="
                  font-bold mb-1 sm:mb-2 leading-tight break-words
                  text-[clamp(1.2rem,4vw,2rem)]   /* auto co chữ */
                  max-h-[3.6em] overflow-hidden line-clamp-2
                "
                title={data.word}
              >
                {data.word}
              </h2>
              <p className="text-[clamp(0.9rem,3.5vw,1.2rem)] text-gray-700 opacity-90 truncate">
                {data.ipa}
              </p>
            </div>
  
            <Button
              variant="ghost"
              size="sm"
              className="absolute top-3 right-3 sm:top-4 sm:right-4 p-1.5 sm:p-2 bg-white/80 rounded-full hover:bg-white transition-all shadow-md"
              onClick={(e) => {
                e.stopPropagation();
                onSpeak(data.word);
              }}
              onPointerDown={(e) => e.stopPropagation()}
            >
              🔊
            </Button>
          </div>
  
          {/* ===== BACK SIDE ===== */}
          <div
            className="absolute inset-0 w-full h-full bg-blue-200 rounded-xl flex flex-col justify-center items-center p-4 sm:p-6"
            style={{
              transform: "rotateY(180deg)",
              backfaceVisibility: "hidden",
            }}
          >
            <div className="text-center px-2">
              <h3 className="text-[clamp(2rem,3.5vw,1.6rem)] font-semibold mb-2">{data.mean}</h3>
                
            </div>
          </div>
        </div>
      </div>
    </div>
  );
  
}

const areEqual = (prev: FlashcardCardProps, next: FlashcardCardProps) => {
  // Only re-render when displayed word content or showImage changes
  return (
    prev.data.word === next.data.word &&
    prev.data.ipa === next.data.ipa &&
    prev.data.mean === next.data.mean &&
    prev.showImage === next.showImage
  );
};

export default memo(FlashcardCardComp, areEqual);
