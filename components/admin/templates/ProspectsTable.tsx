"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { CanonicalRecord } from "@/lib/templates/types";
import { ProspectDrawer } from "./ProspectDrawer";

export interface CampaignHeader {
  id: string;
  industry_slug: string;
  name: string | null;
  status: string;
  scraped_count: number;
  qualified_count: number;
  incomplete_count: number;
  pushed_count: number;
  cost_total: number;
  cost_per_qualified: number | null;
}

export interface Prospect {
  id: string;
  source_id: string;
  business_name: string | null;
  city: string | null;
  state: string | null;
  phone: string | null;
  website: string | null;
  website_status: string;
  confidence: number | null;
  completeness: { missing?: string[] } | null;
  stage: string;
  agent_id: string | null;
  record: CanonicalRecord;
  call_count?: number;
  last_called_at?: string | null;
  tpl_mailings?: { status: string; scan_count: number; last_scanned_at: string | null }[];
}

const STAGES = ["scraped", "enriching", "qualified", "incomplete", "approved", "awaiting_template", "building", "live", "build_failed"];
const PAGE_SIZE = 50;

export function ProspectsTable({ campaign }: { campaign: CampaignHeader }) {
  const [prospects, setProspects] = useState<Prospect[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [stageFilter, setStageFilter] = useState("");
  const [websiteFilter, setWebsiteFilter] = useState("");
  const [missingFilter, setMissingFilter] = useState("");
  const [dnaFilter, setDnaFilter] = useState("");
  const [addressFilter, setAddressFilter] = useState("");
  const [siteFilter, setSiteFilter] = useState("");
  const [exportedFilter, setExportedFilter] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [openId, setOpenId] = useState<string | null>(null);
  const [actionBusy, setActionBusy] = useState(false);
  const [reps, setReps] = useState<{ id: string; first_name: string; last_name: string | null }[]>([]);
  // Monotonic fetch token: rapid filter/page changes overlap requests, and an
  // older response landing last would otherwise overwrite the newer one.
  const fetchSeq = useRef(0);

  const load = useCallback(async () => {
    const seq = ++fetchSeq.current;
    setLoading(true);
    const sp = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) });
    if (stageFilter) sp.set("stage", stageFilter);
    if (websiteFilter) sp.set("website_status", websiteFilter);
    if (missingFilter) sp.set("missing", missingFilter);
    if (dnaFilter) sp.set("dna", dnaFilter);
    if (addressFilter) sp.set("address", addressFilter);
    if (siteFilter) sp.set("site", siteFilter);
    if (exportedFilter) sp.set("exported", exportedFilter);
    try {
      const res = await fetch(`/api/templates/campaigns/${campaign.id}/prospects?${sp}`);
      const json = await res.json();
      if (seq !== fetchSeq.current) return; // a newer request superseded this one
      if (res.ok) {
        setProspects(json.prospects);
        setTotal(json.total);
      }
    } finally {
      if (seq === fetchSeq.current) setLoading(false);
    }
  }, [campaign.id, page, stageFilter, websiteFilter, missingFilter, dnaFilter, addressFilter, siteFilter, exportedFilter]);

  useEffect(() => { load(); }, [load]);

  // Active reps for the "Assign rep" dropdown (sets tpl_prospects.sales_rep_id).
  useEffect(() => {
    fetch("/api/admin/sales-reps")
      .then((r) => r.json())
      .then((j) => setReps((j.reps ?? []).filter((r: { active: boolean }) => r.active)))
      .catch(() => {});
  }, []);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }
  function toggleAll() {
    setSelected((prev) => (prev.size === prospects.length ? new Set() : new Set(prospects.map((p) => p.id))));
  }

  async function estimateAndRun(kind: "deep-audit" | "backfill") {
    const ids = [...selected];
    if (ids.length === 0) return;
    const url = kind === "deep-audit"
      ? `/api/templates/campaigns/${campaign.id}/deep-audit`
      : `/api/templates/prospects/backfill`;
    const estRes = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ prospectIds: ids, dryRun: true }),
    });
    const est = await estRes.json();
    if (!estRes.ok) return alert(est.error || "Estimate failed");
    if (!confirm(`${kind === "deep-audit" ? "Deep audit" : "Backfill"} ${est.prospects} prospect(s) — est. $${Number(est.usd).toFixed(2)} in Apify credits. Proceed?`)) return;

    setActionBusy(true);
    try {
      const runRes = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ prospectIds: ids }),
      });
      const json = await runRes.json();
      if (!runRes.ok) throw new Error(json.error || "Run failed");
      setSelected(new Set());
      alert(`Started — run ${json.runId}`);
    } catch (e) {
      alert(String(e instanceof Error ? e.message : e));
    } finally {
      setActionBusy(false);
    }
  }

  async function assignRep(repId: string) {
    const ids = [...selected];
    if (ids.length === 0 || !repId) return;
    setActionBusy(true);
    try {
      const res = await fetch(`/api/templates/prospects/bulk`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ids, sales_rep_id: repId }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Assign failed");
      setSelected(new Set());
      load();
    } catch (e) {
      alert(String(e instanceof Error ? e.message : e));
    } finally {
      setActionBusy(false);
    }
  }

  async function approveForSL() {
    const ids = [...selected];
    if (ids.length === 0) return;
    setActionBusy(true);
    try {
      await Promise.all(ids.map((id) =>
        fetch(`/api/templates/prospects/${id}`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ stage: "qualified" }),
        }),
      ));
      setSelected(new Set());
      load();
    } finally {
      setActionBusy(false);
    }
  }

  async function bulkMail(flags: { mail_ready?: boolean; do_not_mail?: boolean }) {
    const ids = [...selected];
    if (ids.length === 0) return;
    setActionBusy(true);
    try {
      const res = await fetch(`/api/templates/prospects/bulk`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ids, ...flags }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Bulk update failed");
      setSelected(new Set());
      load();
    } catch (e) {
      alert(String(e instanceof Error ? e.message : e));
    } finally {
      setActionBusy(false);
    }
  }

  function exportCsv() {
    const sp = new URLSearchParams();
    if (stageFilter) sp.set("stage", stageFilter);
    if (websiteFilter) sp.set("website_status", websiteFilter);
    if (missingFilter) sp.set("missing", missingFilter);
    if (dnaFilter) sp.set("dna", dnaFilter);
    if (addressFilter) sp.set("address", addressFilter);
    if (siteFilter) sp.set("site", siteFilter);
    if (exportedFilter) sp.set("exported", exportedFilter);
    const qs = sp.toString();
    window.open(`/api/templates/campaigns/${campaign.id}/export${qs ? `?${qs}` : ""}`, "_blank");
  }

  async function pushCampaign() {
    const dryRes = await fetch(`/api/templates/campaigns/${campaign.id}/push`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ dryRun: true }),
    });
    const dry = await dryRes.json();
    if (!dryRes.ok) return alert(dry.error || "Dry-run failed");
    if (!confirm(`Push qualified prospects to SiteLaunchr?\n${JSON.stringify(dry, null, 2)}`)) return;
    setActionBusy(true);
    try {
      const res = await fetch(`/api/templates/campaigns/${campaign.id}/push`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Push failed");
      alert("Push dispatched.");
      load();
    } catch (e) {
      alert(String(e instanceof Error ? e.message : e));
    } finally {
      setActionBusy(false);
    }
  }

  // Dispatch ONLY the checked prospects to SL (build control — pick how many /
  // which ones). Sends prospect ids; the push route resolves + dispatches them
  // regardless of stage. Dry-runs first to show the count.
  async function buildSelected() {
    const prospectIds = [...selected];
    if (prospectIds.length === 0) return;
    const dryRes = await fetch(`/api/templates/campaigns/${campaign.id}/push`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ dryRun: true, prospectIds }),
    });
    const dry = await dryRes.json();
    if (!dryRes.ok) return alert(dry.error || "Dry-run failed");
    if (!confirm(`Build ${dry.recordCount} of ${prospectIds.length} selected in SiteLaunchr?`)) return;
    setActionBusy(true);
    try {
      const res = await fetch(`/api/templates/campaigns/${campaign.id}/push`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ prospectIds }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Build failed");
      alert(`Dispatched ${json.recordCount ?? prospectIds.length} build(s) to SiteLaunchr.`);
      setSelected(new Set());
      load();
    } catch (e) {
      alert(String(e instanceof Error ? e.message : e));
    } finally {
      setActionBusy(false);
    }
  }

  // Changing any filter must jump back to page 0 — staying on a deep page of a
  // now-smaller result set renders "No prospects match" even when matches
  // exist — and must drop the selection: bulk actions on ids the new filter
  // hides would silently target rows the operator can no longer see.
  function setFilter(set: (v: string) => void) {
    return (v: string) => {
      set(v);
      setPage(0);
      setSelected(new Set());
    };
  }

  const totalPages = Math.ceil(total / PAGE_SIZE) || 1;

  return (
    <div>
      <Link href="/admin/templates" style={{ fontSize: 13, color: "#888886", textDecoration: "none" }}>← Template Sites</Link>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", margin: "6px 0 18px" }}>
        <h1 style={{ fontFamily: "var(--font-serif)", fontSize: "1.75rem", fontWeight: 700 }}>{campaign.industry_slug || campaign.name || "Campaign"}</h1>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={exportCsv} style={ghostBtn}>Export CSV</button>
          <button onClick={pushCampaign} disabled={actionBusy} style={primaryBtn}>Push qualified → SL</button>
        </div>
      </div>

      <div style={{ display: "flex", gap: 24, marginBottom: 18, flexWrap: "wrap" }}>
        <Stat label="Scraped" value={campaign.scraped_count} />
        <Stat label="Qualified" value={campaign.qualified_count} color="#0a7a3d" />
        <Stat label="Incomplete" value={campaign.incomplete_count} color="#b3300a" />
        <Stat label="Pushed" value={campaign.pushed_count} />
        <Stat label="Cost" value={`$${campaign.cost_total.toFixed(2)}`} />
        {campaign.cost_per_qualified != null && <Stat label="$/qualified" value={`$${campaign.cost_per_qualified.toFixed(2)}`} />}
      </div>

      <div style={{ display: "flex", gap: 10, marginBottom: 14, flexWrap: "wrap" }}>
        <Select value={stageFilter} onChange={setFilter(setStageFilter)} placeholder="All stages" options={STAGES} />
        <Select value={websiteFilter} onChange={setFilter(setWebsiteFilter)} placeholder="Any site status" options={["none", "stale", "has_site"]} />
        <Select value={missingFilter} onChange={setFilter(setMissingFilter)} placeholder="Any completeness" options={["phone", "address", "business_name", "industry_slug"]} />
        <Select
          value={dnaFilter}
          onChange={setFilter(setDnaFilter)}
          placeholder="Any DNA"
          options={[{ value: "has", label: "has DNA (logo + color)" }, { value: "missing", label: "missing DNA" }]}
        />
        <Select
          value={addressFilter}
          onChange={setFilter(setAddressFilter)}
          placeholder="Any address"
          options={[{ value: "has", label: "has full address" }, { value: "missing", label: "missing address" }]}
        />
        <Select
          value={siteFilter}
          onChange={setFilter(setSiteFilter)}
          placeholder="Any site"
          options={[{ value: "has", label: "site generated" }, { value: "missing", label: "no site yet" }]}
        />
        <Select
          value={exportedFilter}
          onChange={setFilter(setExportedFilter)}
          placeholder="Any export"
          options={[{ value: "no", label: "not exported" }, { value: "yes", label: "exported" }]}
        />
      </div>

      {selected.size > 0 && (
        <div style={actionBar}>
          <span style={{ fontSize: 13, fontWeight: 600 }}>{selected.size} selected</span>
          <button onClick={() => estimateAndRun("deep-audit")} disabled={actionBusy} style={ghostBtn}>Run deep audit</button>
          <button onClick={() => estimateAndRun("backfill")} disabled={actionBusy} style={ghostBtn}>Backfill</button>
          <select
            value=""
            disabled={actionBusy || reps.length === 0}
            onChange={(e) => assignRep(e.target.value)}
            style={{ ...ghostBtn, cursor: "pointer" }}
            title={reps.length === 0 ? "No active reps — add one at /admin/sales-reps" : "Assign selected to a rep"}
          >
            <option value="">Assign rep…</option>
            {reps.map((r) => (
              <option key={r.id} value={r.id}>{r.first_name}{r.last_name ? ` ${r.last_name}` : ""}</option>
            ))}
          </select>
          <button onClick={approveForSL} disabled={actionBusy} style={ghostBtn}>Approve for SL</button>
          <button onClick={buildSelected} disabled={actionBusy} style={primaryBtn}>Build selected → SL</button>
          <button onClick={() => bulkMail({ mail_ready: true })} disabled={actionBusy} style={ghostBtn}>Mark mail-ready</button>
          <button onClick={() => bulkMail({ do_not_mail: true })} disabled={actionBusy} style={ghostBtn}>Suppress</button>
          <button onClick={() => setSelected(new Set())} style={{ ...ghostBtn, marginLeft: "auto" }}>Clear</button>
        </div>
      )}

      <div style={{ background: "#fff", border: "1.5px solid #e8e6df", borderRadius: 6, overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: "var(--font-sans)" }}>
          <thead>
            <tr style={{ background: "#f5f4ef", borderBottom: "1.5px solid #e8e6df" }}>
              <th style={{ ...th, width: 36 }}><input type="checkbox" checked={selected.size === prospects.length && prospects.length > 0} onChange={toggleAll} /></th>
              <th style={th}>Business</th>
              <th style={th}>Location</th>
              <th style={{ ...th, textAlign: "center" }}>Site</th>
              <th style={{ ...th, textAlign: "center" }}>Complete</th>
              <th style={{ ...th, textAlign: "center" }}>DNA</th>
              <th style={{ ...th, textAlign: "center" }}>Mail</th>
              <th style={{ ...th, textAlign: "center" }}>Calls</th>
              <th style={{ ...th, textAlign: "center" }}>Stage</th>
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={9} style={{ ...td, textAlign: "center", color: "#888886", padding: 28 }}>Loading…</td></tr>}
            {!loading && prospects.length === 0 && <tr><td colSpan={9} style={{ ...td, textAlign: "center", color: "#888886", padding: 28 }}>No prospects match.</td></tr>}
            {!loading && prospects.map((p) => {
              const missing = p.completeness?.missing ?? [];
              return (
                <tr key={p.id} style={{ borderTop: "1px solid #f0eeea", cursor: "pointer" }} onClick={() => setOpenId(p.id)}>
                  <td style={td} onClick={(e) => e.stopPropagation()}>
                    <input type="checkbox" checked={selected.has(p.id)} onChange={() => toggle(p.id)} />
                  </td>
                  <td style={td}>
                    <div style={{ fontWeight: 600, color: "#111110" }}>{p.business_name || "—"}</div>
                    <div style={{ fontSize: 11, color: "#888886" }}>{p.phone || "no phone"}</div>
                  </td>
                  <td style={{ ...td, color: "#555553" }}>{[p.city, p.state].filter(Boolean).join(", ") || "—"}</td>
                  <td style={{ ...td, textAlign: "center" }}><SiteBadge status={p.website_status} /></td>
                  <td style={{ ...td, textAlign: "center" }}><CompletenessBadge missing={missing} /></td>
                  <td style={{ ...td, textAlign: "center" }}><DnaBadge record={p.record} stage={p.stage} websiteStatus={p.website_status} /></td>
                  <td style={{ ...td, textAlign: "center" }}><MailBadge mailing={p.tpl_mailings?.[0]} /></td>
                  <td style={{ ...td, textAlign: "center" }}><CallBadge count={p.call_count ?? 0} lastCalledAt={p.last_called_at ?? null} /></td>
                  <td style={{ ...td, textAlign: "center" }}><span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "#555553" }}>{p.stage}</span></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 14 }}>
        <span style={{ fontSize: 12, color: "#888886" }}>{total} prospects</span>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <button onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page === 0} style={ghostBtn}>← Prev</button>
          <span style={{ fontSize: 12, color: "#555553" }}>{page + 1} / {totalPages}</span>
          <button onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1} style={ghostBtn}>Next →</button>
        </div>
      </div>

      {openId && (
        <ProspectDrawer
          prospectId={openId}
          prospect={prospects.find((p) => p.id === openId) ?? null}
          onClose={() => setOpenId(null)}
          onSaved={() => { setOpenId(null); load(); }}
        />
      )}
    </div>
  );
}

