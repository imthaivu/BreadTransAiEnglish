import { NextRequest } from "next/server";

// Rate limiting store (in production, use Redis)
const rateLimitStore = new Map<string, { count: number; resetTime: number; blockedUntil?: number }>();

// Clean up old entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, record] of rateLimitStore.entries()) {
    if (now > record.resetTime && (!record.blockedUntil || now > record.blockedUntil)) {
      rateLimitStore.delete(key);
    }
  }
}, 5 * 60 * 1000);

export interface RateLimitConfig {
  maxAttempts: number;
  windowMs: number;
  blockDurationMs?: number; // Block after max attempts
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetTime: number;
  blockedUntil?: number;
}

export function getClientIP(request: NextRequest): string {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    request.headers.get("cf-connecting-ip") ||
    "unknown"
  );
}

export function checkRateLimit(
  key: string,
  config: RateLimitConfig
): RateLimitResult {
  const now = Date.now();
  const record = rateLimitStore.get(key);

  // Check if currently blocked
  if (record?.blockedUntil && now < record.blockedUntil) {
    return {
      allowed: false,
      remaining: 0,
      resetTime: record.blockedUntil,
      blockedUntil: record.blockedUntil,
    };
  }

  // Reset if window expired
  if (!record || now > record.resetTime) {
    rateLimitStore.set(key, {
      count: 1,
      resetTime: now + config.windowMs,
    });
    return {
      allowed: true,
      remaining: config.maxAttempts - 1,
      resetTime: now + config.windowMs,
    };
  }

  // Check if exceeded limit
  if (record.count >= config.maxAttempts) {
    // Block if blockDurationMs is configured
    if (config.blockDurationMs) {
      const blockedUntil = now + config.blockDurationMs;
      record.blockedUntil = blockedUntil;
      record.resetTime = blockedUntil;
      rateLimitStore.set(key, record);
      return {
        allowed: false,
        remaining: 0,
        resetTime: blockedUntil,
        blockedUntil,
      };
    }
    return {
      allowed: false,
      remaining: 0,
      resetTime: record.resetTime,
    };
  }

  // Increment count
  record.count++;
  rateLimitStore.set(key, record);

  return {
    allowed: true,
    remaining: config.maxAttempts - record.count,
    resetTime: record.resetTime,
  };
}

// Rate limit by IP
export function checkIPRateLimit(
  request: NextRequest,
  prefix: string,
  config: RateLimitConfig
): RateLimitResult {
  const ip = getClientIP(request);
  const key = `${prefix}:ip:${ip}`;
  return checkRateLimit(key, config);
}

// Rate limit by phone number (for brute force protection)
export function checkPhoneRateLimit(
  phone: string,
  config: RateLimitConfig
): RateLimitResult {
  const key = `phone:${phone}`;
  return checkRateLimit(key, config);
}

// Rate limit by IP + phone combination
export function checkIPPhoneRateLimit(
  request: NextRequest,
  phone: string,
  config: RateLimitConfig
): RateLimitResult {
  const ip = getClientIP(request);
  const key = `ip-phone:${ip}:${phone}`;
  return checkRateLimit(key, config);
}

// Rate limit theo userId (đã đăng nhập). Áp cho các endpoint có chi phí cao
// như chấm AI, đổi mật khẩu, gọi proxy bên thứ 3.
export function checkUserRateLimit(
  userId: string,
  prefix: string,
  config: RateLimitConfig
): RateLimitResult {
  const safeUserId = userId?.trim() || "anonymous";
  const key = `${prefix}:user:${safeUserId}`;
  return checkRateLimit(key, config);
}

// Unlock phone number - removes all rate limit records for this phone
export function unlockPhone(phone: string): void {
  if (!phone || !phone.trim()) {
    console.warn("[unlockPhone] Invalid phone number provided:", phone);
    return;
  }

  const trimmedPhone = phone.trim();
  
  // Unlock phone-based rate limit
  rateLimitStore.delete(`phone:${trimmedPhone}`);
  
  // Unlock all IP-phone combinations for this phone
  const keysToDelete: string[] = [];
  for (const key of rateLimitStore.keys()) {
    if (key.startsWith(`ip-phone:`) && key.endsWith(`:${trimmedPhone}`)) {
      keysToDelete.push(key);
    }
  }
  
  // Delete all matching keys
  for (const key of keysToDelete) {
    rateLimitStore.delete(key);
  }
  
}

