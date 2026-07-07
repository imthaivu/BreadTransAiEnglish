"use client";

import { useAuth } from "@/lib/auth/context";
import { useCallback, useEffect, useState } from "react";
import { toast } from "react-hot-toast";
import {
  createSpeakingItem,
  deleteSpeakingItem,
  deleteWritingItem,
  fetchAiUsage,
  fetchUserAiItems,
  generateText,
  generateWritingItem,
  gradeSpeakingItem,
  ocrImage,
  recordSpeakingListen,
  saveWritingItem,
  updateSpeakingItem,
  updateWritingItem,
} from "./services";
import type { AiWeeklyUsage, SpeakingItem, WritingItem, WritingKind } from "./types";
import { AI_SPEAKING_MAX, AI_WRITING_MAX } from "./types";

export function useAiHub() {
  const { session } = useAuth();
  const userId = session?.user?.id ?? "";

  const [speaking, setSpeaking] = useState<SpeakingItem[]>([]);
  const [writing, setWriting] = useState<WritingItem[]>([]);
  const [usage, setUsage] = useState<AiWeeklyUsage | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingUsage, setIsLoadingUsage] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reloadUsage = useCallback(async () => {
    if (!userId) {
      setUsage(null);
      setIsLoadingUsage(false);
      return;
    }
    try {
      setIsLoadingUsage(true);
      const data = await fetchAiUsage();
      setUsage(data);
    } catch {
      setUsage(null);
    } finally {
      setIsLoadingUsage(false);
    }
  }, [userId]);

  const reload = useCallback(async () => {
    if (!userId) {
      setSpeaking([]);
      setWriting([]);
      setIsLoading(false);
      return;
    }
    try {
      setIsLoading(true);
      setError(null);
      const data = await fetchUserAiItems(userId);
      setSpeaking(data.speaking);
      setWriting(data.writing);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Không tải được dữ liệu AI.";
      setError(msg);
    } finally {
      setIsLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    void reload();
    void reloadUsage();
  }, [reload, reloadUsage]);

  const handleOcr = useCallback(
    async (mimeType: string, base64: string) => {
      const text = await ocrImage({ mimeType, base64 });
      void reloadUsage();
      toast.success("Đã trích xuất chữ từ ảnh.");
      return text;
    },
    [reloadUsage]
  );

  const handleGenerateText = useCallback(
    async (params: { prompt: string; length?: number }) => {
      const result = await generateText(params);
      void reloadUsage();
      toast.success("Đã tạo văn bản bằng AI.");
      return result;
    },
    [reloadUsage]
  );

  const handleCreateSpeaking = useCallback(
    async (params: { title: string; text: string; voice?: string }) => {
      if (speaking.length >= AI_SPEAKING_MAX) {
        throw new Error(`Tối đa ${AI_SPEAKING_MAX} bài nói.`);
      }
      const item = await createSpeakingItem(params);
      setSpeaking((prev) => [item, ...prev].slice(0, AI_SPEAKING_MAX));
      void reloadUsage();
      toast.success("Đã lưu bài nói.");
      return item;
    },
    [speaking.length, reloadUsage]
  );

  const handleGradeSpeaking = useCallback(
    async (params: {
      itemId: string;
      audio: File;
      recordedDurationSeconds?: number;
      listenCount?: number;
    }) => {
      const result = await gradeSpeakingItem(params);
      setSpeaking((prev) =>
        prev.map((item) =>
          item.id === params.itemId
            ? { ...item, gradeHistory: [...(item.gradeHistory ?? []), result.gradeEntry] }
            : item
        )
      );
      void reloadUsage();
      toast.success("Đã chấm xong.");
      return result;
    },
    [reloadUsage]
  );

  const handleGenerateWriting = useCallback(
    async (params: {
      prompt: string;
      kind: WritingKind;
      length: number;
      imageBase64?: string;
      imageMimeType?: string;
    }) => {
      if (writing.length >= AI_WRITING_MAX) {
        throw new Error(`Tối đa ${AI_WRITING_MAX} bài viết.`);
      }
      const item = await generateWritingItem(params);
      setWriting((prev) => [item, ...prev].slice(0, AI_WRITING_MAX));
      void reloadUsage();
      toast.success("Đã lưu bài viết.");
      return item;
    },
    [writing.length, reloadUsage]
  );

  const handleSaveWriting = useCallback(
    async (params: {
      title: string;
      script: string;
      kind: WritingKind;
      length: number;
      prompt?: string;
    }) => {
      if (writing.length >= AI_WRITING_MAX) {
        throw new Error(`Tối đa ${AI_WRITING_MAX} bài viết.`);
      }
      const item = await saveWritingItem(params);
      setWriting((prev) => [item, ...prev].slice(0, AI_WRITING_MAX));
      toast.success("Đã lưu bài viết.");
      return item;
    },
    [writing.length]
  );

  const handleUpdateWriting = useCallback(
    async (params: {
      itemId: string;
      mode: "manual" | "ai";
      title?: string;
      script?: string;
      kind?: WritingKind;
      length?: number;
      instruction?: string;
    }) => {
      const item = await updateWritingItem(params);
      setWriting((prev) => prev.map((w) => (w.id === item.id ? item : w)));
      if (params.mode === "ai") void reloadUsage();
      toast.success(params.mode === "ai" ? "AI đã chỉnh sửa bài viết." : "Đã lưu thay đổi.");
      return item;
    },
    [reloadUsage]
  );

  const handleRecordListen = useCallback(async (itemId: string) => {
    try {
      const listenCount = await recordSpeakingListen(itemId);
      setSpeaking((prev) =>
        prev.map((s) => (s.id === itemId ? { ...s, listenCount } : s))
      );
      return listenCount;
    } catch {
      return undefined;
    }
  }, []);

  const handleUpdateSpeaking = useCallback(
    async (params: { itemId: string; title?: string; text?: string; voice?: string }) => {
      const item = await updateSpeakingItem(params);
      setSpeaking((prev) => prev.map((s) => (s.id === item.id ? item : s)));
      void reloadUsage();
      toast.success("Đã lưu bài nói.");
      return item;
    },
    [reloadUsage]
  );

  const handleDeleteSpeaking = useCallback(async (itemId: string) => {
    await deleteSpeakingItem(itemId);
    setSpeaking((prev) => prev.filter((item) => item.id !== itemId));
    toast.success("Đã xóa bài nói.");
  }, []);

  const handleDeleteWriting = useCallback(async (itemId: string) => {
    await deleteWritingItem(itemId);
    setWriting((prev) => prev.filter((item) => item.id !== itemId));
    toast.success("Đã xóa bài viết.");
  }, []);

  return {
    userId,
    speaking,
    writing,
    usage,
    isLoading,
    isLoadingUsage,
    error,
    reload,
    reloadUsage,
    speakingCount: speaking.length,
    writingCount: writing.length,
    canCreateSpeaking: speaking.length < AI_SPEAKING_MAX,
    canCreateWriting: writing.length < AI_WRITING_MAX,
    ocrImage: handleOcr,
    generateText: handleGenerateText,
    createSpeaking: handleCreateSpeaking,
    gradeSpeaking: handleGradeSpeaking,
    recordListen: handleRecordListen,
    generateWriting: handleGenerateWriting,
    saveWriting: handleSaveWriting,
    updateWriting: handleUpdateWriting,
    updateSpeaking: handleUpdateSpeaking,
    deleteSpeaking: handleDeleteSpeaking,
    deleteWriting: handleDeleteWriting,
  };
}
