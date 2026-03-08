import Link from "next/link";

const STATS = [
  { n: "47+", label: "Sites Built" },
  { n: "100%", label: "US-Based" },
  { n: "5.0★", label: "Client Rated" },
  { n: "14–21", label: "Days to Launch" },
];

export function Hero() {
  return (
    <section style={{ background: "#faf9f5", paddingTop: "64px" }}>
      <div className="wrap" style={{ paddingTop: "80px", paddingBottom: "0" }}>
        {/* Eyebrow */}
        <p className="eyebrow" style={{ marginBottom: "28px" }}>Web Design &amp; Development</p>

        {/* Headline */}
        <h1
          style={{
            fontFamily: "var(--font-serif)",
            fontWeight: 900,
            fontSize: "clamp(3.2rem, 7vw, 7rem)",
            lineHeight: 0.9,
            letterSpacing: "-0.025em",
            color: "#111110",
            marginBottom: "36px",
            maxWidth: "900px",
          }}
        >
          Websites that<br />
          win customers<br />
          <span style={{ color: "#ff3d00" }}>for your business.</span>
        </h1>

        {/* Sub */}
        <p
          style={{
            fontFamily: "var(--font-sans)",
            fontSize: "clamp(1rem, 1.5vw, 1.15rem)",
            color: "#888886",
            lineHeight: 1.65,
            maxWidth: "480px",
            marginBottom: "44px",
          }}
        >
          We design and build custom websites for small businesses — no templates,
          no shortcuts. Just sites that look great, load fast, and turn visitors into leads.
        </p>

        {/* CTAs */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: "12px", marginBottom: "72px" }}>
          <Link href="/start" className="btn-orange" style={{ fontSize: "15px", padding: "14px 36px" }}>
            Start the Questionnaire →
          </Link>
          <Link href="#work" className="btn-outline" style={{ fontSize: "15px", padding: "14px 28px" }}>
            See Our Work
          </Link>
        </div>
      </div>

      {/* Stats bar — full width */}
      <div
        style={{
          borderTop: "1px solid #e8e6df",
          borderBottom: "1px solid #e8e6df",
          background: "#ffffff",
        }}
      >
        <div className="wrap">
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(4, 1fr)",
            }}
          >
            {STATS.map((s, i) => (
              <div
                key={s.label}
                style={{
                  padding: "28px 24px",
                  borderLeft: i > 0 ? "1px solid #e8e6df" : undefined,
                }}
              >
                <div
                  style={{
                    fontFamily: "var(--font-serif)",
                    fontWeight: 900,
                    fontSize: "clamp(1.8rem, 3vw, 2.6rem)",
                    color: "#111110",
                    lineHeight: 1,
                    marginBottom: "6px",
                  }}
                >
                  {s.n}
                </div>
                <div
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: "10px",
                    letterSpacing: "0.12em",
                    textTransform: "uppercase",
                    color: "#888886",
                  }}
                >
                  {s.label}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
