"use client";

import { useEffect, useState } from "react";
import type { Client } from "@/lib/types/client-tasks";

interface ClientDetailDrawerProps {
  client: Client | null;
  onClose: () => void;
  onUpdated: (client: Client) => void;
  onDeleted?: (id: string) => void;
}

export function ClientDetailDrawer({
  client,
  onClose,
  onUpdated,
  onDeleted,
}: ClientDetailDrawerProps) {
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [resettingPin, setResettingPin] = useState(false);
  const [newPin, setNewPin] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Edit form state
  const [form, setForm] = useState({
    first_name: "",
    last_name: "",
    company_name: "",
    email: "",
    phone: "",
    website_url: "",
    github_repo_url: "",
  });

  // Sync form when client changes or edit mode opens
  useEffect(() => {
    if (client) {
      setForm({
        first_name: client.first_name,
        last_name: client.last_name,
        company_name: client.company_name,
        email: client.email,
        phone: client.phone || "",
        website_url: client.website_url || "",
        github_repo_url: client.github_repo_url || "",
      });
    }
    setEditing(false);
    setConfirmDelete(false);
    setNewPin(null);
    setErrorMsg(null);
  }, [client]);

  // Escape to close
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  // Auto-hide PIN after 10 seconds
  useEffect(() => {
    if (!newPin) return;
    const timer = setTimeout(() => setNewPin(null), 10000);
    return () => clearTimeout(timer);
  }, [newPin]);

  if (!client) return null;

  const handleResetPin = async () => {
    setResettingPin(true);
    try {
      const res = await fetch(`/api/admin/clients/${client.id}/reset-pin`, {
        method: "POST",
      });
      if (!res.ok) throw new Error("Failed to reset PIN");
      const data = await res.json();
      setNewPin(data.pin);
    } catch {
      setErrorMsg("Failed to reset PIN. Please try again.");
    } finally {
      setResettingPin(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/clients/${client.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          first_name: form.first_name,
          last_name: form.last_name,
          company_name: form.company_name,
          email: form.email,
          phone: form.phone || null,
          website_url: form.website_url || null,
          github_repo_url: form.github_repo_url || null,
        }),
      });
      if (!res.ok) throw new Error("Failed to update client");
      const updated = await res.json();
      onUpdated(updated);
      setEditing(false);
    } catch {
      setErrorMsg("Failed to save changes. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      const res = await fetch(`/api/admin/clients/${client.id}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Failed to delete client");
      onDeleted?.(client.id);
      onClose();
    } catch {
      setErrorMsg("Failed to delete client. Please try again.");
      setDeleting(false);
    }
  };

  const updateField = (field: string, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(0,0,0,0.3)",
          zIndex: 999,
        }}
      />

      {/* Drawer */}
      <div
        style={{
          position: "fixed",
          top: 0,
          right: 0,
          bottom: 0,
          width: "min(420px, 90vw)",
          background: "#fff",
          boxShadow: "-4px 0 24px rgba(0,0,0,0.08)",
          zIndex: 1000,
          overflowY: "auto",
          padding: "32px 28px 60px",
        }}
      >
        {/* Close */}
        <button
          onClick={onClose}
          style={{
            position: "absolute",
            top: "16px",
            right: "16px",
            background: "transparent",
            border: "none",
            fontSize: "20px",
            color: "#888886",
            cursor: "pointer",
            padding: "4px 8px",
          }}
        >
          ✕
        </button>

        {/* Error banner */}
        {errorMsg && (
          <div
            style={{
              display: "flex",
              alignItems: "flex-start",
              gap: "10px",
              background: "#fff5f5",
              border: "1.5px solid #fecaca",
              borderRadius: "6px",
              padding: "10px 14px",
              marginBottom: "20px",
            }}
          >
            <span
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: "12px",
                fontWeight: 600,
                color: "#dc2626",
                letterSpacing: "0.04em",
                textTransform: "uppercase",
                flexShrink: 0,
                paddingTop: "1px",
              }}
            >
              Error
            </span>
            <span
              style={{
                fontFamily: "var(--font-sans)",
                fontSize: "13px",
                color: "#111110",
                flex: 1,
                lineHeight: 1.5,
              }}
            >
              {errorMsg}
            </span>
            <button
              onClick={() => setErrorMsg(null)}
              style={{
                background: "transparent",
                border: "none",
                color: "#888886",
                cursor: "pointer",
                fontSize: "16px",
                padding: "0 2px",
                flexShrink: 0,
                lineHeight: 1,
              }}
            >
              ✕
            </button>
          </div>
        )}

        {/* Header */}
        <h2
          style={{
            fontFamily: "var(--font-serif)",
            fontSize: "1.5rem",
            fontWeight: 700,
            color: "#111110",
            marginBottom: "4px",
          }}
        >
          {client.first_name} {client.last_name}
        </h2>
        <p
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: "12px",
            color: "#888886",
            marginBottom: "28px",
          }}
        >
          {client.company_name}
        </p>

        {editing ? (
          /* ——— Edit Form ——— */
          <div>
            <Section title="Edit Client">
              <FormField
                label="First Name"
                value={form.first_name}
                onChange={(v) => updateField("first_name", v)}
                required
              />
              <FormField
                label="Last Name"
                value={form.last_name}
                onChange={(v) => updateField("last_name", v)}
                required
              />
              <FormField
                label="Company Name"
                value={form.company_name}
                onChange={(v) => updateField("company_name", v)}
                required
              />
              <FormField
                label="Email"
                value={form.email}
                onChange={(v) => updateField("email", v)}
                type="email"
                required
              />
              <FormField
                label="Phone"
                value={form.phone}
                onChange={(v) => updateField("phone", v)}
                type="tel"
              />
              <FormField
                label="Website URL"
                value={form.website_url}
                onChange={(v) => updateField("website_url", v)}
                type="url"
              />
              <FormField
                label="GitHub Repo URL"
                value={form.github_repo_url}
                onChange={(v) => updateField("github_repo_url", v)}
                type="url"
              />
            </Section>

            <div style={{ display: "flex", gap: "10px", marginTop: "20px" }}>
              <button
                onClick={handleSave}
                disabled={saving || !form.first_name || !form.last_name || !form.company_name || !form.email}
                className="btn-orange"
                style={{ fontSize: "13px", padding: "10px 20px" }}
              >
                {saving ? "Saving..." : "Save Changes"}
              </button>
              <button
                onClick={() => {
                  setEditing(false);
                  // Reset form to current client data
                  setForm({
                    first_name: client.first_name,
                    last_name: client.last_name,
                    company_name: client.company_name,
                    email: client.email,
                    phone: client.phone || "",
                    website_url: client.website_url || "",
                    github_repo_url: client.github_repo_url || "",
                  });
                }}
                className="btn-outline"
                style={{ fontSize: "13px", padding: "10px 20px" }}
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          /* ——— Detail View ——— */
          <>
            {/* Contact Section */}
            <Section title="Contact">
              <Row
                label="Email"
                value={
                  <a
                    href={`mailto:${client.email}`}
                    style={{ ...valueLinkStyle }}
                  >
                    {client.email}
                  </a>
                }
              />
              {client.phone && <Row label="Phone" value={client.phone} />}
              {client.website_url && (
                <Row
                  label="Website"
                  value={
                    <a
                      href={client.website_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ ...valueLinkStyle }}
                    >
                      {client.website_url}
                    </a>
                  }
                />
              )}
              {client.github_repo_url && (
                <Row
                  label="GitHub Repo"
                  value={
                    <a
                      href={client.github_repo_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ ...valueLinkStyle }}
                    >
                      {client.github_repo_url}
                    </a>
                  }
                />
              )}
            </Section>

            {/* PIN Section */}
            <Section title="Portal PIN">
              <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                <span style={valueStyle}>••••••</span>
                <button
                  onClick={handleResetPin}
                  disabled={resettingPin}
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: "12px",
                    fontWeight: 500,
                    color: "#111110",
                    background: "transparent",
                    border: "1.5px solid #e8e6df",
                    borderRadius: "6px",
                    padding: "5px 12px",
                    cursor: resettingPin ? "not-allowed" : "pointer",
                    opacity: resettingPin ? 0.6 : 1,
                  }}
                >
                  {resettingPin ? "Resetting..." : "Reset PIN"}
                </button>
              </div>
              {newPin && (
                <div
                  style={{
                    marginTop: "10px",
                    padding: "10px 14px",
                    background: "#fffbe6",
                    border: "1.5px solid #ffe066",
                    borderRadius: "6px",
                    fontFamily: "var(--font-mono)",
                    fontSize: "16px",
                    fontWeight: 700,
                    color: "#111110",
                    letterSpacing: "0.15em",
                  }}
                >
                  New PIN: {newPin}
                  <span
                    style={{
                      display: "block",
                      fontFamily: "var(--font-sans)",
                      fontSize: "11px",
                      fontWeight: 400,
                      color: "#888886",
                      marginTop: "4px",
                      letterSpacing: "normal",
                    }}
                  >
                    This will disappear in 10 seconds
                  </span>
                </div>
              )}
            </Section>

            {/* Task Summary */}
            <Section title="Tasks">
              <span
                style={{
                  fontFamily: "var(--font-sans)",
                  fontSize: "14px",
                  color: "#ff3d00",
                  cursor: "pointer",
                }}
              >
                View tasks →
              </span>
            </Section>

            {/* Actions */}
            <div
              style={{
                display: "flex",
                gap: "10px",
                marginTop: "32px",
                paddingTop: "20px",
                borderTop: "1.5px solid #e8e6df",
              }}
            >
              <button
                onClick={() => setEditing(true)}
                className="btn-orange"
                style={{ fontSize: "13px", padding: "10px 20px" }}
              >
                Edit Client
              </button>
            </div>

            {/* Delete */}
            <div
              style={{
                marginTop: "32px",
                paddingTop: "20px",
                borderTop: "1.5px solid #e8e6df",
              }}
            >
              {confirmDelete ? (
                <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                  <span
                    style={{
                      fontFamily: "var(--font-sans)",
                      fontSize: "13px",
                      color: "#888886",
                    }}
                  >
                    Are you sure?
                  </span>
                  <button
                    onClick={handleDelete}
                    disabled={deleting}
                    style={{
                      fontFamily: "var(--font-mono)",
                      fontSize: "12px",
                      fontWeight: 600,
                      color: "#fff",
                      background: "#dc2626",
                      border: "none",
                      borderRadius: "6px",
                      padding: "6px 14px",
                      cursor: deleting ? "not-allowed" : "pointer",
                      opacity: deleting ? 0.6 : 1,
                    }}
                  >
                    {deleting ? "Deleting..." : "Yes, Delete"}
                  </button>
                  <button
                    onClick={() => setConfirmDelete(false)}
                    style={{
                      fontFamily: "var(--font-mono)",
                      fontSize: "12px",
                      fontWeight: 500,
                      color: "#888886",
                      background: "transparent",
                      border: "1.5px solid #e8e6df",
                      borderRadius: "6px",
                      padding: "6px 14px",
                      cursor: "pointer",
                    }}
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setConfirmDelete(true)}
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: "13px",
                    fontWeight: 500,
                    color: "#dc2626",
                    background: "transparent",
                    border: "none",
                    padding: 0,
                    cursor: "pointer",
                  }}
                >
                  Delete Client
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </>
  );
}

