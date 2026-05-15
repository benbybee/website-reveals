import { createServerClient } from "@/lib/supabase/server";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { createHmac } from "crypto";

export const SALES_REP_COOKIE = "sales_rep_session";

export interface SalesRepSession {
  rep_id: string;
  email: string;
  exp: number;
}

function getJwtSecret(): string {
  return process.env.PORTAL_JWT_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY!;
}

function base64url(str: string): string {
  return Buffer.from(str).toString("base64url");
}

function createJwt(payload: SalesRepSession): string {
  const header = base64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = base64url(JSON.stringify(payload));
  const signature = createHmac("sha256", getJwtSecret())
    .update(`${header}.${body}`)
    .digest("base64url");
  return `${header}.${body}.${signature}`;
}

function verifyJwt(token: string): SalesRepSession | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const [header, body, signature] = parts;
    const expected = createHmac("sha256", getJwtSecret())
      .update(`${header}.${body}`)
      .digest("base64url");
    if (signature !== expected) return null;
    const payload = JSON.parse(Buffer.from(body, "base64url").toString()) as SalesRepSession;
    if (payload.exp < Date.now() / 1000) return null;
    return payload;
  } catch {
    return null;
  }
}

async function checkRateLimit(email: string): Promise<boolean> {
  const supabase = createServerClient();
  const windowStart = new Date(Date.now() - 15 * 60 * 1000).toISOString();
  const { count, error } = await supabase
    .from("pin_login_attempts")
    .select("*", { count: "exact", head: true })
    .eq("email", email.toLowerCase())
    .gte("created_at", windowStart);
  if (error) return true;
  return (count ?? 0) < 5;
}

async function recordAttempt(email: string): Promise<void> {
  const supabase = createServerClient();
  await supabase.from("pin_login_attempts").insert({ email: email.toLowerCase() });
}

export async function authenticateSalesRep(
  email: string,
  pin: string,
): Promise<{ token: string } | { error: string; status: number }> {
  if (!(await checkRateLimit(email))) {
    return { error: "Too many attempts. Try again in 15 minutes.", status: 429 };
  }
  await recordAttempt(email);

  const supabase = createServerClient();
  const { data: rep, error } = await supabase
    .from("sales_reps")
    .select("id, email, pin, active")
    .ilike("email", email.trim())
    .maybeSingle();

  if (error || !rep || !rep.active) {
    return { error: "Invalid email or PIN", status: 401 };
  }
  if (String(rep.pin).trim() !== String(pin).trim()) {
    return { error: "Invalid email or PIN", status: 401 };
  }

  const payload: SalesRepSession = {
    rep_id: rep.id,
    email: rep.email,
    exp: Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60,
  };
  return { token: createJwt(payload) };
}

export async function getSalesRepSession(): Promise<SalesRepSession | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SALES_REP_COOKIE)?.value;
  if (!token) return null;
  return verifyJwt(token);
}

export async function requireSalesRepAuth(): Promise<
  | { session: SalesRepSession; error?: never }
  | { session?: never; error: NextResponse }
> {
  const session = await getSalesRepSession();
  if (!session) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  return { session };
}
