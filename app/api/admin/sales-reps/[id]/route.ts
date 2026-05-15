import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { updateSalesRep, deleteSalesRep } from "@/lib/sales-reps";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;
  const { id } = await params;
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  const patch = body as Record<string, unknown>;
  const allowed: Record<string, unknown> = {};
  for (const k of ["email", "first_name", "last_name", "active", "notes"]) {
    if (k in patch) allowed[k] = patch[k];
  }
  const rep = await updateSalesRep(id, allowed);
  if (!rep) return NextResponse.json({ error: "Update failed" }, { status: 500 });
  return NextResponse.json({ rep });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;
  const { id } = await params;
  const ok = await deleteSalesRep(id);
  return NextResponse.json({ ok });
}
