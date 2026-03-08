"use client";

import { QuestionnaireMode } from "@/lib/form-steps";

interface ModeSelectorProps {
  onSelect: (mode: QuestionnaireMode) => void;
}

const MODES: {
  id: QuestionnaireMode;
  time: string;
  name: string;
  description: string;
  bullets: string[];
  tradeoff: string;
  icon: string;
  highlight?: boolean;
}[] = [
  {
    id: "quick",
    time: "Under 5 min",
    name: "Quick",
    description: "Just the essentials. We'll make educated guesses where information is missing.",
    bullets: [
      "2 steps, ~10 questions",
      "Business basics + your key services",
      "Good for simple, straightforward businesses",
    ],
    tradeoff: "We may not capture your brand voice or positioning accurately. We might reach out with follow-up questions.",
    icon: "⚡",
  },
  {
    id: "standard",
    time: "About 15 min",
    name: "Standard",
    description: "Covers the essentials without going too deep. A solid foundation for most businesses.",
    bullets: [
      "6 steps, ~35 questions",
      "Goals, audience, brand basics, and services",
      "Enough detail for an accurate website",
    ],
    tradeoff: "We might need to follow up on a few specifics, but most things will be covered.",
    icon: "📋",
    highlight: true,
  },
  {
    id: "in-depth",
    time: "30–45 min",
    name: "In-Depth",
    description: "The full brief. Every question has a purpose and improves what we build.",
    bullets: [
      "11 steps, 100+ questions",
      "Deep dive into brand, copy, and positioning",
      "The most accurate, strategic result",
    ],
    tradeoff: "It takes time — but it's an investment that shows up in every line of copy and every design decision.",
    icon: "📑",
  },
];

export function ModeSelector({ onSelect }: ModeSelectorProps) {
  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#faf9f5",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        padding: "64px 24px 80px",
      }}
    >
      {/* Wordmark */}
      <div
        style={{
          fontFamily: "var(--font-serif)",
          fontWeight: 700,
          fontSize: "16px",
          color: "#111110",
          marginBottom: "56px",
          alignSelf: "flex-start",
          width: "100%",
          maxWidth: "820px",
        }}
      >
        Obsession<span style={{ color: "#ff3d00" }}>.</span>
      </div>

      {/* Header */}
      <div style={{ width: "100%", maxWidth: "820px", marginBottom: "48px" }}>
        <p
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: "11px",
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            color: "#ff3d00",
            marginBottom: "12px",
          }}
        >
          Website Questionnaire
        </p>
        <h1
          style={{
            fontFamily: "var(--font-serif)",
            fontWeight: 700,
            fontSize: "clamp(1.75rem, 4vw, 2.5rem)",
            color: "#111110",
            lineHeight: 1.15,
            marginBottom: "14px",
          }}
        >
          How much time do you have?
        </h1>
        <p
          style={{
            fontFamily: "var(--font-sans)",
            fontSize: "16px",
            color: "#555553",
            lineHeight: 1.6,
            maxWidth: "560px",
          }}
        >
          Choose the level of detail that works for you right now. More answers means a more
          accurate website — but we&apos;ll take whatever you can give us.
        </p>
      </div>

      {/* Mode Cards */}
      <div
        style={{
          width: "100%",
          maxWidth: "820px",
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          gap: "16px",
          marginBottom: "40px",
        }}
      >
        {MODES.map((mode) => (
          <div
            key={mode.id}
            style={{
              background: "#ffffff",
              border: `1.5px solid ${mode.highlight ? "#ff3d00" : "#e8e6df"}`,
              borderRadius: "6px",
              padding: "28px 24px",
              display: "flex",
              flexDirection: "column",
              gap: "0",
              position: "relative",
            }}
          >
            {mode.highlight && (
              <div
                style={{
                  position: "absolute",
                  top: "-1px",
                  left: "24px",
                  background: "#ff3d00",
                  color: "#ffffff",
                  fontFamily: "var(--font-mono)",
                  fontSize: "10px",
                  letterSpacing: "0.06em",
                  textTransform: "uppercase",
                  padding: "3px 10px",
                  borderRadius: "0 0 4px 4px",
                }}
              >
                Most common
              </div>
            )}

            {/* Time badge */}
            <div
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: "10px",
                letterSpacing: "0.06em",
                textTransform: "uppercase",
                color: mode.highlight ? "#ff3d00" : "#888886",
                marginBottom: "14px",
                marginTop: mode.highlight ? "10px" : "0",
              }}
            >
              {mode.time}
            </div>

            {/* Name */}
            <h2
              style={{
                fontFamily: "var(--font-serif)",
                fontWeight: 700,
                fontSize: "1.45rem",
                color: "#111110",
                marginBottom: "10px",
              }}
            >
              {mode.name}
            </h2>

            {/* Description */}
            <p
              style={{
                fontFamily: "var(--font-sans)",
                fontSize: "13.5px",
                color: "#555553",
                lineHeight: 1.55,
                marginBottom: "18px",
              }}
            >
              {mode.description}
            </p>

            {/* Bullets */}
            <ul
              style={{
                listStyle: "none",
                padding: 0,
                margin: "0 0 18px 0",
                display: "flex",
                flexDirection: "column",
                gap: "7px",
              }}
            >
              {mode.bullets.map((b, i) => (
                <li
                  key={i}
                  style={{
                    fontFamily: "var(--font-sans)",
                    fontSize: "12.5px",
                    color: "#444442",
                    display: "flex",
                    alignItems: "flex-start",
                    gap: "8px",
                  }}
                >
                  <span style={{ color: "#ff3d00", flexShrink: 0, marginTop: "1px" }}>—</span>
                  {b}
                </li>
              ))}
            </ul>

            {/* Tradeoff */}
            <p
              style={{
                fontFamily: "var(--font-sans)",
                fontSize: "12px",
                color: "#999997",
                lineHeight: 1.5,
                borderTop: "1px solid #f0eeea",
                paddingTop: "14px",
                marginBottom: "22px",
                flexGrow: 1,
              }}
            >
              {mode.tradeoff}
            </p>

            {/* CTA */}
            <button
              onClick={() => onSelect(mode.id)}
              className={mode.highlight ? "btn-orange" : "btn-outline"}
              style={{ width: "100%", fontSize: "13px", padding: "11px" }}
            >
              Start {mode.name} →
            </button>
          </div>
        ))}
      </div>

      {/* Save progress note */}
      <div
        style={{
          width: "100%",
          maxWidth: "820px",
          background: "#f3f1eb",
          border: "1px solid #e8e6df",
          borderRadius: "4px",
          padding: "18px 22px",
          display: "flex",
          alignItems: "flex-start",
          gap: "12px",
        }}
      >
        <span style={{ fontSize: "16px", flexShrink: 0, marginTop: "1px" }}>💾</span>
        <div>
          <p
            style={{
              fontFamily: "var(--font-sans)",
              fontSize: "13.5px",
              color: "#333331",
              fontWeight: 600,
              marginBottom: "4px",
            }}
          >
            You can save your progress and come back later
          </p>
          <p
            style={{
              fontFamily: "var(--font-sans)",
              fontSize: "13px",
              color: "#666664",
              lineHeight: 1.55,
            }}
          >
            At any point in the questionnaire, click <strong>Save progress</strong> and we&apos;ll
            email you a link to continue right where you left off. No account needed.{" "}
            <strong>Resume links are valid for 30 days</strong> — so don&apos;t wait too long
            before coming back.
          </p>
        </div>
      </div>
    </div>
  );
}
