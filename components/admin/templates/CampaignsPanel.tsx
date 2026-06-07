"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { TplIndustry } from "@/lib/templates/industries";
import { US_STATES } from "@/lib/templates/normalize/state";
import { RerunModal, type RerunTarget } from "./RerunModal";

export interface CampaignSummary {
  id: string;
  industry_slug: string;
  state: string | null;
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

const BLANK = { industrySlug: "", state: "", cities: [""], targetCount: 25, auditEnabled: false };

export function CampaignsPanel({ campaigns, industries }: { campaigns: CampaignSummary[]; industries: TplIndustry[] }) {
  const router = useRouter();
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [industrySlug, setIndustrySlug] = useState(BLANK.industrySlug);
  const [state, setState] = useState(BLANK.state);
  const [cities, setCities] = useState<string[]>(BLANK.cities);
  const [targetCount, setTargetCount] = useState(BLANK.targetCount);
  const [auditEnabled, setAuditEnabled] = useState(BLANK.auditEnabled);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [runningId, setRunningId] = useState<string | null>(null);
  const [rerunTarget, setRerunTarget] = useState<RerunTarget | null>(null);

  function resetForm() {
    setEditingId(null);
    setIndustrySlug(BLANK.industrySlug);
    setState(BLANK.state);
    setCities(BLANK.cities);
    setTargetCount(BLANK.targetCount);
    setAuditEnabled(BLANK.auditEnabled);
    setError(null);
  }

  function openCreate() {
    resetForm();
    setShowForm(true);
  }

  function openEdit(c: CampaignSummary) {
    const cityList = [...new Set(c.locations.map((l) => (l.city ?? "").trim()).filter(Boolean))];
    setEditingId(c.id);
    setIndustrySlug(c.industry_slug);
    setState(c.state ?? c.locations[0]?.state ?? "");
    setCities(cityList.length ? cityList : [""]);
    setTargetCount(c.target_count || 25);
    setAuditEnabled(c.audit_enabled);
    setError(null);
    setShowForm(true);
  }

  function buildLocations() {
    const cleanCities = cities.map((c) => c.trim()).filter(Boolean);
    return cleanCities.length ? cleanCities.map((city) => ({ state, city })) : [{ state }];
  }

  async function submitForm(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!industrySlug.trim()) return setError("Please select an industry.");
    if (!state) return setError("Please select a state.");

    setBusy(true);
    try {
      const locations = buildLocations();
      const url = editingId ? `/api/templates/campaigns/${editingId}` : "/api/templates/campaigns";
      const method = editingId ? "PATCH" : "POST";
      const body = editingId
        ? { locations, target_count: targetCount, audit_enabled: auditEnabled }
        : { industry_slug: industrySlug.trim(), locations, target_count: targetCount, audit_enabled: auditEnabled };
      const res = await fetch(url, { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || "Failed to save campaign");
      setShowForm(false);
      resetForm();
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

  function openRerun(c: CampaignSummary) {
    const cityCount = new Set(c.locations.map((l) => (l.city ?? "").trim()).filter(Boolean)).size;
    setRerunTarget({
      id: c.id,
      industry_slug: c.industry_slug,
      state: c.state,
      target_count: c.target_count,
      scraped_count: c.scraped_count,
      cityCount,
    });
  }

  // A campaign that has produced prospects gets "Re-run" (full control); one that
  // hasn't yet gets a plain first "Run".
  const hasRun = (c: CampaignSummary) => c.scraped_count > 0;

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
        <Link href="/admin" style={{ fontSize: 13, color: "#888886", textDecoration: "none" }}>← Dashboard</Link>
        <div style={{ display: "flex", gap: 8 }}>
          <Link href="/admin/templates/industries" style={navBtn}>Industries</Link>
          <Link href="/admin/templates/mail" style={navBtn}>Mail settings</Link>
          <Link href="/admin/templates/sales" style={navBtn}>Sales board →</Link>
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 22 }}>
        <div>
          <h1 style={{ fontFamily: "var(--font-serif)", fontSize: "2rem", fontWeight: 700, marginBottom: 6 }}>
            Template Sites
          </h1>
          <p style={{ fontSize: 14, color: "#555553" }}>
            One campaign per industry + state. Develop each list by re-running to add, enrich, or refresh prospects.
          </p>
        </div>
        <button onClick={() => (showForm ? (setShowForm(false), resetForm()) : openCreate())} style={primaryBtn}>
          {showForm ? "Cancel" : "+ New campaign"}
        </button>
      </div>

      {showForm && (
        <form onSubmit={submitForm} style={card}>
          {error && <div style={errorBox}>{error}</div>}
          {editingId && (
            <div style={{ fontSize: 12, color: "#888886", marginBottom: 12, fontFamily: "var(--font-mono)" }}>
              Editing {industrySlug} · {state} — industry &amp; state are fixed once created.
            </div>
          )}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 120px", gap: 16, marginBottom: 16 }}>
            <label style={fieldLabel}>
              Industry
              {industries.length === 0 ? (
                <span style={{ ...input, display: "block", color: "#b3300a", fontFamily: "var(--font-sans)" }}>
                  No industries yet — <Link href="/admin/templates/industries" style={{ color: "#ff3d00" }}>add one</Link> first.
                </span>
              ) : (
                <select value={industrySlug} onChange={(e) => setIndustrySlug(e.target.value)} style={input} disabled={!!editingId}>
                  <option value="">Select an industry…</option>
                  {industries.map((ind) => (
                    <option key={ind.slug} value={ind.slug}>{ind.display_name}</option>
                  ))}
                </select>
              )}
            </label>
            <label style={fieldLabel}>
              State
              <select value={state} onChange={(e) => setState(e.target.value)} style={input} disabled={!!editingId}>
                <option value="">State…</option>
                {US_STATES.map((s) => <option key={s.abbr} value={s.abbr}>{s.name} ({s.abbr})</option>)}
              </select>
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

          <div style={{ marginBottom: 8, ...fieldLabel }}>Cities (optional — leave blank to crawl the whole state)</div>
          {cities.map((city, i) => (
            <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr 32px", gap: 10, marginBottom: 8 }}>
              <input
                value={city}
                onChange={(e) => setCities((p) => p.map((c, idx) => (idx === i ? e.target.value : c)))}
                placeholder="City"
                style={input}
              />
              <button type="button" onClick={() => setCities((p) => p.filter((_, idx) => idx !== i))} style={iconBtn} disabled={cities.length === 1}>×</button>
            </div>
          ))}
          <button type="button" onClick={() => setCities((p) => [...p, ""])} style={ghostBtn}>+ Add city</button>

          <label style={{ display: "flex", alignItems: "center", gap: 8, margin: "16px 0", fontSize: 13, color: "#555553" }}>
            <input type="checkbox" checked={auditEnabled} onChange={(e) => setAuditEnabled(e.target.checked)} />
            Enable deep audit (tech-stack + Lighthouse) by default
          </label>

          <button type="submit" disabled={busy} style={primaryBtn}>
            {busy ? "Saving…" : editingId ? "Save changes" : "Create campaign"}
          </button>
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
              <th style={{ ...th, width: 220 }} />
            </tr>
          </thead>
          <tbody>
            {campaigns.length === 0 && (
              <tr><td colSpan={7} style={{ ...td, textAlign: "center", color: "#888886", padding: 32 }}>No campaigns yet.</td></tr>
            )}
            {campaigns.map((c) => (
              <tr key={c.id} style={{ borderTop: "1px solid #f0eeea" }}>
                <td style={td}>
                  <div style={{ fontWeight: 600, color: "#111110" }}>{c.industry_slug} · {c.state ?? "—"}</div>
                  <div style={{ fontSize: 11, color: "#888886", fontFamily: "var(--font-mono)" }}>
                    {c.locations.map((l) => l.city).filter(Boolean).join(" · ") || "whole state"}
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
                    <button onClick={() => openEdit(c)} style={ghostBtn}>Edit</button>
                    {hasRun(c) ? (
                      <button onClick={() => openRerun(c)} style={ghostBtn}>Re-run</button>
                    ) : (
                      <button onClick={() => runCampaign(c.id)} disabled={runningId === c.id} style={ghostBtn}>
                        {runningId === c.id ? "…" : "Run"}
                      </button>
                    )}
                    <Link href={`/admin/templates/campaigns/${c.id}`} style={manageLink}>Open →</Link>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {rerunTarget && (
        <RerunModal
          target={rerunTarget}
          onClose={() => {
            setRerunTarget(null);
            router.refresh();
          }}
          onEditCities={() => {
            const c = campaigns.find((x) => x.id === rerunTarget.id);
            setRerunTarget(null);
            if (c) openEdit(c);
          }}
        />
      )}
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
