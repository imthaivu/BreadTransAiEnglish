import { LessonStatus } from "./types";

/**
 * Phát hiện iOS Safari (bao gồm iPhone 8 và các thiết bị iOS cũ)
 */
export function isIOSSafari(): boolean {
  if (typeof window === "undefined") return false;

  const ua = window.navigator.userAgent;
  const isIOS = /iPad|iPhone|iPod/.test(ua);
  const isSafari = /Safari/.test(ua) && !/Chrome|CriOS|FxiOS/.test(ua);

  return isIOS && isSafari;
}

/**
 * Kiểm tra xem speech synthesis có sẵn và hoạt động không
 */
export function isSpeechSynthesisAvailable(): boolean {
  if (typeof window === "undefined") return false;
  if (!("speechSynthesis" in window)) return false;

  try {
    const voices = window.speechSynthesis.getVoices();
    return voices.length > 0;
  } catch {
    return false;
  }
}

/**
 * Test xem speech synthesis có thực sự phát được âm thanh không
 * Trả về Promise<boolean> - true nếu hoạt động, false nếu không
 * 
 * Cách test: Thử phát một utterance ngắn và kiểm tra events
 */
export function testSpeechSynthesisWorking(): Promise<boolean> {
  return new Promise((resolve) => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) {
      resolve(false);
      return;
    }

    try {
      const synth = window.speechSynthesis;

      // Nếu đang speaking, cancel trước
      if (synth.speaking || synth.pending) {
        synth.cancel();
      }

      // Tạo một utterance test rất ngắn (1 ký tự)
      const testUtter = new SpeechSynthesisUtterance("a");
      testUtter.volume = 1.0;
      testUtter.rate = 2.0; // Nhanh hơn để test nhanh

      // Lấy voices
      const voices = synth.getVoices();
      if (voices.length > 0) {
        // Tìm English voice
        const enVoice = voices.find((v) =>
          v.lang?.toLowerCase().startsWith("en")
        ) || voices[0];
        testUtter.voice = enVoice;
        testUtter.lang = enVoice.lang;
      } else {
        testUtter.lang = "en-US";
      }

      let hasStarted = false;
      let hasEnded = false;

      // Event handlers
      const onStart = () => {
        hasStarted = true;
      };

      const onEnd = () => {
        hasEnded = true;
        cleanup();
        // Nếu có start event, nghĩa là thực sự đã phát
        resolve(hasStarted);
      };

      const onError = () => {
        cleanup();
        resolve(false);
      };

      const cleanup = () => {
        clearTimeout(timeoutId);
        testUtter.onstart = null;
        testUtter.onend = null;
        testUtter.onerror = null;
      };

      testUtter.onstart = onStart;
      testUtter.onend = onEnd;
      testUtter.onerror = onError;

      // Timeout sau 2 giây nếu không có response
      const timeoutId = setTimeout(() => {
        cleanup();
        // Nếu đã start nhưng chưa end, vẫn coi là hoạt động
        resolve(hasStarted);
      }, 2000);

      // Thử speak
      try {
        synth.speak(testUtter);

        // Trên một số thiết bị, có thể cần đợi một chút
        // Kiểm tra xem có speaking/pending không
        setTimeout(() => {
          if (!hasStarted && !hasEnded) {
            // Nếu sau 100ms vẫn chưa có event, có thể không hoạt động
            // Nhưng vẫn đợi timeout để chắc chắn
            if (synth.speaking || synth.pending) {
              hasStarted = true;
            }
          }
        }, 100);
      } catch (error) {
        cleanup();
        resolve(false);
      }
    } catch (error) {
      resolve(false);
    }
  });
}

/**
 * Xác định trạng thái màu sắc của bài học dựa trên accuracy
 * @param lessonStatus - Trạng thái bài học (có thể null nếu chưa làm)
 * @param accuracy - Độ chính xác (0-100), nếu không có thì lấy từ lessonStatus
 * @returns Object chứa className và status type
 */
export function getLessonStatusColor(
  lessonStatus: LessonStatus | null | undefined,
  accuracy?: number
): {
  className: string;
  status: "completed" | "in-progress" | "not-started";
} {
  const finalAccuracy = accuracy ?? lessonStatus?.lastAccuracy ?? 0;
  const isCompleted = finalAccuracy >= 90;

  if (isCompleted) {
    return {
      className:
        "bg-green-100 dark:bg-green-800/50 text-green-800 dark:text-green-200 border border-green-200 dark:border-green-700",
      status: "completed",
    };
  } else if (lessonStatus && finalAccuracy > 0 && finalAccuracy < 90) {
    // Orange for lessons with accuracy < 90%
    return {
      className:
        "bg-orange-100 dark:bg-orange-800/50 text-orange-800 dark:text-orange-200 border border-orange-200 dark:border-orange-700",
      status: "in-progress",
    };
  } else {
    return {
      className:
        "bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-600 hover:bg-gray-200 dark:hover:bg-gray-600",
      status: "not-started",
    };
  }
}

/**
 * Xác định className cho button trong LessonSelectionGrid
 * (không có dark mode, vì modal thường có background sáng)
 * 
 * Logic tô màu tối ưu:
 * - Xanh: nếu lesson có trong completedLessons (dựa vào completedLessons array)
 * - Cam: nếu có accuracy trong lessonStatuses và accuracy < 90 và không có trong completedLessons
 * - Xám: chưa làm hoặc không có data
 */
export function getLessonButtonClass(
  isSelected: boolean,
  lessonStatus: LessonStatus | null | undefined,
  isCompleted?: boolean,
  accuracy?: number,
  isListened?: boolean,
  isNeedComplete?: boolean
): string {
  if (isSelected) {
    return "bg-primary text-white border-blue-600";
  }

  // Màu xanh: dựa vào completedLessons (ưu tiên cao nhất)
  if (isCompleted) {
    return "bg-green-100 text-green-800 border-green-300";
  }

  // Màu xanh dương nhạt: giáo viên đánh dấu bài cần hoàn thành
  if (isNeedComplete) {
    return "bg-blue-100 text-blue-800 border-blue-300";
  }

  // Màu vàng: nghe đủ số lần (>= 4) nhưng chưa submit/completed
  if (isListened) {
    return "bg-yellow-100 text-yellow-800 border-yellow-300";
  }

  // Màu cam: có accuracy trong lessonStatuses và accuracy < 90
  const finalAccuracy = accuracy ?? lessonStatus?.lastAccuracy ?? 0;
  if (lessonStatus && finalAccuracy > 0 && finalAccuracy < 90) {
    return "bg-orange-100 text-orange-800 border-orange-300";
  }

  // Màu xám: chưa làm hoặc không có data
  return "bg-white text-gray-700 border-gray-300 hover:bg-gray-100";
}