/* ——— Sub-components ——— */

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div style={{ marginBottom: "24px" }}>
      <h3
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: "11px",
          fontWeight: 500,
          letterSpacing: "0.14em",
          textTransform: "uppercase",
          color: "#ff3d00",
          marginBottom: "12px",
          paddingBottom: "8px",
          borderBottom: "1px solid #f0eee8",
        }}
      >
        {title}
      </h3>
      <div
        style={{ display: "flex", flexDirection: "column", gap: "8px" }}
      >
        {children}
      </div>
    </div>
  );
}

function Row({
  label,
  value,
}: {
  label: string;
  value?: React.ReactNode;
}) {
  if (!value) return null;
  return (
    <div style={{ display: "flex", gap: "8px" }}>
      <span
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: "11px",
          fontWeight: 500,
          letterSpacing: "0.06em",
          textTransform: "uppercase",
          color: "#888886",
          minWidth: "110px",
          flexShrink: 0,
          paddingTop: "2px",
        }}
      >
        {label}
      </span>
      <span style={valueStyle}>
        {value}
      </span>
    </div>
  );
}

function FormField({
  label,
  value,
  onChange,
  type = "text",
  required = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  required?: boolean;
}) {
  return (
    <div style={{ marginBottom: "4px" }}>
      <label
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: "11px",
          fontWeight: 500,
          letterSpacing: "0.06em",
          textTransform: "uppercase",
          color: "#888886",
          display: "block",
          marginBottom: "4px",
        }}
      >
        {label}
        {required && <span style={{ color: "#ff3d00" }}> *</span>}
      </label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={required}
        style={{
          width: "100%",
          fontFamily: "var(--font-sans)",
          fontSize: "14px",
          color: "#111110",
          padding: "8px 10px",
          border: "1.5px solid #e8e6df",
          borderRadius: "6px",
          outline: "none",
          background: "#fff",
        }}
      />
    </div>
  );
}

/* ——— Shared styles ——— */

const valueStyle: React.CSSProperties = {
  fontFamily: "var(--font-sans)",
  fontSize: "14px",
  color: "#111110",
  lineHeight: 1.5,
  wordBreak: "break-word",
};

const valueLinkStyle: React.CSSProperties = {
  fontFamily: "var(--font-sans)",
  fontSize: "14px",
  color: "#111110",
  lineHeight: 1.5,
  wordBreak: "break-word",
  textDecoration: "underline",
  textDecorationColor: "#e8e6df",
  textUnderlineOffset: "2px",
};
