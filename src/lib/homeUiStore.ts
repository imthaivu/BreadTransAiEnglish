"use client";

import { useSyncExternalStore } from "react";
import { create } from "zustand";

const HOME_STORIES_BODY_CLASS = "home-stories-active";
const MOVIE_IMMERSIVE_BODY_CLASS = "movie-immersive-active";
const LIGHT_IMMERSIVE_BODY_CLASS = "immersive-light-active";

interface HomeUiState {
  isStoriesActive: boolean;
  setStoriesActive: (active: boolean) => void;
  isMovieImmersive: boolean;
  setMovieImmersive: (active: boolean) => void;
  isImmersiveLight: boolean;
  setImmersiveLight: (active: boolean) => void;
  isLearnSessionActive: boolean;
  setLearnSessionActive: (active: boolean) => void;
}

export const useHomeUiStore = create<HomeUiState>((set) => ({
  isStoriesActive: false,
  setStoriesActive: (active) => set({ isStoriesActive: active }),
  isMovieImmersive: false,
  setMovieImmersive: (active) => set({ isMovieImmersive: active }),
  isImmersiveLight: false,
  setImmersiveLight: (active) => set({ isImmersiveLight: active }),
  isLearnSessionActive: false,
  setLearnSessionActive: (active) => set({ isLearnSessionActive: active }),
}));

/** Đồng bộ dark mode Stories: store + body class (AppNav đọc qua useSyncExternalStore). */
export function syncHomeStoriesDarkMode(active: boolean) {
  useHomeUiStore.getState().setStoriesActive(active);
  if (typeof document === "undefined") return;
  document.body.classList.toggle(HOME_STORIES_BODY_CLASS, active);
}

function subscribeToStoriesBodyClass(callback: () => void) {
  if (typeof document === "undefined") return () => {};
  const observer = new MutationObserver(callback);
  observer.observe(document.body, {
    attributes: true,
    attributeFilter: ["class"],
  });
  return () => observer.disconnect();
}

function getStoriesBodyClassSnapshot() {
  if (typeof document === "undefined") return false;
  return document.body.classList.contains(HOME_STORIES_BODY_CLASS);
}

/** Hook đọc trạng thái dark Stories từ body class — re-render ngay khi tab đổi. */
export function useHomeStoriesDarkMode() {
  return useSyncExternalStore(
    subscribeToStoriesBodyClass,
    getStoriesBodyClassSnapshot,
    () => false
  );
}

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
