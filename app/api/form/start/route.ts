import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";

// Simple in-memory rate limit for session creation (best-effort on serverless)
const startWindows = new Map<string, { count: number; resetAt: number }>();
const START_LIMIT = 20; // max sessions per IP per hour
const START_WINDOW_MS = 60 * 60 * 1000;

function checkStartRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = startWindows.get(ip);
  if (!entry || now > entry.resetAt) {
    startWindows.set(ip, { count: 1, resetAt: now + START_WINDOW_MS });
    return true;
  }
  if (entry.count >= START_LIMIT) return false;
  entry.count++;
  return true;
}

export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",").pop()?.trim() || "unknown";
  if (!checkStartRateLimit(ip)) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const supabase = createServerClient();

  const { data, error } = await supabase
    .from("form_sessions")
    .insert({})
    .select("token")
    .single();

  if (error) {
    console.error("[form/start] Insert failed:", error.message);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }

  return NextResponse.json({ token: data.token });
}
