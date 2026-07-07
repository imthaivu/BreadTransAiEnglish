"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { SafeImage as Image } from "@/components/ui/SafeImage";
import { FiUser, FiPlay, FiList } from "react-icons/fi";
import { useAuth } from "@/lib/auth/context";
import { useQueryClient } from "@tanstack/react-query";
import type { Book } from "@/modules/flashcard/types";
import type { PendingSpeakingItem } from "../api/pending-speaking";
import {
  extractTotalScoreFromIssue,
  isAudioLikelyExpired,
} from "../utils/pending-speaking";
import { SpeakingScoreControl } from "./SpeakingScoreControl";
import { AudioPlayerWithDuration } from "./AudioPlayerWithDuration";
import { teacherClassKeys } from "../hooks";

type ViewMode = "list" | "review";

interface PendingEvaluationModalProps {
  open: boolean;
  onClose: () => void;
  items: PendingSpeakingItem[];
  isLoading?: boolean;
  books?: Book[];
  onItemGraded?: (itemId: string) => void;
}

function formatSubmittedAt(date: Date): string {
  return date.toLocaleString("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function PendingEvaluationModal({
  open,
  onClose,
  items,
  isLoading = false,
  books = [],
  onItemGraded,
}: PendingEvaluationModalProps) {
  const { session } = useAuth();
  const queryClient = useQueryClient();
  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const [localItems, setLocalItems] = useState<PendingSpeakingItem[]>(items);
  const [reviewIndex, setReviewIndex] = useState(0);

  useEffect(() => {
    setLocalItems(items);
  }, [items]);

  useEffect(() => {
    if (!open) {
      setViewMode("list");
      setReviewIndex(0);
    }
  }, [open]);

  const bookNameMap = useMemo(() => {
    const map = new Map<string, string>();
    books.forEach((b) => map.set(String(b.id), b.name));
    return map;
  }, [books]);

  const currentItem = localItems[reviewIndex] ?? null;

  const rewardParamsBase = useMemo(() => {
    const teacherId = session?.user?.id;
    if (!teacherId) return undefined;
    return {
      teacherId,
      teacherName: session?.user?.name || "Giáo viên",
      teacherAvatarUrl: session?.user?.image ?? undefined,
      classId: currentItem?.classId || "",
      studentName: currentItem?.studentName || "",
    };
  }, [session?.user, currentItem]);

  const invalidateClasses = useCallback(() => {
    const teacherId = session?.user?.id;
    if (teacherId) {
      queryClient.invalidateQueries({ queryKey: teacherClassKeys.list(teacherId) });
    }
  }, [queryClient, session?.user?.id]);

  const openReview = (index: number) => {
    setReviewIndex(index);
    setViewMode("review");
  };

  const handleScoreUpdate = (score: string | null) => {
    if (!currentItem || !score) return;
    const gradedId = currentItem.id;
    onItemGraded?.(gradedId);
    invalidateClasses();

    setLocalItems((prev) => {
      const remaining = prev.filter((it) => it.id !== gradedId);
      if (remaining.length === 0) {
        queueMicrotask(() => {
          setViewMode("list");
          onClose();
        });
      } else {
        const nextIndex = Math.min(reviewIndex, remaining.length - 1);
        queueMicrotask(() => setReviewIndex(nextIndex));
      }
      return remaining;
    });
  };

  const navigateReview = (delta: 1 | -1) => {
    const next = reviewIndex + delta;
    if (next < 0 || next >= localItems.length) return;
    setReviewIndex(next);
  };

  const listContent = (
    <div className="space-y-3">
      {isLoading ? (
        <div className="flex justify-center py-12">
          <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      ) : localItems.length === 0 ? (
        <p className="text-center text-muted py-8">Không còn bài nào chưa chấm.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gray-200">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left text-xs text-gray-600">
              <tr>
                <th className="px-3 py-2 font-medium">Học sinh</th>
                <th className="px-3 py-2 font-medium hidden sm:table-cell">Lớp</th>
                <th className="px-3 py-2 font-medium">Sách</th>
                <th className="px-3 py-2 font-medium">Bài</th>
                <th className="px-3 py-2 font-medium hidden md:table-cell">Nộp</th>
                <th className="px-3 py-2 font-medium text-right"> </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {localItems.map((item, idx) => (
                <tr key={item.id} className="hover:bg-gray-50/80">
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="relative w-7 h-7 flex-shrink-0">
                        {item.avatarUrl ? (
                          <Image
                            src={item.avatarUrl}
                            alt={item.studentName}
                            width={28}
                            height={28}
                            sizes="28px"
                            className="w-full h-full rounded-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full rounded-full bg-primary/10 flex items-center justify-center">
                            <FiUser className="w-3.5 h-3.5 text-primary" />
                          </div>
                        )}
                      </div>
                      <span className="truncate font-medium">{item.studentName}</span>
                    </div>
                  </td>
                  <td className="px-3 py-2 hidden sm:table-cell">
                    <span className="truncate text-gray-600">
                      {item.classNames.join(", ")}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-gray-700">
                    {bookNameMap.get(item.bookId) || `Sách ${item.bookId}`}
                  </td>
                  <td className="px-3 py-2">{item.lessonId}</td>
                  <td className="px-3 py-2 hidden md:table-cell text-gray-500 text-xs whitespace-nowrap">
                    {formatSubmittedAt(item.submittedAt)}
                    {isAudioLikelyExpired(item.submittedAt) && (
                      <span className="ml-1 inline-block rounded bg-amber-100 px-1 py-0.5 text-[10px] text-amber-800">
                        Audio có thể hết hạn
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => openReview(idx)}
                      className="gap-1"
                    >
                      <FiPlay className="w-3.5 h-3.5" />
                      <span className="hidden sm:inline">Nghe & chấm</span>
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );

  const reviewContent = currentItem ? (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setViewMode("list")}
          className="gap-1"
        >
          <FiList className="w-4 h-4" />
          Danh sách
        </Button>
        <span className="text-xs text-gray-500">
          {reviewIndex + 1} / {localItems.length}
        </span>
      </div>

      <div className="flex items-center gap-2">
        <div className="relative w-8 h-8 flex-shrink-0">
          {currentItem.avatarUrl ? (
            <Image
              src={currentItem.avatarUrl}
              alt={currentItem.studentName}
              width={32}
              height={32}
              sizes="32px"
              className="w-full h-full rounded-full object-cover"
            />
          ) : (
            <div className="w-full h-full rounded-full bg-primary/10 flex items-center justify-center">
              <FiUser className="w-4 h-4 text-primary" />
            </div>
          )}
        </div>
        <div className="min-w-0">
          <p className="font-medium truncate">{currentItem.studentName}</p>
          <p className="text-xs text-gray-500 truncate">
            {currentItem.classNames.join(" · ")} ·{" "}
            {bookNameMap.get(currentItem.bookId) || `Sách ${currentItem.bookId}`} · Bài{" "}
            {currentItem.lessonId}
          </p>
        </div>
      </div>

      {isAudioLikelyExpired(currentItem.submittedAt) && (
        <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
          Audio có thể đã hết hạn (nộp {formatSubmittedAt(currentItem.submittedAt)}). Storage chỉ giữ 3 ngày gần nhất.
        </p>
      )}

      <AudioPlayerWithDuration
        key={currentItem.id}
        src={currentItem.fileUrl}
        autoPlay
        initialDuration={currentItem.duration ?? 0}
        className="w-full"
        title={`Bài ${currentItem.lessonId}`}
        onPrev={reviewIndex > 0 ? () => navigateReview(-1) : undefined}
        onNext={reviewIndex < localItems.length - 1 ? () => navigateReview(1) : undefined}
        hasPrev={reviewIndex > 0}
        hasNext={reviewIndex < localItems.length - 1}
      />

      {currentItem.issueSpeaking && (
        <details className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
          <summary className="cursor-pointer font-medium text-slate-700">
            Nhận xét AI
            {extractTotalScoreFromIssue(currentItem.issueSpeaking) && (
              <span className="ml-2 text-blue-600">
                (gợi ý {extractTotalScoreFromIssue(currentItem.issueSpeaking)}/10)
              </span>
            )}
          </summary>
          <p className="mt-2 whitespace-pre-wrap text-slate-600 text-xs leading-relaxed max-h-40 overflow-y-auto">
            {currentItem.issueSpeaking}
          </p>
        </details>
      )}

      <div className="rounded-lg border border-slate-200/90 bg-slate-50/90 px-2 py-2 sm:px-5 sm:py-4">
        <div className="flex w-full min-w-0 justify-center">
          <SpeakingScoreControl
            compact
            studentId={currentItem.studentId}
            studentName={currentItem.studentName}
            bookId={currentItem.bookId}
            lessonId={currentItem.lessonId}
            aiSuggestedScore={extractTotalScoreFromIssue(currentItem.issueSpeaking)}
            currentScore={null}
            rewardParams={
              rewardParamsBase
                ? {
                    ...rewardParamsBase,
                    classId: currentItem.classId,
                    studentName: currentItem.studentName,
                  }
                : undefined
            }
            onScoreUpdate={handleScoreUpdate}
          />
        </div>
      </div>
    </div>
  ) : null;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={
        <span>
          Chưa chấm
          {localItems.length > 0 && (
            <span className="ml-2 text-sm font-normal text-gray-500">
              ({localItems.length} bài)
            </span>
          )}
        </span>
      }
      maxWidth="4xl"
      className="md:max-w-4xl"
    >
      {viewMode === "list" ? listContent : reviewContent}
    </Modal>
  );
}