function Stat({ label, value, color }: { label: string; value: string | number; color?: string }) {
  return (
    <div>
      <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.06em", color: "#888886" }}>{label}</div>
      <div style={{ fontFamily: "var(--font-serif)", fontSize: 22, fontWeight: 700, color: color ?? "#111110" }}>{value}</div>
    </div>
  );
}

type SelectOption = string | { value: string; label: string };

function Select({ value, onChange, placeholder, options }: { value: string; onChange: (v: string) => void; placeholder: string; options: SelectOption[] }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} style={{ padding: "7px 10px", border: "1.5px solid #d8d6cf", borderRadius: 4, fontSize: 13, fontFamily: "var(--font-sans)", background: "#fff", color: "#555553" }}>
      <option value="">{placeholder}</option>
      {options.map((o) => {
        const opt = typeof o === "string" ? { value: o, label: o } : o;
        return <option key={opt.value} value={opt.value}>{opt.label}</option>;
      })}
    </select>
  );
}

function SiteBadge({ status }: { status: string }) {
  const map: Record<string, { c: string; t: string }> = {
    none: { c: "#888886", t: "no site" }, stale: { c: "#b3300a", t: "stale" }, has_site: { c: "#0a4a7a", t: "has site" },
  };
  const m = map[status] ?? { c: "#888886", t: status };
  return <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: m.c }}>{m.t}</span>;
}

