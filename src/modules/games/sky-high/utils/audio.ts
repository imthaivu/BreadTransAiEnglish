const STORAGE_KEY = "breadtrans.sky_high.audio_muted";

class SkyHighAudioManager {
  private ctx: AudioContext | null = null;
  private enabled = true;

  constructor() {
    if (typeof window !== "undefined") {
      try {
        this.enabled = localStorage.getItem(STORAGE_KEY) !== "true";
      } catch {
        this.enabled = true;
      }
    }
  }

  private initCtx() {
    if (typeof window === "undefined") return;
    if (!this.ctx) {
      try {
        const AudioCtx =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext: typeof AudioContext })
            .webkitAudioContext;
        if (AudioCtx) this.ctx = new AudioCtx();
      } catch {
        // Web Audio not supported – âm thầm bỏ qua, game vẫn chơi được.
      }
    }
    if (this.ctx && this.ctx.state === "suspended") {
      void this.ctx.resume();
    }
  }

  isMuted() {
    return !this.enabled;
  }

  toggleMute() {
    this.enabled = !this.enabled;
    try {
      localStorage.setItem(STORAGE_KEY, (!this.enabled).toString());
    } catch {
      // ignore
    }
    return !this.enabled;
  }

  setMute(muted: boolean) {
    this.enabled = !muted;
    try {
      localStorage.setItem(STORAGE_KEY, muted.toString());
    } catch {
      // ignore
    }
  }

  playClick() {
    if (!this.enabled) return;
    this.initCtx();
    if (!this.ctx) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.type = "sine";
    osc.frequency.setValueAtTime(300, this.ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(150, this.ctx.currentTime + 0.08);
    gain.gain.setValueAtTime(0.1, this.ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0.01, this.ctx.currentTime + 0.08);
    osc.start();
    osc.stop(this.ctx.currentTime + 0.08);
  }

  playDrop() {
    if (!this.enabled) return;
    this.initCtx();
    if (!this.ctx) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.type = "triangle";
    osc.frequency.setValueAtTime(180, this.ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(80, this.ctx.currentTime + 0.15);
    gain.gain.setValueAtTime(0.15, this.ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0.01, this.ctx.currentTime + 0.15);
    osc.start();
    osc.stop(this.ctx.currentTime + 0.15);
  }

  playLand(perfect: boolean, multiplier = 1) {
    if (!this.enabled) return;
    this.initCtx();
    if (!this.ctx) return;
    const dest = this.ctx.destination;

    const osc1 = this.ctx.createOscillator();
    const gain1 = this.ctx.createGain();
    osc1.connect(gain1);
    gain1.connect(dest);
    osc1.type = "triangle";
    const baseFreq = perfect ? 440 + multiplier * 40 : 220;
    osc1.frequency.setValueAtTime(baseFreq, this.ctx.currentTime);
    osc1.frequency.exponentialRampToValueAtTime(
      baseFreq / 2,
      this.ctx.currentTime + 0.12
    );
    gain1.gain.setValueAtTime(0.2, this.ctx.currentTime);
    gain1.gain.linearRampToValueAtTime(0.01, this.ctx.currentTime + 0.12);
    osc1.start();
    osc1.stop(this.ctx.currentTime + 0.12);

    if (perfect) {
      const osc2 = this.ctx.createOscillator();
      const gain2 = this.ctx.createGain();
      osc2.connect(gain2);
      gain2.connect(dest);
      osc2.type = "sine";
      const sparkFreq = 880 + multiplier * 80;
      osc2.frequency.setValueAtTime(sparkFreq, this.ctx.currentTime + 0.02);
      osc2.frequency.exponentialRampToValueAtTime(
        sparkFreq * 1.5,
        this.ctx.currentTime + 0.25
      );
      gain2.gain.setValueAtTime(0.12, this.ctx.currentTime);
      gain2.gain.linearRampToValueAtTime(0.001, this.ctx.currentTime + 0.25);
      osc2.start(this.ctx.currentTime + 0.02);
      osc2.stop(this.ctx.currentTime + 0.25);
    }
  }

  playPierreSquawk() {
    if (!this.enabled) return;
    this.initCtx();
    if (!this.ctx) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(600, this.ctx.currentTime);
    osc.frequency.linearRampToValueAtTime(1200, this.ctx.currentTime + 0.08);
    osc.frequency.linearRampToValueAtTime(700, this.ctx.currentTime + 0.16);
    gain.gain.setValueAtTime(0.08, this.ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0.01, this.ctx.currentTime + 0.16);
    osc.start();
    osc.stop(this.ctx.currentTime + 0.16);
  }

  playWindWhoosh() {
    if (!this.enabled) return;
    this.initCtx();
    if (!this.ctx) return;
    const bufferSize = this.ctx.sampleRate * 1.5;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let lastOut = 0.0;
    for (let i = 0; i < bufferSize; i++) {
      const white = Math.random() * 2 - 1;
      data[i] = lastOut = 0.95 * lastOut + 0.05 * white;
    }
    const noiseNode = this.ctx.createBufferSource();
    noiseNode.buffer = buffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(100, this.ctx.currentTime);
    filter.frequency.exponentialRampToValueAtTime(500, this.ctx.currentTime + 0.4);
    filter.frequency.exponentialRampToValueAtTime(150, this.ctx.currentTime + 1.2);
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.0, this.ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0.15, this.ctx.currentTime + 0.4);
    gain.gain.linearRampToValueAtTime(0.001, this.ctx.currentTime + 1.5);
    noiseNode.connect(filter);
    filter.connect(gain);
    gain.connect(this.ctx.destination);
    noiseNode.start();
    noiseNode.stop(this.ctx.currentTime + 1.5);
  }

  playCrash() {
    if (!this.enabled) return;
    this.initCtx();
    if (!this.ctx) return;
    const bufferSize = this.ctx.sampleRate * 1.2;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    const noiseNode = this.ctx.createBufferSource();
    noiseNode.buffer = buffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.setValueAtTime(300, this.ctx.currentTime);
    filter.frequency.exponentialRampToValueAtTime(80, this.ctx.currentTime + 1.0);
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.3, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 1.2);
    noiseNode.connect(filter);
    filter.connect(gain);
    gain.connect(this.ctx.destination);
    noiseNode.start();
    noiseNode.stop(this.ctx.currentTime + 1.2);

    const osc = this.ctx.createOscillator();
    const oscGain = this.ctx.createGain();
    osc.connect(oscGain);
    oscGain.connect(this.ctx.destination);
    osc.type = "triangle";
    osc.frequency.setValueAtTime(80, this.ctx.currentTime);
    osc.frequency.linearRampToValueAtTime(20, this.ctx.currentTime + 0.8);
    oscGain.gain.setValueAtTime(0.4, this.ctx.currentTime);
    oscGain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.8);
    osc.start();
    osc.stop(this.ctx.currentTime + 0.8);
  }

  playLevelUp() {
    if (!this.enabled) return;
    this.initCtx();
    if (!this.ctx) return;
    const ctx = this.ctx;
    const dest = ctx.destination;
    const now = ctx.currentTime;
    const notes = [261.63, 329.63, 392.0, 523.25];
    notes.forEach((freq, index) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(dest);
      osc.type = "sine";
      osc.frequency.setValueAtTime(freq, now + index * 0.1);
      gain.gain.setValueAtTime(0.0, now + index * 0.1);
      gain.gain.linearRampToValueAtTime(0.12, now + index * 0.1 + 0.05);
      gain.gain.linearRampToValueAtTime(0.001, now + index * 0.1 + 0.3);
      osc.start(now + index * 0.1);
      osc.stop(now + index * 0.1 + 0.3);
    });
  }
}

export const skyHighAudio = new SkyHighAudioManager();
