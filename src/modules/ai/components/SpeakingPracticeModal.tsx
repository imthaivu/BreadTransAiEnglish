"use client";

import AudioPlayer from "@/components/streamline/AudioPlayer";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { AudioRecorder } from "@/modules/speaking-upload/components/AudioRecorder";
import { useCallback, useMemo, useState } from "react";
import { toast } from "react-hot-toast";
import type { SpeakingItem } from "../types";
import { AI_MIN_LISTEN_COUNT } from "../types";

type SpeakingPracticeModalProps = {
  item: SpeakingItem;
  onClose: () => void;
  onGrade: (params: {
    itemId: string;
    audio: File;
    recordedDurationSeconds?: number;
    listenCount: number;
  }) => Promise<{ issue: string }>;
  onRecordListen?: (itemId: string) => Promise<number | undefined>;
};

export function SpeakingPracticeModal({
  item,
  onClose,
  onGrade,
  onRecordListen,
}: SpeakingPracticeModalProps) {
  const [listenCount, setListenCount] = useState(item.listenCount ?? 0);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [recordedDuration, setRecordedDuration] = useState(0);
  const [isGrading, setIsGrading] = useState(false);
  const [lastIssue, setLastIssue] = useState<string | null>(null);
  const [recorderResetToken, setRecorderResetToken] = useState(0);

  const hasListenedEnough = listenCount >= AI_MIN_LISTEN_COUNT;
  const remainingListen = Math.max(0, AI_MIN_LISTEN_COUNT - listenCount);

  const gradeHistory = useMemo(
    () => (item?.gradeHistory ?? []).slice().reverse(),
    [item?.gradeHistory]
  );

  const handleListenCompleted = useCallback(() => {
    setListenCount((c) => {
      if (c < AI_MIN_LISTEN_COUNT && item && onRecordListen) {
        void onRecordListen(item.id);
      }
      return c + 1;
    });
  }, [item, onRecordListen]);

  const handleRecordingComplete = useCallback((file: File | null, duration?: number) => {
    setSelectedFile(file);
    setRecordedDuration(duration ?? 0);
  }, []);

  const handleGrade = async () => {
    if (!item || !selectedFile) return;
    if (!hasListenedEnough) {
      toast.error(`Nghe thêm ${remainingListen} lần để ghi âm.`);
      return;
    }
    try {
      setIsGrading(true);
      const result = await onGrade({
        itemId: item.id,
        audio: selectedFile,
        recordedDurationSeconds: recordedDuration,
        listenCount,
      });
      setLastIssue(result.issue);
      setSelectedFile(null);
      setRecorderResetToken((t) => t + 1);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Chấm điểm thất bại.");
    } finally {
      setIsGrading(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={item.title}
      subtitle="Nghe mẫu → ghi âm → chấm điểm"
      maxWidth="2xl"
    >
      <div className="space-y-5">
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700 whitespace-pre-wrap">
          {item.script}
        </div>

        <AudioPlayer
          audioFiles={[item.audioUrl]}
          hideLessonList
          onListenCompleted={handleListenCompleted}
          className="rounded-lg border border-slate-200 p-3"
        />

        <p className="text-sm text-slate-600">
          {hasListenedEnough ? (
            <span className="font-medium text-emerald-700">Đã nghe đủ {AI_MIN_LISTEN_COUNT} lần — có thể ghi âm.</span>
          ) : (
            <>Nghe thêm <span className="font-semibold">{remainingListen}</span> lần để ghi âm ({listenCount}/{AI_MIN_LISTEN_COUNT}).</>
          )}
        </p>

        {hasListenedEnough ? (
          <AudioRecorder
            key={recorderResetToken}
            disabled={isGrading}
            onRecordingComplete={handleRecordingComplete}
          />
        ) : null}

        {selectedFile ? (
          <Button
            type="button"
            variant="success"
            className="w-full"
            disabled={isGrading}
            onClick={() => void handleGrade()}
          >
            {isGrading ? "Đang chấm…" : "Chấm điểm"}
          </Button>
        ) : null}

        {lastIssue ? (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 whitespace-pre-wrap">
            <p className="mb-1 font-semibold">Nhận xét mới nhất</p>
            {lastIssue}
          </div>
        ) : null}

        {gradeHistory.length > 0 ? (
          <div className="space-y-2">
            <p className="text-sm font-semibold text-slate-800">Lịch sử chấm ({gradeHistory.length})</p>
            <div className="max-h-48 space-y-2 overflow-y-auto">
              {gradeHistory.map((entry) => (
                <div
                  key={entry.id}
                  className="rounded-md border border-slate-200 bg-white p-2 text-xs text-slate-700"
                >
                  <div className="mb-1 flex items-center justify-between text-slate-500">
                    <span>{new Date(entry.at).toLocaleString("vi-VN")}</span>
                    {entry.score != null ? (
                      <span className="font-semibold text-sky-700">{entry.score}/10</span>
                    ) : null}
                  </div>
                  <p className="whitespace-pre-wrap">{entry.issue}</p>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </Modal>
  );
}