function MailBadge({ mailing }: { mailing?: { status: string; scan_count: number; last_scanned_at: string | null } }) {
  if (!mailing) return <span style={{ color: "#c9c7c0", fontSize: 12 }}>—</span>;
  const scans = mailing.scan_count ?? 0;
  if (scans > 0) {
    const when = mailing.last_scanned_at ? new Date(mailing.last_scanned_at).toLocaleString() : "";
    return (
      <span
        title={`Last scan: ${when}`}
        style={{ fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 700, color: "#0a7a3d" }}
      >
        ▣ {scans}
      </span>
    );
  }
  const map: Record<string, { c: string; t: string }> = {
    sent: { c: "#555553", t: "mailed" },
    queued: { c: "#888886", t: "queued" },
    undeliverable: { c: "#b3300a", t: "undeliv." },
    failed: { c: "#b3300a", t: "failed" },
    suppressed: { c: "#888886", t: "suppr." },
  };
  const m = map[mailing.status] ?? { c: "#888886", t: mailing.status };
  return <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: m.c }} title="No scans yet">{m.t}</span>;
}

function CallBadge({ count, lastCalledAt }: { count: number; lastCalledAt: string | null }) {
  if (count <= 0) return <span style={{ color: "#c9c7c0", fontSize: 12 }} title="Not called yet">—</span>;
  const when = lastCalledAt ? new Date(lastCalledAt).toLocaleString() : "";
  return (
    <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 700, color: "#555553" }} title={`Called ${count}×${when ? ` — last ${when}` : ""}`}>
      ☎ {count}
    </span>
  );
}

