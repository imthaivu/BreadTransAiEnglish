/**
 * Detect if the current device is a PC (desktop/laptop) or non-PC (mobile/tablet)
 * @returns "pc" for desktop/laptop devices, "non-pc" for mobile/tablet devices
 */
export function getDeviceType(): "pc" | "non-pc" {
  if (typeof window === "undefined") {
    // Server-side: default to "pc" (can be overridden by client)
    return "pc";
  }

  // Check user agent for mobile/tablet devices
  const userAgent = navigator.userAgent.toLowerCase();
  const isMobile = /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini/i.test(userAgent);
  
  // Check screen width as additional indicator (mobile devices typically have smaller screens)
  // But prioritize user agent as it's more reliable
  if (isMobile) {
    return "non-pc";
  }

  // Check for touch capability (tablets might not be detected by user agent alone)
  const hasTouchScreen = "ontouchstart" in window || navigator.maxTouchPoints > 0;
  
  // If it has touch but screen is large, might be a tablet (non-PC)
  // If screen width is less than 768px, likely mobile/tablet
  if (hasTouchScreen && window.innerWidth < 1024) {
    return "non-pc";
  }

  // Default to PC for desktop/laptop
  return "pc";
}
