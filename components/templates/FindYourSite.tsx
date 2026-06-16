"use client";

import { useState } from "react";

type Match = { id: string; business_name: string | null; city: string | null; state: string | null };
type FindResponse =
  | { result: "none" }
  | { result: "one"; match: Match }
  | { result: "many"; matches: Match[] };

export function FindYourSite() {
  const [name, setName] = useState("");
  const [zip, setZip] = useState("");
  const [state, setState] = useState<"idle" | "loading" | "done">("idle");
  const [res, setRes] = useState<FindResponse | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setState("loading");
    setRes(null);
    try {
      const r = await fetch("/api/templates/find", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ business_name: name, zip }),
      });
      setRes((await r.json()) as FindResponse);
    } catch {
      setRes({ result: "none" });
    } finally {
      setState("done");
    }
  }

  return (
    <div>
      <form onSubmit={submit} style={{ display: "grid", gap: 10 }}>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Business name" required style={inp} />
        <input value={zip} onChange={(e) => setZip(e.target.value)} placeholder="ZIP code" inputMode="numeric" required style={inp} />
        <button type="submit" disabled={state === "loading"} style={btn}>
          {state === "loading" ? "Searching…" : "Find my site"}
        </button>
      </form>

      {state === "done" && res?.result === "one" && (
        <ResultCard match={res.match} />
      )}
      {state === "done" && res?.result === "many" && (
        <div style={{ marginTop: 18, display: "grid", gap: 8 }}>
          <p style={{ fontSize: 13, color: "#555553" }}>We found a few — pick yours:</p>
          {res.matches.map((m) => <ResultCard key={m.id} match={m} />)}
        </div>
      )}
      {state === "done" && res?.result === "none" && (
        <p style={{ marginTop: 18, fontSize: 14, color: "#8a2a1a" }}>
          We couldn&apos;t find it. Double-check the spelling and the ZIP code printed on your postcard.
        </p>
      )}
    </div>
  );
}

function ResultCard({ match }: { match: Match }) {
  return (
    <a
      href={`/s/${match.id}`}
      style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 14, padding: "14px 16px", background: "#fff", border: "1.5px solid #e8e6df", borderRadius: 8, textDecoration: "none", color: "#111110" }}
    >
      <span>
        <strong style={{ display: "block", fontSize: 15 }}>{match.business_name || "Your business"}</strong>
        <span style={{ fontSize: 12, color: "#888886" }}>{[match.city, match.state].filter(Boolean).join(", ")}</span>
      </span>
      <span style={{ fontWeight: 600, color: "#1a7a3a" }}>Open your site →</span>
    </a>
  );
}

const inp: React.CSSProperties = { width: "100%", padding: "11px 12px", border: "1.5px solid #d8d6cf", borderRadius: 6, fontSize: 15, boxSizing: "border-box" };
const btn: React.CSSProperties = { padding: "11px 12px", background: "#1a7a3a", color: "#fff", border: "none", borderRadius: 6, fontSize: 15, fontWeight: 600, cursor: "pointer" };
