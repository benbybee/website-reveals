"use client";

import { useEffect, useState } from "react";
import type { FormSession } from "@/lib/supabase/types";
import { generateMarkdown } from "@/lib/export-markdown";

export function DetailDrawer({
  session,
  onClose,
  onExported,
}: {
  session: FormSession;
  onClose: () => void;
  onExported: (session: FormSession) => void;
}) {
  const [copied, setCopied] = useState(false);
  const fd = session.form_data || {};
  const markdown = generateMarkdown(fd, session.dns_provider, session.submitted_at);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  const markExported = async () => {
    if (session.exported_at) return;
    await fetch(`/api/admin/submissions/${session.id}/export`, { method: "POST" });
    onExported(session);
  };

  const handleCopy = async () => {
    await navigator.clipboard.writeText(markdown);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    await markExported();
  };

  const handleDownload = async () => {
    const name = (String(fd.business_name || "client"))
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/-+$/, "");
    const blob = new Blob([markdown], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${name}-brief.md`;
    a.click();
    URL.revokeObjectURL(url);
    await markExported();
  };

  const str = (key: string) => {
    const val = fd[key];
    return typeof val === "string" ? val : undefined;
  };

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(17,17,16,0.3)",
          zIndex: 50,
        }}
      />

      {/* Drawer */}
      <div
        style={{
          position: "fixed",
          top: 0,
          right: 0,
          bottom: 0,
          width: "min(520px, 90vw)",
          background: "#fff",
          borderLeft: "1.5px solid #e8e6df",
          zIndex: 51,
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

        {/* Title + status */}
        <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "4px" }}>
          <h2
            style={{
              fontFamily: "var(--font-serif)",
              fontSize: "1.5rem",
              fontWeight: 700,
              color: "#111110",
            }}
          >
            {str("business_name") || "Untitled"}
          </h2>
          {!session.exported_at && (
            <span
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: "10px",
                fontWeight: 700,
                color: "#fff",
                background: "#ff3d00",
                padding: "2px 7px",
                borderRadius: "3px",
                letterSpacing: "0.06em",
              }}
            >
              NEW
            </span>
          )}
        </div>
        <p
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: "12px",
            color: "#888886",
            marginBottom: "28px",
          }}
        >
          {str("_source") || "claim-your-site"} &middot;{" "}
          {session.submitted_at
            ? new Date(session.submitted_at).toLocaleDateString("en-US", {
                month: "long",
                day: "numeric",
                year: "numeric",
              })
            : "Not submitted"}
          {session.exported_at && (
            <>
              {" "}&middot; Exported{" "}
              {new Date(session.exported_at).toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
              })}
            </>
          )}
        </p>

        {/* Sections */}
        <Section title="Business Details">
          <Row label="Business Name" value={str("business_name")} />
          <Row label="Contact" value={str("contact_person")} />
          <Row label="Email" value={session.email || str("email")} />
          <Row label="Phone" value={str("phone")} />
          <Row label="Address" value={str("address")} />
          <Row label="Current URL" value={str("current_url")} />
        </Section>

        {str("service_areas") && (
          <Section title="Service Area">
            <p style={valueStyle}>{str("service_areas")}</p>
          </Section>
        )}

        {(str("domain_name") || session.dns_provider) && (
          <Section title="Domain & DNS">
            <Row label="Domain" value={str("domain_name")} />
            <Row
              label="DNS Provider"
              value={session.dns_provider || str("dns_provider")}
            />
          </Section>
        )}

        {str("details") && (
          <Section title="Additional Details">
            <p style={valueStyle}>{str("details")}</p>
          </Section>
        )}

        {/* Remaining form_data keys */}
        {(() => {
          const covered = new Set([
            "business_name", "contact_person", "email", "phone", "address",
            "current_url", "service_areas", "domain_name", "dns_provider",
            "details", "_source", "_mode",
          ]);
          const extra = Object.entries(fd).filter(
            ([k, v]) => !covered.has(k) && v && String(v).trim()
          );
          if (extra.length === 0) return null;
          return (
            <Section title="Questionnaire Responses">
              {extra.map(([k, v]) => (
                <Row
                  key={k}
                  label={k.replace(/_/g, " ")}
                  value={String(v)}
                />
              ))}
            </Section>
          );
        })()}

        {/* Export Actions */}
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
            onClick={handleCopy}
            className="btn-orange"
            style={{ fontSize: "13px", padding: "10px 20px" }}
          >
            {copied ? "Copied!" : "Copy Markdown"}
          </button>
          <button
            onClick={handleDownload}
            className="btn-outline"
            style={{ fontSize: "13px", padding: "10px 20px" }}
          >
            Download .md
          </button>
        </div>
      </div>
    </>
  );
}

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
  value?: string | null;
}) {
  if (!value) return null;
  return (
    <div style={{ display: "flex", gap: "8px" }}>
      <span
        style={{
          fontFamily: "var(--font-sans)",
          fontSize: "13px",
          fontWeight: 500,
          color: "#888886",
          minWidth: "110px",
          flexShrink: 0,
        }}
      >
        {label}
      </span>
      <span style={valueStyle}>{value}</span>
    </div>
  );
}

const valueStyle: React.CSSProperties = {
  fontFamily: "var(--font-sans)",
  fontSize: "14px",
  color: "#111110",
  lineHeight: 1.5,
  wordBreak: "break-word",
};
