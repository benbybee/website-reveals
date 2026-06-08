import Link from "next/link";

export interface SalesCampaignSummary {
  id: string;
  name: string;
  created_at: string;
  prospect_count: number;
  awaiting_count: number;
}

/**
 * Sales-rep submission campaigns (kind='sales'). Each rep has one long-lived
 * campaign that collects the businesses they submit via /sales. Submissions land
 * here HELD (stage 'awaiting_template') until a template exists for the prospect's
 * industry; the operator then opens the campaign and pushes each prospect through
 * the same Approve → Push → Convert pipeline discovery prospects use.
 */
export function SalesCampaignsPanel({ campaigns }: { campaigns: SalesCampaignSummary[] }) {
  return (
    <div style={{ marginTop: 40 }}>
      <div style={{ marginBottom: 14 }}>
        <h2 style={{ fontFamily: "var(--font-serif)", fontSize: "1.4rem", fontWeight: 700, marginBottom: 6 }}>
          Sales submissions
        </h2>
        <p style={{ fontSize: 14, color: "#555553" }}>
          One campaign per sales rep. Submitted businesses wait here until a template
          exists for their industry — then open the campaign to push them to SiteLaunchr.
        </p>
      </div>

      <div style={{ background: "#fff", border: "1.5px solid #e8e6df", borderRadius: 6, overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: "var(--font-sans)" }}>
          <thead>
            <tr style={{ background: "#f5f4ef", borderBottom: "1.5px solid #e8e6df" }}>
              <th style={th}>Rep</th>
              <th style={{ ...th, textAlign: "center" }}>Submissions</th>
              <th style={{ ...th, textAlign: "center" }}>Awaiting template</th>
              <th style={{ ...th, width: 120 }} />
            </tr>
          </thead>
          <tbody>
            {campaigns.length === 0 && (
              <tr><td colSpan={4} style={{ ...td, textAlign: "center", color: "#888886", padding: 32 }}>No sales submissions yet.</td></tr>
            )}
            {campaigns.map((c) => (
              <tr key={c.id} style={{ borderTop: "1px solid #f0eeea" }}>
                <td style={td}>
                  <div style={{ fontWeight: 600, color: "#111110" }}>{c.name}</div>
                </td>
                <td style={{ ...td, textAlign: "center", fontFamily: "var(--font-mono)" }}>{c.prospect_count}</td>
                <td style={{ ...td, textAlign: "center", fontFamily: "var(--font-mono)", color: c.awaiting_count ? "#b36b00" : "#bbb", fontWeight: 600 }}>{c.awaiting_count}</td>
                <td style={{ ...td, textAlign: "right" }}>
                  <Link href={`/admin/templates/campaigns/${c.id}`} style={manageLink}>Open →</Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const th: React.CSSProperties = { padding: "10px 14px", textAlign: "left", fontFamily: "var(--font-mono)", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.06em", color: "#555553", fontWeight: 600 };
const td: React.CSSProperties = { padding: "12px 14px", fontSize: 13, verticalAlign: "middle" };
const manageLink: React.CSSProperties = { fontSize: 12, color: "#ff3d00", textDecoration: "none", fontFamily: "var(--font-mono)", textTransform: "uppercase", letterSpacing: "0.04em", fontWeight: 600 };