// Unlock IP address - removes all rate limit records for this IP
export function unlockIP(ip: string, prefix?: string): void {
  if (prefix) {
    // Unlock specific prefix IP rate limit
    rateLimitStore.delete(`${prefix}:ip:${ip}`);
  } else {
    // Unlock all IP-based rate limits for this IP
    for (const key of rateLimitStore.keys()) {
      if (key.includes(`:ip:${ip}`)) {
        rateLimitStore.delete(key);
      }
    }
  }
  
  // Unlock all IP-phone combinations for this IP
  for (const key of rateLimitStore.keys()) {
    if (key.startsWith(`ip-phone:${ip}:`)) {
      rateLimitStore.delete(key);
    }
  }
}

// Unlock user - unlocks both phone and all related IPs
// This is the main function to use when admin wants to unlock a user
// Unlocks:
// 1. Phone-based rate limit (phone:xxx)
// 2. All IP-phone combinations for this phone (ip-phone:xxx:phone)
// Note: IP-based rate limits are not unlocked as we don't know which IPs the user used
// But users can still login from new IPs, and old IP blocks will expire naturally
export function unlockUser(phone: string): void {
  if (!phone || !phone.trim()) {
    console.warn("[unlockUser] Invalid phone number provided:", phone);
    throw new Error("Phone number is required to unlock user");
  }

  const trimmedPhone = phone.trim();
  
  // Unlock phone-based rate limit
  rateLimitStore.delete(`phone:${trimmedPhone}`);
  
  // Unlock all IP-phone combinations for this phone
  const keysToDelete: string[] = [];
  for (const key of rateLimitStore.keys()) {
    if (key.startsWith(`ip-phone:`) && key.endsWith(`:${trimmedPhone}`)) {
      keysToDelete.push(key);
    }
  }
  
  // Delete all matching keys
  for (const key of keysToDelete) {
    rateLimitStore.delete(key);
  }
  
}

// Unlock all IP rate limits - use with caution!
// This unlocks all IP-based rate limits (verify-password:ip:xxx, login:ip:xxx, etc.)
// This is used when admin wants to ensure a user can login from any IP
export function unlockAllIPRateLimits(): void {
  const keysToDelete: string[] = [];
  
  // Find all IP-based rate limit keys
  for (const key of rateLimitStore.keys()) {
    // Match patterns like: "verify-password:ip:xxx", "login:ip:xxx", etc.
    // But exclude ip-phone combinations (they are handled separately)
    if (key.includes(":ip:") && !key.startsWith("ip-phone:")) {
      keysToDelete.push(key);
    }
  }
  
  // Delete all matching keys
  for (const key of keysToDelete) {
    rateLimitStore.delete(key);
  }
  
}

// Comprehensive unlock function - unlocks everything related to a phone number
// This is the most thorough unlock function, use when you need to ensure complete unlock
export function unlockUserCompletely(phone: string): void {
  if (!phone || !phone.trim()) {
    console.warn("[unlockUserCompletely] Invalid phone number provided:", phone);
    return;
  }

  const trimmedPhone = phone.trim();
  let totalUnlocked = 0;
  const unlockedKeys: string[] = [];
  
  // 1. Unlock phone-based rate limit
  const phoneKey = `phone:${trimmedPhone}`;
  if (rateLimitStore.has(phoneKey)) {
    rateLimitStore.delete(phoneKey);
    totalUnlocked++;
    unlockedKeys.push(phoneKey);
  }
  
  // 2. Unlock all IP-phone combinations for this phone
  // Pattern: ip-phone:IP:PHONE
  const ipPhoneKeys: string[] = [];
  for (const key of rateLimitStore.keys()) {
    if (key.startsWith(`ip-phone:`) && key.endsWith(`:${trimmedPhone}`)) {
      ipPhoneKeys.push(key);
    }
  }
  for (const key of ipPhoneKeys) {
    if (rateLimitStore.delete(key)) {
      totalUnlocked++;
      unlockedKeys.push(key);
    }
  }
  
  // 3. Unlock all IP rate limits (for all IPs)
  // This includes: verify-password:ip:xxx, login:ip:xxx, etc.
  const ipKeys: string[] = [];
  for (const key of rateLimitStore.keys()) {
    if (key.includes(":ip:") && !key.startsWith("ip-phone:")) {
      ipKeys.push(key);
    }
  }
  for (const key of ipKeys) {
    if (rateLimitStore.delete(key)) {
      totalUnlocked++;
      unlockedKeys.push(key);
    }
  }
  
}

