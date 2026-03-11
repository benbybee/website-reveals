"use client";

import { useState, FormEvent } from "react";

export default function PortalLoginPage() {
  const [email, setEmail] = useState("");
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/portal/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, pin }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Login failed");
        setLoading(false);
        return;
      }

      window.location.href = "/portal";
    } catch {
      setError("Something went wrong. Please try again.");
      setLoading(false);
    }
  }

  return (
    <div style={styles.page}>
      <div style={styles.card}>
        <p style={styles.brand}>WEBSITE REVEALS</p>
        <h1 style={styles.heading}>Client Portal</h1>

        <form onSubmit={handleSubmit}>
          <div style={styles.formGroup}>
            <label style={styles.label}>EMAIL</label>
            <input
              type="email"
              required
              placeholder="Email address"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              style={styles.input}
            />
          </div>

          <div style={styles.formGroup}>
            <label style={styles.label}>PIN</label>
            <input
              type="text"
              required
              placeholder="6-digit PIN"
              maxLength={6}
              inputMode="numeric"
              pattern="[0-9]*"
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
              style={styles.pinInput}
            />
          </div>

          <button type="submit" disabled={loading} style={styles.button}>
            {loading ? "Logging in..." : "Log In"}
          </button>

          {error && <p style={styles.error}>{error}</p>}
        </form>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    minHeight: "100vh",
    backgroundColor: "#faf9f5",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
  },
  card: {
    width: "100%",
    maxWidth: 400,
    padding: 40,
  },
  brand: {
    fontFamily: "var(--font-mono)",
    fontSize: 14,
    letterSpacing: "0.08em",
    color: "#ff3d00",
    textTransform: "uppercase",
    margin: 0,
    marginBottom: 8,
  },
  heading: {
    fontFamily: "var(--font-serif)",
    fontSize: 28,
    color: "#111110",
    fontWeight: 400,
    margin: 0,
    marginBottom: 32,
  },
  formGroup: {
    marginBottom: 20,
  },
  label: {
    display: "block",
    fontFamily: "var(--font-mono)",
    fontSize: 11,
    letterSpacing: "0.06em",
    color: "#888886",
    textTransform: "uppercase",
    marginBottom: 6,
  },
  input: {
    width: "100%",
    backgroundColor: "#ffffff",
    border: "1px solid #e8e6df",
    borderRadius: 4,
    padding: "12px 16px",
    color: "#111110",
    fontSize: 15,
    outline: "none",
    boxSizing: "border-box",
  },
  pinInput: {
    width: "100%",
    backgroundColor: "#ffffff",
    border: "1px solid #e8e6df",
    borderRadius: 4,
    padding: "12px 16px",
    color: "#111110",
    fontSize: 20,
    fontFamily: "monospace",
    letterSpacing: "0.3em",
    textAlign: "center",
    outline: "none",
    boxSizing: "border-box",
  },
  button: {
    width: "100%",
    backgroundColor: "#ff3d00",
    color: "#ffffff",
    padding: 14,
    border: "none",
    borderRadius: 4,
    fontSize: 15,
    fontWeight: 600,
    cursor: "pointer",
  },
  error: {
    color: "#ff6b35",
    fontSize: 13,
    margin: 0,
    marginTop: 12,
  },
};
