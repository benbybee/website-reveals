import Link from "next/link";

export function FinalCTA() {
  return (
    <section style={{ background: "#111110", padding: "96px 0" }}>
      <div className="wrap">
        <p className="eyebrow" style={{ color: "#ff3d00", marginBottom: "24px" }}>
          Ready to Start?
        </p>
        <h2 style={{
          fontFamily: "var(--font-serif)",
          fontWeight: 900,
          fontSize: "clamp(2.8rem, 6vw, 5.5rem)",
          lineHeight: 0.92,
          letterSpacing: "-0.02em",
          color: "#faf9f5",
          marginBottom: "40px",
          maxWidth: "700px",
        }}>
          Let&apos;s build a site that actually grows your business.
        </h2>
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "20px" }}>
          <Link href="/start" className="btn-orange" style={{ fontSize: "15px", padding: "15px 36px" }}>
            Start the Questionnaire →
          </Link>
          <span style={{
            fontFamily: "var(--font-mono)",
            fontSize: "12px",
            color: "#888886",
            letterSpacing: "0.05em",
          }}>
            ~20 min · save anytime · no account needed
          </span>
        </div>
      </div>
    </section>
  );
}
