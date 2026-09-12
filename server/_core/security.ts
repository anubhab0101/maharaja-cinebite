import type { Request, Response, NextFunction } from "express";

/**
 * HTTP Security Headers Middleware
 * Implements OWASP recommendations:
 * - X-Frame-Options: DENY (prevents Clickjacking)
 * - X-Content-Type-Options: nosniff (prevents MIME sniffing)
 * - Referrer-Policy: strict-origin-when-cross-origin
 * - Strict-Transport-Security (HSTS)
 * - Content-Security-Policy (CSP)
 */
export function securityHeaders(req: Request, res: Response, next: NextFunction) {
  // Force HTTPS if request comes via HTTP through reverse proxy
  if (req.headers["x-forwarded-proto"] === "http") {
    const host = req.headers.host || "cinebite.store";
    return res.redirect(301, `https://${host}${req.url}`);
  }

  res.removeHeader("X-Powered-By");
  res.removeHeader("Server");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("X-XSS-Protection", "0"); // Modern standard (avoids side-channel leaks)
  res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains; preload");

  // Permissions-Policy: Restricts browser APIs (camera, mic, geolocation)
  res.setHeader(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=(), payment=(self 'https://checkout.razorpay.com' 'https://api.razorpay.com')"
  );

  // Cross-Origin Isolation Policies
  res.setHeader("Cross-Origin-Opener-Policy", "same-origin-allow-popups");
  res.setHeader("Cross-Origin-Resource-Policy", "same-origin");

  // Content Security Policy - hardened for production
  // Eliminates 'unsafe-eval' and 'unsafe-inline' from script-src in production
  const isProd = process.env.NODE_ENV === "production";
  const scriptSrc = isProd
    ? "script-src 'self' https://checkout.razorpay.com https://api.razorpay.com"
    : "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://checkout.razorpay.com https://api.razorpay.com";

  res.setHeader(
    "Content-Security-Policy",
    [
      "default-src 'self'",
      scriptSrc,
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' https://fonts.gstatic.com data:",
      "img-src 'self' data: blob: https:",
      "connect-src 'self' https://lumberjack.razorpay.com https://api.razorpay.com wss: ws:",
      "frame-src 'self' https://api.razorpay.com https://checkout.razorpay.com",
      "object-src 'none'",
      "base-uri 'self'",
      "frame-ancestors 'none'",
    ].join("; ") + ";"
  );

  next();
}

/**
 * In-Memory Sliding Window Rate Limiter
 * Protects against brute force, credential stuffing, and DoS attacks.
 */
interface RateLimitRecord {
  timestamps: number[];
}

export function createRateLimiter(options: {
  windowMs: number;
  maxRequests: number;
  message?: string;
}) {
  const ipMap = new Map<string, RateLimitRecord>();

  // Cleanup expired records periodically (every 5 minutes)
  const cleanupInterval = setInterval(() => {
    const now = Date.now();
    ipMap.forEach((record, ip) => {
      const valid = record.timestamps.filter((ts: number) => now - ts < options.windowMs);
      if (valid.length === 0) {
        ipMap.delete(ip);
      } else {
        record.timestamps = valid;
      }
    });
  }, 5 * 60_000);

  if (typeof cleanupInterval.unref === "function") {
    cleanupInterval.unref();
  }

  return (req: Request, res: Response, next: NextFunction) => {
    // Extract client IP address
    const forwarded = req.headers["x-forwarded-for"];
    const ip = (typeof forwarded === "string" ? forwarded.split(",")[0].trim() : req.socket.remoteAddress) || "unknown";

    const now = Date.now();
    let record = ipMap.get(ip);
    if (!record) {
      record = { timestamps: [] };
      ipMap.set(ip, record);
    }

    // Keep only timestamps within window
    record.timestamps = record.timestamps.filter((ts: number) => now - ts < options.windowMs);

    if (record.timestamps.length >= options.maxRequests) {
      res.status(429).json({
        error: "Too Many Requests",
        message: options.message || "Rate limit exceeded. Please wait a moment before retrying.",
        retryAfterSeconds: Math.ceil(options.windowMs / 1000),
      });
      return;
    }

    record.timestamps.push(now);
    next();
  };
}

const actionLimitMap = new Map<string, number[]>();

/**
 * Keyed Sliding-Window Rate Limiter for fine-grained action protection (e.g. order creation, lookups)
 */
export function checkRateLimit(key: string, maxRequests: number, windowMs: number): boolean {
  const now = Date.now();
  let timestamps = actionLimitMap.get(key) || [];
  timestamps = timestamps.filter((ts) => now - ts < windowMs);

  if (timestamps.length >= maxRequests) {
    actionLimitMap.set(key, timestamps);
    return false;
  }

  timestamps.push(now);
  actionLimitMap.set(key, timestamps);
  return true;
}


/**
 * Storage Path Validator
 * Rejects path traversal (`..`), null bytes, or dangerous paths.
 */
export function isValidStorageKey(key: string): boolean {
  if (!key || typeof key !== "string") return false;
  if (key.includes("..") || key.includes("\0") || key.includes("\\")) return false;
  // Allow alphanumeric, dashes, underscores, slashes, and periods
  return /^[a-zA-Z0-9_\-\.\/]+$/.test(key);
}

/**
 * Input sanitization helper for user text
 */
export function sanitizeText(input: unknown, maxLength = 250): string {
  if (typeof input !== "string") return "";
  return input
    .trim()
    .slice(0, maxLength)
    .replace(/[<>]/g, ""); // Strip dangerous HTML tags
}
