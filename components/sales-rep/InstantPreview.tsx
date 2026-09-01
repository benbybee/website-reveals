"use client";

import { useCallback, useRef, useState } from "react";

interface ReadyIndustry {
  slug: string;
  display_name: string;
  sl_slug: string;
}
interface Match {
  placeId: string;
  description: string;
}

const ORANGE = "#ff3d00";
const BORDER = "1.5px solid #e8e6df";

const card: React.CSSProperties = {
  background: "#fff",
  border: BORDER,
  borderRadius: 6,
  padding: 24,
};
const label: React.CSSProperties = {
  display: "block",
  fontSize: 12,
  textTransform: "uppercase",
  letterSpacing: "0.08em",
  color: "#888886",
  fontWeight: 600,
  marginBottom: 8,
};
const field: React.CSSProperties = {
  width: "100%",
  padding: "12px 14px",
  border: BORDER,
  borderRadius: 4,
  fontSize: 15,
  background: "#faf9f5",
  boxSizing: "border-box",
};

export function InstantPreview({
  industries,
  placesEnabled,
}: {
  industries: ReadyIndustry[];
  placesEnabled: boolean;
}) {
  const [industrySlug, setIndustrySlug] = useState("");
  const [query, setQuery] = useState("");
  const [matches, setMatches] = useState<Match[]>([]);
  const [searching, setSearching] = useState(false);
  const [status, setStatus] = useState<"idle" | "building" | "done" | "error">("idle");
  const [message, setMessage] = useState("");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const runSearch = useCallback(
    async (q: string, slug: string) => {
      if (q.trim().length < 2 || !slug) {
        setMatches([]);
        return;
      }
      setSearching(true);
      try {
        const res = await fetch("/api/templates/find/gbp", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query: q, industrySlug: slug }),
        });
        if (!res.ok) {
          setMatches([]);
          if (res.status === 503) setMessage("Business search isn't configured yet.");
          return;
        }
        const data = (await res.json()) as { matches?: Match[] };
        setMatches(data.matches ?? []);
      } catch {
        setMatches([]);
      } finally {
        setSearching(false);
      }
    },
    [],
  );

  function onQueryChange(value: string) {
    setQuery(value);
    setMessage("");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void runSearch(value, industrySlug), 350);
  }

  async function confirm(placeId: string, description: string) {
    setStatus("building");
    setMessage(`Building a preview for ${description}…`);
    setMatches([]);
    try {
      const res = await fetch("/api/templates/find/gbp/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ placeId, industrySlug }),
      });
      const data = (await res.json().catch(() => ({}))) as { cap?: number; error?: string };
      if (res.ok) {
        setStatus("done");
        setMessage("Building your preview — we'll email you the link when it's ready.");
        return;
      }
      setStatus("error");
      if (res.status === 402) {
        setMessage(`You've hit today's preview budget${data.cap ? ` ($${data.cap})` : ""}. Try again tomorrow.`);
      } else if (res.status === 400 && data.error === "template_not_ready") {
        setMessage("We don't have a template for that industry yet.");
      } else {
        setMessage("Something went wrong starting the build. Please try again.");
      }
    } catch {
      setStatus("error");
      setMessage("Network error starting the build. Please try again.");
    }
  }

  function reset() {
    setStatus("idle");
    setMessage("");
    setQuery("");
    setMatches([]);
  }

  return (
    <div>
      <a href="/sales-rep" style={{ color: "#888886", fontSize: 13, textDecoration: "none" }}>
        ← Back to dashboard
      </a>
      <h1
        style={{
          fontFamily: "Georgia, 'Playfair Display', serif",
          fontSize: 28,
          fontWeight: 700,
          margin: "12px 0 4px",
        }}
      >
        Instant Preview
      </h1>
      <p style={{ color: "#888886", fontSize: 15, margin: "0 0 24px" }}>
        {"Pick an industry, find the business on Google, and we'll build a speculative preview site you can show on your call."}
      </p>

      {!placesEnabled && (
        <div style={{ ...card, borderColor: "#f0c000", background: "#fffbea", marginBottom: 16 }}>
          <strong>{"Business search isn't configured yet."}</strong>{" "}
          Ask an admin to set the Google Places API key, then reload this page.
        </div>
      )}

      {status === "done" ? (
        <div style={{ ...card, textAlign: "center" }}>
          <div style={{ fontSize: 40, marginBottom: 8 }}>✅</div>
          <h2 style={{ fontSize: 20, margin: "0 0 8px" }}>Preview building</h2>
          <p style={{ color: "#555", fontSize: 15 }}>{message}</p>
          <button onClick={reset} style={primaryBtn}>
            Build another
          </button>
        </div>
      ) : (
        <div style={card}>
          <div style={{ marginBottom: 20 }}>
            <label style={label} htmlFor="industry">
              Industry
            </label>
            <select
              id="industry"
              value={industrySlug}
              onChange={(e) => {
                setIndustrySlug(e.target.value);
                void runSearch(query, e.target.value);
              }}
              style={field}
              disabled={status === "building"}
            >
              <option value="">Select an industry…</option>
              {industries.map((i) => (
                <option key={i.slug} value={i.slug}>
                  {i.display_name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label style={label} htmlFor="business">
              Business name
            </label>
            <input
              id="business"
              type="text"
              value={query}
              onChange={(e) => onQueryChange(e.target.value)}
              placeholder={industrySlug ? "Start typing a business name…" : "Pick an industry first"}
              disabled={!industrySlug || !placesEnabled || status === "building"}
              style={field}
              autoComplete="off"
            />
          </div>

          {searching && <p style={{ color: "#888886", fontSize: 13, marginTop: 12 }}>Searching…</p>}

          {matches.length > 0 && (
            <ul style={{ listStyle: "none", padding: 0, margin: "16px 0 0" }}>
              {matches.map((m) => (
                <li key={m.placeId} style={{ borderTop: BORDER }}>
                  <button
                    onClick={() => void confirm(m.placeId, m.description)}
                    disabled={status === "building"}
                    style={{
                      display: "block",
                      width: "100%",
                      textAlign: "left",
                      background: "none",
                      border: "none",
                      padding: "14px 4px",
                      fontSize: 15,
                      cursor: "pointer",
                      color: "#111110",
                    }}
                  >
                    {m.description}
                  </button>
                </li>
              ))}
            </ul>
          )}

          {message && (
            <p
              style={{
                marginTop: 16,
                fontSize: 14,
                color: status === "error" ? "#b00020" : "#555",
              }}
            >
              {message}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

const primaryBtn: React.CSSProperties = {
  display: "inline-block",
  marginTop: 20,
  background: ORANGE,
  color: "#fff",
  border: "none",
  padding: "12px 28px",
  fontSize: 15,
  fontWeight: 600,
  borderRadius: 3,
  cursor: "pointer",
};
