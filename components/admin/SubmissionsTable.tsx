"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import type { FormSession } from "@/lib/supabase/types";
import { DetailDrawer } from "./DetailDrawer";

type SortKey = "business_name" | "source" | "email" | "submitted_at";
type SortDir = "asc" | "desc";
type ExportFilter = "all" | "new" | "exported";

const SOURCES = ["all", "claim-your-site", "novalux", "new-client", "external"] as const;

export function SubmissionsTable({ sessions: initial }: { sessions: FormSession[] }) {
  const router = useRouter();
  const [sessions, setSessions] = useState(initial);
  const [search, setSearch] = useState("");
  const [sourceFilter, setSourceFilter] = useState<string>("all");
  const [exportFilter, setExportFilter] = useState<ExportFilter>("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("submitted_at");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [selected, setSelected] = useState<FormSession | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [clearingAll, setClearingAll] = useState(false);

  const newCount = useMemo(() => sessions.filter((s) => !s.exported_at).length, [sessions]);

  const filtered = useMemo(() => {
    let result = [...sessions];

    // Text search
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter((s) => {
        const name = String(s.form_data?.business_name || "").toLowerCase();
        const email = (s.email || String(s.form_data?.email || "")).toLowerCase();
        return name.includes(q) || email.includes(q);
      });
    }

    // Source filter
    if (sourceFilter !== "all") {
      result = result.filter(
        (s) => (s.form_data?._source || "claim-your-site") === sourceFilter
      );
    }

    // Export status filter
    if (exportFilter === "new") {
      result = result.filter((s) => !s.exported_at);
    } else if (exportFilter === "exported") {
      result = result.filter((s) => !!s.exported_at);
    }

    // Date range
    if (dateFrom) {
      const from = new Date(dateFrom);
      result = result.filter(
        (s) => s.submitted_at && new Date(s.submitted_at) >= from
      );
    }
    if (dateTo) {
      const to = new Date(dateTo);
      to.setHours(23, 59, 59, 999);
      result = result.filter(
        (s) => s.submitted_at && new Date(s.submitted_at) <= to
      );
    }

    // Sort
    result.sort((a, b) => {
      let aVal = "";
      let bVal = "";

      switch (sortKey) {
        case "business_name":
          aVal = String(a.form_data?.business_name || "").toLowerCase();
          bVal = String(b.form_data?.business_name || "").toLowerCase();
          break;
        case "source":
          aVal = String(a.form_data?._source || "claim-your-site");
          bVal = String(b.form_data?._source || "claim-your-site");
          break;
        case "email":
          aVal = (a.email || String(a.form_data?.email || "")).toLowerCase();
          bVal = (b.email || String(b.form_data?.email || "")).toLowerCase();
          break;
        case "submitted_at":
          aVal = a.submitted_at || "";
          bVal = b.submitted_at || "";
          break;
      }

      if (aVal < bVal) return sortDir === "asc" ? -1 : 1;
      if (aVal > bVal) return sortDir === "asc" ? 1 : -1;
      return 0;
    });

    return result;
  }, [sessions, search, sourceFilter, exportFilter, dateFrom, dateTo, sortKey, sortDir]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  const sortIndicator = (key: SortKey) => {
    if (sortKey !== key) return "";
    return sortDir === "asc" ? " \u2191" : " \u2193";
  };

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm("Delete this submission? This cannot be undone.")) return;
    setDeleting(id);
    const res = await fetch(`/api/admin/submissions/${id}`, { method: "DELETE" });
    if (res.ok) {
      setSessions((prev) => prev.filter((s) => s.id !== id));
      if (selected?.id === id) setSelected(null);
    }
    setDeleting(null);
  };

  const handleClearAll = async () => {
    if (!confirm(`Delete ALL ${sessions.length} submissions? This cannot be undone.`)) return;
    if (!confirm("Are you absolutely sure? This will permanently delete every submission.")) return;
    setClearingAll(true);
    const res = await fetch("/api/admin/submissions/clear", { method: "DELETE" });
    if (res.ok) {
      setSessions([]);
      setSelected(null);
    } else {
      alert("Failed to clear submissions.");
    }
    setClearingAll(false);
  };

  const handleExported = (session: FormSession) => {
    setSessions((prev) =>
      prev.map((s) =>
        s.id === session.id ? { ...s, exported_at: new Date().toISOString() } : s
      )
    );
    setSelected((prev) =>
      prev?.id === session.id ? { ...prev, exported_at: new Date().toISOString() } : prev
    );
  };

  return (
    <>
      {/* Header with Clear All */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: "16px",
        }}
      >
        <h2
          style={{
            fontFamily: "var(--font-sans)",
            fontSize: "16px",
            fontWeight: 600,
            color: "#111110",
            margin: 0,
          }}
        >
          Submissions
        </h2>
        {sessions.length > 0 && (
          <button
            onClick={handleClearAll}
            disabled={clearingAll}
            style={{
              background: "transparent",
              color: "#c8c6be",
              border: "1.5px solid #e8e6df",
              fontSize: "12px",
              padding: "6px 14px",
              borderRadius: "4px",
              cursor: clearingAll ? "not-allowed" : "pointer",
              fontFamily: "var(--font-sans)",
              fontWeight: 500,
              transition: "all 0.12s",
              opacity: clearingAll ? 0.6 : 1,
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = "#ff3d00";
              e.currentTarget.style.borderColor = "#ff3d00";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = "#c8c6be";
              e.currentTarget.style.borderColor = "#e8e6df";
            }}
          >
            {clearingAll ? "Clearing..." : "Clear All"}
          </button>
        )}
      </div>

      {/* Filters */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, 1fr)",
          gap: "12px",
          marginBottom: "20px",
        }}
      >
        <input
          className="field"
          placeholder="Search name or email..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ padding: "10px 14px", fontSize: "14px" }}
        />
        <select
          className="field"
          value={sourceFilter}
          onChange={(e) => setSourceFilter(e.target.value)}
          style={{ padding: "10px 14px", fontSize: "14px", cursor: "pointer" }}
        >
          {SOURCES.map((s) => (
            <option key={s} value={s}>
              {s === "all" ? "All Sources" : s}
            </option>
          ))}
        </select>
        <select
          className="field"
          value={exportFilter}
          onChange={(e) => setExportFilter(e.target.value as ExportFilter)}
          style={{ padding: "10px 14px", fontSize: "14px", cursor: "pointer" }}
        >
          <option value="all">All Status</option>
          <option value="new">New ({newCount})</option>
          <option value="exported">Exported</option>
        </select>
        <div style={{ display: "flex", gap: "8px" }}>
          <input
            className="field"
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            style={{ padding: "10px 14px", fontSize: "14px", flex: 1 }}
          />
          <input
            className="field"
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            style={{ padding: "10px 14px", fontSize: "14px", flex: 1 }}
          />
        </div>
      </div>

      {/* Count */}
      <p
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: "12px",
          color: "#888886",
          marginBottom: "12px",
          letterSpacing: "0.02em",
        }}
      >
        {filtered.length} submission{filtered.length !== 1 ? "s" : ""}
      </p>

      {/* Table */}
      <div
        style={{
          border: "1.5px solid #e8e6df",
          borderRadius: "6px",
          overflow: "hidden",
          background: "#fff",
        }}
      >
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ borderBottom: "1.5px solid #e8e6df" }}>
              {/* Status column */}
              <th style={{ ...thStyle, width: "50px", textAlign: "center" }}>
                Status
              </th>
              {(
                [
                  ["business_name", "Business Name"],
                  ["source", "Source"],
                  ["email", "Email"],
                  ["submitted_at", "Submitted"],
                ] as [SortKey, string][]
              ).map(([key, label]) => (
                <th
                  key={key}
                  onClick={() => toggleSort(key)}
                  style={{
                    ...thStyle,
                    cursor: "pointer",
                    userSelect: "none",
                  }}
                >
                  {label}
                  {sortIndicator(key)}
                </th>
              ))}
              {/* Actions column */}
              <th style={{ ...thStyle, width: "60px", textAlign: "center" }} />
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td
                  colSpan={6}
                  style={{
                    ...tdStyle,
                    textAlign: "center",
                    color: "#888886",
                    padding: "40px 16px",
                  }}
                >
                  No submissions found.
                </td>
              </tr>
            ) : (
              filtered.map((s) => (
                <tr
                  key={s.id}
                  onClick={() => setSelected(s)}
                  style={{
                    borderBottom: "1px solid #f0eee8",
                    cursor: "pointer",
                    transition: "background 0.1s",
                  }}
                  onMouseEnter={(e) =>
                    (e.currentTarget.style.background = "#faf9f5")
                  }
                  onMouseLeave={(e) =>
                    (e.currentTarget.style.background = "transparent")
                  }
                >
                  {/* Status */}
                  <td style={{ ...tdStyle, textAlign: "center" }}>
                    {!s.exported_at ? (
                      <span style={newBadgeStyle}>NEW</span>
                    ) : (
                      <span style={exportedBadgeStyle}>Exported</span>
                    )}
                  </td>
                  <td style={tdStyle}>
                    {String(s.form_data?.business_name || "\u2014")}
                  </td>
                  <td style={tdStyle}>
                    <span style={sourceBadgeStyle}>
                      {String(s.form_data?._source || "claim-your-site")}
                    </span>
                  </td>
                  <td style={tdStyle}>
                    {s.email || String(s.form_data?.email || "\u2014")}
                  </td>
                  <td style={tdStyle}>
                    {s.submitted_at
                      ? new Date(s.submitted_at).toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                        })
                      : "\u2014"}
                  </td>
                  {/* Delete */}
                  <td style={{ ...tdStyle, textAlign: "center" }}>
                    <button
                      onClick={(e) => handleDelete(s.id, e)}
                      disabled={deleting === s.id}
                      style={{
                        background: "transparent",
                        border: "none",
                        color: "#c8c6be",
                        cursor: deleting === s.id ? "not-allowed" : "pointer",
                        fontSize: "14px",
                        padding: "4px 8px",
                        borderRadius: "3px",
                        transition: "color 0.12s",
                      }}
                      onMouseEnter={(e) =>
                        (e.currentTarget.style.color = "#ff3d00")
                      }
                      onMouseLeave={(e) =>
                        (e.currentTarget.style.color = "#c8c6be")
                      }
                      title="Delete submission"
                    >
                      {deleting === s.id ? "\u2026" : "\u2715"}
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Detail Drawer */}
      {selected && (
        <DetailDrawer
          session={selected}
          onClose={() => setSelected(null)}
          onExported={handleExported}
        />
      )}
    </>
  );
}

