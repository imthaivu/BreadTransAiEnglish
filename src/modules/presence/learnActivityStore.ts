import type { LearnActivity } from "./types";

/**
 * Store in-memory cho chi tiết hoạt động ở tab Learn. Thay cho localStorage
 * `learnActivityState` cũ. Màn Learn (Flashcard, Speaking) gọi `setState`;
 * PresenceProvider subscribe để ghi `currentActivity` lên RTDB.
 */
type Listener = (state: LearnActivity | null) => void;

let state: LearnActivity | null = null;
const listeners = new Set<Listener>();

export const learnActivityStore = {
  getState(): LearnActivity | null {
    return state;
  },
  setState(next: LearnActivity | null): void {
    state = next;
    listeners.forEach((l) => l(state));
  },
  subscribe(listener: Listener): () => void {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
};
