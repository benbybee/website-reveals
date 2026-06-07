"use client";

import { useState } from "react";
import type { RerunConfig, RerunMode } from "@/lib/templates/rerun";

export interface RerunTarget {
  id: string;
  industry_slug: string;
  state: string | null;
  target_count: number;
  scraped_count: number;
  cityCount: number;
}

const ENRICH_STAGES: { value: string; label: string }[] = [
  { value: "scraped", label: "Scraped" },
  { value: "incomplete", label: "Incomplete" },
  { value: "qualified", label: "Qualified" },
];

/**
 * Full control over how a completed campaign is re-run. Three modes map to the
 * RerunConfig contract; the "find new" mode surfaces a deeper-crawl warning,
 * because Google Places returns the same top results unless the crawl is widened
 * (raise target / add cities). On submit, posts the config to the run route.
 */
export function RerunModal({
  target,
  onClose,
  onEditCities,
}: {
  target: RerunTarget;
  onClose: () => void;
  onEditCities: () => void;
}) {
  const [mode, setMode] = useState<RerunMode>("discover_new");
  const [stages, setStages] = useState<string[]>(["scraped", "incomplete"]);
  const [includeNoSite, setIncludeNoSite] = useState(true);
  const [reEnrich, setReEnrich] = useState(true);
  const [targetCount, setTargetCount] = useState(Math.max(target.target_count, target.scraped_count));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Find-new can only surface businesses the last crawl didn't reach. If the
  // user hasn't widened the crawl (more results-per-search than already scraped,
  // or more cities), warn that the run will likely re-pull the same businesses.
  const deeperCrawl = targetCount > target.scraped_count || target.cityCount > 1;
  const showDeepWarning = mode === "discover_new" && !deeperCrawl;

  function toggleStage(s: string) {
    setStages((prev) => (prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]));
  }

  async function submit() {
    setError(null);
    setBusy(true);
    try {
      const config: RerunConfig = { mode };
      if (mode === "enrich_existing") {
        config.stages = stages;
        config.includeNoSite = includeNoSite;
      }
      if (mode === "rescrape") config.reEnrich = reEnrich;
      if (mode !== "enrich_existing") config.targetCount = targetCount;

      const res = await fetch(`/api/templates/campaigns/${target.id}/run`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(config),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || "Failed to start re-run");
      }
      onClose();
    } catch (err) {
      setError(String(err instanceof Error ? err.message : err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={overlay} onClick={onClose}>
      <div style={modal} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 4 }}>
          <h2 style={{ fontFamily: "var(--font-serif)", fontSize: "1.4rem", fontWeight: 700 }}>Re-run campaign</h2>
          <button onClick={onClose} style={iconBtn}>×</button>
        </div>
        <p style={{ fontSize: 13, color: "#555553", marginBottom: 18 }}>
          {target.industry_slug} · {target.state ?? "—"} · {target.scraped_count} prospects so far
        </p>

        {error && <div style={errorBox}>{error}</div>}

        <ModeOption
          checked={mode === "discover_new"}
          onSelect={() => setMode("discover_new")}
          title="Find new businesses"
          desc="Crawl again and add only businesses not already on this list. Existing prospects stay exactly as they are."
        />
        {mode === "discover_new" && (
          <div style={subPanel}>
            <label style={inlineLabel}>
              Results per search
              <input type="number" min={1} value={targetCount} onChange={(e) => setTargetCount(parseInt(e.target.value, 10) || 0)} style={numInput} />
            </label>
            {showDeepWarning ? (
              <div style={warnBox}>
                <strong>This will likely re-pull the same businesses.</strong>
                <span> Google Places returns the same top results by relevance. To reach new businesses, make the crawl go deeper:</span>
                <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>
                  <li>Raise &ldquo;results per search&rdquo; above {target.scraped_count} (currently {targetCount}).</li>
                  <li>
                    Add more cities to this campaign —{" "}
                    <button type="button" onClick={onEditCities} style={linkBtn}>edit cities</button>.
                  </li>
                </ul>
              </div>
            ) : (
              <div style={okBox}>
                Crawl widened (target {targetCount} vs {target.scraped_count} scraped{target.cityCount > 1 ? `, ${target.cityCount} cities` : ""}). New businesses are likely.
              </div>
            )}
          </div>
        )}

        <ModeOption
          checked={mode === "enrich_existing"}
          onSelect={() => setMode("enrich_existing")}
          title="Enrich existing"
          desc="Re-run enrichment on prospects already on the list. Their stage never changes."
        />
        {mode === "enrich_existing" && (
          <div style={subPanel}>
            <div style={inlineLabel}>Re-enrich prospects in:</div>
            <div style={{ display: "flex", gap: 14, flexWrap: "wrap", margin: "6px 0 10px" }}>
              {ENRICH_STAGES.map((s) => (
                <label key={s.value} style={checkLabel}>
                  <input type="checkbox" checked={stages.includes(s.value)} onChange={() => toggleStage(s.value)} />
                  {s.label}
                </label>
              ))}
            </div>
            <label style={checkLabel}>
              <input type="checkbox" checked={includeNoSite} onChange={(e) => setIncludeNoSite(e.target.checked)} />
              Include prospects with no website
            </label>
          </div>
        )}

        <ModeOption
          checked={mode === "rescrape"}
          onSelect={() => setMode("rescrape")}
          title="Refresh (re-scrape)"
          desc="Pay to crawl the same businesses again and refresh their data."
        />
        {mode === "rescrape" && (
          <div style={subPanel}>
            <div style={warnBox}>This re-pulls data you already have and is billed by Apify. Use it to refresh stale listings.</div>
            <label style={{ ...checkLabel, marginTop: 10 }}>
              <input type="checkbox" checked={reEnrich} onChange={(e) => setReEnrich(e.target.checked)} />
              Re-enrich &amp; re-score refreshed prospects (resets their stage)
            </label>
          </div>
        )}

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 22 }}>
          <button onClick={onClose} style={ghostBtn} disabled={busy}>Cancel</button>
          <button onClick={submit} style={primaryBtn} disabled={busy || (mode === "enrich_existing" && stages.length === 0)}>
            {busy ? "Starting…" : "Start re-run"}
          </button>
        </div>
      </div>
    </div>
  );
}

