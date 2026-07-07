type WindowWithWebkit = Window & {
  webkitAudioContext?: typeof AudioContext;
};

class SoundEffectsManager {
  private ctx: AudioContext | null = null;
  private isMuted: boolean = false;

  private initContext() {
    if (typeof window === "undefined") return;
    if (!this.ctx) {
      const w = window as WindowWithWebkit;
      const Ctor = window.AudioContext || w.webkitAudioContext;
      if (!Ctor) return;
      this.ctx = new Ctor();
    }
    if (this.ctx.state === "suspended") {
      this.ctx.resume();
    }
  }

  public setMute(mute: boolean) {
    this.isMuted = mute;
  }

  public toggleMute() {
    this.isMuted = !this.isMuted;
    return this.isMuted;
  }

  public getMuteStatus() {
    return this.isMuted;
  }

  public playWritePen(isO: boolean = false) {
    if (this.isMuted) return;
    try {
      this.initContext();
      if (!this.ctx) return;

      const duration = isO ? 0.25 : 0.15;
      const sampleRate = this.ctx.sampleRate;
      const bufferSize = Math.floor(sampleRate * duration);
      const buffer = this.ctx.createBuffer(1, bufferSize, sampleRate);
      const data = buffer.getChannelData(0);

      for (let i = 0; i < bufferSize; i++) {
        data[i] = Math.random() * 2 - 1;
      }

      const noiseNode = this.ctx.createBufferSource();
      noiseNode.buffer = buffer;

      const filter = this.ctx.createBiquadFilter();
      filter.type = "bandpass";
      filter.frequency.setValueAtTime(isO ? 1200 : 1500, this.ctx.currentTime);
      filter.Q.setValueAtTime(3, this.ctx.currentTime);

      if (isO) {
        filter.frequency.exponentialRampToValueAtTime(
          700,
          this.ctx.currentTime + 0.12
        );
        filter.frequency.exponentialRampToValueAtTime(
          1400,
          this.ctx.currentTime + 0.25
        );
      } else {
        filter.frequency.exponentialRampToValueAtTime(
          600,
          this.ctx.currentTime + 0.15
        );
      }

      const gainNode = this.ctx.createGain();
      gainNode.gain.setValueAtTime(0.08, this.ctx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(
        0.001,
        this.ctx.currentTime + duration
      );

      noiseNode.connect(filter);
      filter.connect(gainNode);
      gainNode.connect(this.ctx.destination);

      noiseNode.start();
    } catch (e) {
      console.warn("Audio play failed:", e);
    }
  }

  public playUndoErase() {
    if (this.isMuted) return;
    try {
      this.initContext();
      if (!this.ctx) return;

      const duration = 0.35;
      const sampleRate = this.ctx.sampleRate;
      const bufferSize = Math.floor(sampleRate * duration);
      const buffer = this.ctx.createBuffer(1, bufferSize, sampleRate);
      const data = buffer.getChannelData(0);

      for (let i = 0; i < bufferSize; i++) {
        data[i] = Math.random() * 2 - 1;
      }

      const noiseNode = this.ctx.createBufferSource();
      noiseNode.buffer = buffer;

      const filter = this.ctx.createBiquadFilter();
      filter.type = "bandpass";
      filter.frequency.setValueAtTime(400, this.ctx.currentTime);
      filter.Q.setValueAtTime(2, this.ctx.currentTime);

      filter.frequency.linearRampToValueAtTime(
        800,
        this.ctx.currentTime + 0.15
      );
      filter.frequency.linearRampToValueAtTime(
        400,
        this.ctx.currentTime + 0.25
      );
      filter.frequency.linearRampToValueAtTime(
        700,
        this.ctx.currentTime + 0.35
      );

      const gainNode = this.ctx.createGain();
      gainNode.gain.setValueAtTime(0.06, this.ctx.currentTime);
      gainNode.gain.linearRampToValueAtTime(
        0.04,
        this.ctx.currentTime + 0.15
      );
      gainNode.gain.linearRampToValueAtTime(
        0.05,
        this.ctx.currentTime + 0.2
      );
      gainNode.gain.exponentialRampToValueAtTime(
        0.001,
        this.ctx.currentTime + duration
      );

      noiseNode.connect(filter);
      filter.connect(gainNode);
      gainNode.connect(this.ctx.destination);

      noiseNode.start();
    } catch (e) {
      console.warn("Audio play failed:", e);
    }
  }

  public playClick() {
    if (this.isMuted) return;
    try {
      this.initContext();
      if (!this.ctx) return;

      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = "sine";
      osc.frequency.setValueAtTime(600, this.ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(
        300,
        this.ctx.currentTime + 0.08
      );

      gain.gain.setValueAtTime(0.05, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(
        0.001,
        this.ctx.currentTime + 0.08
      );

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start();
      osc.stop(this.ctx.currentTime + 0.08);
    } catch (e) {
      console.warn("Audio play failed:", e);
    }
  }

  public playWinFanfare() {
    if (this.isMuted) return;
    try {
      this.initContext();
      if (!this.ctx) return;

      const now = this.ctx.currentTime;
      const notes = [523.25, 659.25, 783.99, 1046.5];

      notes.forEach((freq, idx) => {
        if (!this.ctx) return;
        const osc = this.ctx.createOscillator();
        const subOsc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        const noteStart = now + idx * 0.12;
        const noteDuration = 0.6;

        osc.type = "triangle";
        osc.frequency.setValueAtTime(freq, noteStart);

        subOsc.type = "sine";
        subOsc.frequency.setValueAtTime(freq * 1.01, noteStart);

        gain.gain.setValueAtTime(0, now);
        gain.gain.setValueAtTime(0, noteStart);
        gain.gain.linearRampToValueAtTime(0.06, noteStart + 0.03);
        gain.gain.exponentialRampToValueAtTime(
          0.001,
          noteStart + noteDuration
        );

        osc.connect(gain);
        subOsc.connect(gain);
        gain.connect(this.ctx.destination);

        osc.start(noteStart);
        osc.stop(noteStart + noteDuration);

        subOsc.start(noteStart);
        subOsc.stop(noteStart + noteDuration);
      });
    } catch (e) {
      console.warn("Audio play failed:", e);
    }
  }

  public playDrawSound() {
    if (this.isMuted) return;
    try {
      this.initContext();
      if (!this.ctx) return;

      const now = this.ctx.currentTime;
      const osc1 = this.ctx.createOscillator();
      const osc2 = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc1.frequency.setValueAtTime(320, now);
      osc2.frequency.setValueAtTime(318, now);

      gain.gain.setValueAtTime(0.05, now);
      gain.gain.linearRampToValueAtTime(0.03, now + 0.2);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.5);

      osc1.connect(gain);
      osc2.connect(gain);
      gain.connect(this.ctx.destination);

      osc1.start(now);
      osc2.start(now);

      osc1.stop(now + 0.5);
      osc2.stop(now + 0.5);
    } catch (e) {
      console.warn("Audio play failed:", e);
    }
  }
}

export const sounds = new SoundEffectsManager();
