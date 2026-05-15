import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { resetSalesRepPin } from "@/lib/sales-reps";

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;
  const { id } = await params;
  const result = await resetSalesRepPin(id);
  if (!result) return NextResponse.json({ error: "Reset failed" }, { status: 500 });
  return NextResponse.json(result);
}
