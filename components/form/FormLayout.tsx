"use client";

import Link from "next/link";
import { ProgressBar } from "./ProgressBar";

interface FormLayoutProps {
  currentStep: number;
  totalSteps: number;
  children: React.ReactNode;
  onSave: () => void;
}

export function FormLayout({ currentStep, totalSteps, children, onSave }: FormLayoutProps) {
  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", background: "#faf9f5" }}>
      {/* Top bar */}
      <header
        style={{
          position: "sticky",
          top: 0,
          zIndex: 10,
          background: "rgba(250,249,245,0.97)",
          borderBottom: "1px solid #e8e6df",
          backdropFilter: "blur(8px)",
          WebkitBackdropFilter: "blur(8px)",
          display: "flex",
          alignItems: "center",
          padding: "0 24px",
          height: "60px",
          gap: "20px",
        }}
      >
        <Link
          href="/"
          style={{
            fontFamily: "var(--font-serif)",
            fontWeight: 700,
            fontSize: "16px",
            color: "#111110",
            textDecoration: "none",
            flexShrink: 0,
          }}
        >
          Obsession<span style={{ color: "#ff3d00" }}>.</span>
        </Link>

        <ProgressBar current={currentStep} total={totalSteps} />

        <button
          onClick={onSave}
          style={{
            flexShrink: 0,
            fontFamily: "var(--font-mono)",
            fontSize: "11px",
            letterSpacing: "0.04em",
            color: "#888886",
            background: "none",
            border: "1.5px solid #e8e6df",
            borderRadius: "4px",
            padding: "6px 14px",
            cursor: "pointer",
            transition: "border-color 0.15s, color 0.15s",
          }}
          onMouseEnter={(e) => {
            (e.target as HTMLButtonElement).style.borderColor = "#ff3d00";
            (e.target as HTMLButtonElement).style.color = "#ff3d00";
          }}
          onMouseLeave={(e) => {
            (e.target as HTMLButtonElement).style.borderColor = "#e8e6df";
            (e.target as HTMLButtonElement).style.color = "#888886";
          }}
        >
          Save progress
        </button>
      </header>

      {/* Content */}
      <main
        style={{
          flex: 1,
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "center",
          padding: "60px 24px 80px",
        }}
      >
        <div style={{ width: "100%", maxWidth: "700px" }}>{children}</div>
      </main>
    </div>
  );
}
