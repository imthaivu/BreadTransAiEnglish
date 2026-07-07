"use client";

import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { RequireAuth, RequireRole } from "@/lib/auth/guard";
import { UserRole } from "@/lib/auth/types";
import { AudioRecorder } from "@/modules/speaking-upload/components/AudioRecorder";
import { IssueSpeakingPanel } from "@/modules/speaking-upload/components/IssueSpeakingPanel";
import { SubmissionControls } from "@/modules/speaking-upload/components/SubmissionControls";
import { useSpeakingUpload } from "@/modules/speaking-upload/hooks";
import { useEffect, useState } from "react";
import { learnActivityStore } from "@/modules/presence";
import {
  isPlaybackActive,
  isRecordingActive,
  subscribeAudioInterlock,
} from "@/lib/audio/interlock";

export default function SpeakingUploadScreen() {
  const {
    books,
    selectedBook,
    selectedLesson,
    selectedFile,
    isUploading,
    isSuccess,
    isError,
    error,
    setSelectedLesson,
    setSelectedFile,
    setReferenceDuration,
    submit,
    recorderResetToken,
    canSubmit,
    hasListenedEnough,
    currentListenCount,
    isCheckingListening,
    isSubmitted,
    lastIssueSpeaking,
    submitStage,
    uploadProgress,
  } = useSpeakingUpload();

  const submitButtonLabel = (() => {
    if (!isUploading) return "Nộp bài";
    switch (submitStage) {
      case "validating":
        return "Đang kiểm tra...";
      case "uploading":
        return uploadProgress > 0 && uploadProgress < 100
          ? `Đang nộp... ${Math.floor(uploadProgress)}%`
          : "Đang nộp...";
      case "evaluating":
        return "Đang chấm...";
      default:
        return "Đang xử lý...";
    }
  })();

  const [showIssueModal, setShowIssueModal] = useState(false);
  const [recordingActive, setRecordingActive] = useState(false);
  const [playbackActive, setPlaybackActive] = useState(false);
  const remainingListenCount = Math.max(0, 3 - currentListenCount);

  useEffect(() => {
    const syncInterlockState = () => {
      setRecordingActive(isRecordingActive());
      setPlaybackActive(isPlaybackActive());
    };
    syncInterlockState();
    return subscribeAudioInterlock(syncInterlockState);
  }, []);

  useEffect(() => {
    if (!selectedBook && !selectedLesson) return;
    const mode: "submiting" | "listening" | "speaking" | "none" = isUploading
      ? "submiting"
      : recordingActive
        ? "speaking"
        : playbackActive
          ? "listening"
          : hasListenedEnough === true || !!selectedFile
            ? "none"
            : "none";
    const bookName =
      books.find((b) => String(b.id) === String(selectedBook))?.name ||
      (selectedBook ? `Sách ${selectedBook}` : undefined);
    const lessons = selectedLesson ? [selectedLesson] : [];
    const pending = mode !== "none";

    learnActivityStore.setState({
      miniTab: "Speaking",
      mode,
      bookName,
      lessons,
      pending,
    });
  }, [
    books,
    hasListenedEnough,
    isSubmitted,
    isUploading,
    playbackActive,
    recordingActive,
    selectedBook,
    selectedFile,
    selectedLesson,
  ]);

  const handleSubmitClick = () => {
    submit();
  };

  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    if (selectedFile && !isUploading) {
      window.addEventListener("beforeunload", handleBeforeUnload);
      return () =>
        window.removeEventListener("beforeunload", handleBeforeUnload);
    }
    return () => {};
  }, [selectedFile, isUploading]);

  useEffect(() => {
    if (isSuccess && lastIssueSpeaking) {
      setShowIssueModal(true);
    }
  }, [isSuccess, lastIssueSpeaking]);

  return (
    <RequireAuth>
      <RequireRole roles={[UserRole.STUDENT, UserRole.TEACHER, UserRole.ADMIN]}>
          <div className="w-full max-w-4xl mx-auto space-y-4 sm:space-y-6 lg:space-y-8 flex flex-col items-center">
            {/* Book and Lesson Selection */}
            <div className="w-full">
              <SubmissionControls
                selectedBook={selectedBook}
                selectedLesson={selectedLesson}
                onLessonChange={setSelectedLesson}
                disabled={isUploading}
                onReferenceDurationChange={setReferenceDuration}
              />
            </div>

            {/* Audio Recorder - Only show if listened enough */}
            {selectedBook && selectedLesson && (
              <div className="w-full">
                {isCheckingListening ? (
                  <div className="w-full max-w-md mx-auto p-6 sm:p-8 rounded-2xl bg-white border border-neutral-200 shadow-sm">
                    <div className="flex flex-col items-center justify-center">
                      <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin mb-4"></div>
                      <p className="text-sm text-neutral-600">Đang kiểm tra...</p>
                    </div>
                  </div>
                ) : hasListenedEnough === false ? (
                  <div className="w-full max-w-md mx-auto p-4 sm:p-6 rounded-2xl bg-yellow-50 border-2 border-yellow-200 shadow-sm">
                    <div className="flex flex-col items-center text-center space-y-2 sm:space-y-3">
                      <h3 className="text-base sm:text-lg font-semibold text-yellow-800 mb-1 sm:mb-2">
                        Nghe thêm {remainingListenCount} lần để ghi âm.
                      </h3>
                    </div>
                  </div>
                ) : hasListenedEnough === true ? (
                  <AudioRecorder
                    key={recorderResetToken}
                    onRecordingComplete={setSelectedFile}
                    onSubmitClick={handleSubmitClick}
                    disabled={isUploading}
                  />
                ) : null}
              </div>
            )}

            {/* Status Messages */}
            {isError && (
              <div
                className="w-full p-4 text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl shadow-sm"
                role="alert"
              >
                <span className="font-semibold">Lỗi!</span>{" "}
                {error?.message || "Đã có lỗi xảy ra khi nộp bài."}
              </div>
            )}

             {/* Submit Button - Only show when audio is recorded */}
             {selectedFile && (
              <div className="w-full pt-2">
                <Button
                  onClick={handleSubmitClick}
                  disabled={!canSubmit}
                  variant="success"
                  className="relative w-full overflow-hidden px-8 py-4 text-lg font-semibold shadow-lg hover:shadow-xl transition-shadow"
                  size="lg"
                >
                  {isUploading && submitStage === "uploading" && (
                    <span
                      className="absolute inset-y-0 left-0 bg-white/25 transition-[width] duration-200 ease-out"
                      style={{ width: `${Math.min(100, Math.max(0, uploadProgress))}%` }}
                      aria-hidden
                    />
                  )}
                  <span className="relative inline-flex items-center justify-center gap-2">
                    {isUploading && (
                      <span className="inline-block h-4 w-4 rounded-full border-2 border-white/70 border-t-transparent animate-spin" aria-hidden />
                    )}
                    {submitButtonLabel}
                  </span>
                </Button>
              </div>
            )}

            {lastIssueSpeaking && (
              <div className="w-full p-4 text-sm text-amber-900 bg-amber-50 border border-amber-200 rounded-xl shadow-sm">
                <p className="font-semibold mb-2">Nhận xét của AI</p>
                <IssueSpeakingPanel issue={lastIssueSpeaking} />
              </div>
            )}

            <Modal
              open={showIssueModal}
              onClose={() => setShowIssueModal(false)}
              title="Nhận xét của AI"
              maxWidth="2xl"
            >
              <div className="space-y-4">
                <div className="p-4 text-sm text-amber-900 bg-amber-50 border border-amber-200 rounded-xl">
                  <IssueSpeakingPanel
                    issue={lastIssueSpeaking || "Chưa có nhận xét từ AI."}
                  />
                </div>
                <div className="flex justify-end">
                  <Button onClick={() => setShowIssueModal(false)} variant="primary">
                    Đóng
                  </Button>
                </div>
              </div>
            </Modal>

            
          </div>
      </RequireRole>
    </RequireAuth>
  );
}
