import { timingSafeEqual } from "crypto";

export function validateApiKey(headerValue: string | null): boolean {
  const expected = process.env.WEBHOOK_API_KEY;
  if (!expected || !headerValue) return false;
  if (expected.length !== headerValue.length) return false;
  return timingSafeEqual(Buffer.from(expected), Buffer.from(headerValue));
}

export function validateOrigin(origin: string | null): boolean {
  const allowed = process.env.WEBHOOK_ALLOWED_ORIGINS;
  if (!allowed) return true;
  if (!origin) return true; // no Origin = server-to-server call (API key is the real gate)
  const origins = allowed.split(",").map((o) => o.trim().toLowerCase());
  return origins.includes(origin.toLowerCase());
}

const windows = new Map<string, { count: number; resetAt: number }>();

export function checkRateLimit(ip: string): boolean {
  const limit = parseInt(process.env.WEBHOOK_RATE_LIMIT || "10", 10);
  const now = Date.now();
  const windowMs = 60 * 60 * 1000;

  const entry = windows.get(ip);
  if (!entry || now > entry.resetAt) {
    windows.set(ip, { count: 1, resetAt: now + windowMs });
    return true;
  }

  if (entry.count >= limit) return false;
  entry.count++;
  return true;
}
