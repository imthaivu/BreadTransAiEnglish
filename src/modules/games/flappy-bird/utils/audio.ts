type WindowWithLegacyAudio = Window & {
  webkitAudioContext?: typeof AudioContext;
};

/**
 * Sau khi `osc.stop()` các node vẫn nằm trong audio graph cho đến khi GC.
 * Safari/iOS giới hạn ~256 node mỗi AudioContext → sau vài chục âm là tắt
 * tiếng luôn. Phải tự `disconnect()` trong `onended` để giải phóng ngay.
 */
class FlappyBirdAudio {
  private ctx: AudioContext | null = null;

  private init() {
    if (typeof window === "undefined") return;
    if (!this.ctx) {
      const w = window as WindowWithLegacyAudio;
      const AudioCtx = window.AudioContext || w.webkitAudioContext;
      if (AudioCtx) this.ctx = new AudioCtx();
    }
    if (this.ctx?.state === "suspended") {
      void this.ctx.resume();
    }
  }

  play(type: "jump" | "point" | "hit") {
    try {
      this.init();
      if (!this.ctx) return;
      const ctx = this.ctx;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      const now = ctx.currentTime;

      let stopAt = now;

      if (type === "jump") {
        osc.frequency.setValueAtTime(350, now);
        osc.frequency.exponentialRampToValueAtTime(800, now + 0.12);
        gain.gain.setValueAtTime(0.12, now);
        gain.gain.linearRampToValueAtTime(0.01, now + 0.12);
        stopAt = now + 0.12;
      } else if (type === "point") {
        osc.frequency.setValueAtTime(587.33, now);
        osc.frequency.setValueAtTime(880, now + 0.08);
        gain.gain.setValueAtTime(0.15, now);
        gain.gain.linearRampToValueAtTime(0.01, now + 0.25);
        stopAt = now + 0.25;
      } else {
        osc.type = "sawtooth";
        osc.frequency.setValueAtTime(220, now);
        osc.frequency.exponentialRampToValueAtTime(40, now + 0.3);
        gain.gain.setValueAtTime(0.2, now);
        gain.gain.linearRampToValueAtTime(0.01, now + 0.3);
        stopAt = now + 0.3;
      }

      osc.onended = () => {
        try {
          osc.disconnect();
          gain.disconnect();
        } catch {
          // node đã được giải phóng
        }
      };

      osc.start(now);
      osc.stop(stopAt);
    } catch {
      // autoplay / unsupported
    }
  }

  /**
   * Tiếng sấm: noise buffer ngắn + low-pass filter để mô phỏng "ầm ầm".
   * Tách riêng vì cần `BufferSource` thay vì oscillator như các âm khác.
   */
  playThunder() {
    try {
      this.init();
      if (!this.ctx) return;
      const ctx = this.ctx;
      const duration = 1.1;
      const sampleRate = ctx.sampleRate;
      const length = Math.floor(sampleRate * duration);
      const buffer = ctx.createBuffer(1, length, sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < length; i++) {
        // Random white noise [-1, 1) — đủ "thô" để tai nghe ra sấm
        data[i] = Math.random() * 2 - 1;
      }
      const src = ctx.createBufferSource();
      src.buffer = buffer;

      const filter = ctx.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.value = 320;
      filter.Q.value = 0.6;

      const gain = ctx.createGain();
      const now = ctx.currentTime;
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(0.35, now + 0.06);
      gain.gain.exponentialRampToValueAtTime(0.18, now + 0.4);
      gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

      src.connect(filter);
      filter.connect(gain);
      gain.connect(ctx.destination);

      src.onended = () => {
        try {
          src.disconnect();
          filter.disconnect();
          gain.disconnect();
        } catch {
          // node đã được giải phóng
        }
      };

      src.start(now);
      src.stop(now + duration);
    } catch {
      // autoplay / unsupported
    }
  }
}

export const flappyBirdAudio = new FlappyBirdAudio();
