// src/lib/audio/soundManager.ts

type SoundName = "correct" | "wrong" | "complete" | "click";

const soundFiles: Record<SoundName, string> = {
  correct: "/sounds/ting.mp3",
  wrong: "/sounds/error.mp3",
  complete: "/sounds/all-done.mp3",
  click: "/sounds/bubble.mp3",
};

const audioCache: Partial<Record<SoundName, HTMLAudioElement>> = {};

/**
 * Preloads all sound effects to avoid delay on the first play.
 * This should be called once when the application loads.
 */
export function preloadSounds() {
  if (typeof window === "undefined") return;

  for (const key in soundFiles) {
    const soundName = key as SoundName;
    if (!audioCache[soundName]) {
      const audio = new Audio(soundFiles[soundName]);
      audio.preload = "auto";
      audioCache[soundName] = audio;
    }
  }
}

/**
 * Plays a preloaded sound effect.
 * @param soundName The name of the sound to play.
 */
export function playSound(soundName: SoundName) {
  const audio = audioCache[soundName];
  if (audio) {
    // Rewind to the start and play
    audio.currentTime = 0;
    audio.play().catch((error) => {
      // Autoplay might be prevented by the browser.
      console.error(`Could not play sound "${soundName}":`, error);
    });
  }
}

// Preload sounds when this module is first imported.
preloadSounds();
