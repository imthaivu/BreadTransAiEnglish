"use client";

import { useState, useRef, useEffect, useCallback } from "react";
// Gói `webm-duration-fix` trên npm không nhận tham số duration (ms); dùng `fix-webm-duration` cho wall-clock như Safari/iOS.
import fixWebmDuration from "fix-webm-duration";
import {
  registerStopRecordingHandler,
  requestPausePlayback,
  setRecordingActive,
} from "@/lib/audio/interlock";

export type RecordingStatus = "idle" | "recording" | "paused" | "stopped";

export type RecordingCompleteHandler = (
  blob: Blob,
  durationSeconds: number
) => void;

const RECORDING_TIMESLICE_MS = 250;

function isAppleTouchDevice(): boolean {
  if (typeof navigator === "undefined") return false;
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
  );
}

function isMediaRecorderAvailable(): boolean {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return Boolean((window as any).MediaRecorder);
}

export function useAudioRecorder(onRecordingComplete?: RecordingCompleteHandler) {
  const [status, setStatus] = useState<RecordingStatus>("idle");
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [duration, setDuration] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const timerIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const recordingStartedAtRef = useRef<number>(0);
  const recordingStoppedAtRef = useRef<number | null>(null);
  const onRecordingCompleteRef = useRef(onRecordingComplete);

  useEffect(() => {
    onRecordingCompleteRef.current = onRecordingComplete;
  }, [onRecordingComplete]);

  const stopStream = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
  }, []);

  const chooseSupportedMimeType = (): string | undefined => {
    // Safari/iOS ổn định hơn khi để browser chọn default container.
    if (isAppleTouchDevice()) {
      return undefined;
    }

    const candidates = [
      "audio/webm;codecs=opus",
      "audio/webm",
      "audio/mp4",
      "audio/aac",
      "audio/ogg;codecs=opus",
      "audio/ogg",
      "audio/mpeg",
      "video/mp4",
    ];
    for (const type of candidates) {
      if (isMediaRecorderAvailable() && MediaRecorder.isTypeSupported(type)) {
        return type;
      }
    }
    return undefined;
  };

  const clearRecordingTimer = useCallback(() => {
    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }
  }, []);

  const requestFinalRecorderData = (recorder: MediaRecorder) => {
    try {
      recorder.requestData();
    } catch {
      // requestData không có trên mọi browser.
    }
  };

  const stopRecording = useCallback(() => {
    const recorder = mediaRecorderRef.current;
    if (!recorder || recorder.state !== "recording") {
      return;
    }

    const stopTimestamp = Date.now();
    recordingStoppedAtRef.current = stopTimestamp;
    clearRecordingTimer();

    const finalDurationSeconds = Math.max(
      1,
      Math.ceil((stopTimestamp - recordingStartedAtRef.current) / 1000)
    );
    setDuration(finalDurationSeconds);
    requestFinalRecorderData(recorder);
    recorder.stop();
  }, [clearRecordingTimer]);

  const stopRecordingRef = useRef(stopRecording);
  stopRecordingRef.current = stopRecording;

  const startRecording = async () => {
    requestPausePlayback();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mimeType = chooseSupportedMimeType();
      const recorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;
      const chunks: Blob[] = [];

      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          chunks.push(event.data);
        }
      };

      recorder.onstop = async () => {
        clearRecordingTimer();

        const finalType = recorder.mimeType || chunks[0]?.type || "audio/webm";
        let blob = new Blob(chunks, { type: finalType });

        const stopTimestamp = recordingStoppedAtRef.current ?? Date.now();
        const durationMs = Math.max(
          0,
          stopTimestamp - recordingStartedAtRef.current
        );
        const finalDurationSeconds = Math.max(
          1,
          Math.ceil(durationMs / 1000)
        );

        const isWebm =
          finalType.includes("webm") || (blob.type && blob.type.includes("webm"));
        if (isWebm) {
          try {
            blob = await fixWebmDuration(blob, durationMs);
          } catch (e) {
            console.warn("fixWebmDuration failed, using raw blob:", e);
          }
        }

        setDuration(finalDurationSeconds);
        setAudioBlob(blob);
        setStatus("stopped");
        onRecordingCompleteRef.current?.(blob, finalDurationSeconds);

        stopStream();
        mediaRecorderRef.current = null;
      };

      recordingStartedAtRef.current = Date.now();
      recordingStoppedAtRef.current = null;
      recorder.start(RECORDING_TIMESLICE_MS);
      setStatus("recording");
      setDuration(0);
      timerIntervalRef.current = setInterval(() => {
        const elapsedSeconds = Math.max(
          0,
          Math.floor((Date.now() - recordingStartedAtRef.current) / 1000)
        );
        setDuration(elapsedSeconds);
      }, 250);
      return true;
    } catch (error) {
      console.warn("startRecording failed:", error);
      stopStream();
      mediaRecorderRef.current = null;
      return false;
    }
  };

  const resetRecording = () => {
    clearRecordingTimer();

    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state === "recording") {
      recordingStoppedAtRef.current = Date.now();
      requestFinalRecorderData(recorder);
      recorder.stop();
    } else {
      stopStream();
      mediaRecorderRef.current = null;
    }

    setAudioBlob(null);
    setStatus("idle");
    setDuration(0);
  };

  useEffect(() => {
    registerStopRecordingHandler(() => stopRecordingRef.current());
    return () => registerStopRecordingHandler(null);
  }, []);

  useEffect(() => {
    setRecordingActive(status === "recording");
  }, [status]);

  useEffect(() => {
    return () => {
      clearRecordingTimer();
      stopStream();
      setRecordingActive(false);
    };
  }, [clearRecordingTimer, stopStream]);

  return {
    status,
    audioBlob,
    duration,
    startRecording,
    stopRecording,
    resetRecording,
  };
}
