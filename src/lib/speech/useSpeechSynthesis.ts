"use client";

import { useCallback, useEffect, useRef, useState } from "react";

function pickEnglishVoice(voices: SpeechSynthesisVoice[]): SpeechSynthesisVoice | null {
  const preferLangs = ["en-US", "en-GB", "en_US", "en_GB"];
  const preferNames = ["Samantha", "Alex", "Victoria", "Daniel", "Moira", "Fred", "Serena"];
  return (
    voices.find((v) => preferLangs.includes(v.lang)) ||
    voices.find((v) => v.lang?.toLowerCase().startsWith("en")) ||
    voices.find((v) => preferNames.some((n) => v.name.includes(n))) ||
    voices[0] ||
    null
  );
}

export function useSpeechSynthesis() {
  const englishVoiceRef = useRef<SpeechSynthesisVoice | null>(null);
  const [isSupported, setIsSupported] = useState(false);
  const [speakingText, setSpeakingText] = useState<string | null>(null);
  const mountedRef = useRef(true);
  const queueRef = useRef<string[]>([]);
  const isQueueRunningRef = useRef(false);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (typeof window !== "undefined" && "speechSynthesis" in window) {
        speechSynthesis.cancel();
      }
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) {
      setIsSupported(false);
      return;
    }

    setIsSupported(true);

    const loadVoices = () => {
      const voices = speechSynthesis.getVoices();
      if (voices.length) {
        englishVoiceRef.current = pickEnglishVoice(voices);
        return true;
      }
      return false;
    };

    if (!loadVoices()) {
      const interval = setInterval(() => {
        if (loadVoices()) clearInterval(interval);
      }, 250);

      const onVoicesChanged = () => {
        if (loadVoices()) clearInterval(interval);
      };
      speechSynthesis.onvoiceschanged = onVoicesChanged;

      return () => {
        clearInterval(interval);
        if (speechSynthesis.onvoiceschanged === onVoicesChanged) {
          speechSynthesis.onvoiceschanged = null;
        }
      };
    }
  }, []);

  const createUtterance = useCallback((text: string): SpeechSynthesisUtterance | null => {
    try {
      const utter = new SpeechSynthesisUtterance(text);
      const chosen = englishVoiceRef.current;
      if (chosen) {
        utter.voice = chosen;
        utter.lang = chosen.lang;
      } else {
        utter.lang = "en-US";
      }
      utter.rate = 0.9;
      utter.pitch = 1.0;
      utter.volume = 1.0;
      return utter;
    } catch {
      return null;
    }
  }, []);

  const runNextInQueue = useCallback(() => {
    const next = queueRef.current.shift();
    if (!next) {
      isQueueRunningRef.current = false;
      if (mountedRef.current) setSpeakingText(null);
      return;
    }

    if (typeof window === "undefined" || !("speechSynthesis" in window)) {
      isQueueRunningRef.current = false;
      return;
    }

    const utter = createUtterance(next);
    if (!utter) {
      runNextInQueue();
      return;
    }

    if (mountedRef.current) setSpeakingText(next);

    utter.onend = () => {
      if (!mountedRef.current) return;
      setTimeout(runNextInQueue, 350);
    };
    utter.onerror = () => {
      if (!mountedRef.current) return;
      runNextInQueue();
    };

    try {
      speechSynthesis.speak(utter);
    } catch {
      runNextInQueue();
    }
  }, [createUtterance]);

  const speak = useCallback(
    (text: string) => {
      if (typeof window === "undefined" || !("speechSynthesis" in window)) return;

      const trimmed = text.trim();
      if (!trimmed) return;

      queueRef.current = [];
      isQueueRunningRef.current = false;

      if (speechSynthesis.speaking || speechSynthesis.pending) {
        speechSynthesis.cancel();
      }

      const voices = speechSynthesis.getVoices();
      if (voices.length > 0 && !englishVoiceRef.current) {
        englishVoiceRef.current = pickEnglishVoice(voices);
      }

      const utter = createUtterance(trimmed);
      if (!utter) return;

      if (mountedRef.current) setSpeakingText(trimmed);

      utter.onend = () => {
        if (mountedRef.current) setSpeakingText(null);
      };
      utter.onerror = () => {
        if (mountedRef.current) setSpeakingText(null);
      };

      try {
        speechSynthesis.speak(utter);
      } catch {
        if (mountedRef.current) setSpeakingText(null);
      }
    },
    [createUtterance]
  );

  const speakSequence = useCallback(
    (words: string[]) => {
      const list = words.map((w) => w.trim()).filter(Boolean);
      if (!list.length) return;

      if (typeof window === "undefined" || !("speechSynthesis" in window)) return;

      if (speechSynthesis.speaking || speechSynthesis.pending) {
        speechSynthesis.cancel();
      }

      queueRef.current = [...list];
      isQueueRunningRef.current = true;
      runNextInQueue();
    },
    [runNextInQueue]
  );

  const cancel = useCallback(() => {
    queueRef.current = [];
    isQueueRunningRef.current = false;
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      speechSynthesis.cancel();
    }
    if (mountedRef.current) setSpeakingText(null);
  }, []);

  return {
    isSupported,
    speakingText,
    speak,
    speakSequence,
    cancel,
  };
}
