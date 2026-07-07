"use client";

import { Button } from "@/components/ui/Button";
import { cn } from "@/utils";
import { FiMic, FiTrash2, FiEdit3, FiEdit2 } from "react-icons/fi";
import { useState } from "react";
import { useAiHub } from "../hooks";
import type { AiWeeklyUsage, WritingItem } from "../types";
import { AI_SPEAKING_MAX, AI_WRITING_MAX } from "../types";
import { CreateSpeakingModal } from "./CreateSpeakingModal";
import { CreateWritingModal } from "./CreateWritingModal";
import { EditSpeakingModal } from "./EditSpeakingModal";
import { EditWritingModal } from "./EditWritingModal";
import { SpeakingPracticeModal } from "./SpeakingPracticeModal";

function formatDate(iso: string) {
  try {
    return new Date(iso).toLocaleDateString("vi-VN", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

function AiWeeklyUsageBadge({
  usage,
  isLoading,
}: {
  usage: AiWeeklyUsage | null;
  isLoading: boolean;
}) {
  if (isLoading) {
    return <div className="h-7 w-56 animate-pulse rounded-lg bg-slate-100" aria-hidden />;
  }
  if (!usage) return null;

  const tone =
    usage.remaining === 0
      ? "border-red-200 bg-red-50 text-red-800"
      : usage.remaining <= 5
        ? "border-amber-200 bg-amber-50 text-amber-900"
        : "border-blue-200 bg-blue-50/80 text-blue-900";

  return (
    <span className={cn("rounded-lg border px-2.5 py-1.5 text-xs font-semibold", tone)}>
      Còn {usage.remaining}/{usage.limit} lượt trong tuần.
    </span>
  );
}

export function AiHubScreen() {
  const {
    speaking,
    writing,
    usage,
    isLoading,
    isLoadingUsage,
    error,
    canCreateSpeaking,
    canCreateWriting,
    ocrImage,
    generateText,
    createSpeaking,
    gradeSpeaking,
    recordListen,
    saveWriting,
    updateWriting,
    updateSpeaking,
    deleteSpeaking,
    deleteWriting,
  } = useAiHub();

  const [speakingModalOpen, setSpeakingModalOpen] = useState(false);
  const [writingModalOpen, setWritingModalOpen] = useState(false);
  const [practiceItemId, setPracticeItemId] = useState<string | null>(null);
  const [expandedWriting, setExpandedWriting] = useState<WritingItem | null>(null);
  const [editWritingId, setEditWritingId] = useState<string | null>(null);
  const [editSpeakingId, setEditSpeakingId] = useState<string | null>(null);

  const practiceItem = speaking.find((s) => s.id === practiceItemId) ?? null;
  const editWritingItem = writing.find((w) => w.id === editWritingId) ?? null;
  const editSpeakingItem = speaking.find((s) => s.id === editSpeakingId) ?? null;
  const outOfQuota = usage?.remaining === 0;

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6 px-2 py-4 sm:px-4">
      <header className="space-y-2">
        <h1 className="text-2xl font-bold text-slate-900">Soạn bài nói, bài viết nhanh với AI </h1>
       
        <AiWeeklyUsageBadge usage={usage} isLoading={isLoadingUsage} />
      </header>

      <div className="flex flex-wrap gap-3">
        <Button
          type="button"
          variant="primary"
          className="inline-flex items-center gap-2"
          disabled={outOfQuota}
          title={outOfQuota ? "Hết lượt AI tuần này" : undefined}
          onClick={() => setSpeakingModalOpen(true)}
        >
          <FiMic className="h-4 w-4" />
          Tạo bài nói mẫu
        </Button>
        <Button
          type="button"
          variant="secondary"
          className="inline-flex items-center gap-2"
          disabled={outOfQuota}
          title={outOfQuota ? "Hết lượt AI tuần này" : undefined}
          onClick={() => setWritingModalOpen(true)}
        >
          <FiEdit3 className="h-4 w-4" />
          Tạo bài viết mẫu
        </Button>
      </div>

      {isLoading ? (
        <div className="h-24 animate-pulse rounded-lg bg-slate-100" aria-hidden />
      ) : null}
      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-800">
            Bài nói ({speaking.length}/{AI_SPEAKING_MAX})
          </h2>
        </div>
        {speaking.length === 0 && !isLoading ? (
          <p className="text-sm text-slate-400">Chưa có bài nói nào.</p>
        ) : (
          <ul className="space-y-2">
            {speaking.map((item) => (
              <li
                key={item.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-3 py-3 shadow-sm"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-slate-900">{item.title}</p>
                  <p className="text-xs text-slate-500">
                    {formatDate(item.createdAt)}
                    {(item.gradeHistory?.length ?? 0) > 0
                      ? ` · ${item.gradeHistory.length} lần chấm`
                      : ""}
                  </p>
                </div>
                <div className="flex shrink-0 gap-2">
                  <Button type="button" size="sm" onClick={() => setPracticeItemId(item.id)}>
                    Nói thử và chấm 
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    aria-label="Sửa"
                    onClick={() => setEditSpeakingId(item.id)}
                  >
                    Sửa
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="destructive"
                    aria-label="Xóa"
                    onClick={() => void deleteSpeaking(item.id)}
                  >
                    <FiTrash2 className="h-4 w-4" />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-slate-800">
          Bài viết ({writing.length}/{AI_WRITING_MAX})
        </h2>
        {writing.length === 0 && !isLoading ? (
          <p className="text-sm text-slate-400">Chưa có bài viết nào.</p>
        ) : (
          <ul className="space-y-2">
            {writing.map((item) => (
              <li
                key={item.id}
                className="rounded-lg border border-slate-200 bg-white px-3 py-3 shadow-sm"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-slate-900">{item.title}</p>
                    <p className="text-xs text-slate-500">
                      {item.kind === "essay" ? "Bài văn" : "Đoạn văn"} ·{" "}
                      {item.length} từ · {formatDate(item.createdAt)}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        setExpandedWriting((prev) => (prev?.id === item.id ? null : item))
                      }
                    >
                      {expandedWriting?.id === item.id ? "Thu gọn" : "Xem"}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      aria-label="Sửa"
                      onClick={() => setEditWritingId(item.id)}
                    >
                      <FiEdit2 className="h-4 w-4" />
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="destructive"
                      aria-label="Xóa"
                      onClick={() => void deleteWriting(item.id)}
                    >
                      <FiTrash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                {expandedWriting?.id === item.id ? (
                  <div
                    className={cn(
                      "mt-3 rounded-md border border-slate-100 bg-slate-50 p-3 text-sm",
                      "leading-relaxed text-slate-700 whitespace-pre-wrap"
                    )}
                  >
                    {item.script}
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      <CreateSpeakingModal
        open={speakingModalOpen}
        onClose={() => setSpeakingModalOpen(false)}
        canCreate={canCreateSpeaking && !outOfQuota}
        onCreate={createSpeaking}
        onOcr={ocrImage}
        onGenerateText={generateText}
      />

      <CreateWritingModal
        open={writingModalOpen}
        onClose={() => setWritingModalOpen(false)}
        canCreate={canCreateWriting && !outOfQuota}
        onSave={saveWriting}
        onOcr={ocrImage}
        onGenerateText={generateText}
      />

      {practiceItem ? (
        <SpeakingPracticeModal
          key={practiceItem.id}
          item={practiceItem}
          onClose={() => setPracticeItemId(null)}
          onGrade={gradeSpeaking}
          onRecordListen={recordListen}
        />
      ) : null}

      <EditWritingModal
        open={!!editWritingId}
        item={editWritingItem}
        onClose={() => setEditWritingId(null)}
        onUpdate={updateWriting}
      />

      <EditSpeakingModal
        open={!!editSpeakingId}
        item={editSpeakingItem}
        onClose={() => setEditSpeakingId(null)}
        onUpdate={updateSpeaking}
      />
    </div>
  );
}
