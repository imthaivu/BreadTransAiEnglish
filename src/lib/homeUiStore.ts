"use client";

import { useSyncExternalStore } from "react";
import { create } from "zustand";

const MOVIE_IMMERSIVE_BODY_CLASS = "movie-immersive-active";
const LIGHT_IMMERSIVE_BODY_CLASS = "immersive-light-active";

interface HomeUiState {
  isMovieImmersive: boolean;
  setMovieImmersive: (active: boolean) => void;
  isImmersiveLight: boolean;
  setImmersiveLight: (active: boolean) => void;
  isLearnSessionActive: boolean;
  setLearnSessionActive: (active: boolean) => void;
}

export const useHomeUiStore = create<HomeUiState>((set) => ({
  isMovieImmersive: false,
  setMovieImmersive: (active) => set({ isMovieImmersive: active }),
  isImmersiveLight: false,
  setImmersiveLight: (active) => set({ isImmersiveLight: active }),
  isLearnSessionActive: false,
  setLearnSessionActive: (active) => set({ isLearnSessionActive: active }),
}));

/** Đồng bộ chế độ xem phim toàn màn (ẩn sidebar, tab Home). */
export function syncMovieImmersive(active: boolean) {
  useHomeUiStore.getState().setMovieImmersive(active);
  if (typeof document === "undefined") return;
  document.body.classList.toggle(MOVIE_IMMERSIVE_BODY_CLASS, active);
}

function subscribeToMovieImmersiveBodyClass(callback: () => void) {
  if (typeof document === "undefined") return () => {};
  const observer = new MutationObserver(callback);
  observer.observe(document.body, {
    attributes: true,
    attributeFilter: ["class"],
  });
  return () => observer.disconnect();
}

function getMovieImmersiveBodyClassSnapshot() {
  if (typeof document === "undefined") return false;
  return document.body.classList.contains(MOVIE_IMMERSIVE_BODY_CLASS);
}

export function useMovieImmersive() {
  return useSyncExternalStore(
    subscribeToMovieImmersiveBodyClass,
    getMovieImmersiveBodyClassSnapshot,
    () => false
  );
}

/**
 * Đồng bộ chế độ xem toàn màn "sáng" (ẩn sidebar + tab Home như xem phim,
 * nhưng GIỮ theme sáng). Dùng cho Music player và Grammar player.
 */
export function syncImmersiveLight(active: boolean) {
  useHomeUiStore.getState().setImmersiveLight(active);
  if (typeof document === "undefined") return;
  document.body.classList.toggle(LIGHT_IMMERSIVE_BODY_CLASS, active);
}

function subscribeToLightImmersiveBodyClass(callback: () => void) {
  if (typeof document === "undefined") return () => {};
  const observer = new MutationObserver(callback);
  observer.observe(document.body, {
    attributes: true,
    attributeFilter: ["class"],
  });
  return () => observer.disconnect();
}

function getLightImmersiveBodyClassSnapshot() {
  if (typeof document === "undefined") return false;
  return document.body.classList.contains(LIGHT_IMMERSIVE_BODY_CLASS);
}

export function useImmersiveLight() {
  return useSyncExternalStore(
    subscribeToLightImmersiveBodyClass,
    getLightImmersiveBodyClassSnapshot,
    () => false
  );
}

export function useLearnSessionActive() {
  return useHomeUiStore((state) => state.isLearnSessionActive);
}
