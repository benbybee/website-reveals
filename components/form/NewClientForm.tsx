"use client";

import { useState } from "react";
import Link from "next/link";

export function NewClientForm() {
  const [form, setForm] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);

  const v = (id: string) => form[id] || "";
  const set = (id: string, val: string) => {
    setForm((p) => ({ ...p, [id]: val }));
    setErrors((e) => e.filter((x) => x !== id));
  };

  const handleSubmit = async () => {
    const missing = ["business_name", "current_url"].filter((id) => !v(id).trim());
    if (missing.length) {
      setErrors(missing);
      return;
    }

    setSubmitting(true);
    try {
      const { token } = await (await fetch("/api/form/start", { method: "POST" })).json();
      await fetch(`/api/form/${token}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          current_step: 1,
          form_data: { ...form, _source: "new-client" },
          dns_provider: null,
        }),
      });
      await fetch(`/api/form/${token}/submit`, { method: "POST" });
      setSubmitted(true);
    } catch {
      setSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <div
        style={{
          minHeight: "100vh",
          background: "#faf9f5",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "24px",
        }}
      >
        <div style={{ textAlign: "center", maxWidth: "420px" }}>
          <div
            style={{
              width: "48px",
              height: "48px",
              borderRadius: "50%",
              background: "#fff5f2",
              border: "2px solid #ff3d00",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              margin: "0 auto 20px",
              color: "#ff3d00",
              fontSize: "20px",
            }}
          >
            ✓
          </div>
          <h1
            style={{
              fontFamily: "var(--font-serif)",
              fontSize: "1.75rem",
              fontWeight: 700,
              color: "#111110",
              marginBottom: "10px",
            }}
          >
            Received
          </h1>
          <p
            style={{
              fontFamily: "var(--font-sans)",
              fontSize: "15px",
              color: "#888886",
              lineHeight: 1.6,
            }}
          >
            We&apos;ll review and get back to you shortly.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: "#faf9f5", padding: "48px 24px 80px" }}>
      <div style={{ maxWidth: "520px", margin: "0 auto" }}>
        {/* Header */}
        <Link
          href="/"
          style={{
            fontFamily: "var(--font-serif)",
            fontWeight: 700,
            fontSize: "16px",
            color: "#111110",
            textDecoration: "none",
            display: "block",
            marginBottom: "48px",
          }}
        >
          Obsession<span style={{ color: "#ff3d00" }}>.</span>
        </Link>

        <p className="eyebrow" style={{ marginBottom: "12px" }}>
          New Client
        </p>
        <h1
          style={{
            fontFamily: "var(--font-serif)",
            fontSize: "clamp(1.5rem, 4vw, 2rem)",
            fontWeight: 700,
            color: "#111110",
            lineHeight: 1.15,
            marginBottom: "40px",
          }}
        >
          Quick Intake
        </h1>

        {/* Fields */}
        <div style={{ display: "flex", flexDirection: "column", gap: "24px", marginBottom: "36px" }}>
          <div>
            <label style={labelStyle}>
              Business Name <span style={{ color: "#ff3d00" }}>*</span>
            </label>
            <input
              className="field"
              value={v("business_name")}
              onChange={(e) => set("business_name", e.target.value)}
              placeholder="Your business name"
              style={errors.includes("business_name") ? { borderColor: "#ff3d00" } : {}}
            />
            {errors.includes("business_name") && <p style={errStyle}>Required</p>}
          </div>

          <div>
            <label style={labelStyle}>
              Website URL <span style={{ color: "#ff3d00" }}>*</span>
            </label>
            <input
              className="field"
              value={v("current_url")}
              onChange={(e) => set("current_url", e.target.value)}
              placeholder="https://yourbusiness.com"
              style={errors.includes("current_url") ? { borderColor: "#ff3d00" } : {}}
            />
            {errors.includes("current_url") && <p style={errStyle}>Required</p>}
          </div>

          <div>
            <label style={labelStyle}>Details</label>
            <textarea
              className="field"
              value={v("details")}
              onChange={(e) => set("details", e.target.value)}
              placeholder="Anything we should know — goals, notes, context..."
              style={{ minHeight: "120px", resize: "vertical" }}
            />
          </div>
        </div>

        {/* Submit */}
        <button
          onClick={handleSubmit}
          disabled={submitting}
          className="btn-orange"
          style={{
            width: "100%",
            justifyContent: "center",
            opacity: submitting ? 0.5 : 1,
            cursor: submitting ? "not-allowed" : "pointer",
          }}
        >
          {submitting ? "Submitting..." : "Submit"}
        </button>
      </div>
    </div>
  );
}

const labelStyle: React.CSSProperties = {
  display: "block",
  fontFamily: "var(--font-sans)",
  fontSize: "14px",
  fontWeight: 500,
  color: "#111110",
  marginBottom: "6px",
};

const errStyle: React.CSSProperties = {
  fontFamily: "var(--font-mono)",
  fontSize: "11px",
  color: "#ff3d00",
  marginTop: "4px",
  letterSpacing: "0.02em",
};
