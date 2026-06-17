"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Session = {
  token: string;
  email: string | null;
  form_data: Record<string, unknown> | null;
  submitted_at: string | null;
};

type Client = {
  id: string;
  first_name: string;
  last_name: string;
  company_name: string;
  email: string;
  website_url: string | null;
  created_at: string;
};

type Task = Record<string, unknown> & {
  id: string;
  title: string;
  status: string;
  priority: string;
  created_at: string;
  updated_at: string;
  sales_outcome?: "sold" | "not_needed" | null;
  client?: { id: string; first_name: string; last_name: string; company_name: string; email: string } | null;
};

type TemplateLead = {
  id: string;
  business_name: string | null;
  city: string | null;
  state: string | null;
  phone: string | null;
  stage: string;
  preview_url: string | null;
  lookup_count: number;
  click_count: number;
  sold_at: string | null;
};

type Tab = "leads" | "submissions" | "clients" | "tasks";

const STATUS_COLORS: Record<string, string> = {
  backlog: "#888886",
  in_progress: "#ff3d00",
  review: "#7c4dff",
  blocked: "#ff6b35",
  complete: "#2e7d32",
  queued: "#888886",
  building: "#ff3d00",
  deployed: "#7c4dff",
  live: "#2e7d32",
  failed: "#b3300a",
};

const STATUS_LABELS: Record<string, string> = {
  backlog: "Backlog",
  in_progress: "In Progress",
  review: "Review",
  blocked: "Blocked",
  complete: "Complete",
};

export function SalesRepDashboard({
  rep,
  sessions,
  clients,
  tasks,
  templateLeads = [],
}: {
  rep: { first_name: string; last_name: string | null; email: string };
  sessions: Session[];
  clients: Client[];
  tasks: Task[];
  templateLeads?: TemplateLead[];
}) {
  const [tab, setTab] = useState<Tab>(templateLeads.length > 0 ? "leads" : "submissions");

  const tabCounts = {
    leads: templateLeads.length,
    submissions: sessions.length,
    clients: clients.length,
    tasks: tasks.length,
  };

  return (
    <>
      <div style={headerStyle}>
        <div>
          <p style={eyebrow}>Sales Rep Dashboard</p>
          <h1 style={titleStyle}>Hi, {rep.first_name} 👋</h1>
          <p style={{ fontSize: "13px", color: "#888886", marginTop: "4px" }}>{rep.email}</p>
        </div>
        <div style={{ display: "flex", gap: "10px" }}>
          <form action="/api/sales-rep/logout" method="POST">
            <button type="submit" style={btnGhost}>Sign out</button>
          </form>
        </div>
      </div>

      <div style={tabsRow}>
        {(["leads", "submissions", "clients", "tasks"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              ...tabBtn,
              color: tab === t ? "#ff3d00" : "#888886",
              borderBottom: tab === t ? "2px solid #ff3d00" : "2px solid transparent",
            }}
          >
            {t === "leads" ? "my leads" : t} <span style={{ color: "#888886", fontWeight: 400 }}>({tabCounts[t]})</span>
          </button>
        ))}
      </div>

      {tab === "leads" && <LeadsTab leads={templateLeads} />}
      {tab === "submissions" && <SubmissionsTab sessions={sessions} />}
      {tab === "clients" && <ClientsTab clients={clients} />}
      {tab === "tasks" && <TasksTab tasks={tasks} />}
    </>
  );
}

/**
 * Read-only board of the rep's assigned template leads with engagement signals.
 * The rep can flag a lead "sold" (the operator converts later) but cannot change
 * stage or convert — those stay admin-only.
 */
