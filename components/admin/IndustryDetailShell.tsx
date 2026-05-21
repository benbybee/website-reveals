"use client";

import { useState } from "react";
import Link from "next/link";
import type { IndustryReference, IndustryAlias } from "@/lib/industries";

export function IndustryDetailShell({
  slug,
  label,
  initialReferences,
  initialAliases,
}: {
  slug: string;
  label: string;
  initialReferences: IndustryReference[];
  initialAliases: IndustryAlias[];
}) {
  const [refs, setRefs] = useState(initialReferences);
  const [aliases, setAliases] = useState(initialAliases);
  const [newUrl, setNewUrl] = useState("");
  const [newRefLabel, setNewRefLabel] = useState("");
  const [newAlias, setNewAlias] = useState("");
  const [refError, setRefError] = useState<string | null>(null);
  const [aliasError, setAliasError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const addReference = async () => {
    if (!newUrl.trim()) return;
    setBusy(true);
    setRefError(null);
    try {
      const res = await fetch(`/api/admin/industries/${slug}/references`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: newUrl.trim(), label: newRefLabel.trim() || null }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error || "Add failed");
      setRefs([body.reference, ...refs]);
      setNewUrl("");
      setNewRefLabel("");
    } catch (err) {
      setRefError(err instanceof Error ? err.message : "Add failed");
    } finally {
      setBusy(false);
    }
  };

  const toggleReferenceActive = async (ref: IndustryReference) => {
    const next = !ref.active;
    setRefs(refs.map((r) => (r.id === ref.id ? { ...r, active: next } : r)));
    await fetch(`/api/admin/industries/${slug}/references/${ref.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: next }),
    });
  };

  const deleteReference = async (ref: IndustryReference) => {
    if (!confirm(`Delete reference ${ref.url}?`)) return;
    setRefs(refs.filter((r) => r.id !== ref.id));
    await fetch(`/api/admin/industries/${slug}/references/${ref.id}`, { method: "DELETE" });
  };

  const addAlias = async () => {
    const kw = newAlias.trim().toLowerCase();
    if (!kw) return;
    setBusy(true);
    setAliasError(null);
    try {
      const res = await fetch(`/api/admin/industries/${slug}/aliases`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ alias_keyword: kw }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error || "Add failed");
      setAliases([...aliases, body.alias].sort((a, b) => a.alias_keyword.localeCompare(b.alias_keyword)));
      setNewAlias("");
    } catch (err) {
      setAliasError(err instanceof Error ? err.message : "Add failed");
    } finally {
      setBusy(false);
    }
  };

  const deleteAlias = async (alias: IndustryAlias) => {
    if (!confirm(`Delete alias "${alias.alias_keyword}"?`)) return;
    setAliases(aliases.filter((a) => a.id !== alias.id));
    await fetch(`/api/admin/industries/${slug}/aliases/${alias.id}`, { method: "DELETE" });
  };

  return (
    <div style={{ minHeight: "100vh", background: "#faf9f5", padding: "32px 24px 80px" }}>
      <div style={{ maxWidth: 880, margin: "0 auto" }}>
        <Link href="/admin/industries" style={{ fontSize: 13, color: "#888886", textDecoration: "none" }}>← All industries</Link>
        <h1 style={{ fontFamily: "var(--font-serif)", fontSize: "2rem", fontWeight: 700, marginTop: 6, marginBottom: 4 }}>{label}</h1>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "#888886", marginBottom: 28 }}>{slug}</div>

        {/* References section */}
        <Section title="Reference URLs" subtitle="Sent as design inspiration to SiteLaunchr on every /sales submission that picks this category.">
          <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
            <input
              type="url"
              value={newUrl}
              onChange={(e) => setNewUrl(e.target.value)}
              placeholder="https://example.com"
              style={{ ...input, flex: 2 }}
            />
            <input
              type="text"
              value={newRefLabel}
              onChange={(e) => setNewRefLabel(e.target.value)}
              placeholder="Label (optional)"
              style={{ ...input, flex: 1 }}
            />
            <button onClick={addReference} disabled={busy || !newUrl.trim()} className="btn-orange" style={{ ...primaryBtn, opacity: !newUrl.trim() ? 0.4 : 1 }}>
              Add
            </button>
          </div>
          {refError && <div style={errorBox}>{refError}</div>}
          {refs.length === 0 ? (
            <div style={emptyBox}>No references yet. Add 2-3 sites that capture the design style you want for this industry.</div>
          ) : (
            <table style={tableStyle}>
              <thead>
                <tr style={{ borderBottom: "1.5px solid #e8e6df" }}>
                  <th style={th}>URL</th>
                  <th style={{ ...th, width: 180 }}>Label</th>
                  <th style={{ ...th, textAlign: "center", width: 80 }}>Active</th>
                  <th style={{ ...th, width: 60 }} />
                </tr>
              </thead>
              <tbody>
                {refs.map((r) => (
                  <tr key={r.id} style={{ borderTop: "1px solid #f0eeea", opacity: r.active ? 1 : 0.5 }}>
                    <td style={td}>
                      <a href={r.url} target="_blank" rel="noopener noreferrer" style={{ color: "#111110", textDecoration: "underline", fontSize: 13 }}>
                        {r.url}
                      </a>
                    </td>
                    <td style={{ ...td, fontSize: 12, color: "#555553" }}>{r.label || "—"}</td>
                    <td style={{ ...td, textAlign: "center" }}>
                      <button onClick={() => toggleReferenceActive(r)} style={toggleBtn(r.active)}>
                        {r.active ? "ON" : "OFF"}
                      </button>
                    </td>
                    <td style={{ ...td, textAlign: "right" }}>
                      <button onClick={() => deleteReference(r)} style={deleteLink}>delete</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Section>

        {/* Aliases section */}
        <Section title="Alias keywords" subtitle={`Free text on /sales "Other" submissions matches against these (substring, case-insensitive). Adding "dental" here makes "Other → dental clinic" auto-route to ${label}.`}>
          <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
            <input
              type="text"
              value={newAlias}
              onChange={(e) => setNewAlias(e.target.value)}
              placeholder="dental"
              style={{ ...input, flex: 1 }}
              onKeyDown={(e) => { if (e.key === "Enter") addAlias(); }}
            />
            <button onClick={addAlias} disabled={busy || !newAlias.trim()} className="btn-orange" style={{ ...primaryBtn, opacity: !newAlias.trim() ? 0.4 : 1 }}>
              Add alias
            </button>
          </div>
          {aliasError && <div style={errorBox}>{aliasError}</div>}
          {aliases.length === 0 ? (
            <div style={emptyBox}>No aliases yet.</div>
          ) : (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {aliases.map((a) => (
                <span key={a.id} style={chipStyle}>
                  {a.alias_keyword}
                  <button onClick={() => deleteAlias(a)} style={chipDelete} title="Remove">×</button>
                </span>
              ))}
            </div>
          )}
        </Section>
      </div>
    </div>
  );
}

function Section({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div style={{ background: "#fff", border: "1.5px solid #e8e6df", borderRadius: 6, padding: 22, marginBottom: 24 }}>
      <h2 style={{ fontFamily: "var(--font-serif)", fontSize: "1.25rem", fontWeight: 700, marginBottom: 4 }}>{title}</h2>
      {subtitle && <p style={{ fontSize: 13, color: "#555553", marginBottom: 16, lineHeight: 1.5 }}>{subtitle}</p>}
      {children}
    </div>
  );
}

const input: React.CSSProperties = {
  padding: "8px 12px",
  border: "1.5px solid #d8d6cf",
  borderRadius: 3,
  fontSize: 13,
  fontFamily: "var(--font-sans)",
  background: "#faf9f5",
  outline: "none",
};
const primaryBtn: React.CSSProperties = { fontSize: 13, padding: "8px 18px", cursor: "pointer" };
const errorBox: React.CSSProperties = { padding: "8px 12px", background: "#fff5f2", border: "1px solid #ffcdc0", borderRadius: 3, fontSize: 12, color: "#b3300a", marginBottom: 12 };
const emptyBox: React.CSSProperties = { padding: "16px 14px", background: "#f5f4ef", border: "1px dashed #d8d6cf", borderRadius: 3, fontSize: 13, color: "#888886", textAlign: "center" };
const tableStyle: React.CSSProperties = { width: "100%", borderCollapse: "collapse", fontFamily: "var(--font-sans)" };
const th: React.CSSProperties = {
  padding: "8px 10px",
  textAlign: "left",
  fontFamily: "var(--font-mono)",
  fontSize: 11,
  textTransform: "uppercase",
  letterSpacing: "0.05em",
  color: "#888886",
  fontWeight: 600,
};
const td: React.CSSProperties = { padding: "10px", fontSize: 13, verticalAlign: "middle" };
const toggleBtn = (active: boolean): React.CSSProperties => ({
  background: active ? "#2e7d32" : "#fff",
  color: active ? "#fff" : "#888886",
  border: `1.5px solid ${active ? "#2e7d32" : "#d8d6cf"}`,
  borderRadius: 3,
  padding: "3px 10px",
  fontSize: 10,
  fontFamily: "var(--font-mono)",
  fontWeight: 600,
  letterSpacing: "0.04em",
  cursor: "pointer",
});
const deleteLink: React.CSSProperties = {
  background: "transparent",
  border: "none",
  color: "#b3300a",
  fontSize: 12,
  cursor: "pointer",
  fontFamily: "var(--font-mono)",
};
const chipStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  padding: "4px 4px 4px 10px",
  background: "#f5f4ef",
  border: "1px solid #d8d6cf",
  borderRadius: 12,
  fontFamily: "var(--font-mono)",
  fontSize: 12,
  color: "#111110",
};
const chipDelete: React.CSSProperties = {
  background: "transparent",
  border: "none",
  color: "#888886",
  cursor: "pointer",
  padding: "0 4px",
  fontSize: 14,
  lineHeight: 1,
};
