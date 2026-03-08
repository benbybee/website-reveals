"use client";

import { useState } from "react";

const DNS_PROVIDERS = [
  { id: "godaddy", name: "GoDaddy" },
  { id: "namecheap", name: "Namecheap" },
  { id: "cloudflare", name: "Cloudflare" },
  { id: "google", name: "Google / Squarespace" },
  { id: "networksolutions", name: "Network Solutions" },
  { id: "other", name: "Other / Not sure" },
];

const C = {
  bg: "#080C14",
  input: "#0F172A",
  border: "#1E293B",
  accent: "#22D3EE",
  accentDim: "rgba(34,211,238,0.08)",
  text: "#F1F5F9",
  muted: "#64748B",
  error: "#EF4444",
} as const;

export function NovaluxForm() {
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
    const allFields = ["business_name", "contact_person", "email", "phone", "address", "service_areas", "domain_name", "dns_provider"];
    const missing = allFields.filter((id) => !v(id).trim());
    if (missing.length) {
      setErrors(missing);
      window.scrollTo({ top: 0, behavior: "smooth" });
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
          form_data: { ...form, _source: "novalux" },
          dns_provider: form.dns_provider || null,
        }),
      });
      await fetch(`/api/form/${token}/save-email`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: form.email }),
      });
      await fetch(`/api/form/${token}/submit`, { method: "POST" });
      setSubmitted(true);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch {
      setSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <Wrapper>
        <div style={{ textAlign: "center", maxWidth: "480px", margin: "0 auto", paddingTop: "20vh" }}>
          <div
            style={{
              width: "56px",
              height: "56px",
              borderRadius: "50%",
              background: C.accentDim,
              border: `2px solid ${C.accent}`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              margin: "0 auto 24px",
              color: C.accent,
              fontSize: "24px",
            }}
          >
            ✓
          </div>
          <h1
            style={{
              fontFamily: "var(--font-nv-heading), sans-serif",
              fontSize: "2rem",
              fontWeight: 700,
              color: C.text,
              marginBottom: "12px",
            }}
          >
            All Set
          </h1>
          <p
            style={{
              fontFamily: "var(--font-nv-body), sans-serif",
              fontSize: "16px",
              color: C.muted,
              lineHeight: 1.6,
            }}
          >
            We received your information. Check your email for DNS setup instructions.
          </p>
        </div>
      </Wrapper>
    );
  }

  return (
    <Wrapper>
      <div style={{ maxWidth: "600px", margin: "0 auto" }}>
        {/* Header */}
        <div style={{ marginBottom: "48px" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="https://novalux2.websitereveals.com/wp-content/uploads/2026/02/Untitled-design.png"
            alt="NovaLux"
            style={{ height: "40px", width: "auto", marginBottom: "24px", display: "block" }}
          />
          <h1
            style={{
              fontFamily: "var(--font-nv-heading), sans-serif",
              fontSize: "clamp(1.75rem, 4.5vw, 2.5rem)",
              fontWeight: 700,
              color: C.text,
              letterSpacing: "-0.01em",
              lineHeight: 1.15,
            }}
          >
            Website Client{" "}
            <span style={{ color: C.accent }}>Onboarding</span>
          </h1>
        </div>

        {/* Business Details */}
        <Section title="Business Details">
          <Field label="Business Name" required>
            <Input
              value={v("business_name")}
              onChange={(val) => set("business_name", val)}
              placeholder="Your business name"
              error={errors.includes("business_name")}
            />
          </Field>
          <Field label="Primary Contact" required>
            <Input
              value={v("contact_person")}
              onChange={(val) => set("contact_person", val)}
              placeholder="Full name"
              error={errors.includes("contact_person")}
            />
          </Field>
        </Section>

        {/* Contact Information */}
        <Section title="Contact Information">
          <Field label="Email" required>
            <Input
              type="email"
              value={v("email")}
              onChange={(val) => set("email", val)}
              placeholder="hello@yourbusiness.com"
              error={errors.includes("email")}
            />
          </Field>
          <Field label="Phone" required>
            <Input
              type="tel"
              value={v("phone")}
              onChange={(val) => set("phone", val)}
              placeholder="(555) 000-0000"
              error={errors.includes("phone")}
            />
          </Field>
          <Field label="Business Address" required>
            <Input
              value={v("address")}
              onChange={(val) => set("address", val)}
              placeholder="Street, City, State ZIP"
              error={errors.includes("address")}
            />
          </Field>
        </Section>

        {/* Service Area */}
        <Section title="Service Area">
          <Field label="Where do you operate?" required>
            <TextArea
              value={v("service_areas")}
              onChange={(val) => set("service_areas", val)}
              placeholder="List the cities, counties, or regions you serve..."
              error={errors.includes("service_areas")}
            />
          </Field>
        </Section>

        {/* Domain & DNS */}
        <Section title="Domain & DNS">
          <Field label="Your Domain" required>
            <Input
              value={v("domain_name")}
              onChange={(val) => set("domain_name", val)}
              placeholder="yourbusiness.com"
              error={errors.includes("domain_name")}
            />
          </Field>
          <Field label="Who manages your DNS?" required>
            <DnsGrid value={v("dns_provider")} onChange={(val) => set("dns_provider", val)} error={errors.includes("dns_provider")} />
          </Field>
        </Section>

        {/* Submit */}
        <button
          onClick={handleSubmit}
          disabled={submitting}
          className="nv-submit"
          style={{
            width: "100%",
            padding: "14px 32px",
            background: C.accent,
            color: "#0A0F1A",
            border: "none",
            borderRadius: "8px",
            fontFamily: "var(--font-nv-body), sans-serif",
            fontSize: "15px",
            fontWeight: 700,
            cursor: submitting ? "not-allowed" : "pointer",
            opacity: submitting ? 0.5 : 1,
            transition: "opacity 0.15s, background 0.15s",
          }}
        >
          {submitting ? "Submitting..." : "Submit"}
        </button>
      </div>
    </Wrapper>
  );
}

/* ── Layout ──────────────────────────────────────────── */

function Wrapper({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        minHeight: "100vh",
        background: C.bg,
        padding: "48px 24px 80px",
        position: "relative",
        overflow: "hidden",
      }}
    >
      <style>{`
        .nv-input::placeholder { color: #475569; }
        .nv-input:focus { border-color: ${C.accent} !important; box-shadow: 0 0 0 3px rgba(34,211,238,0.08); outline: none; }
        .nv-submit:hover:not(:disabled) { background: #06B6D4 !important; }
        @keyframes nv-drift { 0%,100% { transform: translate(0,0) scale(1); } 50% { transform: translate(30px,-20px) scale(1.1); } }
        @keyframes nv-drift2 { 0%,100% { transform: translate(0,0) scale(1); } 50% { transform: translate(-20px,30px) scale(1.05); } }
      `}</style>

      {/* Ambient glow orbs */}
      <div
        style={{
          position: "fixed",
          top: "-10%",
          right: "-5%",
          width: "500px",
          height: "500px",
          borderRadius: "50%",
          background: "radial-gradient(circle, rgba(34,211,238,0.07) 0%, transparent 70%)",
          pointerEvents: "none",
          animation: "nv-drift 12s ease-in-out infinite",
        }}
      />
      <div
        style={{
          position: "fixed",
          bottom: "5%",
          left: "-8%",
          width: "450px",
          height: "450px",
          borderRadius: "50%",
          background: "radial-gradient(circle, rgba(34,211,238,0.05) 0%, transparent 70%)",
          pointerEvents: "none",
          animation: "nv-drift2 15s ease-in-out infinite",
        }}
      />
      <div
        style={{
          position: "fixed",
          top: "40%",
          left: "50%",
          width: "600px",
          height: "600px",
          borderRadius: "50%",
          background: "radial-gradient(circle, rgba(14,116,144,0.04) 0%, transparent 70%)",
          transform: "translateX(-50%)",
          pointerEvents: "none",
        }}
      />

      {/* Top accent stripe */}
      <div
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          height: "3px",
          background: `linear-gradient(90deg, transparent, ${C.accent}, transparent)`,
          zIndex: 10,
        }}
      />

      {/* Content */}
      <div style={{ position: "relative", zIndex: 1 }}>
        {children}
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: "36px" }}>
      <h2
        style={{
          fontFamily: "var(--font-nv-heading), sans-serif",
          fontSize: "13px",
          fontWeight: 600,
          color: C.accent,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          marginBottom: "20px",
          paddingBottom: "10px",
          borderBottom: `1px solid ${C.border}`,
        }}
      >
        {title}
      </h2>
      <div style={{ display: "flex", flexDirection: "column", gap: "18px" }}>
        {children}
      </div>
    </div>
  );
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <label
        style={{
          display: "block",
          fontFamily: "var(--font-nv-body), sans-serif",
          fontSize: "13px",
          fontWeight: 500,
          color: C.text,
          marginBottom: "6px",
        }}
      >
        {label}
        {required && <span style={{ color: C.accent, marginLeft: "4px" }}>*</span>}
      </label>
      {children}
    </div>
  );
}

