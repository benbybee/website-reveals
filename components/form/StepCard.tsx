"use client";

import { AnimatePresence, motion } from "framer-motion";

interface StepCardProps {
  icon: string;
  title: string;
  subtitle: string;
  direction: number;
  stepKey: number;
  children: React.ReactNode;
}

export function StepCard({ icon, title, subtitle, direction, stepKey, children }: StepCardProps) {
  return (
    <AnimatePresence mode="wait" custom={direction}>
      <motion.div
        key={stepKey}
        custom={direction}
        initial={{ x: direction > 0 ? 32 : -32, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        exit={{ x: direction > 0 ? -32 : 32, opacity: 0 }}
        transition={{ duration: 0.26, ease: [0.25, 0.46, 0.45, 0.94] }}
      >
        {/* Step header */}
        <div
          style={{
            marginBottom: "40px",
            paddingBottom: "32px",
            borderBottom: "1px solid #e8e6df",
          }}
        >
          <span
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: "10px",
              color: "#ff3d00",
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              display: "block",
              marginBottom: "12px",
            }}
          >
            {subtitle}
          </span>
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <span style={{ fontSize: "22px" }}>{icon}</span>
            <h1
              style={{
                fontFamily: "var(--font-serif)",
                fontWeight: 700,
                fontSize: "clamp(1.5rem, 3vw, 2rem)",
                color: "#111110",
                lineHeight: 1.1,
              }}
            >
              {title}
            </h1>
          </div>
        </div>

        {/* Questions */}
        <div>{children}</div>
      </motion.div>
    </AnimatePresence>
  );
}
