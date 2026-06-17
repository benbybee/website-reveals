"use client";

import { useState } from "react";

/**
 * Keyword "Clean list" tool: free-form comma-separated words → suppress every
 * business in THIS campaign whose name contains any of them. Always preview
 * (dry-run) before applying, so the operator sees the count + sample names
 * first. Suppressed leads move to the Suppressed list (non-destructive).
 */
export function CleanListModal({
  campaignId,
  onClose,
  onSuppressed,
}: {
  campaignId: string;
  onClose: () => void;
  onSuppressed: (count: number) => void;
}) {
  const [keywords, setKeywords] = useState("");
  const [preview, setPreview] = useState<{ matched: number; samples: string[] } | null>(null);
  const [busy, setBusy] = useState(false);

  async function runPreview() {
    setBusy(true);
    setPreview(null);
    try {
      const res = await fetch(`/api/templates/campaigns/${campaignId}/suppress`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ keywords, dryRun: true }),
      });
      if (!res.ok) return; // ToastProvider surfaces the error
      const json = await res.json();
      setPreview({ matched: json.matched ?? 0, samples: json.samples ?? [] });
    } finally {
      setBusy(false);
    }
  }

  async function apply() {
    setBusy(true);
    try {
      const res = await fetch(`/api/templates/campaigns/${campaignId}/suppress`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ keywords }),
      });
      if (!res.ok) return;
      const json = await res.json();
      onSuppressed(json.suppressed ?? 0);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div role="dialog" aria-modal="true" style={overlay} onClick={busy ? undefined : onClose}>
      <div style={modal} onClick={(e) => e.stopPropagation()}>
        <h2 style={{ fontFamily: "var(--font-serif)", fontSize: "1.25rem", fontWeight: 700, margin: "0 0 8px" }}>Clean list</h2>
        <p style={{ fontSize: 13, color: "#555553", lineHeight: 1.5, margin: "0 0 12px" }}>
          Suppress every business in this campaign whose name contains any of these words. Comma-separated, case-insensitive.
          Suppressed leads move to the <strong>Suppressed</strong> list — nothing is deleted, and you can restore them anytime.
        </p>

        <textarea
          value={keywords}
          onChange={(e) => { setKeywords(e.target.value); setPreview(null); }}
          placeholder="plumbing, electrical, mechanical"
          autoFocus
          style={textarea}
        />

        {preview && (
          <div style={previewBox}>
            <span style={{ fontWeight: 700, color: preview.matched > 0 ? "#b3300a" : "#555553" }}>{preview.matched}</span>
            {" "}match{preview.matched === 1 ? "" : "es"} in this campaign.
            {preview.samples.length > 0 && (
              <div style={{ marginTop: 4, color: "#555553", fontFamily: "var(--font-mono)", fontSize: 11.5 }}>
                e.g. {preview.samples.slice(0, 6).join(", ")}{preview.matched > preview.samples.length ? " …" : ""}
              </div>
            )}
          </div>
        )}

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 18 }}>
          <button onClick={onClose} disabled={busy} style={ghostBtn}>Cancel</button>
          <button onClick={runPreview} disabled={busy || !keywords.trim()} style={ghostBtn}>{busy && !preview ? "…" : "Preview"}</button>
          <button
            onClick={apply}
            disabled={busy || !preview || preview.matched === 0}
            style={{ ...dangerBtn, opacity: !preview || preview.matched === 0 ? 0.5 : 1, cursor: !preview || preview.matched === 0 ? "not-allowed" : "pointer" }}
            title={!preview ? "Preview first" : preview.matched === 0 ? "Nothing to suppress" : ""}
          >
            {busy && preview ? "Suppressing…" : preview ? `Suppress ${preview.matched}` : "Suppress"}
          </button>
        </div>
      </div>
    </div>
  );
}

const overlay: React.CSSProperties = { position: "fixed", inset: 0, background: "rgba(17,17,16,0.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 60, padding: 16 };
const modal: React.CSSProperties = { background: "#fff", border: "1.5px solid #e8e6df", borderRadius: 8, padding: 24, width: "100%", maxWidth: 460, boxShadow: "0 12px 40px rgba(0,0,0,0.18)" };
const textarea: React.CSSProperties = { width: "100%", minHeight: 72, resize: "vertical", padding: "9px 11px", border: "1.5px solid #d8d6cf", borderRadius: 4, fontSize: 13, fontFamily: "var(--font-sans)", boxSizing: "border-box" };
const previewBox: React.CSSProperties = { marginTop: 12, padding: "10px 12px", background: "#f5f4ef", border: "1px solid #e8e6df", borderRadius: 4, fontSize: 13, color: "#333" };
const ghostBtn: React.CSSProperties = { fontFamily: "var(--font-sans)", fontSize: 13, fontWeight: 500, color: "#555553", background: "#fff", border: "1.5px solid #d8d6cf", borderRadius: 4, padding: "7px 14px", cursor: "pointer" };
const dangerBtn: React.CSSProperties = { fontFamily: "var(--font-sans)", fontSize: 13, fontWeight: 600, color: "#fff", background: "#b3300a", border: "1.5px solid #b3300a", borderRadius: 4, padding: "7px 16px" };