function ModeOption({ checked, onSelect, title, desc }: { checked: boolean; onSelect: () => void; title: string; desc: string }) {
  return (
    <label
      onClick={onSelect}
      style={{
        display: "flex", gap: 10, alignItems: "flex-start", padding: "12px 14px", marginBottom: 8, cursor: "pointer",
        border: `1.5px solid ${checked ? "#ff3d00" : "#e8e6df"}`, borderRadius: 6, background: checked ? "#fff6f3" : "#fff",
      }}
    >
      <input type="radio" checked={checked} onChange={onSelect} style={{ marginTop: 3 }} />
      <div>
        <div style={{ fontWeight: 600, fontSize: 14, color: "#111110" }}>{title}</div>
        <div style={{ fontSize: 12.5, color: "#555553", marginTop: 2 }}>{desc}</div>
      </div>
    </label>
  );
}

const overlay: React.CSSProperties = { position: "fixed", inset: 0, background: "rgba(17,17,16,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50, padding: 20 };
const modal: React.CSSProperties = { background: "#faf9f5", border: "1.5px solid #e8e6df", borderRadius: 8, padding: 24, width: "100%", maxWidth: 560, maxHeight: "90vh", overflowY: "auto", fontFamily: "var(--font-sans)" };
const subPanel: React.CSSProperties = { margin: "-2px 0 12px", padding: "12px 14px", border: "1.5px solid #e8e6df", borderRadius: 6, background: "#fff" };
const inlineLabel: React.CSSProperties = { fontFamily: "var(--font-mono)", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.05em", color: "#555553", fontWeight: 600, display: "flex", alignItems: "center", gap: 8 };
const checkLabel: React.CSSProperties = { display: "flex", alignItems: "center", gap: 7, fontSize: 13, color: "#555553" };
const numInput: React.CSSProperties = { width: 90, padding: "6px 8px", border: "1.5px solid #d8d6cf", borderRadius: 4, fontSize: 13, fontFamily: "var(--font-sans)" };
const warnBox: React.CSSProperties = { background: "#fff7ed", border: "1.5px solid #fed7aa", color: "#9a3412", padding: "10px 12px", borderRadius: 4, fontSize: 12.5, marginTop: 10 };
const okBox: React.CSSProperties = { background: "#f0fdf4", border: "1.5px solid #bbf7d0", color: "#166534", padding: "10px 12px", borderRadius: 4, fontSize: 12.5, marginTop: 10 };
const errorBox: React.CSSProperties = { background: "#fff0ec", border: "1.5px solid #ffcdc0", color: "#b3300a", padding: "8px 12px", borderRadius: 4, fontSize: 13, marginBottom: 16 };
const primaryBtn: React.CSSProperties = { fontFamily: "var(--font-sans)", fontSize: 13, fontWeight: 600, color: "#fff", background: "#ff3d00", border: "none", borderRadius: 4, padding: "8px 18px", cursor: "pointer" };
const ghostBtn: React.CSSProperties = { fontFamily: "var(--font-sans)", fontSize: 12, fontWeight: 500, color: "#555553", background: "transparent", border: "1.5px solid #d8d6cf", borderRadius: 4, padding: "8px 14px", cursor: "pointer" };
const linkBtn: React.CSSProperties = { background: "none", border: "none", color: "#ff3d00", cursor: "pointer", padding: 0, fontSize: 12.5, textDecoration: "underline", fontFamily: "inherit" };
const iconBtn: React.CSSProperties = { background: "transparent", border: "none", cursor: "pointer", color: "#888886", fontSize: 22, lineHeight: 1 };
