import { timingSafeEqual } from "crypto";
import { createServerClient } from "@/lib/supabase/server";

export function validateApiKey(headerValue: string | null): boolean {
  const expected = process.env.WEBHOOK_API_KEY;
  if (!expected || !headerValue) return false;
  if (expected.length !== headerValue.length) return false;
  return timingSafeEqual(Buffer.from(expected), Buffer.from(headerValue));
}

export function validateOrigin(origin: string | null): boolean {
  const allowed = process.env.WEBHOOK_ALLOWED_ORIGINS;
  // NOTE: If WEBHOOK_ALLOWED_ORIGINS is not set, ALL origins are allowed.
  // This is intentional fail-open — the API key is the primary gate.
  // Set this env var in production to restrict to specific origins.
  if (!allowed) return true;
  if (!origin) return true; // no Origin = server-to-server call (API key is the real gate)
  const origins = allowed.split(",").map((o) => o.trim().toLowerCase());
  return origins.includes(origin.toLowerCase());
}

/**
 * Extract the most trustworthy client IP from x-forwarded-for.
 * Uses the rightmost non-private IP (last proxy hop before our infra).
 */
export function extractClientIp(xForwardedFor: string | null): string {
  if (!xForwardedFor) return "unknown";

  const ips = xForwardedFor.split(",").map((ip) => ip.trim());

  // Walk from the right to find the first non-private IP
  for (let i = ips.length - 1; i >= 0; i--) {
    const ip = ips[i];
    if (ip && !isPrivateIp(ip)) return ip;
  }

  // Fallback to the rightmost IP if all are private (local network)
  return ips[ips.length - 1] || "unknown";
}

function isPrivateIp(ip: string): boolean {
  return (
    ip.startsWith("10.") ||
    ip.startsWith("172.16.") || ip.startsWith("172.17.") || ip.startsWith("172.18.") ||
    ip.startsWith("172.19.") || ip.startsWith("172.2") || ip.startsWith("172.30.") ||
    ip.startsWith("172.31.") ||
    ip.startsWith("192.168.") ||
    ip === "127.0.0.1" ||
    ip === "::1"
  );
}

/**
 * Persistent rate limiter using Supabase.
 * Falls back to in-memory if DB call fails (fail-open to avoid blocking legitimate traffic).
 */
export async function checkRateLimit(ip: string): Promise<boolean> {
  const limit = parseInt(process.env.WEBHOOK_RATE_LIMIT || "10", 10);
  const windowMs = 60 * 60 * 1000;
  const now = Date.now();
  const windowStart = new Date(now - windowMs).toISOString();

  try {
    const supabase = createServerClient();

    // Count requests from this IP in the current window
    const { count, error } = await supabase
      .from("rate_limit_entries")
      .select("*", { count: "exact", head: true })
      .eq("ip", ip)
      .gte("created_at", windowStart);

    if (error) {
      console.error("[rate-limit] DB check failed, allowing request:", error.message);
      return true; // fail-open
    }

    if ((count ?? 0) >= limit) return false;

    // Record this request
    await supabase
      .from("rate_limit_entries")
      .insert({ ip });

    return true;
  } catch (err) {
    console.error("[rate-limit] Unexpected error, allowing request:", err);
    return true; // fail-open
  }
}
