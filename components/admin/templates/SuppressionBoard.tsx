"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useToast } from "@/components/admin/ToastProvider";
import { ConfirmDialog, type ConfirmConfig } from "./ConfirmDialog";

interface SuppressedRow {
  id: string;
  business_name: string | null;
  city: string | null;
  state: string | null;
  campaign_id: string | null;
  suppressed_at: string | null;
  suppression_reason: string | null;
  industry: string | null;
}

const PAGE_SIZE = 50;

export function SuppressionBoard({
  campaigns,
  industries,
}: {
  campaigns: { id: string; label: string }[];
  industries: string[];
}) {
  const { success } = useToast();
  const campaignLabel = useCallback(
    (id: string | null) => (id ? campaigns.find((c) => c.id === id)?.label ?? id.slice(0, 8) : "—"),
    [campaigns],
  );

  const [rows, setRows] = useState<SuppressedRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [industry, setIndustry] = useState("");
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
    if (industry) sp.set("industry", industry);
    if (q.trim()) sp.set("q", q.trim());
    try {
      const res = await fetch(`/api/templates/suppressed?${sp}`);
      if (seq !== fetchSeq.current) return;
      if (res.ok) {
        const json = await res.json();
        setRows(json.rows ?? []);
        setTotal(json.total ?? 0);
      }
    } finally {
      if (seq === fetchSeq.current) setLoading(false);
    }
  }, [page, industry, q]);

  useEffect(() => { load(); }, [load]);

  function setFilter<T>(set: (v: T) => void) {
    return (v: T) => { set(v); setPage(0); setSelected(new Set()); };
  }
  function toggle(id: string) {
    setSelected((prev) => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  }
  function toggleAll() {
    setSelected((prev) => (prev.size === rows.length ? new Set() : new Set(rows.map((r) => r.id))));
  }

  async function doRestore(ids: string[]) {
    setBusy(true);
    try {
      const res = await fetch(`/api/templates/prospects/bulk`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ids, suppress: false }),
      });
      if (!res.ok) return; // ToastProvider surfaces the error
      const json = await res.json();
      success("Restored to the working list", `${json.updated ?? ids.length} lead(s) moved back into their campaign.`);
      setSelected(new Set());
      load();
    } finally {
      setBusy(false);
    }
  }

  function confirmRestore(ids: string[]) {
    if (ids.length === 0) return;
    setConfirmCfg({
      title: "Restore to the working list?",
      message: "These leads move back into their campaign's working list (and become eligible to build/mail again).",
      detail: `${ids.length} lead(s) → restore`,
      confirmLabel: "Restore",
      onConfirm: () => doRestore(ids),
    });
  }

  const totalPages = Math.ceil(total / PAGE_SIZE) || 1;

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
        <Link href="/admin/templates" style={{ fontSize: 13, color: "#888886", textDecoration: "none" }}>← Template Sites</Link>
        <div style={{ display: "flex", gap: 8 }}>
          <Link href="/admin/templates/builds" style={navBtn}>Builds →</Link>
          <button onClick={load} disabled={loading} style={navBtn}>{loading ? "…" : "↻ Refresh"}</button>
        </div>
      </div>
      <h1 style={{ fontFamily: "var(--font-serif)", fontSize: "1.75rem", fontWeight: 700, marginBottom: 4 }}>Suppressed</h1>
      <p style={{ fontSize: 13, color: "#888886", marginBottom: 16 }}>
        Leads cleaned out of the working campaign lists. Nothing is deleted — restore any of them back to their campaign anytime.
      </p>

      <div style={{ display: "flex", gap: 10, marginBottom: 14, flexWrap: "wrap", alignItems: "center" }}>
        <select value={industry} onChange={(e) => setFilter(setIndustry)(e.target.value)} style={filterSel}>
          <option value="">All industries</option>
          {industries.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <input value={q} onChange={(e) => setFilter(setQ)(e.target.value)} placeholder="Search business…" style={{ ...filterSel, minWidth: 200 }} />
        <span style={{ fontSize: 12, color: "#888886", marginLeft: "auto" }}>{total} suppressed</span>
      </div>

      {selected.size > 0 && (
        <div style={actionBar}>
          <span style={{ fontSize: 13, fontWeight: 600 }}>{selected.size} selected</span>
          <button onClick={() => confirmRestore([...selected])} disabled={busy} style={primaryBtn}>Restore to working list</button>
          <button onClick={() => setSelected(new Set())} style={{ ...ghostBtn, marginLeft: "auto" }}>Clear</button>
        </div>
      )}

      <div style={{ background: "#fff", border: "1.5px solid #e8e6df", borderRadius: 6, overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: "var(--font-sans)" }}>
          <thead>
            <tr style={{ background: "#f5f4ef", borderBottom: "1.5px solid #e8e6df" }}>
              <th style={{ ...th, width: 36 }}><input type="checkbox" checked={selected.size === rows.length && rows.length > 0} onChange={toggleAll} /></th>
              <th style={th}>Business</th>
              <th style={th}>Location</th>
              <th style={th}>Industry</th>
              <th style={th}>Campaign</th>
              <th style={th}>Reason</th>
              <th style={{ ...th, width: 150 }}>Suppressed</th>
              <th style={{ ...th, width: 90 }} />
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={8} style={{ ...td, textAlign: "center", color: "#888886", padding: 28 }}>Loading…</td></tr>}
            {!loading && rows.length === 0 && <tr><td colSpan={8} style={{ ...td, textAlign: "center", color: "#888886", padding: 28 }}>No suppressed leads.</td></tr>}
            {!loading && rows.map((r) => (
              <tr key={r.id} style={{ borderTop: "1px solid #f0eeea" }}>
                <td style={td}><input type="checkbox" checked={selected.has(r.id)} onChange={() => toggle(r.id)} /></td>
                <td style={td}><span style={{ fontWeight: 600, color: "#111110" }}>{r.business_name || "—"}</span></td>
                <td style={{ ...td, color: "#555553" }}>{[r.city, r.state].filter(Boolean).join(", ") || "—"}</td>
                <td style={{ ...td, fontFamily: "var(--font-mono)", fontSize: 11, color: "#555553" }}>{r.industry || "—"}</td>
                <td style={{ ...td, fontFamily: "var(--font-mono)", fontSize: 11, color: "#555553" }}>{campaignLabel(r.campaign_id)}</td>
                <td style={{ ...td, fontSize: 11.5, color: "#888886" }}>{r.suppression_reason || "—"}</td>
                <td style={{ ...td, fontSize: 11, color: "#888886" }}>{r.suppressed_at ? new Date(r.suppressed_at).toLocaleDateString() : "—"}</td>
                <td style={{ ...td, textAlign: "right" }}>
                  <button onClick={() => confirmRestore([r.id])} disabled={busy} style={ghostBtn}>Restore</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 14 }}>
        <span style={{ fontSize: 12, color: "#888886" }}>{total} suppressed</span>
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

const filterSel: React.CSSProperties = { padding: "7px 10px", border: "1.5px solid #d8d6cf", borderRadius: 4, fontSize: 13, fontFamily: "var(--font-sans)", background: "#fff", color: "#333" };
const actionBar: React.CSSProperties = { display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", background: "#fff", border: "1.5px solid #e8e6df", borderRadius: 6, marginBottom: 14 };
const th: React.CSSProperties = { padding: "9px 12px", textAlign: "left", fontFamily: "var(--font-mono)", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.05em", color: "#555553", fontWeight: 600 };
const td: React.CSSProperties = { padding: "10px 12px", fontSize: 13, verticalAlign: "middle" };
const ghostBtn: React.CSSProperties = { fontFamily: "var(--font-sans)", fontSize: 12, fontWeight: 500, color: "#555553", background: "#fff", border: "1.5px solid #d8d6cf", borderRadius: 4, padding: "5px 10px", cursor: "pointer" };
const primaryBtn: React.CSSProperties = { fontFamily: "var(--font-sans)", fontSize: 12, fontWeight: 600, color: "#fff", background: "#1a7a3a", border: "1.5px solid #1a7a3a", borderRadius: 4, padding: "5px 10px", cursor: "pointer" };
const navBtn: React.CSSProperties = { fontFamily: "var(--font-sans)", fontSize: 13, fontWeight: 500, color: "#555553", background: "#fff", border: "1.5px solid #d8d6cf", borderRadius: 4, padding: "5px 12px", cursor: "pointer", textDecoration: "none" };
