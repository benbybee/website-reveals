"use client";

import { useState, useMemo } from "react";
import type { Client } from "@/lib/types/client-tasks";

type SortKey = "name" | "company_name" | "email";
type SortDir = "asc" | "desc";

interface ClientsPanelProps {
  clients: Client[];
  onSelect: (client: Client) => void;
}

const EMPTY_FORM = {
  first_name: "",
  last_name: "",
  company_name: "",
  email: "",
  phone: "",
  website_url: "",
  github_repo_url: "",
};

export function ClientsPanel({ clients: initial, onSelect }: ClientsPanelProps) {
  const [clients, setClients] = useState(initial);
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [selected, setSelected] = useState<Client | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [clearingAll, setClearingAll] = useState(false);

  const filtered = useMemo(() => {
    let result = [...clients];

    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter((c) => {
        const name = `${c.first_name} ${c.last_name}`.toLowerCase();
        const company = (c.company_name || "").toLowerCase();
        const email = (c.email || "").toLowerCase();
        return name.includes(q) || company.includes(q) || email.includes(q);
      });
    }

    result.sort((a, b) => {
      let aVal = "";
      let bVal = "";

      switch (sortKey) {
        case "name":
          aVal = `${a.first_name} ${a.last_name}`.toLowerCase();
          bVal = `${b.first_name} ${b.last_name}`.toLowerCase();
          break;
        case "company_name":
          aVal = (a.company_name || "").toLowerCase();
          bVal = (b.company_name || "").toLowerCase();
          break;
        case "email":
          aVal = (a.email || "").toLowerCase();
          bVal = (b.email || "").toLowerCase();
          break;
      }

      if (aVal < bVal) return sortDir === "asc" ? -1 : 1;
      if (aVal > bVal) return sortDir === "asc" ? 1 : -1;
      return 0;
    });

    return result;
  }, [clients, search, sortKey, sortDir]);

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

  const handleClearAll = async () => {
    if (!confirm(`Delete ALL ${clients.length} clients and their tasks? This cannot be undone.`)) return;
    if (!confirm("Are you absolutely sure? This will permanently delete every client, task, and proposal.")) return;
    setClearingAll(true);
    const res = await fetch("/api/admin/clients/clear", { method: "DELETE" });
    if (res.ok) {
      setClients([]);
      setSelected(null);
    } else {
      alert("Failed to clear clients.");
    }
    setClearingAll(false);
  };

  const handleRowClick = (client: Client) => {
    setSelected(client);
    onSelect(client);
  };

  const handleFieldChange = (field: keyof typeof EMPTY_FORM, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleAddClient = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);

    try {
      const res = await fetch("/api/admin/clients", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Failed to create client" }));
        alert(err.error || "Failed to create client");
        return;
      }

      const data = await res.json();
      setClients((prev) => [...prev, data.client]);
      alert(`Client created. Their PIN is: ${data.pin}`);
      setForm(EMPTY_FORM);
      setShowAddModal(false);
    } catch {
      alert("Network error. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const FIELDS: { key: keyof typeof EMPTY_FORM; label: string; type?: string; required?: boolean }[] = [
    { key: "first_name", label: "First Name", required: true },
    { key: "last_name", label: "Last Name", required: true },
    { key: "company_name", label: "Company Name", required: true },
    { key: "email", label: "Email", type: "email", required: true },
    { key: "phone", label: "Phone", type: "tel" },
    { key: "website_url", label: "Website URL", type: "url" },
    { key: "github_repo_url", label: "GitHub Repo URL", type: "url" },
  ];

  return (
    <>
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: "16px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <h2
            style={{
              fontFamily: "var(--font-sans)",
              fontSize: "16px",
              fontWeight: 600,
              color: "#111110",
              margin: 0,
            }}
          >
            Clients
          </h2>
          <span style={countBadgeStyle}>{filtered.length}</span>
        </div>
        <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
          {clients.length > 0 && (
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
          <button onClick={() => setShowAddModal(true)} style={primaryButtonStyle}>
            Add Client
          </button>
        </div>
      </div>

      {/* Search */}
      <div style={{ marginBottom: "20px" }}>
        <input
          className="field"
          placeholder="Search name, company, or email..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ padding: "10px 14px", fontSize: "14px", width: "100%", maxWidth: "400px" }}
        />
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
        {filtered.length} client{filtered.length !== 1 ? "s" : ""}
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
              {(
                [
                  ["name", "Name"],
                  ["company_name", "Company"],
                  ["email", "Email"],
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
              <th style={thStyle}>Phone</th>
              <th style={thStyle}>Active Tasks</th>
              <th style={{ ...thStyle, width: "80px", textAlign: "center" }}>Actions</th>
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
                  No clients found.
                </td>
              </tr>
            ) : (
              filtered.map((c) => (
                <tr
                  key={c.id}
                  onClick={() => handleRowClick(c)}
                  style={{
                    borderBottom: "1px solid #f0eee8",
                    cursor: "pointer",
                    transition: "background 0.1s",
                  }}
                  onMouseEnter={(e) =>
                    (e.currentTarget.style.background = "#f5f4ef")
                  }
                  onMouseLeave={(e) =>
                    (e.currentTarget.style.background = "transparent")
                  }
                >
                  <td style={tdStyle}>
                    {c.first_name} {c.last_name}
                  </td>
                  <td style={tdStyle}>{c.company_name || "\u2014"}</td>
                  <td style={tdStyle}>{c.email || "\u2014"}</td>
                  <td style={tdStyle}>{c.phone || "\u2014"}</td>
                  <td style={tdStyle}>{"\u2014"}</td>
                  <td style={{ ...tdStyle, textAlign: "center" }}>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleRowClick(c);
                      }}
                      style={{
                        background: "transparent",
                        border: "none",
                        color: "#888886",
                        cursor: "pointer",
                        fontSize: "13px",
                        padding: "4px 8px",
                        borderRadius: "3px",
                        fontFamily: "var(--font-sans)",
                        transition: "color 0.12s",
                      }}
                      onMouseEnter={(e) =>
                        (e.currentTarget.style.color = "#ff3d00")
                      }
                      onMouseLeave={(e) =>
                        (e.currentTarget.style.color = "#888886")
                      }
                      title="View client"
                    >
                      View
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Add Client Modal */}
      {showAddModal && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0, 0, 0, 0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
          }}
          onClick={() => setShowAddModal(false)}
        >
          <div
            style={{
              background: "#fff",
              borderRadius: "8px",
              padding: "32px",
              maxWidth: "480px",
              width: "100%",
              maxHeight: "90vh",
              overflowY: "auto",
              boxShadow: "0 20px 60px rgba(0, 0, 0, 0.15)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3
              style={{
                fontFamily: "var(--font-sans)",
                fontSize: "18px",
                fontWeight: 600,
                color: "#111110",
                margin: "0 0 24px 0",
              }}
            >
              Add Client
            </h3>

            <form onSubmit={handleAddClient}>
              {FIELDS.map(({ key, label, type, required }) => (
                <div key={key} style={{ marginBottom: "16px" }}>
                  <label style={labelStyle}>{label}</label>
                  <input
                    type={type || "text"}
                    value={form[key]}
                    onChange={(e) => handleFieldChange(key, e.target.value)}
                    required={required}
                    style={inputStyle}
                  />
                </div>
              ))}

              <div
                style={{
                  display: "flex",
                  gap: "12px",
                  justifyContent: "flex-end",
                  marginTop: "24px",
                }}
              >
                <button
                  type="button"
                  onClick={() => {
                    setShowAddModal(false);
                    setForm(EMPTY_FORM);
                  }}
                  style={cancelButtonStyle}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  style={{
                    ...primaryButtonStyle,
                    opacity: submitting ? 0.6 : 1,
                    cursor: submitting ? "not-allowed" : "pointer",
                  }}
                >
                  {submitting ? "Creating..." : "Create Client"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}

const thStyle: React.CSSProperties = {
  textAlign: "left",
  fontFamily: "var(--font-mono)",
  fontSize: "11px",
  fontWeight: 600,
  color: "#888886",
  textTransform: "uppercase",
  letterSpacing: "0.06em",
  padding: "10px 12px",
  borderBottom: "2px solid #e8e6df",
  background: "#faf9f5",
};

const tdStyle: React.CSSProperties = {
  fontFamily: "var(--font-sans)",
  fontSize: "14px",
  color: "#111110",
  padding: "12px",
  borderBottom: "1px solid #e8e6df",
};

const countBadgeStyle: React.CSSProperties = {
  fontFamily: "var(--font-mono)",
  fontSize: "11px",
  fontWeight: 600,
  color: "#ff3d00",
  background: "#fff5f2",
  padding: "2px 8px",
  borderRadius: "3px",
  letterSpacing: "0.02em",
};

const primaryButtonStyle: React.CSSProperties = {
  background: "#ff3d00",
  color: "#fff",
  border: "none",
  fontSize: "13px",
  padding: "8px 20px",
  borderRadius: "4px",
  cursor: "pointer",
  fontFamily: "var(--font-sans)",
  fontWeight: 500,
};

const cancelButtonStyle: React.CSSProperties = {
  background: "transparent",
  color: "#111110",
  border: "1.5px solid #d8d6cf",
  fontSize: "13px",
  padding: "8px 20px",
  borderRadius: "4px",
  cursor: "pointer",
  fontFamily: "var(--font-sans)",
  fontWeight: 500,
};

const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: "12px",
  textTransform: "uppercase",
  letterSpacing: "0.05em",
  color: "#888886",
  marginBottom: "4px",
  fontFamily: "var(--font-sans)",
  fontWeight: 500,
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  border: "1.5px solid #d8d6cf",
  borderRadius: "3px",
  padding: "8px 12px",
  fontSize: "14px",
  fontFamily: "var(--font-sans)",
  color: "#111110",
  outline: "none",
  boxSizing: "border-box",
};
