"use client";

import { useState } from "react";
import type { Prospect } from "./ProspectsTable";

const EDITABLE = ["business_name", "city", "state", "phone", "website", "website_status"] as const;
const STAGES = ["scraped", "qualified", "incomplete", "approved", "building", "live", "build_failed"];

export function ProspectDrawer({
  prospectId,
  prospect,
  onClose,
  onSaved,
}: {
  prospectId: string;
  prospect: Prospect | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [fields, setFields] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    if (prospect) for (const k of EDITABLE) init[k] = (prospect[k] as string | null) ?? "";
    return init;
  });
  const [stage, setStage] = useState(prospect?.stage ?? "scraped");
  const [saving, setSaving] = useState(false);
  const [noteKind, setNoteKind] = useState<"note" | "call">("note");
  const [noteBody, setNoteBody] = useState("");

  if (!prospect) return null;
  const record = prospect.record;
  const missing = prospect.completeness?.missing ?? [];

  async function save() {
    setSaving(true);
    try {
      const res = await fetch(`/api/templates/prospects/${prospectId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ fields, stage }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || "Save failed");
      }
      onSaved();
    } catch (e) {
      alert(String(e instanceof Error ? e.message : e));
    } finally {
      setSaving(false);
    }
  }

  async function logActivity() {
    if (!noteBody.trim()) return;
    const res = await fetch(`/api/templates/sales/activity`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ prospect_id: prospectId, kind: noteKind, body: noteBody.trim() }),
    });
    if (res.ok) setNoteBody("");
    else alert("Failed to log activity");
  }

  return (
    <>
      <div onClick={onClose} style={overlay} />
      <div style={drawer}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
          <h2 style={{ fontFamily: "var(--font-serif)", fontSize: 20, fontWeight: 700 }}>{prospect.business_name || "Prospect"}</h2>
          <button onClick={onClose} style={{ background: "transparent", border: "none", fontSize: 22, cursor: "pointer", color: "#888886" }}>×</button>
        </div>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "#888886", marginBottom: 16 }}>{prospect.source_id}</div>

        {missing.length > 0 && (
          <div style={{ background: "#fff0ec", border: "1.5px solid #ffcdc0", borderRadius: 4, padding: "8px 12px", marginBottom: 16, fontSize: 12, color: "#b3300a" }}>
            Missing: {missing.join(", ")}
          </div>
        )}

        <SectionTitle>Editable fields</SectionTitle>
        {EDITABLE.map((k) => (
          <label key={k} style={{ display: "block", marginBottom: 10 }}>
            <span style={smallLabel}>{k.replace(/_/g, " ")}</span>
            <input value={fields[k] ?? ""} onChange={(e) => setFields((f) => ({ ...f, [k]: e.target.value }))} style={input} />
          </label>
        ))}

        <label style={{ display: "block", marginBottom: 16 }}>
          <span style={smallLabel}>stage</span>
          <select value={stage} onChange={(e) => setStage(e.target.value)} style={input}>
            {STAGES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </label>

        <button onClick={save} disabled={saving} style={primaryBtn}>{saving ? "Saving…" : "Save changes"}</button>

        <SectionTitle>Assets</SectionTitle>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 16 }}>
          {record.logo?.src_url && <Thumb src={record.logo.src_url} label="logo" />}
          {(record.photos ?? []).map((p, i) => <Thumb key={i} src={p.src_url} label={p.slot} />)}
          {!record.logo?.src_url && (record.photos ?? []).length === 0 && <span style={{ fontSize: 12, color: "#888886" }}>No verified assets.</span>}
        </div>

        <SectionTitle>Record</SectionTitle>
        <dl style={{ fontSize: 13, lineHeight: 1.6, marginBottom: 16 }}>
          {record.industry_raw && <Row k="Industry (raw)" v={record.industry_raw} />}
          {record.industry_slug && <Row k="SL slug" v={record.industry_slug} />}
          {record.address && <Row k="Address" v={`${record.address.street}, ${record.address.city}, ${record.address.state} ${record.address.zip}`} />}
          {(record.services ?? []).length > 0 && <Row k="Services" v={(record.services ?? []).map((s) => s.name).join(", ")} />}
          {record.brand_colors && <Row k="Colors" v={Object.values(record.brand_colors).join(" · ")} />}
          {record.socials?.facebook && <Row k="Facebook" v={record.socials.facebook} />}
        </dl>

        <SectionTitle>Log activity</SectionTitle>
        <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
          <select value={noteKind} onChange={(e) => setNoteKind(e.target.value as "note" | "call")} style={{ ...input, width: 90 }}>
            <option value="note">Note</option>
            <option value="call">Call</option>
          </select>
        </div>
        <textarea value={noteBody} onChange={(e) => setNoteBody(e.target.value)} placeholder="What happened…" style={{ ...input, minHeight: 64, resize: "vertical" }} />
        <button onClick={logActivity} style={{ ...ghostBtn, marginTop: 8 }}>Log {noteKind}</button>
      </div>
    </>
  );
}

function Thumb({ src, label }: { src: string; label: string }) {
  return (
    <div style={{ width: 72 }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt={label} style={{ width: 72, height: 72, objectFit: "cover", borderRadius: 4, border: "1.5px solid #e8e6df", background: "#f5f4ef" }} />
      <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "#888886", textAlign: "center", marginTop: 2 }}>{label}</div>
    </div>
  );
}
function Row({ k, v }: { k: string; v: string }) {
  return (
    <div style={{ display: "flex", gap: 8, borderBottom: "1px solid #f0eeea", padding: "4px 0" }}>
      <dt style={{ width: 110, color: "#888886", fontFamily: "var(--font-mono)", fontSize: 11, flexShrink: 0 }}>{k}</dt>
      <dd style={{ color: "#111110", wordBreak: "break-word" }}>{v}</dd>
    </div>
  );
}
function SectionTitle({ children }: { children: React.ReactNode }) {
  return <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.06em", color: "#555553", fontWeight: 600, margin: "20px 0 10px" }}>{children}</div>;
}

const overlay: React.CSSProperties = { position: "fixed", inset: 0, background: "rgba(17,17,16,0.35)", zIndex: 40 };
const drawer: React.CSSProperties = { position: "fixed", top: 0, right: 0, bottom: 0, width: "min(460px, 92vw)", background: "#faf9f5", borderLeft: "1.5px solid #e8e6df", zIndex: 41, padding: 24, overflowY: "auto" };
const input: React.CSSProperties = { width: "100%", padding: "7px 10px", border: "1.5px solid #d8d6cf", borderRadius: 4, fontSize: 13, fontFamily: "var(--font-sans)", marginTop: 3, background: "#fff" };
const smallLabel: React.CSSProperties = { fontFamily: "var(--font-mono)", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.05em", color: "#888886" };
const primaryBtn: React.CSSProperties = { fontFamily: "var(--font-sans)", fontSize: 13, fontWeight: 600, color: "#fff", background: "#ff3d00", border: "none", borderRadius: 4, padding: "8px 16px", cursor: "pointer" };
const ghostBtn: React.CSSProperties = { fontFamily: "var(--font-sans)", fontSize: 12, fontWeight: 500, color: "#555553", background: "#fff", border: "1.5px solid #d8d6cf", borderRadius: 4, padding: "6px 12px", cursor: "pointer" };
