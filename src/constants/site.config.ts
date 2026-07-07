/**
 * Site configuration
 * Centralized configuration for site URL and domain
 * 
 * To change the domain in the future, update NEXT_PUBLIC_SITE_URL in .env.local
 * or modify the default value below.
 */

export const SITE_CONFIG = {
  /**
   * Base URL of the site
   * Can be overridden by NEXT_PUBLIC_SITE_URL environment variable
   * Default: https://breadtrans.vercel.app
   */
  url: process.env.NEXT_PUBLIC_SITE_URL || "https://breadtrans.vercel.app",
  
  /**
   * Get full URL for a given path
   * @param path - Path to append to base URL (should start with /)
   * @returns Full URL
   */
  getUrl: (path: string = ""): string => {
    const baseUrl = SITE_CONFIG.url.replace(/\/$/, ""); // Remove trailing slash
    const cleanPath = path.startsWith("/") ? path : `/${path}`;
    return `${baseUrl}${cleanPath}`;
  },
  
  /**
   * Get URL for an asset
   * @param assetPath - Path to asset (should start with /)
   * @returns Full asset URL
   */
  getAssetUrl: (assetPath: string): string => {
    return SITE_CONFIG.getUrl(assetPath);
  },
} as const;
