"use client";

import { useState } from "react";
import Link from "next/link";

type Setting = {
  audience: string;
  enabled: boolean;
  updated_at: string | null;
};

export function NotificationSettingsShell({
  settings: initial,
  labels,
  descriptions,
  userEmail,
}: {
  settings: Setting[];
  labels: Record<string, string>;
  descriptions: Record<string, string>;
  userEmail: string;
}) {
  const [settings, setSettings] = useState(initial);
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function toggle(audience: string, next: boolean) {
    setPending(audience);
    setError(null);

    // Optimistic update
    setSettings((prev) =>
      prev.map((s) => (s.audience === audience ? { ...s, enabled: next, updated_at: new Date().toISOString() } : s)),
    );

    try {
      const res = await fetch("/api/admin/notification-settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ audience, enabled: next }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error || `${res.status}`);
      }
    } catch (err) {
      // Revert on failure
      setSettings((prev) =>
        prev.map((s) => (s.audience === audience ? { ...s, enabled: !next } : s)),
      );
      setError(err instanceof Error ? err.message : "Failed to update");
    } finally {
      setPending(null);
    }
  }

  return (
    <>
      {/* Header */}
      <div style={headerStyle}>
        <div>
          <p style={labelStyle}>Admin · Notifications</p>
          <h1 style={titleStyle}>Notification Settings</h1>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
          <Link href="/admin" style={linkBtnStyle}>
            ← Dashboard
          </Link>
          <span style={{ fontFamily: "var(--font-sans)", fontSize: "13px", color: "#888886" }}>
            {userEmail}
          </span>
        </div>
      </div>

      <p style={{ fontFamily: "var(--font-sans)", fontSize: "14px", color: "#555553", marginBottom: "28px", maxWidth: "640px", lineHeight: 1.6 }}>
        Toggle entire categories of notifications on or off. When a category is off, all emails / Telegram messages for that audience are suppressed — submissions and builds still process normally.
      </p>

      {error && (
        <div style={{ marginBottom: "20px", padding: "12px 16px", background: "#fff5f2", border: "1px solid #ffcdc0", borderRadius: "4px", fontFamily: "var(--font-sans)", fontSize: "13px", color: "#b3300a" }}>
          {error}
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
        {settings.map((s) => {
          const isPending = pending === s.audience;
          return (
            <div key={s.audience} style={cardStyle}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "20px" }}>
                <div style={{ flex: 1 }}>
                  <h2 style={cardTitleStyle}>{labels[s.audience] || s.audience}</h2>
                  <p style={cardDescStyle}>{descriptions[s.audience] || ""}</p>
                  {s.updated_at && (
                    <p style={{ fontFamily: "var(--font-mono)", fontSize: "11px", color: "#888886", marginTop: "8px" }}>
                      Last changed: {new Date(s.updated_at).toLocaleString()}
                    </p>
                  )}
                </div>
                <ToggleSwitch
                  checked={s.enabled}
                  disabled={isPending}
                  onChange={(next) => toggle(s.audience, next)}
                />
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}

function ToggleSwitch({
  checked,
  disabled,
  onChange,
}: {
  checked: boolean;
  disabled: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      disabled={disabled}
      aria-pressed={checked}
      style={{
        position: "relative",
        width: "52px",
        height: "30px",
        borderRadius: "999px",
        background: checked ? "#ff3d00" : "#d8d6cf",
        border: "none",
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.6 : 1,
        flexShrink: 0,
        transition: "background 0.15s",
      }}
    >
      <span
        style={{
          position: "absolute",
          top: "3px",
          left: checked ? "25px" : "3px",
          width: "24px",
          height: "24px",
          borderRadius: "50%",
          background: "#fff",
          transition: "left 0.15s",
          boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
        }}
      />
      <span
        style={{
          position: "absolute",
          fontFamily: "var(--font-mono)",
          fontSize: "10px",
          fontWeight: 700,
          letterSpacing: "0.05em",
          color: checked ? "#fff" : "#555553",
          top: "50%",
          left: checked ? "8px" : "28px",
          transform: "translateY(-50%)",
          pointerEvents: "none",
        }}
      >
        {checked ? "ON" : "OFF"}
      </span>
    </button>
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
const labelStyle: React.CSSProperties = {
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
  background: "#ffffff",
  border: "1.5px solid #e8e6df",
  borderRadius: "6px",
  padding: "20px 24px",
};
const cardTitleStyle: React.CSSProperties = {
  fontFamily: "var(--font-serif)",
  fontSize: "1.15rem",
  fontWeight: 700,
  color: "#111110",
  marginBottom: "6px",
};
const cardDescStyle: React.CSSProperties = {
  fontFamily: "var(--font-sans)",
  fontSize: "13px",
  color: "#555553",
  lineHeight: 1.55,
  margin: 0,
};
