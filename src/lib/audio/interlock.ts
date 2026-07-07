const RECORDING_FLAG_KEY = "__breadtransRecordingActive";
const PLAYBACK_FLAG_KEY = "__breadtransPlaybackActive";
const AUDIO_INTERLOCK_EVENT = "breadtrans-audio-interlock-change";

type BreadTransWindow = Window & {
  [RECORDING_FLAG_KEY]?: boolean;
  [PLAYBACK_FLAG_KEY]?: boolean;
};

function getWindowRef(): BreadTransWindow | null {
  if (typeof window === "undefined") return null;
  return window as BreadTransWindow;
}

function dispatchInterlockChange() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(AUDIO_INTERLOCK_EVENT));
}

let stopRecordingHandler: (() => void) | null = null;
let pausePlaybackHandler: (() => void) | null = null;

export function isRecordingActive(): boolean {
  const win = getWindowRef();
  return Boolean(win?.[RECORDING_FLAG_KEY]);
}

export function setRecordingActive(active: boolean): void {
  const win = getWindowRef();
  if (!win) return;
  win[RECORDING_FLAG_KEY] = active;
  dispatchInterlockChange();
}

export function isPlaybackActive(): boolean {
  const win = getWindowRef();
  return Boolean(win?.[PLAYBACK_FLAG_KEY]);
}

export function setPlaybackActive(active: boolean): void {
  const win = getWindowRef();
  if (!win) return;
  win[PLAYBACK_FLAG_KEY] = active;
  dispatchInterlockChange();
}

export function subscribeAudioInterlock(listener: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  window.addEventListener(AUDIO_INTERLOCK_EVENT, listener);
  return () => window.removeEventListener(AUDIO_INTERLOCK_EVENT, listener);
}

export function registerStopRecordingHandler(handler: (() => void) | null): void {
  stopRecordingHandler = handler;
}

export function requestStopRecording(): void {
  stopRecordingHandler?.();
}

export function registerPausePlaybackHandler(handler: (() => void) | null): void {
  pausePlaybackHandler = handler;
}

export function requestPausePlayback(): void {
  pausePlaybackHandler?.();
}