function CompletenessBadge({ missing }: { missing: string[] }) {
  if (missing.length === 0) return <span style={{ color: "#0a7a3d", fontSize: 14 }}>✓</span>;
  return <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "#b3300a", fontWeight: 600 }} title={missing.join(", ")}>−{missing.length}</span>;
}

// Brand-DNA progress: "L" lights green when a logo is extracted, "C" when a
// primary color is. DNA only runs for prospects with a website, so no-site
// rows show "—"; rows still in the pipeline show "…" until enrich finishes.
function DnaBadge({ record, stage, websiteStatus }: { record: CanonicalRecord; stage: string; websiteStatus: string }) {
  if (websiteStatus === "none") {
    return <span style={{ color: "#c9c7c0", fontSize: 12 }} title="No website — DNA not applicable">—</span>;
  }
  if (stage === "scraped" || stage === "enriching") {
    return <span style={{ color: "#888886", fontSize: 12 }} title="DNA extraction pending">…</span>;
  }
  const hasLogo = !!record.logo?.src_url;
  const hasColor = !!record.brand_colors?.primary;
  return (
    <span style={{ display: "inline-flex", gap: 4, justifyContent: "center" }}>
      <DnaChip label="L" on={hasLogo} title={hasLogo ? "Logo extracted" : "No logo found"} />
      <DnaChip label="C" on={hasColor} title={hasColor ? "Primary color extracted" : "No color found"} />
    </span>
  );
}

