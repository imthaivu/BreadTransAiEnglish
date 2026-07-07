export const CARO_ZOOM_MIN = 0.5;
export const CARO_ZOOM_MAX = 2.5;
export const CARO_ZOOM_STEP = 0.15;

export const clampCaroZoom = (value: number) =>
  Math.min(
    CARO_ZOOM_MAX,
    Math.max(CARO_ZOOM_MIN, Math.round(value * 100) / 100)
  );
