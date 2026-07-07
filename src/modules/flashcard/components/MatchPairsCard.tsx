"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Word } from "../types";
import { playSound } from "@/lib/audio/soundManager";
import { cn } from "@/utils";
import { shuffle } from "../utils/sentenceChunk";

interface MatchItem {
  id: number;
  key: number;
  text: string;
}

interface ConnectorLine {
  id: string;
  path: string;
  variant: "matched" | "preview" | "wrong";
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

interface MatchPairsCardProps {
  words: Word[];
  onSpeak: (text: string) => void;
  onComplete: (summary: { correct: number; total: number }) => void;
  onMatchProgress?: (done: number, total: number) => void;
  onPairResult?: (isCorrect: boolean, word: Word) => void;
}

const GROUP_SIZE = 5;

function buildConnectorPath(
  x1: number,
  y1: number,
  x2: number,
  y2: number
): string {
  const cx = (x1 + x2) / 2;
  return `M ${x1} ${y1} C ${cx} ${y1}, ${cx} ${y2}, ${x2} ${y2}`;
}

function connectorsEqual(a: ConnectorLine[], b: ConnectorLine[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((line, i) => {
    const other = b[i];
    return (
      line.id === other.id &&
      line.variant === other.variant &&
      Math.round(line.x1) === Math.round(other.x1) &&
      Math.round(line.y1) === Math.round(other.y1) &&
      Math.round(line.x2) === Math.round(other.x2) &&
      Math.round(line.y2) === Math.round(other.y2)
    );
  });
}

export default function MatchPairsCard({
  words,
  onSpeak,
  onComplete,
  onMatchProgress,
  onPairResult,
}: MatchPairsCardProps) {
  const wordsSignature = useMemo(
    () => words.map((w) => `${w.word}\0${w.mean}`).join("\n"),
    [words]
  );

  const groups = useMemo(() => {
    const valid = words.filter((w) => w.word && w.mean);
    const result: Word[][] = [];
    for (let i = 0; i < valid.length; i += GROUP_SIZE) {
      result.push(valid.slice(i, i + GROUP_SIZE));
    }
    return result;
    // wordsSignature captures content; avoid resetting when parent passes new array ref
  }, [wordsSignature]);

  const totalPairs = useMemo(
    () => groups.reduce((sum, g) => sum + g.length, 0),
    [groups]
  );

  const [groupIndex, setGroupIndex] = useState(0);
  const [leftItems, setLeftItems] = useState<MatchItem[]>([]);
  const [rightItems, setRightItems] = useState<MatchItem[]>([]);
  const [selectedLeft, setSelectedLeft] = useState<number | null>(null);
  const [selectedRight, setSelectedRight] = useState<number | null>(null);
  const [matchedKeys, setMatchedKeys] = useState<Set<number>>(new Set());
  const [wrongKeys, setWrongKeys] = useState<Set<number>>(new Set());
  const [mistakeKeys, setMistakeKeys] = useState<Set<number>>(new Set());
  const [correctCount, setCorrectCount] = useState(0);
  const [connectors, setConnectors] = useState<ConnectorLine[]>([]);
  const completedRef = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<Map<string, HTMLButtonElement>>(new Map());
  const updateConnectorsRef = useRef<() => void>(() => {});

  const setItemRef = useCallback(
    (side: "left" | "right", key: number) => (el: HTMLButtonElement | null) => {
      const id = `${side}-${key}`;
      if (el) itemRefs.current.set(id, el);
      else itemRefs.current.delete(id);
    },
    []
  );

  const getConnectorPoints = useCallback((leftKey: number, rightKey: number) => {
    const container = containerRef.current;
    const leftEl = itemRefs.current.get(`left-${leftKey}`);
    const rightEl = itemRefs.current.get(`right-${rightKey}`);
    if (!container || !leftEl || !rightEl) return null;

    const cr = container.getBoundingClientRect();
    const lr = leftEl.getBoundingClientRect();
    const rr = rightEl.getBoundingClientRect();

    const x1 = lr.right - cr.left;
    const y1 = lr.top + lr.height / 2 - cr.top;
    const x2 = rr.left - cr.left;
    const y2 = rr.top + rr.height / 2 - cr.top;

    return { x1, y1, x2, y2, path: buildConnectorPath(x1, y1, x2, y2) };
  }, []);

  const updateConnectors = useCallback(() => {
    const next: ConnectorLine[] = [];

    matchedKeys.forEach((key) => {
      const pts = getConnectorPoints(key, key);
      if (pts) {
        next.push({
          id: `matched-${key}`,
          path: pts.path,
          variant: "matched",
          x1: pts.x1,
          y1: pts.y1,
          x2: pts.x2,
          y2: pts.y2,
        });
      }
    });

    if (
      selectedLeft !== null &&
      selectedRight !== null &&
      !matchedKeys.has(selectedLeft)
    ) {
      const pts = getConnectorPoints(selectedLeft, selectedRight);
      if (pts) {
        next.push({
          id: "selection",
          path: pts.path,
          variant: wrongKeys.size > 0 ? "wrong" : "preview",
          x1: pts.x1,
          y1: pts.y1,
          x2: pts.x2,
          y2: pts.y2,
        });
      }
    }

    setConnectors((prev) => (connectorsEqual(prev, next) ? prev : next));
  }, [getConnectorPoints, matchedKeys, selectedLeft, selectedRight, wrongKeys]);

  updateConnectorsRef.current = updateConnectors;

  useEffect(() => {
    const group = groups[groupIndex];
    if (!group) return;
    const left: MatchItem[] = group.map((w, idx) => ({
      id: idx,
      key: idx,
      text: w.word,
    }));
    const right: MatchItem[] = group.map((w, idx) => ({
      id: idx,
      key: idx,
      text: w.mean,
    }));
    setLeftItems(shuffle(left));
    setRightItems(shuffle(right));
    setSelectedLeft(null);
    setSelectedRight(null);
    setMatchedKeys(new Set());
    setWrongKeys(new Set());
    setMistakeKeys(new Set());
    itemRefs.current.clear();
  }, [groupIndex, wordsSignature, groups]);

  useLayoutEffect(() => {
    let rafId = 0;
    const scheduleUpdate = () => {
      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => updateConnectorsRef.current());
    };

    scheduleUpdate();
    const container = containerRef.current;
    if (!container) {
      return () => cancelAnimationFrame(rafId);
    }

    const observer = new ResizeObserver(scheduleUpdate);
    observer.observe(container);

    window.addEventListener("resize", scheduleUpdate);

    return () => {
      cancelAnimationFrame(rafId);
      observer.disconnect();
      window.removeEventListener("resize", scheduleUpdate);
    };
  }, [
    groupIndex,
    leftItems.length,
    matchedKeys.size,
    selectedLeft,
    selectedRight,
    wrongKeys.size,
  ]);

  const currentGroup = groups[groupIndex];

  useEffect(() => {
    const pairsDoneBefore = groups
      .slice(0, groupIndex)
      .reduce((sum, g) => sum + g.length, 0);
    const done = pairsDoneBefore + matchedKeys.size;
    onMatchProgress?.(done, totalPairs);
  }, [groupIndex, matchedKeys.size, groups, totalPairs, onMatchProgress]);

  const advanceGroup = useCallback(() => {
    if (groupIndex + 1 < groups.length) {
      setGroupIndex((prev) => prev + 1);
    }
  }, [groupIndex, groups.length]);

  useEffect(() => {
    if (!currentGroup || currentGroup.length === 0) return;
    if (matchedKeys.size === currentGroup.length) {
      const timer = setTimeout(() => {
        if (groupIndex + 1 < groups.length) {
          advanceGroup();
        } else if (!completedRef.current) {
          completedRef.current = true;
          onComplete({ correct: correctCount, total: totalPairs });
        }
      }, 450);
      return () => clearTimeout(timer);
    }
  }, [
    matchedKeys,
    currentGroup,
    groupIndex,
    groups.length,
    advanceGroup,
    onComplete,
    correctCount,
    totalPairs,
  ]);

  const evaluate = useCallback(
    (leftKey: number, rightKey: number) => {
      const group = groups[groupIndex];
      if (!group) return;

      const word = group[leftKey];

      if (leftKey === rightKey) {
        playSound("correct");
        setMatchedKeys((prev) => new Set(prev).add(leftKey));
        setMistakeKeys((prevMistakes) => {
          if (!prevMistakes.has(leftKey)) {
            setCorrectCount((c) => c + 1);
            if (word) onPairResult?.(true, word);
          }
          return prevMistakes;
        });
        setSelectedLeft(null);
        setSelectedRight(null);
      } else {
        playSound("wrong");
        if (word) onPairResult?.(false, word);
        setMistakeKeys((prev) => {
          const next = new Set(prev);
          next.add(leftKey);
          next.add(rightKey);
          return next;
        });
        setWrongKeys(new Set([leftKey, rightKey]));
        setTimeout(() => {
          setWrongKeys(new Set());
          setSelectedLeft(null);
          setSelectedRight(null);
        }, 500);
      }
    },
    [groups, groupIndex, onPairResult]
  );

  const handleSelectLeft = useCallback(
    (key: number) => {
      if (matchedKeys.has(key) || wrongKeys.size > 0) return;
      const nextLeft = selectedLeft === key ? null : key;
      if (nextLeft !== null) {
        const word = groups[groupIndex]?.[key];
        if (word?.word) onSpeak(word.word);
      }
      setSelectedLeft(nextLeft);
      if (nextLeft !== null && selectedRight !== null) {
        evaluate(nextLeft, selectedRight);
      }
    },
    [
      matchedKeys,
      wrongKeys,
      selectedLeft,
      selectedRight,
      evaluate,
      groups,
      groupIndex,
      onSpeak,
    ]
  );

  const handleSelectRight = useCallback(
    (key: number) => {
      if (matchedKeys.has(key) || wrongKeys.size > 0) return;
      const nextRight = selectedRight === key ? null : key;
      setSelectedRight(nextRight);
      if (nextRight !== null && selectedLeft !== null) {
        evaluate(selectedLeft, nextRight);
      }
    },
    [matchedKeys, wrongKeys, selectedLeft, selectedRight, evaluate]
  );

  if (!currentGroup) return null;

  const renderButton = (
    item: MatchItem,
    side: "left" | "right",
    selectedKey: number | null,
    onSelect: (key: number) => void
  ) => {
    const isMatched = matchedKeys.has(item.key);
    const isSelected = selectedKey === item.key;
    const isWrong = wrongKeys.has(item.key) && isSelected;

    return (
      <button
        key={`${side}-${item.id}`}
        ref={setItemRef(side, item.key)}
        onClick={() => onSelect(item.key)}
        disabled={isMatched}
        className={cn(
          "w-full h-full px-3 py-3 rounded-xl border-2 text-sm md:text-base font-medium transition-all duration-200 select-none min-h-[56px] flex items-center justify-center text-center",
          isMatched &&
            "bg-green-50 border-green-500 text-green-700 cursor-default",
          !isMatched &&
            isWrong &&
            "error-shake bg-red-100 border-red-500 text-red-700",
          !isMatched &&
            !isWrong &&
            isSelected &&
            "match-pair-selected bg-primary/10 border-primary text-primary z-10",
          !isMatched &&
            !isWrong &&
            !isSelected &&
            "bg-white border-gray-300 text-gray-800 hover:border-primary hover:shadow-sm active:scale-[0.98]"
        )}
      >
        {item.text}
      </button>
    );
  };

  return (
    <div className="w-full max-w-2xl sm:max-w-3xl lg:max-w-4xl mx-auto flex flex-col flex-1 min-h-0 h-full">
      <div ref={containerRef} className="relative flex-1 flex flex-col min-h-0">
        {connectors.length > 0 && (
          <svg
            className="match-connector-svg absolute inset-0 w-full h-full pointer-events-none z-[5]"
            aria-hidden
          >
            {connectors.map((line) => (
              <g key={line.id}>
                <path
                  d={line.path}
                  className={cn(
                    "match-connector-path",
                    line.variant === "matched" && "match-connector-matched",
                    line.variant === "preview" && "match-connector-preview",
                    line.variant === "wrong" && "match-connector-wrong"
                  )}
                  pathLength={1}
                  strokeDasharray={line.variant === "matched" ? 1 : undefined}
                  strokeDashoffset={line.variant === "matched" ? 1 : undefined}
                />
              </g>
            ))}
          </svg>
        )}

        <div className="flex flex-col justify-center flex-1 min-h-0 h-full gap-3 sm:gap-4 py-6 relative z-[1]">
          {leftItems.map((leftItem, rowIndex) => {
            const rightItem = rightItems[rowIndex];
            if (!rightItem) return null;
            return (
              <div
                key={`row-${rowIndex}`}
                className="grid grid-cols-2 gap-3 md:gap-4 items-stretch"
              >
                {renderButton(
                  leftItem,
                  "left",
                  selectedLeft,
                  handleSelectLeft
                )}
                {renderButton(
                  rightItem,
                  "right",
                  selectedRight,
                  handleSelectRight
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
