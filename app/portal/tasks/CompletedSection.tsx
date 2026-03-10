"use client";

import { useState } from "react";

export function CompletedSection({
  count,
  color,
  children,
}: {
  count: number;
  color: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);

  return (
    <section style={{ marginBottom: "32px" }}>
      <button
        onClick={() => setOpen(!open)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: "8px",
          marginBottom: open ? "12px" : "0",
          background: "none",
          border: "none",
          cursor: "pointer",
          padding: 0,
        }}
      >
        <span
          style={{
            fontSize: "14px",
            fontFamily:
              "ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, monospace",
            textTransform: "uppercase",
            color,
            letterSpacing: "0.04em",
          }}
        >
          Complete
        </span>
        <span
          style={{
            fontSize: "11px",
            fontFamily:
              "ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, monospace",
            color,
            backgroundColor: `${color}18`,
            padding: "2px 8px",
            borderRadius: "10px",
            fontWeight: 600,
          }}
        >
          {count}
        </span>
        <span
          style={{
            fontSize: "12px",
            color: "#888886",
            marginLeft: "4px",
            transition: "transform 0.2s",
            transform: open ? "rotate(90deg)" : "rotate(0deg)",
            display: "inline-block",
          }}
        >
          ▶
        </span>
      </button>
      {open && (
        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          {children}
        </div>
      )}
    </section>
  );
}
