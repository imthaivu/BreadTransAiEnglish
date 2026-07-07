/**
 * Shared sidebar layout constants - dùng chung cho AppNav và AdminSidebar
 */

export const SIDEBAR_WIDTH = 256; // px - w-64
export const SIDEBAR_HEADER_HEIGHT = 64; // px - h-16
export const SIDEBAR_NAV_ITEM_HEIGHT = 48; // px - min-h-12

/** Class names cho nav item - dùng chung */
export const SIDEBAR_NAV_ITEM_CLASS =
  "flex items-center gap-3 px-4 py-3 text-sm md:text-base font-medium rounded-lg transition-colors min-h-12";
export const SIDEBAR_NAV_ITEM_ACTIVE_CLASS =
  "text-primary bg-primary/10";
export const SIDEBAR_NAV_ITEM_INACTIVE_CLASS =
  "text-gray-700 hover:bg-gray-100 hover:text-gray-900";
export const SIDEBAR_NAV_ICON_SIZE = "w-5 h-5";
