"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

export interface CampaignSummary {
  id: string;
  industry_slug: string;
  locations: { state?: string; city?: string }[];
  status: string;
  target_count: number;
  scraped_count: number;
  qualified_count: number;
  incomplete_count: number;
  pushed_count: number;
  audit_enabled: boolean;
  cost_total: number;
  cost_per_qualified: number | null;
  created_at: string;
}

interface LocationRow {
  state: string;
  city: string;
}

export function CampaignsPanel({ campaigns }: { campaigns: CampaignSummary[] }) {
  const router = useRouter();
  const [showForm, setShowForm] = useState(false);
  const [industrySlug, setIndustrySlug] = useState("");
  const [targetCount, setTargetCount] = useState(25);
  const [auditEnabled, setAuditEnabled] = useState(false);
  const [locations, setLocations] = useState<LocationRow[]>([{ state: "", city: "" }]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [runningId, setRunningId] = useState<string | null>(null);

  function updateLocation(i: number, patch: Partial<LocationRow>) {
    setLocations((prev) => prev.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  }

  async function createCampaign(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const cleanLocs = locations
      .map((l) => ({ state: l.state.trim(), city: l.city.trim() || undefined }))
      .filter((l) => l.state);
    if (!industrySlug.trim()) return setError("Industry slug is required.");
    if (cleanLocs.length === 0) return setError("At least one location with a state is required.");

    setBusy(true);
    try {
      const res = await fetch("/api/templates/campaigns", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          industry_slug: industrySlug.trim(),
          locations: cleanLocs,
          target_count: targetCount,
          audit_enabled: auditEnabled,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to create campaign");
      setShowForm(false);
      setIndustrySlug("");
      setLocations([{ state: "", city: "" }]);
      router.refresh();
    } catch (err) {
      setError(String(err instanceof Error ? err.message : err));
    } finally {
      setBusy(false);
    }
  }

  async function runCampaign(id: string) {
    setRunningId(id);
    try {
      const res = await fetch(`/api/templates/campaigns/${id}/run`, { method: "POST" });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error || "Failed to start run");
      }
      router.refresh();
    } catch (err) {
      alert(String(err instanceof Error ? err.message : err));
    } finally {
      setRunningId(null);
    }
  }

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
        <Link href="/admin" style={{ fontSize: 13, color: "#888886", textDecoration: "none" }}>← Dashboard</Link>
        <Link href="/admin/templates/sales" style={navBtn}>Sales board →</Link>
      </div>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 22 }}>
        <div>
          <h1 style={{ fontFamily: "var(--font-serif)", fontSize: "2rem", fontWeight: 700, marginBottom: 6 }}>
            Template Sites
          </h1>
          <p style={{ fontSize: 14, color: "#555553" }}>
            Scrape businesses by industry, enrich into SiteLaunchr-ready records, and push qualified prospects.
          </p>
        </div>
        <button onClick={() => setShowForm((v) => !v)} style={primaryBtn}>
          {showForm ? "Cancel" : "+ New campaign"}
        </button>
      </div>

      {showForm && (
        <form onSubmit={createCampaign} style={card}>
          {error && <div style={errorBox}>{error}</div>}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 140px", gap: 16, marginBottom: 16 }}>
            <label style={fieldLabel}>
              Industry slug
              <input
                value={industrySlug}
                onChange={(e) => setIndustrySlug(e.target.value)}
                placeholder="pest-control"
                style={input}
              />
            </label>
            <label style={fieldLabel}>
              Target / search
              <input
                type="number"
                min={1}
                value={targetCount}
                onChange={(e) => setTargetCount(parseInt(e.target.value, 10) || 0)}
                style={input}
              />
            </label>
          </div>

          <div style={{ marginBottom: 8, ...fieldLabel }}>Locations</div>
          {locations.map((loc, i) => (
            <div key={i} style={{ display: "grid", gridTemplateColumns: "100px 1fr 32px", gap: 10, marginBottom: 8 }}>
              <input value={loc.state} onChange={(e) => updateLocation(i, { state: e.target.value })} placeholder="State (AZ)" style={input} />
              <input value={loc.city} onChange={(e) => updateLocation(i, { city: e.target.value })} placeholder="City (optional)" style={input} />
              <button type="button" onClick={() => setLocations((p) => p.filter((_, idx) => idx !== i))} style={iconBtn} disabled={locations.length === 1}>×</button>
            </div>
          ))}
          <button type="button" onClick={() => setLocations((p) => [...p, { state: "", city: "" }])} style={ghostBtn}>+ Add location</button>

          <label style={{ display: "flex", alignItems: "center", gap: 8, margin: "16px 0", fontSize: 13, color: "#555553" }}>
            <input type="checkbox" checked={auditEnabled} onChange={(e) => setAuditEnabled(e.target.checked)} />
            Enable deep audit (tech-stack + Lighthouse) by default
          </label>

          <button type="submit" disabled={busy} style={primaryBtn}>{busy ? "Creating…" : "Create campaign"}</button>
        </form>
      )}

      <div style={{ background: "#fff", border: "1.5px solid #e8e6df", borderRadius: 6, overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: "var(--font-sans)" }}>
          <thead>
            <tr style={{ background: "#f5f4ef", borderBottom: "1.5px solid #e8e6df" }}>
              <th style={th}>Campaign</th>
              <th style={{ ...th, textAlign: "center" }}>Status</th>
              <th style={{ ...th, textAlign: "center" }}>Scraped</th>
              <th style={{ ...th, textAlign: "center" }}>Qualified</th>
              <th style={{ ...th, textAlign: "center" }}>Incomplete</th>
              <th style={{ ...th, textAlign: "right" }}>Cost</th>
              <th style={{ ...th, width: 160 }} />
            </tr>
          </thead>
          <tbody>
            {campaigns.length === 0 && (
              <tr><td colSpan={7} style={{ ...td, textAlign: "center", color: "#888886", padding: 32 }}>No campaigns yet.</td></tr>
            )}
            {campaigns.map((c) => (
              <tr key={c.id} style={{ borderTop: "1px solid #f0eeea" }}>
                <td style={td}>
                  <div style={{ fontWeight: 600, color: "#111110" }}>{c.industry_slug}</div>
                  <div style={{ fontSize: 11, color: "#888886", fontFamily: "var(--font-mono)" }}>
                    {c.locations.map((l) => (l.city ? `${l.city}, ${l.state}` : l.state)).join(" · ") || "—"}
                  </div>
                </td>
                <td style={{ ...td, textAlign: "center" }}><StatusBadge status={c.status} /></td>
                <td style={{ ...td, textAlign: "center", fontFamily: "var(--font-mono)" }}>{c.scraped_count}</td>
                <td style={{ ...td, textAlign: "center", fontFamily: "var(--font-mono)", color: "#0a7a3d", fontWeight: 600 }}>{c.qualified_count}</td>
                <td style={{ ...td, textAlign: "center", fontFamily: "var(--font-mono)", color: c.incomplete_count ? "#b3300a" : "#bbb" }}>{c.incomplete_count}</td>
                <td style={{ ...td, textAlign: "right", fontFamily: "var(--font-mono)" }}>
                  ${c.cost_total.toFixed(2)}
                  {c.cost_per_qualified != null && <div style={{ fontSize: 10, color: "#888886" }}>${c.cost_per_qualified.toFixed(2)}/qual</div>}
                </td>
                <td style={{ ...td, textAlign: "right" }}>
                  <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                    <button onClick={() => runCampaign(c.id)} disabled={runningId === c.id} style={ghostBtn}>
                      {runningId === c.id ? "…" : "Run"}
                    </button>
                    <Link href={`/admin/templates/campaigns/${c.id}`} style={manageLink}>Open →</Link>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    draft: "#888886", discovering: "#b36b00", enriching: "#b36b00",
    ready: "#0a7a3d", pushing: "#0a4a7a", done: "#0a7a3d",
  };
  const color = map[status] ?? "#555553";
  return (
    <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.05em", color, border: `1.5px solid ${color}40`, borderRadius: 10, padding: "2px 8px", fontWeight: 600 }}>
      {status}
    </span>
  );
}

const th: React.CSSProperties = { padding: "10px 14px", textAlign: "left", fontFamily: "var(--font-mono)", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.06em", color: "#555553", fontWeight: 600 };
const td: React.CSSProperties = { padding: "12px 14px", fontSize: 13, verticalAlign: "middle" };
const card: React.CSSProperties = { background: "#fff", border: "1.5px solid #e8e6df", borderRadius: 6, padding: 20, marginBottom: 22 };
const input: React.CSSProperties = { width: "100%", padding: "8px 10px", border: "1.5px solid #d8d6cf", borderRadius: 4, fontSize: 13, fontFamily: "var(--font-sans)", marginTop: 4 };
const fieldLabel: React.CSSProperties = { fontFamily: "var(--font-mono)", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.05em", color: "#555553", fontWeight: 600, display: "block" };
const primaryBtn: React.CSSProperties = { fontFamily: "var(--font-sans)", fontSize: 13, fontWeight: 600, color: "#fff", background: "#ff3d00", border: "none", borderRadius: 4, padding: "8px 18px", cursor: "pointer" };
const ghostBtn: React.CSSProperties = { fontFamily: "var(--font-sans)", fontSize: 12, fontWeight: 500, color: "#555553", background: "transparent", border: "1.5px solid #d8d6cf", borderRadius: 4, padding: "6px 12px", cursor: "pointer" };
const navBtn: React.CSSProperties = { fontFamily: "var(--font-mono)", fontSize: 12, textTransform: "uppercase", letterSpacing: "0.05em", color: "#555553", textDecoration: "none", border: "1.5px solid #d8d6cf", borderRadius: 3, padding: "6px 14px", fontWeight: 600 };
const manageLink: React.CSSProperties = { fontSize: 12, color: "#ff3d00", textDecoration: "none", fontFamily: "var(--font-mono)", textTransform: "uppercase", letterSpacing: "0.04em", fontWeight: 600, alignSelf: "center" };
const iconBtn: React.CSSProperties = { background: "transparent", border: "1.5px solid #d8d6cf", borderRadius: 4, cursor: "pointer", color: "#888886", fontSize: 16 };
const errorBox: React.CSSProperties = { background: "#fff0ec", border: "1.5px solid #ffcdc0", color: "#b3300a", padding: "8px 12px", borderRadius: 4, fontSize: 13, marginBottom: 16 };