/* ── Inputs ──────────────────────────────────────────── */

const baseInput: React.CSSProperties = {
  width: "100%",
  fontFamily: "var(--font-nv-body), sans-serif",
  fontSize: "15px",
  color: C.text,
  background: C.input,
  border: `1.5px solid ${C.border}`,
  borderRadius: "8px",
  padding: "12px 16px",
  outline: "none",
  transition: "border-color 0.15s, box-shadow 0.15s",
};

function Input({
  type = "text",
  value,
  onChange,
  placeholder,
  error,
}: {
  type?: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  error?: boolean;
}) {
  return (
    <>
      <input
        type={type}
        className="nv-input"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        style={{ ...baseInput, ...(error ? { borderColor: C.error } : {}) }}
      />
      {error && (
        <p
          style={{
            fontFamily: "var(--font-nv-body), sans-serif",
            fontSize: "12px",
            color: C.error,
            marginTop: "4px",
          }}
        >
          Required
        </p>
      )}
    </>
  );
}

function TextArea({
  value,
  onChange,
  placeholder,
  error,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  error?: boolean;
}) {
  return (
    <>
      <textarea
        className="nv-input"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        style={{ ...baseInput, minHeight: "100px", resize: "vertical", ...(error ? { borderColor: C.error } : {}) }}
      />
      {error && (
        <p style={{ fontFamily: "var(--font-nv-body), sans-serif", fontSize: "12px", color: C.error, marginTop: "4px" }}>
          Required
        </p>
      )}
    </>
  );
}

function DnsGrid({ value, onChange, error }: { value: string; onChange: (v: string) => void; error?: boolean }) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(170px, 1fr))",
        gap: "8px",
      }}
    >
      {DNS_PROVIDERS.map((p) => {
        const active = value === p.id;
        return (
          <button
            key={p.id}
            type="button"
            onClick={() => onChange(p.id)}
            style={{
              textAlign: "left",
              padding: "12px 14px",
              borderRadius: "8px",
              border: `1.5px solid ${active ? C.accent : error ? C.error : C.border}`,
              background: active ? C.accentDim : C.input,
              cursor: "pointer",
              transition: "all 0.15s",
              fontFamily: "var(--font-nv-body), sans-serif",
              fontWeight: active ? 600 : 400,
              fontSize: "13px",
              color: active ? C.accent : C.muted,
            }}
          >
            {active && <span style={{ marginRight: "6px" }}>✓</span>}
            {p.name}
          </button>
        );
      })}
      {error && (
        <p style={{ fontFamily: "var(--font-nv-body), sans-serif", fontSize: "12px", color: C.error, marginTop: "4px", gridColumn: "1 / -1" }}>
          Required
        </p>
      )}
    </div>
  );
}
