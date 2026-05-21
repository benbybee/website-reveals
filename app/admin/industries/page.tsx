import { createSSRClient } from "@/lib/supabase/server-ssr";
import { createServerClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { INDUSTRY_CATEGORIES } from "@/lib/industries";

export const dynamic = "force-dynamic";

export const metadata = { title: "Industries — Website Reveals" };

export default async function IndustriesIndexPage() {
  const ssr = await createSSRClient();
  const { data: { user } } = await ssr.auth.getUser();
  if (!user) redirect("/admin/login");

  // Pull counts per slug + pending Other count in two queries.
  const supabase = createServerClient();
  const [refsRes, aliasesRes, pendingRes] = await Promise.all([
    supabase.from("industry_references").select("industry_slug, active"),
    supabase.from("industry_aliases").select("industry_slug, active"),
    supabase
      .from("industry_other_log")
      .select("*", { count: "exact", head: true })
      .in("status", ["pending", "auto_mapped"]),
  ]);

  const refCounts = new Map<string, number>();
  for (const r of refsRes.data || []) {
    if (!r.active) continue;
    refCounts.set(r.industry_slug, (refCounts.get(r.industry_slug) || 0) + 1);
  }
  const aliasCounts = new Map<string, number>();
  for (const a of aliasesRes.data || []) {
    if (!a.active) continue;
    aliasCounts.set(a.industry_slug, (aliasCounts.get(a.industry_slug) || 0) + 1);
  }
  const otherQueueCount = pendingRes.count ?? 0;

  return (
    <div style={{ minHeight: "100vh", background: "#faf9f5", padding: "32px 24px 80px" }}>
      <div style={{ maxWidth: 980, margin: "0 auto" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
          <Link href="/admin" style={{ fontSize: 13, color: "#888886", textDecoration: "none" }}>← Dashboard</Link>
          <Link
            href="/admin/industries/other-review"
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 12,
              textTransform: "uppercase",
              letterSpacing: "0.05em",
              color: otherQueueCount > 0 ? "#b3300a" : "#555553",
              textDecoration: "none",
              border: `1.5px solid ${otherQueueCount > 0 ? "#b3300a" : "#d8d6cf"}`,
              borderRadius: 3,
              padding: "6px 14px",
              fontWeight: 600,
            }}
          >
            Other review queue {otherQueueCount > 0 ? `(${otherQueueCount})` : ""}
          </Link>
        </div>
        <h1 style={{ fontFamily: "var(--font-serif)", fontSize: "2rem", fontWeight: 700, marginBottom: 6 }}>
          Industries
        </h1>
        <p style={{ fontSize: 14, color: "#555553", marginBottom: 28 }}>
          Reference URLs attached here auto-fill every /sales submission&apos;s inspiration list based on the chosen industry. Aliases let &quot;Other&quot; submissions auto-route to a fixed industry.
        </p>

        <div style={{ background: "#fff", border: "1.5px solid #e8e6df", borderRadius: 6, overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: "var(--font-sans)" }}>
            <thead>
              <tr style={{ background: "#f5f4ef", borderBottom: "1.5px solid #e8e6df" }}>
                <th style={th}>Industry</th>
                <th style={{ ...th, textAlign: "center", width: 120 }}>References</th>
                <th style={{ ...th, textAlign: "center", width: 100 }}>Aliases</th>
                <th style={{ ...th, width: 100 }} />
              </tr>
            </thead>
            <tbody>
              {INDUSTRY_CATEGORIES.map((cat) => {
                const isOther = cat.slug === "other";
                return (
                  <tr key={cat.slug} style={{ borderTop: "1px solid #f0eeea" }}>
                    <td style={td}>
                      <div style={{ fontWeight: 600, color: "#111110" }}>{cat.label}</div>
                      <div style={{ fontSize: 11, color: "#888886", fontFamily: "var(--font-mono)" }}>{cat.slug}</div>
                    </td>
                    <td style={{ ...td, textAlign: "center", fontFamily: "var(--font-mono)", color: refCounts.get(cat.slug) ? "#111110" : "#bbb" }}>
                      {isOther ? "—" : (refCounts.get(cat.slug) || 0)}
                    </td>
                    <td style={{ ...td, textAlign: "center", fontFamily: "var(--font-mono)", color: aliasCounts.get(cat.slug) ? "#111110" : "#bbb" }}>
                      {isOther ? "—" : (aliasCounts.get(cat.slug) || 0)}
                    </td>
                    <td style={{ ...td, textAlign: "right" }}>
                      {!isOther && (
                        <Link
                          href={`/admin/industries/${cat.slug}`}
                          style={{
                            fontSize: 12,
                            color: "#ff3d00",
                            textDecoration: "none",
                            fontFamily: "var(--font-mono)",
                            textTransform: "uppercase",
                            letterSpacing: "0.04em",
                            fontWeight: 600,
                          }}
                        >
                          Manage →
                        </Link>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

const th: React.CSSProperties = {
  padding: "10px 14px",
  textAlign: "left",
  fontFamily: "var(--font-mono)",
  fontSize: 11,
  textTransform: "uppercase",
  letterSpacing: "0.06em",
  color: "#555553",
  fontWeight: 600,
};
const td: React.CSSProperties = {
  padding: "12px 14px",
  fontSize: 13,
  verticalAlign: "middle",
};
