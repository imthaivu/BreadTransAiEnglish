"use client";

import { FiChevronLeft } from "react-icons/fi";

interface LearningViewLayoutProps {
  onBack: () => void;
  /** Quiz: % tiến độ 0–100 */
  progress?: number;
  /** Quiz: title giai đoạn (chữ) */
  stageTitle?: string;
  /** Quiz: vị trí % đường kẻ phân giai đoạn (0–100, không gồm 0 và 100) */
  stageBoundaries?: number[];
  children: React.ReactNode;
}

const backButtonClass =
  "flex-shrink-0 flex items-center justify-center w-10 h-10 rounded-lg bg-yellow-400 text-yellow-900 shadow-sm hover:bg-yellow-500 active:bg-yellow-600 transition-colors";

export function LearningViewLayout({
  onBack,
  progress,
  stageTitle,
  stageBoundaries,
  children,
}: LearningViewLayoutProps) {
  const hasLearningHeader = progress !== undefined || stageTitle !== undefined;

  if (hasLearningHeader) {
    return (
      <div className="relative w-full flex-1 min-h-0 h-full bg-white flex flex-col">
        <div className="w-full px-2 sm:px-3 pt-3 pb-2">
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={onBack}
                aria-label="Quay lại"
                className={backButtonClass}
              >
                <FiChevronLeft className="w-6 h-6" />
              </button>
              <div
                className="relative flex-1 min-w-0 h-4 bg-gray-100 rounded-full overflow-hidden border-2 border-primary/35"
                role="progressbar"
                aria-valuenow={progress ?? 0}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label="Tiến độ học"
              >
                <div
                  className="h-full bg-primary rounded-full transition-all duration-500 ease-out"
                  style={{ width: `${progress ?? 0}%` }}
                />
                {stageBoundaries?.map((boundary) => (
                  <div
                    key={boundary}
                    className="absolute top-0 bottom-0 w-1 -translate-x-1/2 bg-yellow-500 pointer-events-none z-10"
                    style={{ left: `${boundary}%` }}
                    aria-hidden
                  />
                ))}
              </div>
            </div>
            {stageTitle ? (
              <p className="w-full text-3xl my-3 font-semibold text-gray-700 truncate">
                {stageTitle}
              </p>
            ) : null}
          </div>
        </div>

        <div className="flex-1 w-full px-2 sm:px-3 pb-2 flex flex-col min-h-0">
          {children}
        </div>
      </div>
    );
  }

  return (
    <div className="relative w-full min-h-[calc(100vh-140px)] bg-white flex flex-col">
      <button
        type="button"
        onClick={onBack}
        aria-label="Quay lại"
        className={`absolute top-3 left-3 z-10 ${backButtonClass}`}
      >
        <FiChevronLeft className="w-6 h-6" />
      </button>

      <div className="flex-1 w-full px-2 sm:px-3 pt-14 pb-2 flex flex-col min-h-0 h-full">
        {children}
      </div>
    </div>
  );
}
