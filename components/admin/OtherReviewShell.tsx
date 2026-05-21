"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { INDUSTRY_CATEGORIES, getIndustryLabel, type IndustryOtherLogRow } from "@/lib/industries";

type Filter = "open" | "all" | "ignored";

export function OtherReviewShell({ initialEntries }: { initialEntries: IndustryOtherLogRow[] }) {
  const [entries, setEntries] = useState(initialEntries);
  const [filter, setFilter] = useState<Filter>("open");

  const visible = useMemo(() => {
    if (filter === "all") return entries;
    if (filter === "ignored") return entries.filter((e) => e.status === "ignored");
    return entries.filter((e) => e.status === "pending" || e.status === "auto_mapped");
  }, [entries, filter]);

  const updateRow = (id: string, patch: Partial<IndustryOtherLogRow>) => {
    setEntries((rows) => rows.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  };

  return (
    <div style={{ minHeight: "100vh", background: "#faf9f5", padding: "32px 24px 80px" }}>
      <div style={{ maxWidth: 1080, margin: "0 auto" }}>
        <Link href="/admin/industries" style={{ fontSize: 13, color: "#888886", textDecoration: "none" }}>← Industries</Link>
        <h1 style={{ fontFamily: "var(--font-serif)", fontSize: "2rem", fontWeight: 700, marginTop: 6, marginBottom: 4 }}>
          Other review queue
        </h1>
        <p style={{ fontSize: 14, color: "#555553", marginBottom: 20 }}>
          Every &quot;Other&quot; submission lands here. Pending entries got no refs (no alias matched). Auto-mapped entries used a matching alias — confirm or fix. Once you map an entry, future &quot;Other → keyword&quot; submissions auto-route.
        </p>

        <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
          <FilterButton active={filter === "open"} onClick={() => setFilter("open")}>Open ({entries.filter((e) => e.status === "pending" || e.status === "auto_mapped").length})</FilterButton>
          <FilterButton active={filter === "ignored"} onClick={() => setFilter("ignored")}>Ignored ({entries.filter((e) => e.status === "ignored").length})</FilterButton>
          <FilterButton active={filter === "all"} onClick={() => setFilter("all")}>All</FilterButton>
        </div>

        {visible.length === 0 ? (
          <div style={emptyBox}>No entries for this filter.</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {visible.map((entry) => (
              <EntryRow key={entry.id} entry={entry} updateRow={updateRow} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function EntryRow({ entry, updateRow }: { entry: IndustryOtherLogRow; updateRow: (id: string, patch: Partial<IndustryOtherLogRow>) => void }) {
  const [aliasKeyword, setAliasKeyword] = useState(entry.raw_text.toLowerCase().trim());
  const [targetSlug, setTargetSlug] = useState(entry.resolved_industry_slug || "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isAuto = entry.status === "auto_mapped";
  const isAdmin = entry.status === "admin_mapped";
  const isIgnored = entry.status === "ignored";
  const isPending = entry.status === "pending";

  const mapTo = async () => {
    if (!targetSlug || !aliasKeyword.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/industries/other-log/${entry.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "map_to", target_slug: targetSlug, alias_keyword: aliasKeyword.trim() }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error || "Map failed");
      updateRow(entry.id, { status: "admin_mapped", resolved_industry_slug: targetSlug, resolved_at: new Date().toISOString() });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Map failed");
    } finally {
      setBusy(false);
    }
  };

  const ignore = async () => {
    if (!confirm("Mark this entry as ignored?")) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/industries/other-log/${entry.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "ignore" }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error || "Ignore failed");
      }
      updateRow(entry.id, { status: "ignored", resolved_at: new Date().toISOString() });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ignore failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ background: "#fff", border: `1.5px solid ${isPending ? "#ffcdc0" : "#e8e6df"}`, borderRadius: 6, padding: 16 }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 10 }}>
        <div>
          <div style={{ fontFamily: "var(--font-serif)", fontSize: "1.05rem", fontWeight: 700, color: "#111110" }}>
            &ldquo;{entry.raw_text || "(blank)"}&rdquo;
          </div>
          <div style={{ fontSize: 11, color: "#888886", fontFamily: "var(--font-mono)", marginTop: 2 }}>
            {new Date(entry.created_at).toLocaleString()}
          </div>
        </div>
        <StatusBadge status={entry.status} resolvedSlug={entry.resolved_industry_slug} />
      </div>

      {(isPending || isAuto) && (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr auto auto", gap: 8, alignItems: "stretch" }}>
            <select value={targetSlug} onChange={(e) => setTargetSlug(e.target.value)} style={input}>
              <option value="">— Map to industry —</option>
              {INDUSTRY_CATEGORIES.filter((c) => c.slug !== "other").map((c) => (
                <option key={c.slug} value={c.slug}>{c.label}</option>
              ))}
            </select>
            <input
              type="text"
              value={aliasKeyword}
              onChange={(e) => setAliasKeyword(e.target.value)}
              placeholder="alias keyword"
              style={input}
            />
            <button
              onClick={mapTo}
              disabled={busy || !targetSlug || !aliasKeyword.trim()}
              className="btn-orange"
              style={{ ...primaryBtn, opacity: !targetSlug || !aliasKeyword.trim() ? 0.4 : 1 }}
            >
              {isAuto ? "Confirm" : "Map + add alias"}
            </button>
            <button onClick={ignore} disabled={busy} style={secondaryBtn}>Ignore</button>
          </div>
          {error && <div style={errorBox}>{error}</div>}
        </>
      )}

      {isAdmin && (
        <div style={{ fontSize: 12, color: "#555553" }}>
          Admin-mapped to <strong>{getIndustryLabel(entry.resolved_industry_slug || "")}</strong>. Future &quot;Other&quot; submissions matching this alias will auto-resolve.
        </div>
      )}

      {isIgnored && (
        <div style={{ fontSize: 12, color: "#888886" }}>Ignored.</div>
      )}
    </div>
  );
}

function StatusBadge({ status, resolvedSlug }: { status: string; resolvedSlug: string | null }) {
  const map: Record<string, { label: string; bg: string; fg: string }> = {
    pending: { label: "PENDING", bg: "#fff5f2", fg: "#b3300a" },
    auto_mapped: { label: `AUTO → ${getIndustryLabel(resolvedSlug || "")}`, bg: "#fff8e6", fg: "#7a5a00" },
    admin_mapped: { label: `MAPPED → ${getIndustryLabel(resolvedSlug || "")}`, bg: "#eef7ee", fg: "#2e7d32" },
    ignored: { label: "IGNORED", bg: "#f5f4ef", fg: "#888886" },
  };
  const v = map[status] || { label: status, bg: "#eee", fg: "#333" };
  return (
    <span
      style={{
        background: v.bg,
        color: v.fg,
        fontFamily: "var(--font-mono)",
        fontSize: 10,
        textTransform: "uppercase",
        letterSpacing: "0.05em",
        fontWeight: 600,
        padding: "3px 8px",
        borderRadius: 3,
        whiteSpace: "nowrap",
      }}
    >
      {v.label}
    </span>
  );
}

function FilterButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: "6px 12px",
        background: active ? "#111110" : "transparent",
        color: active ? "#fff" : "#555553",
        border: active ? "1.5px solid #111110" : "1.5px solid #d8d6cf",
        borderRadius: 3,
        fontFamily: "var(--font-mono)",
        fontSize: 11,
        textTransform: "uppercase",
        letterSpacing: "0.04em",
        fontWeight: 600,
        cursor: "pointer",
      }}
    >
      {children}
    </button>
  );
}

const input: React.CSSProperties = {
  padding: "7px 10px",
  border: "1.5px solid #d8d6cf",
  borderRadius: 3,
  fontSize: 13,
  fontFamily: "var(--font-sans)",
  background: "#faf9f5",
  outline: "none",
};
const primaryBtn: React.CSSProperties = { fontSize: 12, padding: "6px 14px", cursor: "pointer", whiteSpace: "nowrap" };
const secondaryBtn: React.CSSProperties = {
  fontSize: 12,
  padding: "6px 12px",
  background: "transparent",
  color: "#555553",
  border: "1.5px solid #d8d6cf",
  borderRadius: 3,
  cursor: "pointer",
  fontFamily: "var(--font-sans)",
  whiteSpace: "nowrap",
};
const errorBox: React.CSSProperties = { marginTop: 8, padding: "6px 10px", background: "#fff5f2", border: "1px solid #ffcdc0", borderRadius: 3, fontSize: 12, color: "#b3300a" };
const emptyBox: React.CSSProperties = { padding: "32px 14px", background: "#fff", border: "1px dashed #d8d6cf", borderRadius: 6, fontSize: 13, color: "#888886", textAlign: "center" };
