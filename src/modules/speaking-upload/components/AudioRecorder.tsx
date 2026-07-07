"use client";

import { FiMic, FiTrash2 } from "react-icons/fi";
import { useAudioRecorder } from "../hooks/useAudioRecorder";
import { useCallback, useEffect, useRef, useState } from "react";
import { SPEAKING_MAX_FILE_BYTES, SPEAKING_MIN_FILE_BYTES } from "../types";
import ConfirmDialog from "@/components/ui/ConfirmDialog";

interface AudioRecorderProps {
  onRecordingComplete: (audioFile: File | null, duration?: number) => void;
  onSubmitClick?: () => void;
  disabled?: boolean;
}

function extensionFromBlobType(type: string): string {
  if (type.includes("mpeg") || type.includes("mp3")) return "mp3";
  if (type.includes("ogg")) return "ogg";
  if (type.includes("wav")) return "wav";
  if (type.includes("mp4") || type.includes("m4a") || type.includes("aac")) {
    return "m4a";
  }
  return "webm";
}

export function AudioRecorder({
  onRecordingComplete,
  disabled,
}: AudioRecorderProps) {
  const onRecordingCompleteRef = useRef(onRecordingComplete);
  const [error, setError] = useState<string | null>(null);
  const [showConfirmReset, setShowConfirmReset] = useState<boolean>(false);
  const [completedBlob, setCompletedBlob] = useState<Blob | null>(null);

  useEffect(() => {
    onRecordingCompleteRef.current = onRecordingComplete;
  }, [onRecordingComplete]);

  const handleRecorderComplete = useCallback((blob: Blob, durationSeconds: number) => {
    if (blob.size > SPEAKING_MAX_FILE_BYTES) {
      setError("Bản ghi vượt quá 15MB. Vui lòng ghi lại ngắn hơn.");
      setCompletedBlob(null);
      return;
    }
    if (blob.size < SPEAKING_MIN_FILE_BYTES) {
      setError("Bản ghi quá ngắn hoặc lỗi mic/trình duyệt. Vui lòng ghi âm lại.");
      setCompletedBlob(null);
      onRecordingCompleteRef.current(null, 0);
      return;
    }

    setError(null);
    setCompletedBlob(blob);
    const ext = extensionFromBlobType(blob.type || "audio/webm");
    const audioFile = new File([blob], `recording.${ext}`, {
      type: blob.type || "audio/webm",
    });
    onRecordingCompleteRef.current(audioFile, durationSeconds);
  }, []);

  const {
    status,
    audioBlob,
    duration,
    startRecording,
    stopRecording,
    resetRecording,
  } = useAudioRecorder(handleRecorderComplete);

  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    if (status === "recording") {
      window.addEventListener("beforeunload", handleBeforeUnload);
      return () =>
        window.removeEventListener("beforeunload", handleBeforeUnload);
    }
    return () => {};
  }, [status]);

  const formatTime = (seconds: number) => {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes.toString().padStart(2, "0")}:${remainingSeconds
      .toString()
      .padStart(2, "0")}`;
  };

  const handleReset = () => {
    resetRecording();
    setCompletedBlob(null);
    onRecordingComplete(null, 0);
    setShowConfirmReset(false);
  };

  const handleStartRecording = async () => {
    const started = await startRecording();
    if (!started) {
      return;
    }

    setError(null);
    setCompletedBlob(null);
  };

  const hasRecording = !!(completedBlob ?? audioBlob);

  return (
    <>
      <div className="w-full max-w-md mx-auto">
        {/* Main Recording Area */}
        <div className="flex flex-col items-center justify-center p-4 rounded-lg bg-gradient-to-br from-gray-50 to-gray-100 border border-gray-200 shadow-sm">
          {/* Timer Display - Fixed height to prevent layout shift */}
          <div className="h-10 mb-3 flex items-center justify-center">
            {(status === "recording" || status === "stopped") && (
              <div
                className={`text-2xl font-mono font-semibold ${
                  status === "recording"
                    ? "text-red-500 animate-pulse"
                    : "text-gray-700"
                }`}
              >
                {formatTime(duration)}
              </div>
            )}
          </div>

          {/* Main Record Button - Fixed height */}
          <div className="relative mb-3 h-16 flex items-center justify-center">
            {status === "idle" && (
              <button
                onClick={handleStartRecording}
                disabled={disabled}
                className={`
                  w-16 h-16 rounded-full bg-red-500 text-white
                  flex items-center justify-center
                  shadow-lg hover:shadow-xl
                  transition-all duration-200
                  hover:scale-105 active:scale-95
                  hover:bg-red-600
                  disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100
                  focus:outline-none focus:ring-4 focus:ring-red-500/30
                `}
              >
                <FiMic className="w-7 h-7" />
              </button>
            )}

            {status === "recording" && (
              <button
                onClick={stopRecording}
                className="
                  w-16 h-16 rounded-full bg-red-500 text-white
                  flex items-center justify-center
                  shadow-lg hover:shadow-xl
                  transition-all duration-200
                  hover:scale-105 active:scale-95
                  focus:outline-none focus:ring-4 focus:ring-red-500/30
                  animate-pulse
                "
              >
                <div className="w-6 h-6 bg-white rounded-sm" />
              </button>
            )}

            {status === "stopped" && hasRecording && !error && (
              <button
                onClick={() => setShowConfirmReset(true)}
                className="
                  w-12 h-12 rounded-full bg-red-500 text-white
                  flex items-center justify-center
                  shadow-md hover:shadow-lg
                  transition-all duration-200
                  hover:scale-105 active:scale-95
                  hover:bg-red-600
                  focus:outline-none focus:ring-4 focus:ring-red-300/30
                "
                title="Ghi lại"
              >
                <FiTrash2 className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* Status Text - Fixed height */}
          <div className="text-center h-5 flex items-center justify-center">
            {status === "idle" && (
              <p className="text-xs text-gray-600 font-medium">
                Nhấn để ghi âm
              </p>
            )}
            {status === "recording" && (
              <p className="text-xs text-red-600 font-medium">Đang ghi âm...</p>
            )}
            {status === "stopped" && hasRecording && !error && (
              <p className="text-xs text-green-600 font-medium">
                Ghi âm xong
              </p>
            )}
          </div>

          {/* Error Message */}
          {error && (
            <div className="mt-3 p-2.5 rounded-lg bg-red-50 border border-red-200">
              <p className="text-xs text-red-600 font-medium text-center">
                {error}
              </p>
            </div>
          )}

        </div>
      </div>

      <ConfirmDialog
        isOpen={showConfirmReset}
        message="Bạn có chắc chắn muốn xóa bản ghi hiện tại và ghi âm lại không?"
        onClose={() => setShowConfirmReset(false)}
        onConfirm={handleReset}
        title="Xác nhận ghi âm lại"
      />
    </>
  );
}