function LeadsTab({ leads }: { leads: TemplateLead[] }) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);

  async function toggleSold(lead: TemplateLead) {
    setBusyId(lead.id);
    try {
      const res = await fetch(`/api/sales-rep/template-leads/${lead.id}/sold`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sold: !lead.sold_at }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || `HTTP ${res.status}`);
      }
      router.refresh();
    } catch (e) {
      alert(String(e instanceof Error ? e.message : e));
    } finally {
      setBusyId(null);
    }
  }

  if (leads.length === 0) {
    return <EmptyState message="No leads assigned to you yet. Your admin assigns leads on the campaign board." />;
  }
  return (
    <div style={cardStyle}>
      <table style={tableStyle}>
        <thead>
          <tr>
            <th style={th}>Business</th>
            <th style={th}>Location</th>
            <th style={th}>Looked up</th>
            <th style={th}>Opened</th>
            <th style={th}>Site</th>
            <th style={th} />
          </tr>
        </thead>
        <tbody>
          {leads.map((l) => (
            <tr key={l.id} style={l.sold_at ? { background: "#f0f7f0" } : undefined}>
              <td style={td}>
                <span style={{ fontWeight: 600 }}>{l.business_name || "—"}</span>
                {l.phone && <span style={{ display: "block", fontSize: 12, color: "#888886" }}>{l.phone}</span>}
              </td>
              <td style={td}>{[l.city, l.state].filter(Boolean).join(", ") || "—"}</td>
              <td style={td}>{l.lookup_count > 0 ? `🔍 ${l.lookup_count}` : "—"}</td>
              <td style={td}>{l.click_count > 0 ? `▶ ${l.click_count}` : "—"}</td>
              <td style={td}>
                {l.preview_url ? (
                  <a href={l.preview_url} target="_blank" rel="noreferrer" style={{ color: "#0a4a7a", fontSize: 12 }}>view →</a>
                ) : (
                  <span style={{ color: "#bbb", fontSize: 12 }}>not yet</span>
                )}
              </td>
              <td style={{ ...td, textAlign: "right", whiteSpace: "nowrap" }}>
                {l.sold_at ? (
                  <button onClick={() => toggleSold(l)} disabled={busyId === l.id} style={notNeededBtnStyle}>✓ Sold — undo</button>
                ) : (
                  <button onClick={() => toggleSold(l)} disabled={busyId === l.id} style={soldBtnStyle}>Mark sold</button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SubmissionsTab({ sessions }: { sessions: Session[] }) {
  if (sessions.length === 0) {
    return <EmptyState message="No submissions yet. Submit a /sales form and they'll appear here." />;
  }
  return (
    <div style={cardStyle}>
      <table style={tableStyle}>
        <thead>
          <tr>
            <th style={th}>Business</th>
            <th style={th}>Industry</th>
            <th style={th}>Submitted</th>
            <th style={th}>Contact email</th>
          </tr>
        </thead>
        <tbody>
          {sessions.map((s) => {
            const fd = s.form_data || {};
            return (
              <tr key={s.token}>
                <td style={td}>{(fd.business_name as string) || "—"}</td>
                <td style={td}>{(fd.industry as string) || "—"}</td>
                <td style={td}>{s.submitted_at ? new Date(s.submitted_at).toLocaleString() : "—"}</td>
                <td style={td}>{(fd.contact_email as string) || s.email || "—"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function ClientsTab({ clients }: { clients: Client[] }) {
  if (clients.length === 0) {
    return <EmptyState message="No clients yet. Once a submission auto-creates a client, they'll appear here." />;
  }
  return (
    <div style={cardStyle}>
      <table style={tableStyle}>
        <thead>
          <tr>
            <th style={th}>Company</th>
            <th style={th}>Contact</th>
            <th style={th}>Email</th>
            <th style={th}>Site URL</th>
            <th style={th}>Created</th>
          </tr>
        </thead>
        <tbody>
          {clients.map((c) => (
            <tr key={c.id}>
              <td style={td}>{c.company_name}</td>
              <td style={td}>{c.first_name} {c.last_name}</td>
              <td style={td}>{c.email}</td>
              <td style={td}>
                {c.website_url ? (
                  <a href={c.website_url} target="_blank" rel="noreferrer" style={linkStyle}>
                    {trimUrl(c.website_url)}
                  </a>
                ) : (
                  "—"
                )}
              </td>
              <td style={td}>{new Date(c.created_at).toLocaleDateString()}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TasksTab({ tasks: initialTasks }: { tasks: Task[] }) {
  // Local copy so outcome actions can update the row inline without a refetch.
  const [tasks, setTasks] = useState<Task[]>(initialTasks);
  const [selected, setSelected] = useState<Task | null>(null);
  const [outcomeFor, setOutcomeFor] = useState<{ task: Task; outcome: "sold" | "not_needed" } | null>(null);

  if (tasks.length === 0) {
    return <EmptyState message="No tasks yet. Build tasks will appear here once a submission is processed." />;
  }

  const byStatus: Record<string, Task[]> = {};
  for (const t of tasks) {
    (byStatus[t.status] ||= []).push(t);
  }

  const order = ["backlog", "in_progress", "review", "blocked", "complete"];

  const applyOutcome = (taskId: string, outcome: "sold" | "not_needed") => {
    // 'not_needed' archives the task → drop it from the local list so it
    // disappears from the dashboard immediately (matches server behavior).
    if (outcome === "not_needed") {
      setTasks((prev) => prev.filter((t) => t.id !== taskId));
    } else {
      setTasks((prev) => prev.map((t) => (t.id === taskId ? { ...t, sales_outcome: outcome } : t)));
    }
  };

  return (
    <>
      <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
        {order.map((status) => {
          const list = byStatus[status] || [];
          if (list.length === 0) return null;
          return (
            <div key={status} style={cardStyle}>
              <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "8px" }}>
                <span style={{ ...badgeStyle, background: STATUS_COLORS[status] || "#888886" }}>
                  {STATUS_LABELS[status] || status}
                </span>
                <span style={{ fontSize: "12px", color: "#888886" }}>{list.length}</span>
              </div>
              <table style={tableStyle}>
                <thead>
                  <tr>
                    <th style={th}>Title</th>
                    <th style={th}>Client</th>
                    <th style={th}>Updated</th>
                    <th style={{ ...th, textAlign: "right" }}>Outcome / Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {list.map((t) => (
                    <tr key={t.id}>
                      <td style={td}>{t.title}</td>
                      <td style={td}>{t.client?.company_name || "—"}</td>
                      <td style={td}>{new Date(t.updated_at as string).toLocaleString()}</td>
                      <td style={{ ...td, textAlign: "right" }}>
                        <div style={{ display: "inline-flex", gap: "6px", alignItems: "center", flexWrap: "wrap", justifyContent: "flex-end" }}>
                          {t.sales_outcome === "sold" && (
                            <span style={{ ...soldBadge }}>✓ SOLD</span>
                          )}
                          {t.sales_outcome !== "sold" && (
                            <button
                              onClick={() => setOutcomeFor({ task: t, outcome: "sold" })}
                              style={soldBtnStyle}
                              title="Mark as sold — keeps the site visible"
                            >
                              Sold
                            </button>
                          )}
                          <button
                            onClick={() => setOutcomeFor({ task: t, outcome: "not_needed" })}
                            style={notNeededBtnStyle}
                            title="Mark as not needed — archives the site"
                          >
                            Not needed
                          </button>
                          <button onClick={() => setSelected(t)} style={smallBtnStyle}>
                            Comment →
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        })}
      </div>
      {selected && (
        <CommentModal task={selected} onClose={() => setSelected(null)} />
      )}
      {outcomeFor && (
        <OutcomeModal
          task={outcomeFor.task}
          outcome={outcomeFor.outcome}
          onClose={() => setOutcomeFor(null)}
          onSuccess={() => {
            applyOutcome(outcomeFor.task.id, outcomeFor.outcome);
            setOutcomeFor(null);
          }}
        />
      )}
    </>
  );
}

function OutcomeModal({
  task,
  outcome,
  onClose,
  onSuccess,
}: {
  task: Task;
  outcome: "sold" | "not_needed";
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isSold = outcome === "sold";
  const label = isSold ? "Mark as Sold" : "Mark as Not Needed";
  const accentColor = isSold ? "#2e7d32" : "#b3300a";

  async function submit() {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/sales-rep/tasks/${task.id}/outcome`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ outcome, notes: notes.trim() || null }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error || `${res.status}`);
      }
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to submit");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      style={{ position: "fixed", inset: 0, background: "rgba(17,17,16,0.4)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", padding: "24px" }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ background: "#fff", border: "1.5px solid #e8e6df", borderRadius: "6px", padding: "28px 32px", width: "100%", maxWidth: "520px", fontFamily: "var(--font-sans)" }}
      >
        <h2 style={{ fontFamily: "var(--font-serif)", fontSize: "1.3rem", fontWeight: 700, marginBottom: "4px", color: accentColor }}>
          {label}
        </h2>
        <p style={{ fontSize: "13px", color: "#555553", marginBottom: "16px", lineHeight: 1.5 }}>
          <strong>{task.title}</strong> · {task.client?.company_name || "—"}
          <br />
          {isSold
            ? "The system admin will be notified by email and Telegram. The site stays visible on your dashboard."
            : "The system admin will be notified by email and Telegram. The site is archived from your dashboard and admin's active views (still recoverable)."}
        </p>

        <label style={{ display: "block", fontFamily: "var(--font-mono)", fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.05em", color: "#888886", fontWeight: 600, marginBottom: "6px" }}>
          Notes (optional)
        </label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder={isSold ? "Deal size, close date, any context for admin…" : "Why isn't this needed? (lead cold, client declined, duplicate, etc.)"}
          style={{
            width: "100%",
            minHeight: "100px",
            padding: "10px 12px",
            border: "1.5px solid #d8d6cf",
            borderRadius: "4px",
            fontSize: "14px",
            fontFamily: "inherit",
            background: "#faf9f5",
            boxSizing: "border-box",
          }}
        />

        {error && (
          <div style={{ marginTop: "12px", padding: "10px 14px", background: "#fff5f2", border: "1px solid #ffcdc0", borderRadius: "3px", fontSize: "13px", color: "#b3300a" }}>
            {error}
          </div>
        )}

        <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px", marginTop: "20px" }}>
          <button onClick={onClose} style={btnGhost}>Cancel</button>
          <button
            onClick={submit}
            disabled={submitting}
            style={{
              fontFamily: "var(--font-sans)",
              fontSize: "13px",
              padding: "8px 18px",
              background: accentColor,
              color: "#fff",
              border: "none",
              borderRadius: "3px",
              cursor: submitting ? "not-allowed" : "pointer",
              opacity: submitting ? 0.5 : 1,
              fontWeight: 600,
            }}
          >
            {submitting ? "Submitting…" : `Confirm ${isSold ? "Sold" : "Not Needed"}`}
          </button>
        </div>
      </div>
    </div>
  );
}

function CommentModal({ task, onClose }: { task: Task; onClose: () => void }) {
  const [content, setContent] = useState("");
  const [isRequest, setIsRequest] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function submit() {
    if (!content.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/sales-rep/tasks/${task.id}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: content.trim(), is_request: isRequest }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error || `${res.status}`);
      }
      setDone(true);
      setTimeout(onClose, 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to submit");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      style={{ position: "fixed", inset: 0, background: "rgba(17,17,16,0.4)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", padding: "24px" }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ background: "#fff", border: "1.5px solid #e8e6df", borderRadius: "6px", padding: "28px 32px", width: "100%", maxWidth: "520px", fontFamily: "var(--font-sans)" }}
      >
        <h2 style={{ fontFamily: "var(--font-serif)", fontSize: "1.3rem", fontWeight: 700, marginBottom: "4px" }}>
          {isRequest ? "Request a Change" : "Add a Comment"}
        </h2>
        <p style={{ fontSize: "12px", color: "#888886", marginBottom: "16px" }}>
          {task.title} · {task.client?.company_name || "—"}
        </p>

        {done ? (
          <div style={{ padding: "20px", textAlign: "center", color: "#2e7d32", fontSize: "14px" }}>
            ✓ Submitted. Closing…
          </div>
        ) : (
          <>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder={isRequest ? "Describe the change the client wants…" : "Add notes for the admin reviewing this build…"}
              style={{
                width: "100%",
                minHeight: "120px",
                padding: "10px 12px",
                border: "1.5px solid #d8d6cf",
                borderRadius: "4px",
                fontSize: "14px",
                fontFamily: "inherit",
                background: "#faf9f5",
              }}
            />

            <label style={{ display: "flex", alignItems: "center", gap: "8px", marginTop: "12px", fontSize: "13px", color: "#555553", cursor: "pointer" }}>
              <input type="checkbox" checked={isRequest} onChange={(e) => setIsRequest(e.target.checked)} />
              Mark as <strong>change request</strong> (emails admin immediately)
            </label>

            {error && (
              <div style={{ marginTop: "12px", padding: "10px 14px", background: "#fff5f2", border: "1px solid #ffcdc0", borderRadius: "3px", fontSize: "13px", color: "#b3300a" }}>
                {error}
              </div>
            )}

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px", marginTop: "20px" }}>
              <button onClick={onClose} style={btnGhost}>Cancel</button>
              <button
                onClick={submit}
                disabled={submitting || !content.trim()}
                className="btn-orange"
                style={{ fontSize: "13px", padding: "8px 18px", opacity: submitting || !content.trim() ? 0.5 : 1 }}
              >
                {submitting ? "Submitting…" : "Submit"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

const smallBtnStyle: React.CSSProperties = {
  fontFamily: "var(--font-sans)",
  fontSize: "12px",
  color: "#ff3d00",
  background: "transparent",
  border: "1px solid #ffcdc0",
  borderRadius: "3px",
  padding: "4px 10px",
  cursor: "pointer",
};
const soldBtnStyle: React.CSSProperties = {
  fontFamily: "var(--font-sans)",
  fontSize: "12px",
  color: "#2e7d32",
  background: "transparent",
  border: "1px solid #b5d8b5",
  borderRadius: "3px",
  padding: "4px 10px",
  cursor: "pointer",
  fontWeight: 600,
};
const notNeededBtnStyle: React.CSSProperties = {
  fontFamily: "var(--font-sans)",
  fontSize: "12px",
  color: "#888886",
  background: "transparent",
  border: "1px solid #d8d6cf",
  borderRadius: "3px",
  padding: "4px 10px",
  cursor: "pointer",
};
const soldBadge: React.CSSProperties = {
  display: "inline-block",
  background: "#2e7d32",
  color: "#fff",
  padding: "3px 8px",
  borderRadius: "3px",
  fontFamily: "var(--font-mono)",
  fontSize: "10px",
  textTransform: "uppercase",
  letterSpacing: "0.06em",
  fontWeight: 700,
};

function EmptyState({ message }: { message: string }) {
  return (
    <div style={{ ...cardStyle, padding: "40px 16px", textAlign: "center", color: "#888886", fontSize: "13px", fontFamily: "var(--font-sans)" }}>
      {message}
    </div>
  );
}

function trimUrl(url: string): string {
  return url.replace(/^https?:\/\//, "").replace(/\/$/, "").slice(0, 60);
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
const btnGhost: React.CSSProperties = {
  fontFamily: "var(--font-sans)",
  fontSize: "13px",
  color: "#555553",
  border: "1.5px solid #d8d6cf",
  borderRadius: "3px",
  padding: "6px 14px",
  background: "transparent",
  cursor: "pointer",
};
const tabsRow: React.CSSProperties = {
  display: "flex",
  gap: "4px",
  borderBottom: "1px solid #e8e6df",
  marginBottom: "20px",
};
const tabBtn: React.CSSProperties = {
  fontFamily: "var(--font-mono)",
  fontSize: "11px",
  textTransform: "uppercase",
  letterSpacing: "0.08em",
  fontWeight: 600,
  background: "transparent",
  border: "none",
  padding: "8px 16px",
  cursor: "pointer",
  transition: "color 0.15s, border-color 0.15s",
};
const cardStyle: React.CSSProperties = {
  background: "#fff",
  border: "1.5px solid #e8e6df",
  borderRadius: "6px",
  padding: "20px 24px",
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
  padding: "10px 12px",
  borderBottom: "1px solid #f0eeea",
  color: "#111110",
};
const linkStyle: React.CSSProperties = {
  color: "#ff3d00",
  textDecoration: "none",
  fontWeight: 500,
};
const badgeStyle: React.CSSProperties = {
  display: "inline-block",
  color: "#fff",
  padding: "3px 10px",
  borderRadius: "3px",
  fontFamily: "var(--font-mono)",
  fontSize: "10px",
  textTransform: "uppercase",
  letterSpacing: "0.06em",
  fontWeight: 700,
};
