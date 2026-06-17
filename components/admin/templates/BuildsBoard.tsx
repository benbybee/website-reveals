"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useToast } from "@/components/admin/ToastProvider";
import { ConfirmDialog, type ConfirmConfig } from "./ConfirmDialog";

interface Build {
  id: string;
  business_name: string | null;
  city: string | null;
  state: string | null;
  stage: string;
  sl_build_id: string | null;
  preview_url: string | null;
  campaign_id: string | null;
  updated_at: string | null;
  build_error: string | null;
}

const PAGE_SIZE = 50;
const STATUS_TILES: { key: string; label: string }[] = [
  { key: "", label: "All" },
  { key: "building", label: "Building" },
  { key: "live", label: "Live" },
  { key: "build_failed", label: "Failed" },
];

export function BuildsBoard({ campaigns }: { campaigns: { id: string; label: string }[] }) {
  const { success } = useToast();
  const campaignLabel = useCallback(
    (id: string | null) => (id ? campaigns.find((c) => c.id === id)?.label ?? id.slice(0, 8) : "—"),
    [campaigns],
  );

  const [builds, setBuilds] = useState<Build[]>([]);
  const [total, setTotal] = useState(0);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("");
  const [campaignFilter, setCampaignFilter] = useState("");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [confirmCfg, setConfirmCfg] = useState<ConfirmConfig | null>(null);
  const fetchSeq = useRef(0);

  const load = useCallback(async () => {
    const seq = ++fetchSeq.current;
    setLoading(true);
    const sp = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) });
    if (statusFilter) sp.set("status", statusFilter);
    if (campaignFilter) sp.set("campaign", campaignFilter);
    if (q.trim()) sp.set("q", q.trim());
    try {
      const res = await fetch(`/api/templates/builds?${sp}`);
      if (seq !== fetchSeq.current) return;
      if (res.ok) {
        const json = await res.json();
        setBuilds(json.builds ?? []);
        setTotal(json.total ?? 0);
        setCounts(json.counts ?? {});
      }
    } finally {
      if (seq === fetchSeq.current) setLoading(false);
    }
  }, [page, statusFilter, campaignFilter, q]);

  useEffect(() => { load(); }, [load]);

  function setFilter<T>(set: (v: T) => void) {
    return (v: T) => { set(v); setPage(0); setSelected(new Set()); };
  }
  function toggle(id: string) {
    setSelected((prev) => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  }
  function toggleAll() {
    setSelected((prev) => (prev.size === builds.length ? new Set() : new Set(builds.map((b) => b.id))));
  }

  async function doRebuild(ids: string[]) {
    setBusy(true);
    try {
      const res = await fetch(`/api/templates/builds/rebuild`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ prospectIds: ids }),
      });
      if (!res.ok) return; // ToastProvider surfaces the error
      const json = await res.json();
      const skipped = (json.skipped?.length ?? 0) > 0 ? ` (${json.skipped.length} skipped — invalid payload)` : "";
      success("Rebuild dispatched", `${json.recordCount ?? ids.length} build(s) re-armed in SiteLaunchr${skipped}. They'll move back to building → live.`);
      setSelected(new Set());
      load();
    } finally {
      setBusy(false);
    }
  }

  function confirmRebuild(ids: string[], label: string) {
    if (ids.length === 0) return;
    setConfirmCfg({
      title: "Rebuild in SiteLaunchr?",
      message: "Each selected build is re-armed in place (same build id) and rebuilt by SiteLaunchr. Use this to retry failures after the underlying issue is fixed.",
      detail: `${ids.length} ${label} → rebuild`,
      confirmLabel: "Rebuild now",
      onConfirm: () => doRebuild(ids),
    });
  }

  const failedInView = builds.filter((b) => b.stage === "build_failed").map((b) => b.id);
  const totalPages = Math.ceil(total / PAGE_SIZE) || 1;

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
        <Link href="/admin/templates" style={{ fontSize: 13, color: "#888886", textDecoration: "none" }}>← Template Sites</Link>
        <div style={{ display: "flex", gap: 8 }}>
          <Link href="/admin/templates/sales" style={navBtn}>Sales board →</Link>
          <button onClick={load} disabled={loading} style={navBtn}>{loading ? "Refreshing…" : "↻ Refresh"}</button>
        </div>
      </div>
      <h1 style={{ fontFamily: "var(--font-serif)", fontSize: "1.75rem", fontWeight: 700, marginBottom: 14 }}>Builds</h1>

      {/* Status tiles — clickable filters with live counts */}
      <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
        {STATUS_TILES.map((t) => {
          const active = statusFilter === t.key;
          const n = t.key ? (counts[t.key] ?? 0) : Object.values(counts).reduce((a, b) => a + b, 0);
          return (
            <button
              key={t.key || "all"}
              onClick={() => setFilter(setStatusFilter)(t.key)}
              style={{
                ...tile,
                borderColor: active ? tileAccent(t.key) : "#e8e6df",
                background: active ? tileBg(t.key) : "#fff",
              }}
            >
              <span style={{ fontFamily: "var(--font-serif)", fontSize: 22, fontWeight: 700, color: tileAccent(t.key) }}>{n}</span>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.06em", color: "#555553" }}>{t.label}</span>
            </button>
          );
        })}
      </div>

      {/* Filters */}
      <div style={{ display: "flex", gap: 10, marginBottom: 14, flexWrap: "wrap", alignItems: "center" }}>
        <select value={campaignFilter} onChange={(e) => setFilter(setCampaignFilter)(e.target.value)} style={filterSel}>
          <option value="">All campaigns / industries</option>
          {campaigns.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
        </select>
        <input
          value={q}
          onChange={(e) => setFilter(setQ)(e.target.value)}
          placeholder="Search business…"
          style={{ ...filterSel, minWidth: 200 }}
        />
        {failedInView.length > 0 && (
          <button onClick={() => confirmRebuild(failedInView, "failed in view")} disabled={busy} style={dangerBtn}>
            Rebuild {failedInView.length} failed in view
          </button>
        )}
        <span style={{ fontSize: 12, color: "#888886", marginLeft: "auto" }}>{total} build(s)</span>
      </div>

      {/* Bulk action bar */}
      {selected.size > 0 && (
        <div style={actionBar}>
          <span style={{ fontSize: 13, fontWeight: 600 }}>{selected.size} selected</span>
          <button onClick={() => confirmRebuild([...selected], "selected")} disabled={busy} style={primaryBtn}>Rebuild selected → SL</button>
          <button onClick={() => setSelected(new Set())} style={{ ...ghostBtn, marginLeft: "auto" }}>Clear</button>
        </div>
      )}

      <div style={{ background: "#fff", border: "1.5px solid #e8e6df", borderRadius: 6, overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: "var(--font-sans)" }}>
          <thead>
            <tr style={{ background: "#f5f4ef", borderBottom: "1.5px solid #e8e6df" }}>
              <th style={{ ...th, width: 36 }}><input type="checkbox" checked={selected.size === builds.length && builds.length > 0} onChange={toggleAll} /></th>
              <th style={th}>Business</th>
              <th style={th}>Location</th>
              <th style={th}>Campaign</th>
              <th style={{ ...th, width: 110 }}>Status</th>
              <th style={th}>Preview</th>
              <th style={th}>Build / error</th>
              <th style={{ ...th, width: 150 }}>Updated</th>
              <th style={{ ...th, width: 90 }} />
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={9} style={{ ...td, textAlign: "center", color: "#888886", padding: 28 }}>Loading…</td></tr>}
            {!loading && builds.length === 0 && <tr><td colSpan={9} style={{ ...td, textAlign: "center", color: "#888886", padding: 28 }}>No builds match.</td></tr>}
            {!loading && builds.map((b) => (
              <tr key={b.id} style={{ borderTop: "1px solid #f0eeea" }}>
                <td style={td}><input type="checkbox" checked={selected.has(b.id)} onChange={() => toggle(b.id)} /></td>
                <td style={td}><span style={{ fontWeight: 600, color: "#111110" }}>{b.business_name || "—"}</span></td>
                <td style={{ ...td, color: "#555553" }}>{[b.city, b.state].filter(Boolean).join(", ") || "—"}</td>
                <td style={{ ...td, fontFamily: "var(--font-mono)", fontSize: 11, color: "#555553" }}>{campaignLabel(b.campaign_id)}</td>
                <td style={td}><StatusBadge stage={b.stage} /></td>
                <td style={td}>
                  {b.preview_url
                    ? <a href={b.preview_url} target="_blank" rel="noreferrer" style={{ color: "#0a4a7a", fontSize: 12 }}>view →</a>
                    : <span style={{ color: "#bbb", fontSize: 12 }}>—</span>}
                </td>
                <td style={{ ...td, maxWidth: 320 }}>
                  {b.stage === "build_failed" && b.build_error
                    ? <span title={b.build_error} style={{ fontSize: 11.5, color: "#b3300a", fontFamily: "var(--font-mono)", display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{b.build_error}</span>
                    : <span title={b.sl_build_id ?? ""} style={{ fontSize: 11, color: "#999", fontFamily: "var(--font-mono)" }}>{b.sl_build_id ? b.sl_build_id.slice(0, 8) : "—"}</span>}
                </td>
                <td style={{ ...td, fontSize: 11, color: "#888886" }}>{b.updated_at ? new Date(b.updated_at).toLocaleString() : "—"}</td>
                <td style={{ ...td, textAlign: "right" }}>
                  <button
                    onClick={() => confirmRebuild([b.id], b.stage === "build_failed" ? "failed build" : "build")}
                    disabled={busy}
                    style={b.stage === "build_failed" ? dangerBtn : ghostBtn}
                  >
                    Rebuild
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 14 }}>
        <span style={{ fontSize: 12, color: "#888886" }}>{total} build(s)</span>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <button onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page === 0} style={ghostBtn}>← Prev</button>
          <span style={{ fontSize: 12, color: "#555553" }}>{page + 1} / {totalPages}</span>
          <button onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1} style={ghostBtn}>Next →</button>
        </div>
      </div>

      {confirmCfg && <ConfirmDialog config={confirmCfg} onClose={() => setConfirmCfg(null)} />}
    </div>
  );
}

