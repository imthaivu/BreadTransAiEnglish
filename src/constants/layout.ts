/**
 * Layout constants for consistent spacing and dimensions across the application
 */

// Header dimensions
export const HEADER_HEIGHT = 64; // px - matches h-16 in Tailwind

// Sidebar dimensions - dùng chung AppNav & AdminSidebar
export const SIDEBAR_WIDTH = 256; // px - w-64
export const BOTTOM_NAV_HEIGHT = 64; // px - mobile bottom tab bar

// Z-index layers
export const Z_INDEX = {
  BASE: 10,
  OVERLAY: 20,
  HEADER: 30,
  SIDEBAR: 50,
} as const;

// Layout calculations
export const LAYOUT = {
  HEADER_HEIGHT,
  SIDEBAR_WIDTH,
  CONTENT_HEIGHT: `calc(100vh - ${HEADER_HEIGHT}px)`,
  CONTENT_TOP: `${HEADER_HEIGHT}px`,
  SIDEBAR_LEFT: `${SIDEBAR_WIDTH}px`,
} as const;

/** Admin layout: không có header (Header ẩn khi đăng nhập) nên dùng full viewport */
export const ADMIN_LAYOUT = {
  SIDEBAR_WIDTH,
  CONTENT_HEIGHT: "100vh",
  CONTENT_TOP: "0px",
  SIDEBAR_LEFT: `${SIDEBAR_WIDTH}px`,
} as const;

