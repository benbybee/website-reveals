"use client";

const PROVIDERS = [
  { id: "godaddy", name: "GoDaddy", desc: "Most common for small businesses" },
  { id: "namecheap", name: "Namecheap", desc: "Popular developer choice" },
  { id: "cloudflare", name: "Cloudflare", desc: "Best performance & security" },
  { id: "google", name: "Google / Squarespace", desc: "Simple, clean interface" },
  { id: "networksolutions", name: "Network Solutions", desc: "Legacy provider" },
  { id: "other", name: "Other / Not sure", desc: "We'll help you figure it out" },
];

interface DnsSelectorProps {
  value: string;
  onChange: (val: string) => void;
}

export function DnsSelector({ value, onChange }: DnsSelectorProps) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
        gap: "8px",
        marginTop: "8px",
      }}
    >
      {PROVIDERS.map((p) => {
        const active = value === p.id;
        return (
          <button
            key={p.id}
            type="button"
            onClick={() => onChange(p.id)}
            style={{
              textAlign: "left",
              padding: "14px 16px",
              borderRadius: "4px",
              border: active ? "1.5px solid #ff3d00" : "1.5px solid #e8e6df",
              background: active ? "#fff5f2" : "#ffffff",
              cursor: "pointer",
              transition: "all 0.15s",
            }}
          >
            <div
              style={{
                fontFamily: "var(--font-sans)",
                fontWeight: 500,
                fontSize: "13px",
                color: active ? "#ff3d00" : "#111110",
                marginBottom: "3px",
              }}
            >
              {active && <span style={{ marginRight: "6px" }}>✓</span>}
              {p.name}
            </div>
            <p
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: "10px",
                color: "#888886",
                letterSpacing: "0.02em",
              }}
            >
              {p.desc}
            </p>
          </button>
        );
      })}
    </div>
  );
}
