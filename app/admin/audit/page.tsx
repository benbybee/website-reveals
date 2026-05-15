import { createSSRClient } from "@/lib/supabase/server-ssr";
import { redirect } from "next/navigation";
import { listAuditEntries } from "@/lib/audit-log";
import Link from "next/link";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Audit Log — Website Reveals",
};

const ACTION_COLORS: Record<string, string> = {
  "task.status_changed": "#7c4dff",
  "client.sales_rep_changed": "#ff3d00",
  "client.bulk_assigned": "#ff3d00",
  "client.updated": "#888886",
  "task.change_requested": "#b3300a",
  "task.comment_added": "#2e7d32",
  "build.reconciled_timeout": "#b3300a",
};

export default async function AuditLogPage() {
  const ssr = await createSSRClient();
  const {
    data: { user },
  } = await ssr.auth.getUser();
  if (!user) redirect("/admin/login");

  const entries = await listAuditEntries({ limit: 200 });

  return (
    <div style={{ minHeight: "100vh", background: "#faf9f5", padding: "32px 24px 80px" }}>
      <div style={{ maxWidth: "1200px", margin: "0 auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "24px", flexWrap: "wrap", gap: "16px" }}>
          <div>
            <p style={{ fontFamily: "var(--font-mono)", fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.08em", color: "#888886", marginBottom: "6px" }}>
              Admin · Audit
            </p>
            <h1 style={{ fontFamily: "var(--font-serif)", fontSize: "clamp(1.5rem, 4vw, 2rem)", fontWeight: 700, color: "#111110" }}>
              Audit Log
            </h1>
          </div>
          <Link href="/admin" style={{ fontFamily: "var(--font-sans)", fontSize: "13px", color: "#555553", textDecoration: "none", border: "1.5px solid #d8d6cf", borderRadius: "3px", padding: "6px 14px" }}>
            ← Dashboard
          </Link>
        </div>

        <div style={{ background: "#fff", border: "1.5px solid #e8e6df", borderRadius: "6px", padding: "8px" }}>
          {entries.length === 0 ? (
            <div style={{ padding: "40px 16px", textAlign: "center", color: "#888886", fontFamily: "var(--font-sans)", fontSize: "13px" }}>
              No audit entries yet. Actions taken in the admin (status changes, assignments, etc.) will appear here.
            </div>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: "var(--font-sans)", fontSize: "13px" }}>
              <thead>
                <tr>
                  <th style={th}>When</th>
                  <th style={th}>Actor</th>
                  <th style={th}>Action</th>
                  <th style={th}>Target</th>
                  <th style={th}>Details</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((e) => (
                  <tr key={e.id}>
                    <td style={{ ...td, color: "#888886", whiteSpace: "nowrap" }}>{new Date(e.created_at).toLocaleString()}</td>
                    <td style={td}>
                      <div style={{ fontSize: "11px", color: "#888886", fontFamily: "var(--font-mono)" }}>{e.actor_type}</div>
                      <div>{e.actor_id || "—"}</div>
                    </td>
                    <td style={td}>
                      <span
                        style={{
                          display: "inline-block",
                          padding: "2px 8px",
                          borderRadius: "3px",
                          background: (ACTION_COLORS[e.action] || "#888886") + "22",
                          color: ACTION_COLORS[e.action] || "#555553",
                          fontFamily: "var(--font-mono)",
                          fontSize: "11px",
                          fontWeight: 600,
                        }}
                      >
                        {e.action}
                      </span>
                    </td>
                    <td style={td}>
                      {e.target_type && (
                        <>
                          <div style={{ fontSize: "11px", color: "#888886", fontFamily: "var(--font-mono)" }}>{e.target_type}</div>
                          <div style={{ fontFamily: "var(--font-mono)", fontSize: "11px" }}>{(e.target_id || "").slice(0, 8)}</div>
                        </>
                      )}
                    </td>
                    <td style={{ ...td, maxWidth: "400px" }}>
                      <pre style={{ fontFamily: "var(--font-mono)", fontSize: "11px", margin: 0, whiteSpace: "pre-wrap", wordBreak: "break-word", color: "#555553" }}>
                        {e.details ? JSON.stringify(e.details) : ""}
                      </pre>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <p style={{ marginTop: "16px", fontSize: "11px", color: "#888886", fontFamily: "var(--font-sans)" }}>
          Showing the 200 most recent entries. Records are append-only and not editable.
        </p>
      </div>
    </div>
  );
}

const th: React.CSSProperties = {
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
const td: React.CSSProperties = {
  padding: "10px 12px",
  borderBottom: "1px solid #f0eeea",
  color: "#111110",
  verticalAlign: "top",
};
