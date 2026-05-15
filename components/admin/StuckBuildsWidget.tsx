"use client";

import { useEffect, useState } from "react";

interface StuckBuild {
  id: string;
  token: string;
  pipeline: string;
  status: string;
  sl_phase: string | null;
  sl_build_id: string | null;
  created_at: string;
  started_at: string | null;
  minutes_stuck: number;
  business_name: string;
}

export function StuckBuildsWidget() {
  const [builds, setBuilds] = useState<StuckBuild[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    async function load() {
      try {
        const res = await fetch("/api/admin/stuck-builds");
        if (!res.ok) return;
        const body = await res.json();
        if (alive) setBuilds(body.builds || []);
      } catch {
        /* toast handles error display */
      } finally {
        if (alive) setLoading(false);
      }
    }
    load();
    const interval = setInterval(load, 60_000); // refresh every minute
    return () => {
      alive = false;
      clearInterval(interval);
    };
  }, []);

  if (loading || builds.length === 0) return null;

  return (
    <div
      style={{
        background: "#fff5f2",
        border: "1.5px solid #ff3d00",
        borderRadius: "6px",
        padding: "14px 18px",
        marginBottom: "20px",
        fontFamily: "var(--font-sans)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "10px" }}>
        <span style={{ fontSize: "16px" }}>⚠️</span>
        <span
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: "11px",
            textTransform: "uppercase",
            letterSpacing: "0.08em",
            color: "#b3300a",
            fontWeight: 700,
          }}
        >
          {builds.length} build{builds.length === 1 ? "" : "s"} appear stuck
        </span>
      </div>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px" }}>
        <thead>
          <tr>
            <th style={th}>Business</th>
            <th style={th}>Pipeline</th>
            <th style={th}>Phase</th>
            <th style={{ ...th, textAlign: "right" }}>Stuck for</th>
            <th style={th}>Started</th>
          </tr>
        </thead>
        <tbody>
          {builds.map((b) => (
            <tr key={b.id}>
              <td style={td}>{b.business_name}</td>
              <td style={td}>{b.pipeline}</td>
              <td style={td}>{b.sl_phase || b.status}</td>
              <td style={{ ...td, textAlign: "right", color: "#b3300a", fontWeight: 600 }}>
                {b.minutes_stuck} min
              </td>
              <td style={td}>{b.started_at ? new Date(b.started_at).toLocaleString() : new Date(b.created_at).toLocaleString()}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const th: React.CSSProperties = {
  textAlign: "left",
  fontFamily: "var(--font-mono)",
  fontSize: "10px",
  textTransform: "uppercase",
  letterSpacing: "0.08em",
  color: "#888886",
  fontWeight: 600,
  padding: "6px 8px",
  borderBottom: "1px solid #ffcdc0",
};
const td: React.CSSProperties = {
  padding: "6px 8px",
  borderBottom: "1px solid #ffefea",
  color: "#111110",
};
