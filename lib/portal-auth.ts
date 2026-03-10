import { createServerClient } from "@/lib/supabase/server";
import { verifyPin } from "@/lib/pin";
import type { PortalSession } from "@/lib/types/client-tasks";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { createHmac } from "crypto";

export const PORTAL_COOKIE = "portal_session";

function getJwtSecret(): string {
  return process.env.PORTAL_JWT_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY!;
}

function base64url(str: string): string {
  return Buffer.from(str).toString("base64url");
}

function createJwt(payload: PortalSession): string {
  const header = base64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = base64url(JSON.stringify(payload));
  const signature = createHmac("sha256", getJwtSecret())
    .update(`${header}.${body}`)
    .digest("base64url");
  return `${header}.${body}.${signature}`;
}

function verifyJwt(token: string): PortalSession | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const [header, body, signature] = parts;
    const expected = createHmac("sha256", getJwtSecret())
      .update(`${header}.${body}`)
      .digest("base64url");
    if (signature !== expected) return null;

    const payload = JSON.parse(
      Buffer.from(body, "base64url").toString()
    ) as PortalSession;
    if (payload.exp < Date.now() / 1000) return null;
    return payload;
  } catch {
    return null;
  }
}

async function checkPinRateLimit(email: string): Promise<boolean> {
  const supabase = createServerClient();
  const windowStart = new Date(
    Date.now() - 15 * 60 * 1000
  ).toISOString();

  const { count, error } = await supabase
    .from("pin_login_attempts")
    .select("*", { count: "exact", head: true })
    .eq("email", email.toLowerCase())
    .gte("created_at", windowStart);

  if (error) return true; // fail-open
  return (count ?? 0) < 5;
}

async function recordPinAttempt(email: string): Promise<void> {
  const supabase = createServerClient();
  await supabase
    .from("pin_login_attempts")
    .insert({ email: email.toLowerCase() });
}

export async function authenticateClient(
  email: string,
  pin: string
): Promise<{ token: string } | { error: string; status: number }> {
  if (!(await checkPinRateLimit(email))) {
    return {
      error: "Too many attempts. Try again in 15 minutes.",
      status: 429,
    };
  }

  await recordPinAttempt(email);

  const supabase = createServerClient();
  const { data: client, error } = await supabase
    .from("clients")
    .select("id, email, pin_hash")
    .eq("email", email.toLowerCase())
    .single();

  if (error || !client) {
    return { error: "Invalid email or PIN", status: 401 };
  }

  if (!verifyPin(pin, client.pin_hash)) {
    return { error: "Invalid email or PIN", status: 401 };
  }

  const payload: PortalSession = {
    client_id: client.id,
    email: client.email,
    exp: Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60,
  };

  return { token: createJwt(payload) };
}

export async function getPortalSession(): Promise<PortalSession | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(PORTAL_COOKIE)?.value;
  if (!token) return null;
  return verifyJwt(token);
}

export async function requirePortalAuth(): Promise<
  | { session: PortalSession; error?: never }
  | { session?: never; error: NextResponse }
> {
  const session = await getPortalSession();
  if (!session) {
    return {
      error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }
  return { session };
}
