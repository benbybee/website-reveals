import { createServerClient } from "@/lib/supabase/server";
import { createSSRClient } from "@/lib/supabase/server-ssr";
import { redirect } from "next/navigation";
import Link from "next/link";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Archived Tasks — Website Reveals",
};

const RETENTION_DAYS = 90;

interface ArchivedRow {
  id: string;
  title: string;
  status: string;
  priority: string;
  completed_at: string | null;
  archived_at: string;
  tags: string[];
  client: {
    id: string;
    first_name: string;
    last_name: string;
    company_name: string;
    email: string;
  } | null;
}

export default async function ArchivedTasksPage() {
  const ssr = await createSSRClient();
  const {
    data: { user },
  } = await ssr.auth.getUser();
  if (!user) redirect("/admin/login");

  const supabase = createServerClient();
  const cutoff = new Date(Date.now() - RETENTION_DAYS * 86_400_000).toISOString();

  const { data: rows } = await supabase
    .from("tasks")
    .select(
      "id, title, status, priority, completed_at, archived_at, tags, client:clients(id, first_name, last_name, company_name, email)",
    )
    .not("archived_at", "is", null)
    .gte("archived_at", cutoff)
    .order("archived_at", { ascending: false })
    .limit(500);

  const tasks = (rows || []) as unknown as ArchivedRow[];

  return (
    <div style={{ minHeight: "100vh", background: "#faf9f5", padding: "32px 24px 80px" }}>
      <div style={{ maxWidth: "1200px", margin: "0 auto" }}>
        <div style={headerStyle}>
          <div>
            <p style={eyebrow}>Admin · Archived</p>
            <h1 style={titleStyle}>Archived Tasks</h1>
            <p style={{ fontSize: "13px", color: "#888886", marginTop: "6px", fontFamily: "var(--font-sans)" }}>
              Tasks auto-archive 7 days after they're marked complete. Shown here for {RETENTION_DAYS} days
              after archival; older archives are hidden but stay in the database.
            </p>
          </div>
          <Link href="/admin" style={linkBtnStyle}>← Dashboard</Link>
        </div>

        <div style={cardStyle}>
          {tasks.length === 0 ? (
            <div style={{ padding: "40px 16px", textAlign: "center", color: "#888886", fontFamily: "var(--font-sans)", fontSize: "13px" }}>
              No archived tasks in the last {RETENTION_DAYS} days. They'll show up here automatically once completed tasks age past 7 days.
            </div>
          ) : (
            <table style={tableStyle}>
              <thead>
                <tr>
                  <th style={th}>Task</th>
                  <th style={th}>Client</th>
                  <th style={th}>Status when archived</th>
                  <th style={th}>Completed</th>
                  <th style={th}>Archived</th>
                </tr>
              </thead>
              <tbody>
                {tasks.map((t) => (
                  <tr key={t.id}>
                    <td style={td}>
                      <div style={{ fontWeight: 600 }}>{t.title}</div>
                      {t.tags && t.tags.length > 0 && (
                        <div style={{ marginTop: 4, display: "flex", flexWrap: "wrap", gap: 4 }}>
                          {t.tags.map((tag) => (
                            <span key={tag} style={tagStyle}>
                              {tag}
                            </span>
                          ))}
                        </div>
                      )}
                    </td>
                    <td style={td}>
                      {t.client ? (t.client.company_name || `${t.client.first_name} ${t.client.last_name}`) : "—"}
                    </td>
                    <td style={td}>
                      <span style={statusPillStyle}>{t.status}</span>
                    </td>
                    <td style={{ ...td, color: "#888886", whiteSpace: "nowrap" }}>
                      {t.completed_at ? new Date(t.completed_at).toLocaleDateString() : "—"}
                    </td>
                    <td style={{ ...td, color: "#888886", whiteSpace: "nowrap" }}>
                      {new Date(t.archived_at).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <p style={{ marginTop: "16px", fontSize: "11px", color: "#888886", fontFamily: "var(--font-sans)" }}>
          Showing the most recent 500 entries within the {RETENTION_DAYS}-day window.
        </p>
      </div>
    </div>
  );
}

const headerStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  marginBottom: "24px",
  flexWrap: "wrap",
  gap: "16px",
};
const eyebrow: React.CSSProperties = {
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
const cardStyle: React.CSSProperties = {
  background: "#fff",
  border: "1.5px solid #e8e6df",
  borderRadius: "6px",
  padding: "8px",
};
const tableStyle: React.CSSProperties = {
  width: "100%",
  borderCollapse: "collapse",
  fontFamily: "var(--font-sans)",
  fontSize: "13px",
};
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
const tagStyle: React.CSSProperties = {
  fontFamily: "var(--font-mono)",
  fontSize: "10px",
  background: "#f0eeea",
  color: "#555553",
  padding: "1px 6px",
  borderRadius: "2px",
};
const statusPillStyle: React.CSSProperties = {
  display: "inline-block",
  fontFamily: "var(--font-mono)",
  fontSize: "10px",
  background: "#e8e6df",
  color: "#555553",
  padding: "2px 8px",
  borderRadius: "2px",
  textTransform: "uppercase",
  letterSpacing: "0.05em",
};
