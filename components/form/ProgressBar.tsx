"use client";

interface ProgressBarProps {
  current: number;
  total: number;
}

export function ProgressBar({ current, total }: ProgressBarProps) {
  const pct = Math.round(((current - 1) / total) * 100);
  return (
    <div style={{ flex: 1, margin: "0 20px" }}>
      <div
        style={{
          height: "2px",
          background: "#e8e6df",
          borderRadius: "2px",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            height: "100%",
            width: `${pct}%`,
            background: "#ff3d00",
            borderRadius: "2px",
            transition: "width 0.4s ease",
          }}
        />
      </div>
      <p
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: "10px",
          color: "#888886",
          textAlign: "center",
          marginTop: "6px",
          letterSpacing: "0.06em",
        }}
      >
        {current} / {total}
      </p>
    </div>
  );
}
