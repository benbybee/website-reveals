"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function SalesRepLoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [pin, setPin] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/sales-rep/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), pin: pin.trim() }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error || `Login failed (${res.status})`);
      }
      router.push("/sales-rep");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div style={{ minHeight: "100vh", background: "#faf9f5", display: "flex", alignItems: "center", justifyContent: "center", padding: "32px 24px" }}>
      <div style={{ width: "100%", maxWidth: "420px", background: "#fff", border: "1.5px solid #e8e6df", borderRadius: "6px", padding: "40px 36px", fontFamily: "var(--font-sans)" }}>
        <div style={{ marginBottom: "28px" }}>
          <p style={{ fontFamily: "var(--font-mono)", fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.08em", color: "#ff3d00", marginBottom: "8px" }}>
            Sales Rep Portal
          </p>
          <h1 style={{ fontFamily: "var(--font-serif)", fontSize: "1.75rem", fontWeight: 700, color: "#111110" }}>Sign In</h1>
        </div>

        <form onSubmit={submit}>
          <label style={labelStyle}>Email</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            style={inputStyle}
            required
            autoComplete="email"
          />

          <label style={labelStyle}>PIN</label>
          <input
            type="text"
            inputMode="numeric"
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
            style={{ ...inputStyle, fontFamily: "var(--font-mono)", letterSpacing: "0.1em" }}
            maxLength={6}
            required
            autoComplete="one-time-code"
          />

          {error && (
            <div style={{ marginTop: "12px", padding: "10px 14px", background: "#fff5f2", border: "1px solid #ffcdc0", borderRadius: "3px", fontSize: "13px", color: "#b3300a" }}>
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="btn-orange"
            style={{ width: "100%", marginTop: "20px", fontSize: "14px", padding: "12px", opacity: submitting ? 0.5 : 1 }}
          >
            {submitting ? "Signing in…" : "Sign In →"}
          </button>
        </form>

        <p style={{ marginTop: "20px", fontSize: "12px", color: "#888886", textAlign: "center" }}>
          Don&apos;t have a PIN? Contact your admin.
        </p>
      </div>
    </div>
  );
}

const labelStyle: React.CSSProperties = {
  display: "block",
  fontFamily: "var(--font-mono)",
  fontSize: "10px",
  textTransform: "uppercase",
  letterSpacing: "0.08em",
  color: "#888886",
  fontWeight: 600,
  margin: "16px 0 6px",
};
const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "10px 14px",
  border: "1.5px solid #d8d6cf",
  borderRadius: "3px",
  fontSize: "14px",
  fontFamily: "var(--font-sans)",
  background: "#faf9f5",
};
