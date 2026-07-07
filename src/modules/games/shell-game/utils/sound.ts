/**
 * Trình tạo âm thanh dùng Web Audio API. Lazy-init AudioContext sau click đầu
 * tiên để né browser autoplay policy.
 */

type WindowWithLegacyAudio = Window & {
  webkitAudioContext?: typeof AudioContext;
};

class SoundEffectsManager {
  private ctx: AudioContext | null = null;
  private isMuted = false;
  private volume = 0.5;

  private initContext() {
    if (typeof window === "undefined") return;
    if (!this.ctx) {
      const legacy = window as WindowWithLegacyAudio;
      const AudioCtx = window.AudioContext || legacy.webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === "suspended") {
      this.ctx.resume().catch(() => {});
    }
  }

  setMute(muted: boolean) {
    this.isMuted = muted;
  }

  getMute() {
    return this.isMuted;
  }

  setVolume(vol: number) {
    this.volume = Math.max(0, Math.min(1, vol));
  }

  getVolume() {
    return this.volume;
  }

  private createOscillator(
    type: OscillatorType,
    freqs: number[],
    durations: number[],
    gains: number[]
  ) {
    if (this.isMuted) return;
    try {
      this.initContext();
      if (!this.ctx) return;

      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gainNode = this.ctx.createGain();

      osc.type = type;
      osc.connect(gainNode);
      gainNode.connect(this.ctx.destination);

      let timeOffset = 0;
      freqs.forEach((freq, i) => {
        osc.frequency.setValueAtTime(freq, now + timeOffset);
        if (durations[i]) {
          timeOffset += durations[i];
        }
      });

      gainNode.gain.setValueAtTime(0, now);
      let volumeOffset = 0;
      gains.forEach((g, i) => {
        const stepVol = g * this.volume;
        gainNode.gain.linearRampToValueAtTime(
          stepVol,
          now + volumeOffset + 0.01
        );
        if (durations[i]) {
          volumeOffset += durations[i];
        }
      });
      gainNode.gain.setValueAtTime(
        gains[gains.length - 1] * this.volume,
        now + volumeOffset
      );
      gainNode.gain.exponentialRampToValueAtTime(
        0.0001,
        now + volumeOffset + 0.1
      );

      osc.start(now);
      const totalDur = durations.reduce((a, b) => a + b, 0) + 0.15;
      osc.stop(now + totalDur);
    } catch (e) {
      // Audio failures should never break the game flow.
      if (typeof console !== "undefined") {
        console.warn("Audio synthesis failed:", e);
      }
    }
  }

  playClick() {
    this.createOscillator("sine", [1200], [0.03], [0.2]);
  }

  playLift() {
    this.createOscillator(
      "triangle",
      [220, 440, 880],
      [0.08, 0.08, 0.1],
      [0.1, 0.3, 0.05]
    );
  }

  playLower() {
    this.createOscillator(
      "triangle",
      [880, 440, 220],
      [0.08, 0.08, 0.1],
      [0.1, 0.3, 0.05]
    );
  }

  playShuffle() {
    this.createOscillator("sine", [150, 400], [0.02, 0.04], [0.4, 0.1]);
  }

  playCorrect() {
    this.createOscillator(
      "sine",
      [261.63, 329.63, 392.0, 523.25],
      [0.08, 0.08, 0.08, 0.2],
      [0.2, 0.2, 0.2, 0.4]
    );
  }

  playIncorrect() {
    this.createOscillator("sawtooth", [180, 130], [0.15, 0.25], [0.4, 0.1]);
  }

  playLevelUp() {
    this.createOscillator(
      "triangle",
      [261.63, 329.63, 392.0, 523.25, 659.25, 783.99, 1046.5],
      [0.06, 0.06, 0.06, 0.06, 0.06, 0.06, 0.3],
      [0.2, 0.2, 0.2, 0.3, 0.3, 0.3, 0.4]
    );
  }

  playGameOver() {
    this.createOscillator(
      "sawtooth",
      [440, 415.3, 392.0, 349.23],
      [0.18, 0.18, 0.18, 0.5],
      [0.3, 0.2, 0.2, 0.1]
    );
  }
}

export const sounds = new SoundEffectsManager();
