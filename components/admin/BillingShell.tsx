"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { BILLING_MARKUP, billableFor, formatUsd, monthLabel } from "@/lib/billing";

type UnbilledBuild = {
  id: string;
  cost_usd: number | null;
  completed_at: string | null;
  site_url: string | null;
  invoice_id: string | null;
  business_name: string;
  source: string;
};

type Invoice = {
  id: string;
  invoice_number: string;
  source: string;
  period_year: number;
  period_month: number;
  total_amount: number;
  paid: boolean;
  paid_at: string | null;
  notes: string | null;
  created_at: string;
};

type Tab = "unbilled" | "invoices";

interface Group {
  key: string;
  source: string;
  year: number;
  month: number;
  builds: UnbilledBuild[];
  rawTotal: number;
  billable: number;
}

export function BillingShell({
  builds,
  invoices: initialInvoices,
  userEmail,
}: {
  builds: UnbilledBuild[];
  invoices: Invoice[];
  userEmail: string;
}) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("unbilled");
  const [invoices, setInvoices] = useState(initialInvoices);
  const [generating, setGenerating] = useState<string | null>(null);

  const unbilledGroups: Group[] = useMemo(() => {
    const map = new Map<string, Group>();
    for (const b of builds) {
      if (b.invoice_id) continue;
      if (!b.completed_at || b.cost_usd == null) continue;
      const d = new Date(b.completed_at);
      const year = d.getUTCFullYear();
      const month = d.getUTCMonth() + 1;
      const key = `${b.source}::${year}::${month}`;
      let g = map.get(key);
      if (!g) {
        g = { key, source: b.source, year, month, builds: [], rawTotal: 0, billable: 0 };
        map.set(key, g);
      }
      g.builds.push(b);
      g.rawTotal += b.cost_usd;
      g.billable += billableFor(b.cost_usd);
    }
    return Array.from(map.values()).sort((a, b) => {
      if (a.year !== b.year) return b.year - a.year;
      if (a.month !== b.month) return b.month - a.month;
      return a.source.localeCompare(b.source);
    });
  }, [builds]);

  async function generateInvoice(g: Group) {
    setGenerating(g.key);
    try {
      const res = await fetch("/api/admin/billing/invoices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source: g.source,
          year: g.year,
          month: g.month,
          buildIds: g.builds.map((b) => b.id),
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        alert(`Could not generate invoice: ${body?.error || res.status}`);
        return;
      }
      const { invoice } = await res.json();
      setInvoices((prev) => [invoice, ...prev]);
      router.refresh();
      setTab("invoices");
    } catch (err) {
      alert(`Could not generate invoice: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setGenerating(null);
    }
  }

  async function togglePaid(inv: Invoice) {
    const next = !inv.paid;
    // Optimistic update
    setInvoices((prev) =>
      prev.map((i) =>
        i.id === inv.id ? { ...i, paid: next, paid_at: next ? new Date().toISOString() : null } : i,
      ),
    );
    const res = await fetch(`/api/admin/billing/invoices/${inv.id}/paid`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ paid: next }),
    });
    if (!res.ok) {
      // Revert
      setInvoices((prev) =>
        prev.map((i) => (i.id === inv.id ? { ...i, paid: inv.paid, paid_at: inv.paid_at } : i)),
      );
      alert("Failed to update paid status.");
    }
  }

  const totalUnbilledBillable = unbilledGroups.reduce((sum, g) => sum + g.billable, 0);
  const totalUnpaid = invoices.filter((i) => !i.paid).reduce((sum, i) => sum + Number(i.total_amount), 0);

  return (
    <>
      {/* Header */}
      <div style={headerStyle}>
        <div>
          <p style={labelStyle}>Admin · Billing</p>
          <h1 style={titleStyle}>Billing</h1>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
          <Link href="/admin" style={linkBtnStyle}>
            ← Dashboard
          </Link>
          <span style={{ fontFamily: "var(--font-sans)", fontSize: "13px", color: "#888886" }}>
            {userEmail}
          </span>
        </div>
      </div>

      {/* Summary cards */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          gap: "12px",
          marginBottom: "24px",
        }}
      >
        <SummaryCard label="Unbilled (billable)" value={formatUsd(totalUnbilledBillable)} />
        <SummaryCard label="Outstanding invoices" value={formatUsd(totalUnpaid)} />
        <SummaryCard
          label="Builds awaiting invoice"
          value={String(unbilledGroups.reduce((sum, g) => sum + g.builds.length, 0))}
        />
      </div>

      {/* Tabs */}
      <div style={tabsRowStyle}>
        {(["unbilled", "invoices"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              ...tabBtnStyle,
              color: tab === t ? "#ff3d00" : "#888886",
              borderBottom: tab === t ? "2px solid #ff3d00" : "2px solid transparent",
            }}
          >
            {t === "unbilled" ? "Unbilled" : "Invoices"}
          </button>
        ))}
      </div>

      {tab === "unbilled" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
          {unbilledGroups.length === 0 && (
            <EmptyState message="No unbilled builds. New builds will appear here as they complete." />
          )}
          {unbilledGroups.map((g) => (
            <div key={g.key} style={cardStyle}>
              <div style={cardHeaderStyle}>
                <div>
                  <div style={cardEyebrowStyle}>{g.source}</div>
                  <div style={cardTitleStyle}>{monthLabel(g.year, g.month)}</div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={cardEyebrowStyle}>Billable total</div>
                  <div style={cardTotalStyle}>{formatUsd(g.billable)}</div>
                </div>
              </div>

              <table style={tableStyle}>
                <thead>
                  <tr>
                    <th style={thStyle}>Business</th>
                    <th style={thStyle}>Date</th>
                    <th style={thStyle}>Site</th>
                    <th style={{ ...thStyle, textAlign: "right" }}>API cost</th>
                    <th style={{ ...thStyle, textAlign: "right" }}>Billable</th>
                  </tr>
                </thead>
                <tbody>
                  {g.builds.map((b) => (
                    <tr key={b.id}>
                      <td style={tdStyle}>{b.business_name}</td>
                      <td style={tdStyle}>
                        {b.completed_at ? new Date(b.completed_at).toLocaleDateString() : "—"}
                      </td>
                      <td style={tdStyle}>
                        {b.site_url ? (
                          <a href={b.site_url} target="_blank" rel="noreferrer" style={linkStyle}>
                            {trimUrl(b.site_url)}
                          </a>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td style={{ ...tdStyle, textAlign: "right", color: "#888886" }}>
                        {formatUsd(b.cost_usd)}
                      </td>
                      <td style={{ ...tdStyle, textAlign: "right", fontWeight: 600 }}>
                        {formatUsd(billableFor(b.cost_usd))}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td colSpan={3} style={{ ...tdStyle, fontWeight: 600 }}>
                      Total ({g.builds.length} site{g.builds.length === 1 ? "" : "s"})
                    </td>
                    <td style={{ ...tdStyle, textAlign: "right", color: "#888886" }}>
                      {formatUsd(g.rawTotal)}
                    </td>
                    <td style={{ ...tdStyle, textAlign: "right", fontWeight: 700 }}>
                      {formatUsd(g.billable)}
                    </td>
                  </tr>
                </tfoot>
              </table>

              <div style={{ marginTop: "16px", display: "flex", justifyContent: "flex-end" }}>
                <button
                  onClick={() => generateInvoice(g)}
                  disabled={generating === g.key}
                  className="btn-orange"
                  style={{ fontSize: "13px", padding: "10px 20px", opacity: generating === g.key ? 0.5 : 1 }}
                >
                  {generating === g.key ? "Generating…" : "Generate Invoice →"}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {tab === "invoices" && (
        <div style={cardStyle}>
          {invoices.length === 0 ? (
            <EmptyState message="No invoices yet. Generate one from the Unbilled tab." />
          ) : (
            <table style={tableStyle}>
              <thead>
                <tr>
                  <th style={thStyle}>Invoice #</th>
                  <th style={thStyle}>Source</th>
                  <th style={thStyle}>Period</th>
                  <th style={{ ...thStyle, textAlign: "right" }}>Amount</th>
                  <th style={thStyle}>Created</th>
                  <th style={thStyle}>Paid</th>
                  <th style={thStyle}></th>
                </tr>
              </thead>
              <tbody>
                {invoices.map((inv) => (
                  <tr key={inv.id}>
                    <td style={{ ...tdStyle, fontFamily: "var(--font-mono)", fontSize: "12px" }}>
                      {inv.invoice_number}
                    </td>
                    <td style={tdStyle}>{inv.source}</td>
                    <td style={tdStyle}>{monthLabel(inv.period_year, inv.period_month)}</td>
                    <td style={{ ...tdStyle, textAlign: "right", fontWeight: 600 }}>
                      {formatUsd(Number(inv.total_amount))}
                    </td>
                    <td style={tdStyle}>{new Date(inv.created_at).toLocaleDateString()}</td>
                    <td style={tdStyle}>
                      <label style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer" }}>
                        <input type="checkbox" checked={inv.paid} onChange={() => togglePaid(inv)} />
                        {inv.paid && inv.paid_at && (
                          <span style={{ fontSize: "11px", color: "#888886" }}>
                            {new Date(inv.paid_at).toLocaleDateString()}
                          </span>
                        )}
                      </label>
                    </td>
                    <td style={tdStyle}>
                      <Link href={`/admin/billing/invoice/${inv.id}`} style={linkStyle}>
                        View →
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      <p style={{ marginTop: "32px", fontSize: "11px", color: "#888886", fontFamily: "var(--font-sans)" }}>
        Billable amounts include a {Math.round((BILLING_MARKUP - 1) * 100)}% margin over actual API cost. The invoice itself
        only shows the billable amount.
      </p>
    </>
  );
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ ...cardStyle, padding: "16px 20px" }}>
      <div style={cardEyebrowStyle}>{label}</div>
      <div style={{ fontFamily: "var(--font-serif)", fontSize: "1.5rem", fontWeight: 700, color: "#111110" }}>
        {value}
      </div>
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div style={{ padding: "32px 16px", textAlign: "center", color: "#888886", fontFamily: "var(--font-sans)", fontSize: "13px" }}>
      {message}
    </div>
  );
}

function trimUrl(url: string): string {
  return url.replace(/^https?:\/\//, "").replace(/\/$/, "").slice(0, 50);
}

const headerStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  marginBottom: "24px",
  flexWrap: "wrap",
  gap: "16px",
};
const labelStyle: React.CSSProperties = {
  fontFamily: "var(--font-mono)",
  fontSize: "11px",
  textTransform: "uppercase",
  letterSpacing: "0.08em",
  color: "#888886",
  marginBottom: "6px",
};
const titleStyle: React.CSSProperties = {
  fontFamily: "var(--font-serif)",
  fontSize: "clamp(1.5rem, 4vw, 2rem)",
  fontWeight: 700,
  color: "#111110",
};
const linkBtnStyle: React.CSSProperties = {
  fontFamily: "var(--font-sans)",
  fontSize: "13px",
  color: "#555553",
  textDecoration: "none",
  border: "1.5px solid #d8d6cf",
  borderRadius: "3px",
  padding: "6px 14px",
};
const tabsRowStyle: React.CSSProperties = {
  display: "flex",
  gap: "4px",
  borderBottom: "1px solid #e8e6df",
  marginBottom: "24px",
};
const tabBtnStyle: React.CSSProperties = {
  fontFamily: "var(--font-mono)",
  fontSize: "11px",
  textTransform: "uppercase",
  letterSpacing: "0.08em",
  fontWeight: 600,
  background: "transparent",
  border: "none",
  padding: "8px 16px",
  cursor: "pointer",
  transition: "color 0.15s, border-color 0.15s",
};
const cardStyle: React.CSSProperties = {
  background: "#ffffff",
  border: "1.5px solid #e8e6df",
  borderRadius: "6px",
  padding: "20px 24px",
};
const cardHeaderStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  marginBottom: "16px",
};
const cardEyebrowStyle: React.CSSProperties = {
  fontFamily: "var(--font-mono)",
  fontSize: "10px",
  textTransform: "uppercase",
  letterSpacing: "0.08em",
  color: "#888886",
  marginBottom: "4px",
};
const cardTitleStyle: React.CSSProperties = {
  fontFamily: "var(--font-serif)",
  fontSize: "1.25rem",
  fontWeight: 700,
  color: "#111110",
};
const cardTotalStyle: React.CSSProperties = {
  fontFamily: "var(--font-serif)",
  fontSize: "1.25rem",
  fontWeight: 700,
  color: "#ff3d00",
};
const tableStyle: React.CSSProperties = {
  width: "100%",
  borderCollapse: "collapse",
  fontFamily: "var(--font-sans)",
  fontSize: "13px",
};
const thStyle: React.CSSProperties = {
  textAlign: "left",
  fontFamily: "var(--font-mono)",
  fontSize: "10px",
  textTransform: "uppercase",
  letterSpacing: "0.08em",
  color: "#888886",
  fontWeight: 600,
  padding: "10px 12px",
  borderBottom: "1px solid #e8e6df",
};
const tdStyle: React.CSSProperties = {
  padding: "10px 12px",
  borderBottom: "1px solid #f0eeea",
  color: "#111110",
};
const linkStyle: React.CSSProperties = {
  color: "#ff3d00",
  textDecoration: "none",
  fontWeight: 500,
};
