"use client";

import { Fragment, useState } from "react";
import Link from "next/link";
import type { SalesRep, SalesRepClientSummary } from "@/lib/sales-reps";

export function SalesRepsShell({
  reps: initial,
  clientsByRep,
  userEmail,
}: {
  reps: SalesRep[];
  clientsByRep: Record<string, SalesRepClientSummary[]>;
  userEmail: string;
}) {
  const [reps, setReps] = useState(initial);
  const [showCreate, setShowCreate] = useState(false);
  const [pinFlash, setPinFlash] = useState<{ email: string; pin: string } | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  async function createRep(input: { email: string; first_name: string; last_name: string; notes: string }) {
    const res = await fetch("/api/admin/sales-reps", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      alert(body?.error || `Failed (${res.status})`);
      return;
    }
    const { rep, pin } = await res.json();
    setReps((prev) => [rep, ...prev]);
    setShowCreate(false);
    setPinFlash({ email: rep.email, pin });
  }

  async function toggleActive(rep: SalesRep) {
    const next = !rep.active;
    setReps((prev) => prev.map((r) => (r.id === rep.id ? { ...r, active: next } : r)));
    const res = await fetch(`/api/admin/sales-reps/${rep.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: next }),
    });
    if (!res.ok) {
      setReps((prev) => prev.map((r) => (r.id === rep.id ? { ...r, active: !next } : r)));
      alert("Failed to update");
    }
  }

  async function resetPin(rep: SalesRep) {
    if (!confirm(`Reset PIN for ${rep.email}? Their current PIN will stop working.`)) return;
    const res = await fetch(`/api/admin/sales-reps/${rep.id}/reset-pin`, { method: "POST" });
    if (!res.ok) {
      alert("Failed to reset");
      return;
    }
    const { pin } = await res.json();
    setPinFlash({ email: rep.email, pin });
  }

  async function deleteRep(rep: SalesRep) {
    if (!confirm(`Delete ${rep.email}? This unlinks them from submissions but doesn't delete the data.`)) return;
    const res = await fetch(`/api/admin/sales-reps/${rep.id}`, { method: "DELETE" });
    if (!res.ok) {
      alert("Failed to delete");
      return;
    }
    setReps((prev) => prev.filter((r) => r.id !== rep.id));
  }

  return (
    <>
      <div style={headerStyle}>
        <div>
          <p style={eyebrow}>Admin · Sales Reps</p>
          <h1 style={titleStyle}>Sales Reps</h1>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <Link href="/admin" style={btnGhost}>← Dashboard</Link>
          <button onClick={() => setShowCreate(true)} className="btn-orange" style={{ fontSize: "13px", padding: "8px 18px" }}>
            + Add Sales Rep
          </button>
          <span style={{ fontFamily: "var(--font-sans)", fontSize: "13px", color: "#888886" }}>{userEmail}</span>
        </div>
      </div>

      {pinFlash && (
        <div style={{ marginBottom: "20px", padding: "16px 20px", background: "#fff5f2", border: "1.5px solid #ff3d00", borderRadius: "4px", fontFamily: "var(--font-sans)" }}>
          <p style={{ fontSize: "11px", color: "#888886", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 600, marginBottom: "6px" }}>
            New PIN for {pinFlash.email}
          </p>
          <p style={{ fontSize: "24px", fontFamily: "var(--font-mono)", fontWeight: 700, color: "#ff3d00", letterSpacing: "0.2em" }}>
            {pinFlash.pin}
          </p>
          <p style={{ fontSize: "12px", color: "#666664", marginTop: "8px" }}>
            Copy this and send to the rep. It won&apos;t be shown again.
          </p>
          <button onClick={() => setPinFlash(null)} style={{ marginTop: "10px", fontSize: "12px", background: "transparent", border: "1px solid #d8d6cf", padding: "5px 12px", cursor: "pointer", borderRadius: "3px" }}>
            Dismiss
          </button>
        </div>
      )}

      {showCreate && <CreateRepModal onClose={() => setShowCreate(false)} onSubmit={createRep} />}

      <div style={cardStyle}>
        {reps.length === 0 ? (
          <div style={{ padding: "40px 16px", textAlign: "center", color: "#888886", fontSize: "13px" }}>
            No sales reps yet. Click <strong>Add Sales Rep</strong> to create one.
          </div>
        ) : (
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={th}></th>
                <th style={th}>Name</th>
                <th style={th}>Email</th>
                <th style={{ ...th, textAlign: "right" }}>Clients</th>
                <th style={th}>Active</th>
                <th style={th}>Created</th>
                <th style={th}></th>
              </tr>
            </thead>
            <tbody>
              {reps.map((r) => {
                const repClients = clientsByRep[r.id] || [];
                const isExpanded = expanded === r.id;
                const canExpand = repClients.length > 0;
                return (
                  <Fragment key={r.id}>
                    <tr
                      onClick={() => canExpand && setExpanded(isExpanded ? null : r.id)}
                      style={{ cursor: canExpand ? "pointer" : "default" }}
                    >
                      <td style={{ ...td, width: "24px", color: "#888886", fontFamily: "var(--font-mono)" }}>
                        {canExpand ? (isExpanded ? "▾" : "▸") : ""}
                      </td>
                      <td style={td}>
                        {r.first_name} {r.last_name || ""}
                      </td>
                      <td style={td}>{r.email}</td>
                      <td style={{ ...td, textAlign: "right", fontWeight: 600 }}>
                        <span
                          style={{
                            display: "inline-block",
                            minWidth: "28px",
                            padding: "2px 8px",
                            borderRadius: "999px",
                            background: repClients.length > 0 ? "#fff5f2" : "#f0eeea",
                            color: repClients.length > 0 ? "#ff3d00" : "#888886",
                            fontSize: "12px",
                            fontFamily: "var(--font-mono)",
                          }}
                        >
                          {repClients.length}
                        </span>
                      </td>
                      <td style={td} onClick={(e) => e.stopPropagation()}>
                        <label style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer" }}>
                          <input type="checkbox" checked={r.active} onChange={() => toggleActive(r)} />
                          <span style={{ fontSize: "12px", color: r.active ? "#2e7d32" : "#888886" }}>{r.active ? "Active" : "Disabled"}</span>
                        </label>
                      </td>
                      <td style={td}>{new Date(r.created_at).toLocaleDateString()}</td>
                      <td style={{ ...td, textAlign: "right", whiteSpace: "nowrap" }} onClick={(e) => e.stopPropagation()}>
                        <button onClick={() => resetPin(r)} style={btnSmall}>Reset PIN</button>
                        <button onClick={() => deleteRep(r)} style={{ ...btnSmall, marginLeft: "8px", color: "#b3300a" }}>Delete</button>
                      </td>
                    </tr>
                    {isExpanded && (
                      <tr>
                        <td colSpan={7} style={{ padding: "0 12px 16px 36px", background: "#faf9f5" }}>
                          <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: "var(--font-sans)", fontSize: "13px" }}>
                            <thead>
                              <tr>
                                <th style={{ ...th, padding: "8px 12px" }}>Company</th>
                                <th style={{ ...th, padding: "8px 12px" }}>Contact</th>
                                <th style={{ ...th, padding: "8px 12px" }}>Email</th>
                                <th style={{ ...th, padding: "8px 12px" }}>Site</th>
                                <th style={{ ...th, padding: "8px 12px" }}>Created</th>
                              </tr>
                            </thead>
                            <tbody>
                              {repClients.map((c) => (
                                <tr key={c.id}>
                                  <td style={{ ...td, padding: "8px 12px" }}>{c.company_name}</td>
                                  <td style={{ ...td, padding: "8px 12px" }}>
                                    {c.first_name} {c.last_name}
                                  </td>
                                  <td style={{ ...td, padding: "8px 12px", color: c.email.endsWith("@websitereveals.local") ? "#888886" : "#111110" }}>
                                    {c.email.endsWith("@websitereveals.local") ? <em>(no email)</em> : c.email}
                                  </td>
                                  <td style={{ ...td, padding: "8px 12px" }}>
                                    {c.website_url ? (
                                      <a href={c.website_url} target="_blank" rel="noreferrer" style={{ color: "#ff3d00", textDecoration: "none" }}>
                                        {c.website_url.replace(/^https?:\/\//, "").slice(0, 40)}
                                      </a>
                                    ) : (
                                      "—"
                                    )}
                                  </td>
                                  <td style={{ ...td, padding: "8px 12px", color: "#888886", fontSize: "12px" }}>
                                    {new Date(c.created_at).toLocaleDateString()}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <p style={{ marginTop: "24px", fontSize: "12px", color: "#888886", fontFamily: "var(--font-sans)" }}>
        Sales reps log in at <strong>/sales-rep/login</strong> with their email and PIN. They&apos;ll see only the submissions
        they&apos;ve sent in (matched by their email as the <code>contact_email</code> on a /sales submission).
      </p>
    </>
  );
}

function CreateRepModal({
  onClose,
  onSubmit,
}: {
  onClose: () => void;
  onSubmit: (input: { email: string; first_name: string; last_name: string; notes: string }) => void;
}) {
  const [email, setEmail] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [notes, setNotes] = useState("");

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(17,17,16,0.4)", zIndex: 50, display: "flex", alignItems: "center", justifyContent: "center", padding: "24px" }}>
      <div style={{ background: "#fff", border: "1.5px solid #e8e6df", borderRadius: "6px", padding: "28px 32px", width: "100%", maxWidth: "480px", fontFamily: "var(--font-sans)" }}>
        <h2 style={{ fontFamily: "var(--font-serif)", fontSize: "1.4rem", fontWeight: 700, marginBottom: "16px" }}>Add Sales Rep</h2>

        <label style={inputLabel}>First name</label>
        <input value={firstName} onChange={(e) => setFirstName(e.target.value)} style={inputStyle} />

        <label style={inputLabel}>Last name (optional)</label>
        <input value={lastName} onChange={(e) => setLastName(e.target.value)} style={inputStyle} />

        <label style={inputLabel}>Email</label>
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} style={inputStyle} placeholder="rep@example.com" />

        <label style={inputLabel}>Notes (optional)</label>
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} style={{ ...inputStyle, minHeight: "72px", fontFamily: "inherit" }} />

        <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px", marginTop: "20px" }}>
          <button onClick={onClose} style={btnGhost}>Cancel</button>
          <button
            onClick={() => {
              if (!email.trim() || !firstName.trim()) {
                alert("First name and email are required.");
                return;
              }
              onSubmit({ email: email.trim(), first_name: firstName.trim(), last_name: lastName.trim(), notes: notes.trim() });
            }}
            className="btn-orange"
            style={{ fontSize: "13px", padding: "8px 18px" }}
          >
            Create
          </button>
        </div>
      </div>
    </div>
  );
}

const headerStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
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
  textDecoration: "none",
  border: "1.5px solid #d8d6cf",
  borderRadius: "3px",
  padding: "6px 14px",
  background: "transparent",
  cursor: "pointer",
};
const btnSmall: React.CSSProperties = {
  fontFamily: "var(--font-sans)",
  fontSize: "12px",
  color: "#555553",
  background: "transparent",
  border: "1px solid #d8d6cf",
  borderRadius: "3px",
  padding: "4px 10px",
  cursor: "pointer",
};
const cardStyle: React.CSSProperties = {
  background: "#ffffff",
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
  padding: "12px",
  borderBottom: "1px solid #e8e6df",
};
const td: React.CSSProperties = {
  padding: "12px",
  borderBottom: "1px solid #f0eeea",
  color: "#111110",
};
const inputLabel: React.CSSProperties = {
  display: "block",
  fontFamily: "var(--font-mono)",
  fontSize: "10px",
  textTransform: "uppercase",
  letterSpacing: "0.08em",
  color: "#888886",
  fontWeight: 600,
  margin: "12px 0 6px",
};
const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "8px 12px",
  border: "1.5px solid #d8d6cf",
  borderRadius: "3px",
  fontSize: "14px",
  fontFamily: "var(--font-sans)",
  background: "#faf9f5",
};