function StatusBadge({ stage }: { stage: string }) {
  const map: Record<string, { c: string; bg: string; bd: string; t: string }> = {
    building: { c: "#9a6a00", bg: "#fdf6e3", bd: "#f0e0a8", t: "building" },
    live: { c: "#0a7a3d", bg: "#e7f5ec", bd: "#b7e0c4", t: "live" },
    build_failed: { c: "#b3300a", bg: "#fdecea", bd: "#f3c0b8", t: "failed" },
  };
  const m = map[stage] ?? { c: "#555553", bg: "#f0eeea", bd: "#d8d6cf", t: stage };
  return (
    <span style={{ display: "inline-block", fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 600, color: m.c, background: m.bg, border: `1px solid ${m.bd}`, borderRadius: 4, padding: "2px 8px" }}>
      {m.t}
    </span>
  );
}

function tileAccent(key: string): string {
  if (key === "live") return "#0a7a3d";
  if (key === "build_failed") return "#b3300a";
  if (key === "building") return "#9a6a00";
  return "#111110";
}
function tileBg(key: string): string {
  if (key === "live") return "#e7f5ec";
  if (key === "build_failed") return "#fdecea";
  if (key === "building") return "#fdf6e3";
  return "#f5f4ef";
}

const tile: React.CSSProperties = { display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 2, minWidth: 96, padding: "10px 14px", border: "1.5px solid #e8e6df", borderRadius: 6, cursor: "pointer", background: "#fff" };
const filterSel: React.CSSProperties = { padding: "7px 10px", border: "1.5px solid #d8d6cf", borderRadius: 4, fontSize: 13, fontFamily: "var(--font-sans)", background: "#fff", color: "#333" };
const actionBar: React.CSSProperties = { display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", background: "#fff", border: "1.5px solid #e8e6df", borderRadius: 6, marginBottom: 14 };
const th: React.CSSProperties = { padding: "9px 12px", textAlign: "left", fontFamily: "var(--font-mono)", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.05em", color: "#555553", fontWeight: 600 };
const td: React.CSSProperties = { padding: "10px 12px", fontSize: 13, verticalAlign: "middle" };
const ghostBtn: React.CSSProperties = { fontFamily: "var(--font-sans)", fontSize: 12, fontWeight: 500, color: "#555553", background: "#fff", border: "1.5px solid #d8d6cf", borderRadius: 4, padding: "5px 10px", cursor: "pointer" };
const dangerBtn: React.CSSProperties = { fontFamily: "var(--font-sans)", fontSize: 12, fontWeight: 600, color: "#fff", background: "#b3300a", border: "1.5px solid #b3300a", borderRadius: 4, padding: "5px 10px", cursor: "pointer" };
const primaryBtn: React.CSSProperties = { fontFamily: "var(--font-sans)", fontSize: 12, fontWeight: 600, color: "#fff", background: "#ff3d00", border: "1.5px solid #ff3d00", borderRadius: 4, padding: "5px 10px", cursor: "pointer" };
const navBtn: React.CSSProperties = { fontFamily: "var(--font-sans)", fontSize: 13, fontWeight: 500, color: "#555553", background: "#fff", border: "1.5px solid #d8d6cf", borderRadius: 4, padding: "5px 12px", cursor: "pointer", textDecoration: "none" };
