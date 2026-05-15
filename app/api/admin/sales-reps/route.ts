import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { createSalesRep, listSalesReps } from "@/lib/sales-reps";

export async function GET() {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;
  const reps = await listSalesReps();
  return NextResponse.json({ reps });
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  const { email, first_name, last_name, notes } = body as {
    email?: unknown;
    first_name?: unknown;
    last_name?: unknown;
    notes?: unknown;
  };
  if (typeof email !== "string" || !email.includes("@")) {
    return NextResponse.json({ error: "Valid email required" }, { status: 400 });
  }
  if (typeof first_name !== "string" || !first_name.trim()) {
    return NextResponse.json({ error: "first_name required" }, { status: 400 });
  }

  try {
    const { rep, pin } = await createSalesRep({
      email,
      first_name,
      last_name: typeof last_name === "string" ? last_name : undefined,
      notes: typeof notes === "string" ? notes : undefined,
    });
    return NextResponse.json({ rep, pin });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("duplicate") || msg.includes("unique")) {
      return NextResponse.json({ error: "A rep with that email already exists" }, { status: 409 });
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