function DnaChip({ label, on, title }: { label: string; on: boolean; title: string }) {
  return (
    <span
      title={title}
      style={{
        display: "inline-block", width: 16, height: 16, lineHeight: "16px", textAlign: "center",
        borderRadius: 3, fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700,
        color: on ? "#fff" : "#c9c7c0",
        background: on ? "#0a7a3d" : "transparent",
        border: on ? "none" : "1.5px solid #e8e6df",
      }}
    >
      {label}
    </span>
  );
}

const th: React.CSSProperties = { padding: "9px 12px", textAlign: "left", fontFamily: "var(--font-mono)", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.05em", color: "#555553", fontWeight: 600 };
const td: React.CSSProperties = { padding: "10px 12px", fontSize: 13, verticalAlign: "middle" };
const primaryBtn: React.CSSProperties = { fontFamily: "var(--font-sans)", fontSize: 13, fontWeight: 600, color: "#fff", background: "#ff3d00", border: "none", borderRadius: 4, padding: "8px 16px", cursor: "pointer" };
const ghostBtn: React.CSSProperties = { fontFamily: "var(--font-sans)", fontSize: 12, fontWeight: 500, color: "#555553", background: "#fff", border: "1.5px solid #d8d6cf", borderRadius: 4, padding: "6px 12px", cursor: "pointer" };
const actionBar: React.CSSProperties = { display: "flex", alignItems: "center", gap: 10, background: "#fff6f3", border: "1.5px solid #ffcdc0", borderRadius: 6, padding: "10px 14px", marginBottom: 14 };
