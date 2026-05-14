import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/admin-auth";
import { billableFor, nextInvoiceNumber } from "@/lib/billing";

export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { source, year, month, buildIds } = body as {
    source?: string;
    year?: number;
    month?: number;
    buildIds?: string[];
  };

  if (!source || typeof source !== "string") {
    return NextResponse.json({ error: "source is required" }, { status: 400 });
  }
  if (typeof year !== "number" || typeof month !== "number") {
    return NextResponse.json({ error: "year and month must be numbers" }, { status: 400 });
  }
  if (!Array.isArray(buildIds) || buildIds.length === 0) {
    return NextResponse.json({ error: "buildIds must be a non-empty array" }, { status: 400 });
  }

  const supabase = createServerClient();

  // Fetch the build_jobs to validate they're billable and not already invoiced.
  const { data: builds, error: buildsErr } = await supabase
    .from("build_jobs")
    .select("id, cost_usd, invoice_id")
    .in("id", buildIds);

  if (buildsErr) {
    console.error("[billing] Failed to fetch builds:", buildsErr.message);
    return NextResponse.json({ error: "Failed to fetch builds" }, { status: 500 });
  }
  if (!builds || builds.length === 0) {
    return NextResponse.json({ error: "No matching builds found" }, { status: 404 });
  }

  const eligible = builds.filter((b) => b.cost_usd != null && b.invoice_id == null);
  if (eligible.length === 0) {
    return NextResponse.json(
      { error: "All selected builds are either uncosted or already invoiced" },
      { status: 409 },
    );
  }

  const totalBillable = eligible.reduce((sum, b) => sum + billableFor(Number(b.cost_usd)), 0);
  const totalRounded = Math.round(totalBillable * 100) / 100;

  // Determine next sequence number for this source/period.
  const { count: existingCount, error: countErr } = await supabase
    .from("invoices")
    .select("*", { count: "exact", head: true })
    .eq("source", source)
    .eq("period_year", year)
    .eq("period_month", month);

  if (countErr) {
    console.error("[billing] Failed to count existing invoices:", countErr.message);
    return NextResponse.json({ error: "Failed to determine invoice number" }, { status: 500 });
  }

  const seq = (existingCount || 0) + 1;
  const invoiceNumber = nextInvoiceNumber(source, year, month, seq);

  const { data: invoice, error: insertErr } = await supabase
    .from("invoices")
    .insert({
      invoice_number: invoiceNumber,
      source,
      period_year: year,
      period_month: month,
      total_amount: totalRounded,
    })
    .select("*")
    .single();

  if (insertErr || !invoice) {
    console.error("[billing] Failed to insert invoice:", insertErr?.message);
    return NextResponse.json({ error: "Failed to create invoice" }, { status: 500 });
  }

  // Link the build_jobs to the new invoice
  const { error: linkErr } = await supabase
    .from("build_jobs")
    .update({ invoice_id: invoice.id })
    .in(
      "id",
      eligible.map((b) => b.id),
    );

  if (linkErr) {
    // Roll back the invoice if linking failed
    await supabase.from("invoices").delete().eq("id", invoice.id);
    console.error("[billing] Failed to link builds:", linkErr.message);
    return NextResponse.json({ error: "Failed to link builds to invoice" }, { status: 500 });
  }

  return NextResponse.json({ invoice });
}
