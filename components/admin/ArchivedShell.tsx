"use client";

import { useState, useMemo } from "react";
import Link from "next/link";

export interface ArchivedRow {
  id: string;
  title: string;
  status: string;
  priority: string;
  completed_at: string | null;
  archived_at: string;
  tags: string[];
  sales_outcome: "sold" | "not_needed" | null;
  sales_outcome_at: string | null;
  sales_outcome_notes: string | null;
  client: {
    id: string;
    first_name: string;
    last_name: string;
    company_name: string;
    email: string;
  } | null;
  sales_rep: {
    first_name: string;
    last_name: string | null;
    email: string;
  } | null;
}

type Filter = "not_needed" | "sold" | "auto" | "all";

export function ArchivedShell({ tasks: initialTasks, retentionDays }: { tasks: ArchivedRow[]; retentionDays: number }) {
  const [tasks, setTasks] = useState<ArchivedRow[]>(initialTasks);

  // Counts (computed once; don't change as we delete because counts are pre-mutation snapshot)
  const counts = useMemo(() => ({
    not_needed: tasks.filter((t) => t.sales_outcome === "not_needed").length,
    sold: tasks.filter((t) => t.sales_outcome === "sold").length,
    auto: tasks.filter((t) => !t.sales_outcome).length,
    all: tasks.length,
  }), [tasks]);

  // Default filter: surface the most actionable bucket first (rep flagged "not needed").
  // Falls back to "all" if nothing flagged, so the page is never empty when archives exist.
  const [filter, setFilter] = useState<Filter>(counts.not_needed > 0 ? "not_needed" : "all");

  const visible = useMemo(() => {
    if (filter === "all") return tasks;
    if (filter === "not_needed") return tasks.filter((t) => t.sales_outcome === "not_needed");
    if (filter === "sold") return tasks.filter((t) => t.sales_outcome === "sold");
    return tasks.filter((t) => !t.sales_outcome);
  }, [tasks, filter]);

  const removeTask = (id: string) => setTasks((prev) => prev.filter((t) => t.id !== id));

  return (
    <>
      <div style={headerStyle}>
        <div>
          <p style={eyebrow}>Admin · Archived</p>
          <h1 style={titleStyle}>Archived Tasks</h1>
          <p style={{ fontSize: "13px", color: "#888886", marginTop: "6px", fontFamily: "var(--font-sans)" }}>
            Auto-archived tasks (7 days post-complete), plus anything a sales rep flagged as <strong>Not Needed</strong>.
            Showing items archived in the last {retentionDays} days. Older entries stay in the database but are hidden here.
          </p>
        </div>
        <Link href="/admin" style={linkBtnStyle}>← Dashboard</Link>
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
        <FilterChip
          active={filter === "not_needed"}
          onClick={() => setFilter("not_needed")}
          variant="warn"
        >
          Not Needed (rep flagged) <CountBadge n={counts.not_needed} />
        </FilterChip>
        <FilterChip active={filter === "sold"} onClick={() => setFilter("sold")} variant="ok">
          Sold <CountBadge n={counts.sold} />
        </FilterChip>
        <FilterChip active={filter === "auto"} onClick={() => setFilter("auto")}>
          Auto-archived <CountBadge n={counts.auto} />
        </FilterChip>
        <FilterChip active={filter === "all"} onClick={() => setFilter("all")}>
          All <CountBadge n={counts.all} />
        </FilterChip>
      </div>

      <div style={cardStyle}>
        {visible.length === 0 ? (
          <div style={{ padding: "40px 16px", textAlign: "center", color: "#888886", fontFamily: "var(--font-sans)", fontSize: "13px" }}>
            {filter === "not_needed"
              ? "Nothing flagged Not Needed right now. Sales reps mark sites Not Needed from their dashboard."
              : `No tasks in this view.`}
          </div>
        ) : (
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={th}>Task</th>
                <th style={th}>Client</th>
                <th style={th}>Outcome</th>
                <th style={th}>Archived</th>
                <th style={{ ...th, textAlign: "right" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((t) => (
                <ArchivedRowEl key={t.id} task={t} onDeleted={() => removeTask(t.id)} />
              ))}
            </tbody>
          </table>
        )}
      </div>

      <p style={{ marginTop: "16px", fontSize: "11px", color: "#888886", fontFamily: "var(--font-sans)" }}>
        Permanent delete removes the task row + comments + history. Build records and the client stay (so billing stays intact).
      </p>
    </>
  );
}

function ArchivedRowEl({ task: t, onDeleted }: { task: ArchivedRow; onDeleted: () => void }) {
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleDelete = async () => {
    const what = t.sales_outcome === "not_needed" ? "this not-needed site" : "this archived task";
    if (!confirm(`Permanently delete ${what} (${t.title})? Comments and status history will also be deleted. Client + billing records stay. This can't be undone.`)) return;
    setDeleting(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/tasks/${t.id}/permanent`, { method: "DELETE" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error || `${res.status}`);
      onDeleted();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed");
      setDeleting(false);
    }
  };

  const repName = t.sales_rep
    ? `${t.sales_rep.first_name}${t.sales_rep.last_name ? " " + t.sales_rep.last_name : ""}`
    : null;

  return (
    <tr>
      <td style={td}>
        <div style={{ fontWeight: 600 }}>{t.title}</div>
        {t.tags && t.tags.length > 0 && (
          <div style={{ marginTop: 4, display: "flex", flexWrap: "wrap", gap: 4 }}>
            {t.tags.map((tag) => (
              <span key={tag} style={tagStyle}>{tag}</span>
            ))}
          </div>
        )}
        {t.sales_outcome_notes && (
          <div style={{ marginTop: 8, padding: "8px 12px", background: "#faf9f5", borderLeft: "3px solid #d8d6cf", fontSize: 12, color: "#555553", lineHeight: 1.5 }}>
            <strong style={{ color: "#888886", fontFamily: "var(--font-mono)", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.05em" }}>Rep notes</strong>
            <br />
            {t.sales_outcome_notes}
          </div>
        )}
      </td>
      <td style={td}>
        {t.client ? (t.client.company_name || `${t.client.first_name} ${t.client.last_name}`) : "—"}
      </td>
      <td style={td}>
        {t.sales_outcome === "not_needed" && (
          <span style={{ ...outcomeBadge, background: "#fff5f2", color: "#b3300a", border: "1px solid #ffcdc0" }}>
            🗑️ NOT NEEDED
          </span>
        )}
        {t.sales_outcome === "sold" && (
          <span style={{ ...outcomeBadge, background: "#eef7ee", color: "#2e7d32", border: "1px solid #b5d8b5" }}>
            ✓ SOLD
          </span>
        )}
        {!t.sales_outcome && (
          <span style={{ ...outcomeBadge, background: "#f5f4ef", color: "#888886", border: "1px solid #e8e6df" }}>
            auto-archived
          </span>
        )}
        {(t.sales_outcome && repName) && (
          <div style={{ fontSize: 11, color: "#888886", marginTop: 4 }}>
            by {repName}
            {t.sales_outcome_at && (
              <>
                {" · "}{new Date(t.sales_outcome_at).toLocaleDateString()}
              </>
            )}
          </div>
        )}
      </td>
      <td style={{ ...td, color: "#888886", whiteSpace: "nowrap" }}>
        {new Date(t.archived_at).toLocaleDateString()}
      </td>
      <td style={{ ...td, textAlign: "right" }}>
        <button
          onClick={handleDelete}
          disabled={deleting}
          style={deleteBtnStyle}
          title="Delete permanently"
        >
          {deleting ? "Deleting…" : "Delete permanently"}
        </button>
        {error && (
          <div style={{ fontSize: 11, color: "#b3300a", marginTop: 4 }}>{error}</div>
        )}
      </td>
    </tr>
  );
}

function FilterChip({
  active,
  onClick,
  children,
  variant,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  variant?: "warn" | "ok";
}) {
  const baseFg = variant === "warn" ? "#b3300a" : variant === "ok" ? "#2e7d32" : "#555553";
  const baseBorder = variant === "warn" ? "#ffcdc0" : variant === "ok" ? "#b5d8b5" : "#d8d6cf";
  return (
    <button
      onClick={onClick}
      style={{
        padding: "7px 14px",
        background: active ? "#111110" : "transparent",
        color: active ? "#fff" : baseFg,
        border: `1.5px solid ${active ? "#111110" : baseBorder}`,
        borderRadius: 3,
        fontFamily: "var(--font-mono)",
        fontSize: 11,
        textTransform: "uppercase",
        letterSpacing: "0.04em",
        fontWeight: 600,
        cursor: "pointer",
        display: "inline-flex",
        gap: 6,
        alignItems: "center",
      }}
    >
      {children}
    </button>
  );
}

function CountBadge({ n }: { n: number }) {
  return (
    <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, opacity: 0.7 }}>
      ({n})
    </span>
  );
}

const headerStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  marginBottom: "24px",
  flexWrap: "wrap",
  gap: "16px",
};
const eyebrow: React.CSSProperties = {
  fontFamily: "var(--font-mono)",
  fontSize: "11px",
  textTransform: "uppercase",
  letterSpacing: "0.08em",
  color: "#888886",
  marginBottom: "6px",
};
const titleStyle: React.CSSProperties = {
  fontFamily: "var(--font-serif)",
  fontSize: "clamp(1.5rem, 4vw, 2rem)",
  fontWeight: 700,
  color: "#111110",
};
const linkBtnStyle: React.CSSProperties = {
  fontFamily: "var(--font-sans)",
  fontSize: "13px",
  color: "#555553",
  textDecoration: "none",
  border: "1.5px solid #d8d6cf",
  borderRadius: "3px",
  padding: "6px 14px",
};
const cardStyle: React.CSSProperties = {
  background: "#fff",
  border: "1.5px solid #e8e6df",
  borderRadius: "6px",
  padding: "8px",
};
const tableStyle: React.CSSProperties = {
  width: "100%",
  borderCollapse: "collapse",
  fontFamily: "var(--font-sans)",
  fontSize: "13px",
};
const th: React.CSSProperties = {
  textAlign: "left",
  fontFamily: "var(--font-mono)",
  fontSize: "10px",
  textTransform: "uppercase",
  letterSpacing: "0.08em",
  color: "#888886",
  fontWeight: 600,
  padding: "10px 12px",
  borderBottom: "1px solid #e8e6df",
};
const td: React.CSSProperties = {
  padding: "12px",
  borderBottom: "1px solid #f0eeea",
  color: "#111110",
  verticalAlign: "top",
};
const tagStyle: React.CSSProperties = {
  fontFamily: "var(--font-mono)",
  fontSize: "10px",
  background: "#f0eeea",
  color: "#555553",
  padding: "1px 6px",
  borderRadius: "2px",
};
const outcomeBadge: React.CSSProperties = {
  display: "inline-block",
  fontFamily: "var(--font-mono)",
  fontSize: 10,
  padding: "3px 8px",
  borderRadius: 3,
  textTransform: "uppercase",
  letterSpacing: "0.05em",
  fontWeight: 700,
  whiteSpace: "nowrap",
};
const deleteBtnStyle: React.CSSProperties = {
  fontFamily: "var(--font-sans)",
  fontSize: 12,
  color: "#b3300a",
  background: "transparent",
  border: "1px solid #ffcdc0",
  borderRadius: 3,
  padding: "5px 11px",
  cursor: "pointer",
  whiteSpace: "nowrap",
};