const thStyle: React.CSSProperties = {
  textAlign: "left",
  fontFamily: "var(--font-sans)",
  fontSize: "12px",
  fontWeight: 600,
  color: "#888886",
  textTransform: "uppercase",
  letterSpacing: "0.06em",
  padding: "12px 16px",
  background: "#faf9f5",
};

const tdStyle: React.CSSProperties = {
  fontFamily: "var(--font-sans)",
  fontSize: "14px",
  color: "#111110",
  padding: "14px 16px",
};

const sourceBadgeStyle: React.CSSProperties = {
  fontFamily: "var(--font-mono)",
  fontSize: "11px",
  fontWeight: 500,
  color: "#ff3d00",
  background: "#fff5f2",
  padding: "3px 8px",
  borderRadius: "3px",
  letterSpacing: "0.02em",
};

const newBadgeStyle: React.CSSProperties = {
  fontFamily: "var(--font-mono)",
  fontSize: "10px",
  fontWeight: 700,
  color: "#fff",
  background: "#ff3d00",
  padding: "2px 7px",
  borderRadius: "3px",
  letterSpacing: "0.06em",
};

const exportedBadgeStyle: React.CSSProperties = {
  fontFamily: "var(--font-mono)",
  fontSize: "10px",
  fontWeight: 500,
  color: "#888886",
  letterSpacing: "0.02em",
};
