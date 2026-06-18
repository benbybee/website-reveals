"use client";

import { useState } from "react";

type Mode = "keyword" | "duplicates";

interface DupPreview {
  removable: number;
  groupCount: number;
  groups: { name: string; total: number; remove: number }[];
}

/**
 * List-cleaning tool with two modes:
 *  - Keyword: suppress businesses in THIS campaign whose name contains any of the
 *    given words (preview then apply).
 *  - Duplicates: find duplicate businesses (by normalized name), preview, then
 *    suppress the redundant copies — keeping one each and never a site-generated
 *    lead. Both move leads to the (restorable) Suppressed list, nothing deleted.
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
  const [mode, setMode] = useState<Mode>("keyword");
  const [busy, setBusy] = useState(false);

  // keyword mode
  const [keywords, setKeywords] = useState("");
  const [preview, setPreview] = useState<{ matched: number; samples: string[] } | null>(null);

  // duplicates mode
  const [dup, setDup] = useState<DupPreview | null>(null);

  async function runKeywordPreview() {
    setBusy(true);
    setPreview(null);
    try {
      const res = await fetch(`/api/templates/campaigns/${campaignId}/suppress`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ keywords, dryRun: true }),
      });
      if (!res.ok) return;
      const json = await res.json();
      setPreview({ matched: json.matched ?? 0, samples: json.samples ?? [] });
    } finally {
      setBusy(false);
    }
  }

  async function applyKeyword() {
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

  async function findDuplicates() {
    setBusy(true);
    setDup(null);
    try {
      const res = await fetch(`/api/templates/campaigns/${campaignId}/duplicates`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ dryRun: true }),
      });
      if (!res.ok) return;
      const json = (await res.json()) as DupPreview;
      setDup(json);
    } finally {
      setBusy(false);
    }
  }

  async function applyDuplicates() {
    setBusy(true);
    try {
      const res = await fetch(`/api/templates/campaigns/${campaignId}/duplicates`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ dryRun: false }),
      });
      if (!res.ok) return;
      const json = await res.json();
      onSuppressed(json.suppressed ?? 0);
    } finally {
      setBusy(false);
    }
  }

  function switchMode(m: Mode) {
    setMode(m);
    setPreview(null);
    setDup(null);
  }

  return (
    <div role="dialog" aria-modal="true" style={overlay} onClick={busy ? undefined : onClose}>
      <div style={modal} onClick={(e) => e.stopPropagation()}>
        <h2 style={{ fontFamily: "var(--font-serif)", fontSize: "1.25rem", fontWeight: 700, margin: "0 0 12px" }}>Clean list</h2>

        <div style={{ display: "flex", gap: 6, marginBottom: 14 }}>
          <button onClick={() => switchMode("keyword")} style={mode === "keyword" ? tabActive : tab}>By keyword</button>
          <button onClick={() => switchMode("duplicates")} style={mode === "duplicates" ? tabActive : tab}>Duplicates</button>
        </div>

        {mode === "keyword" && (
          <>
            <p style={{ fontSize: 13, color: "#555553", lineHeight: 1.5, margin: "0 0 12px" }}>
              Suppress every business in this campaign whose name contains any of these words. Comma-separated, case-insensitive.
              Suppressed leads move to the <strong>Suppressed</strong> list — nothing is deleted.
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
            <div style={actions}>
              <button onClick={onClose} disabled={busy} style={ghostBtn}>Cancel</button>
              <button onClick={runKeywordPreview} disabled={busy || !keywords.trim()} style={ghostBtn}>{busy && !preview ? "…" : "Preview"}</button>
              <button
                onClick={applyKeyword}
                disabled={busy || !preview || preview.matched === 0}
                style={{ ...dangerBtn, ...(!preview || preview.matched === 0 ? disabledBtn : null) }}
                title={!preview ? "Preview first" : preview.matched === 0 ? "Nothing to suppress" : ""}
              >
                {busy && preview ? "Suppressing…" : preview ? `Suppress ${preview.matched}` : "Suppress"}
              </button>
            </div>
          </>
        )}

        {mode === "duplicates" && (
          <>
            <p style={{ fontSize: 13, color: "#555553", lineHeight: 1.5, margin: "0 0 12px" }}>
              Find businesses that appear more than once (matched by name). Removing keeps one copy of each and suppresses the rest.
              Leads with a <strong>site already generated are kept</strong> and never removed. Removed copies move to the
              {" "}<strong>Suppressed</strong> list — restorable, nothing deleted.
            </p>
            {!dup && (
              <div style={actions}>
                <button onClick={onClose} disabled={busy} style={ghostBtn}>Cancel</button>
                <button onClick={findDuplicates} disabled={busy} style={primaryBtn}>{busy ? "Scanning…" : "Find duplicates"}</button>
              </div>
            )}
            {dup && (
              <>
                <div style={previewBox}>
                  <span style={{ fontWeight: 700, color: dup.removable > 0 ? "#b3300a" : "#0a7a3d" }}>{dup.removable}</span>
                  {" "}duplicate lead{dup.removable === 1 ? "" : "s"} to remove across <strong>{dup.groupCount}</strong> business{dup.groupCount === 1 ? "" : "es"}.
                  {dup.groups.length > 0 && (
                    <div style={{ marginTop: 8, maxHeight: 180, overflowY: "auto", display: "flex", flexDirection: "column", gap: 4 }}>
                      {dup.groups.map((g, i) => (
                        <div key={i} style={{ fontSize: 12, color: "#555553", display: "flex", justifyContent: "space-between", gap: 10 }}>
                          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{g.name}</span>
                          <span style={{ fontFamily: "var(--font-mono)", color: "#b3300a", flexShrink: 0 }}>{g.total} copies · remove {g.remove}</span>
                        </div>
                      ))}
                      {dup.groupCount > dup.groups.length && (
                        <div style={{ fontSize: 11, color: "#888886" }}>…and {dup.groupCount - dup.groups.length} more</div>
                      )}
                    </div>
                  )}
                </div>
                <div style={actions}>
                  <button onClick={onClose} disabled={busy} style={ghostBtn}>Cancel</button>
                  <button onClick={findDuplicates} disabled={busy} style={ghostBtn}>{busy && dup ? "…" : "Re-scan"}</button>
                  <button
                    onClick={applyDuplicates}
                    disabled={busy || dup.removable === 0}
                    style={{ ...dangerBtn, ...(dup.removable === 0 ? disabledBtn : null) }}
                  >
                    {busy ? "Removing…" : dup.removable > 0 ? `Suppress ${dup.removable} duplicates` : "No duplicates"}
                  </button>
                </div>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}

const overlay: React.CSSProperties = { position: "fixed", inset: 0, background: "rgba(17,17,16,0.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 60, padding: 16 };
const modal: React.CSSProperties = { background: "#fff", border: "1.5px solid #e8e6df", borderRadius: 8, padding: 24, width: "100%", maxWidth: 480, boxShadow: "0 12px 40px rgba(0,0,0,0.18)" };
const tab: React.CSSProperties = { fontFamily: "var(--font-sans)", fontSize: 12, fontWeight: 600, color: "#555553", background: "#fff", border: "1.5px solid #d8d6cf", borderRadius: 4, padding: "5px 12px", cursor: "pointer" };
const tabActive: React.CSSProperties = { ...tab, color: "#fff", background: "#111110", border: "1.5px solid #111110" };
const textarea: React.CSSProperties = { width: "100%", minHeight: 72, resize: "vertical", padding: "9px 11px", border: "1.5px solid #d8d6cf", borderRadius: 4, fontSize: 13, fontFamily: "var(--font-sans)", boxSizing: "border-box" };
const previewBox: React.CSSProperties = { marginTop: 12, padding: "10px 12px", background: "#f5f4ef", border: "1px solid #e8e6df", borderRadius: 4, fontSize: 13, color: "#333" };
const actions: React.CSSProperties = { display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 18 };
const ghostBtn: React.CSSProperties = { fontFamily: "var(--font-sans)", fontSize: 13, fontWeight: 500, color: "#555553", background: "#fff", border: "1.5px solid #d8d6cf", borderRadius: 4, padding: "7px 14px", cursor: "pointer" };
const primaryBtn: React.CSSProperties = { fontFamily: "var(--font-sans)", fontSize: 13, fontWeight: 600, color: "#fff", background: "#ff3d00", border: "1.5px solid #ff3d00", borderRadius: 4, padding: "7px 16px", cursor: "pointer" };
const dangerBtn: React.CSSProperties = { fontFamily: "var(--font-sans)", fontSize: 13, fontWeight: 600, color: "#fff", background: "#b3300a", border: "1.5px solid #b3300a", borderRadius: 4, padding: "7px 16px", cursor: "pointer" };
const disabledBtn: React.CSSProperties = { opacity: 0.5, cursor: "not-allowed" };
