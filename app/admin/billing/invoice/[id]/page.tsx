import { createServerClient } from "@/lib/supabase/server";
import { createSSRClient } from "@/lib/supabase/server-ssr";
import { redirect, notFound } from "next/navigation";
import { INVOICE_BUSINESS_NAME, billableFor, formatUsd, monthLabel } from "@/lib/billing";
import { InvoiceActions } from "@/components/admin/InvoiceActions";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Invoice — Website Reveals",
};

interface BuildRow {
  id: string;
  cost_usd: number | null;
  completed_at: string | null;
  site_url: string | null;
  form_sessions: { form_data: Record<string, unknown> | null } | null;
}

export default async function InvoiceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const ssrClient = await createSSRClient();
  const {
    data: { user },
  } = await ssrClient.auth.getUser();
  if (!user) redirect("/admin/login");

  const supabase = createServerClient();

  const { data: invoice, error: invoiceErr } = await supabase
    .from("invoices")
    .select("*")
    .eq("id", id)
    .single();

  if (invoiceErr || !invoice) notFound();

  const { data: rawBuilds, error: buildsErr } = await supabase
    .from("build_jobs")
    .select(
      "id, cost_usd, completed_at, site_url, form_sessions:form_sessions!token(form_data)",
    )
    .eq("invoice_id", id)
    .order("completed_at", { ascending: true });

  if (buildsErr) console.error("[invoice] Builds fetch failed:", buildsErr.message);

  const builds = ((rawBuilds || []) as unknown as BuildRow[]).map((b) => ({
    id: b.id,
    completed_at: b.completed_at,
    site_url: b.site_url,
    business_name: (b.form_sessions?.form_data?.business_name as string) || "Unknown",
    billable: billableFor(b.cost_usd),
  }));

  return (
    <div style={{ background: "#faf9f5", minHeight: "100vh", padding: "32px 24px" }}>
      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { background: #ffffff !important; }
          .invoice-paper { box-shadow: none !important; border: none !important; padding: 32px 0 !important; max-width: 100% !important; }
        }
      `}</style>

      <div className="no-print" style={{ maxWidth: "800px", margin: "0 auto 16px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <a href="/admin/billing" style={{ fontFamily: "var(--font-sans)", fontSize: "13px", color: "#555553", textDecoration: "none" }}>
          ← Back to billing
        </a>
        <InvoiceActions invoiceId={invoice.id} initiallyPaid={!!invoice.paid} paidAt={invoice.paid_at} />
      </div>

      <div
        className="invoice-paper"
        style={{
          maxWidth: "800px",
          margin: "0 auto",
          background: "#ffffff",
          border: "1px solid #e8e6df",
          padding: "48px 56px",
          fontFamily: "var(--font-sans)",
          color: "#111110",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "40px" }}>
          <div>
            <h1 style={{ fontFamily: "var(--font-serif)", fontSize: "2.25rem", fontWeight: 700, letterSpacing: "-0.02em" }}>
              Invoice
            </h1>
            <div style={{ fontSize: "13px", color: "#888886", marginTop: "4px" }}>
              {invoice.invoice_number}
            </div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontFamily: "var(--font-serif)", fontSize: "1.25rem", fontWeight: 700 }}>
              {INVOICE_BUSINESS_NAME}
            </div>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "32px", marginBottom: "32px", fontSize: "13px" }}>
          <div>
            <div style={metaLabel}>Period</div>
            <div style={metaValue}>{monthLabel(invoice.period_year, invoice.period_month)}</div>
          </div>
          <div>
            <div style={metaLabel}>Issued</div>
            <div style={metaValue}>{new Date(invoice.created_at).toLocaleDateString()}</div>
          </div>
          <div>
            <div style={metaLabel}>Status</div>
            <div style={{ ...metaValue, color: invoice.paid ? "#2e7d32" : "#b3300a" }}>
              {invoice.paid ? `Paid · ${new Date(invoice.paid_at).toLocaleDateString()}` : "Unpaid"}
            </div>
          </div>
          <div>
            <div style={metaLabel}>Builds</div>
            <div style={metaValue}>{builds.length}</div>
          </div>
        </div>

        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px", marginBottom: "24px" }}>
          <thead>
            <tr>
              <th style={invTh}>Site</th>
              <th style={invTh}>Date</th>
              <th style={{ ...invTh, textAlign: "right" }}>Amount</th>
            </tr>
          </thead>
          <tbody>
            {builds.map((b) => (
              <tr key={b.id}>
                <td style={invTd}>
                  <div style={{ fontWeight: 600 }}>{b.business_name}</div>
                  {b.site_url && (
                    <div style={{ fontSize: "11px", color: "#888886", marginTop: "2px" }}>
                      {b.site_url.replace(/^https?:\/\//, "").replace(/\/$/, "")}
                    </div>
                  )}
                </td>
                <td style={invTd}>{b.completed_at ? new Date(b.completed_at).toLocaleDateString() : "—"}</td>
                <td style={{ ...invTd, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                  {formatUsd(b.billable)}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={2} style={{ ...invTd, fontWeight: 700, borderTop: "2px solid #111110" }}>
                Total
              </td>
              <td style={{ ...invTd, textAlign: "right", fontWeight: 700, fontSize: "16px", borderTop: "2px solid #111110", fontVariantNumeric: "tabular-nums" }}>
                {formatUsd(Number(invoice.total_amount))}
              </td>
            </tr>
          </tfoot>
        </table>

        {invoice.notes && (
          <div style={{ marginTop: "32px", paddingTop: "20px", borderTop: "1px solid #e8e6df", fontSize: "12px", color: "#555553" }}>
            <div style={metaLabel}>Notes</div>
            <div style={{ whiteSpace: "pre-wrap" }}>{invoice.notes}</div>
          </div>
        )}
      </div>
    </div>
  );
}

const metaLabel: React.CSSProperties = {
  fontFamily: "var(--font-mono)",
  fontSize: "10px",
  letterSpacing: "0.08em",
  textTransform: "uppercase",
  color: "#888886",
  marginBottom: "4px",
};
const metaValue: React.CSSProperties = {
  fontSize: "14px",
  color: "#111110",
  fontWeight: 500,
};
const invTh: React.CSSProperties = {
  textAlign: "left",
  fontFamily: "var(--font-mono)",
  fontSize: "10px",
  textTransform: "uppercase",
  letterSpacing: "0.08em",
  color: "#888886",
  fontWeight: 600,
  padding: "12px 8px",
  borderBottom: "1px solid #e8e6df",
};
const invTd: React.CSSProperties = {
  padding: "12px 8px",
  borderBottom: "1px solid #f0eeea",
};
