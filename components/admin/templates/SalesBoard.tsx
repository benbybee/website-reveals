"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

export interface SalesProspect {
  id: string;
  business_name: string | null;
  city: string | null;
  state: string | null;
  phone: string | null;
  website: string | null;
  stage: string;
  agent_id: string | null;
  preview_url: string | null;
}

export function SalesBoard({ prospects, userEmail, stages }: { prospects: SalesProspect[]; userEmail: string; stages: string[] }) {
  const router = useRouter();
  const [mineOnly, setMineOnly] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const visible = mineOnly ? prospects.filter((p) => p.agent_id === userEmail) : prospects;

  async function setStage(id: string, stage: string) {
    setBusyId(id);
    try {
      await fetch(`/api/templates/prospects/${id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ stage, agent_id: userEmail }),
      });
      router.refresh();
    } finally {
      setBusyId(null);
    }
  }

  async function logCall(id: string) {
    const body = prompt("Call notes:");
    if (!body) return;
    await fetch(`/api/templates/sales/activity`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ prospect_id: id, kind: "call", body, agent_id: userEmail }),
    });
  }

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
        <Link href="/admin/templates" style={{ fontSize: 13, color: "#888886", textDecoration: "none" }}>← Template Sites</Link>
        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "#555553" }}>
          <input type="checkbox" checked={mineOnly} onChange={(e) => setMineOnly(e.target.checked)} />
          My prospects only
        </label>
      </div>
      <h1 style={{ fontFamily: "var(--font-serif)", fontSize: "1.75rem", fontWeight: 700, marginBottom: 18 }}>Sales board</h1>

      <div style={{ background: "#fff", border: "1.5px solid #e8e6df", borderRadius: 6, overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: "var(--font-sans)" }}>
          <thead>
            <tr style={{ background: "#f5f4ef", borderBottom: "1.5px solid #e8e6df" }}>
              <th style={th}>Business</th>
              <th style={th}>Location</th>
              <th style={th}>Phone</th>
              <th style={th}>Preview</th>
              <th style={th}>Agent</th>
              <th style={{ ...th, width: 160 }}>Stage</th>
              <th style={{ ...th, width: 90 }} />
            </tr>
          </thead>
          <tbody>
            {visible.length === 0 && <tr><td colSpan={7} style={{ ...td, textAlign: "center", color: "#888886", padding: 28 }}>No prospects in the sales funnel.</td></tr>}
            {visible.map((p) => (
              <tr key={p.id} style={{ borderTop: "1px solid #f0eeea" }}>
                <td style={td}><span style={{ fontWeight: 600, color: "#111110" }}>{p.business_name || "—"}</span></td>
                <td style={{ ...td, color: "#555553" }}>{[p.city, p.state].filter(Boolean).join(", ") || "—"}</td>
                <td style={td}>
                  {p.phone ? <a href={`tel:${p.phone}`} style={{ color: "#ff3d00", textDecoration: "none", fontFamily: "var(--font-mono)", fontSize: 12 }}>{p.phone}</a> : <span style={{ color: "#bbb" }}>—</span>}
                </td>
                <td style={td}>
                  {p.preview_url ? <a href={p.preview_url} target="_blank" rel="noreferrer" style={{ color: "#0a4a7a", fontSize: 12 }}>view →</a> : <span style={{ color: "#bbb", fontSize: 12 }}>—</span>}
                </td>
                <td style={{ ...td, fontSize: 11, color: "#888886", fontFamily: "var(--font-mono)" }}>{p.agent_id || "unassigned"}</td>
                <td style={td}>
                  <select value={p.stage} disabled={busyId === p.id} onChange={(e) => setStage(p.id, e.target.value)} style={{ padding: "5px 8px", border: "1.5px solid #d8d6cf", borderRadius: 4, fontSize: 12, fontFamily: "var(--font-mono)", background: "#fff" }}>
                    {stages.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </td>
                <td style={{ ...td, textAlign: "right" }}>
                  <button onClick={() => logCall(p.id)} style={ghostBtn}>Log call</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const th: React.CSSProperties = { padding: "9px 12px", textAlign: "left", fontFamily: "var(--font-mono)", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.05em", color: "#555553", fontWeight: 600 };
const td: React.CSSProperties = { padding: "10px 12px", fontSize: 13, verticalAlign: "middle" };
const ghostBtn: React.CSSProperties = { fontFamily: "var(--font-sans)", fontSize: 12, fontWeight: 500, color: "#555553", background: "#fff", border: "1.5px solid #d8d6cf", borderRadius: 4, padding: "5px 10px", cursor: "pointer" };
