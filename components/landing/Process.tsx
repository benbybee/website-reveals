const STEPS = [
  { n: "01", title: "Discovery", desc: "Fill out our detailed questionnaire about your business, customers, competitors, and goals. We read every word." },
  { n: "02", title: "Design", desc: "We design a custom site around your brand and customers. No templates. You review and approve before we build." },
  { n: "03", title: "Build", desc: "Fast, mobile-first build on a platform that loads in under 2 seconds and is optimized for local SEO." },
  { n: "04", title: "Launch", desc: "We handle DNS, go-live checklist, and final QA. Your site is live and ready to bring in customers in 14–21 days." },
];

export function Process() {
  return (
    <section id="process" style={{ background: "#faf9f5", borderTop: "1px solid #e8e6df" }}>
      <div className="wrap" style={{ paddingTop: "80px", paddingBottom: "80px" }}>

        {/* Header */}
        <div style={{ marginBottom: "56px" }}>
          <p className="eyebrow" style={{ marginBottom: "12px" }}>How It Works</p>
          <h2 style={{
            fontFamily: "var(--font-serif)",
            fontWeight: 700,
            fontSize: "clamp(2rem, 4vw, 3.2rem)",
            lineHeight: 1,
            letterSpacing: "-0.01em",
            color: "#111110",
            maxWidth: "480px",
          }}>
            Brief to live site in 4 steps
          </h2>
        </div>

        {/* Steps */}
        <div style={{ display: "flex", flexDirection: "column", gap: "0" }}>
          {STEPS.map((step, i) => (
            <div
              key={step.n}
              style={{
                display: "grid",
                gridTemplateColumns: "80px 1fr",
                gap: "32px",
                padding: "36px 0",
                borderTop: i === 0 ? "1px solid #e8e6df" : undefined,
                borderBottom: "1px solid #e8e6df",
                alignItems: "start",
              }}
            >
              <div style={{
                fontFamily: "var(--font-serif)",
                fontWeight: 700,
                fontSize: "clamp(2rem, 3vw, 2.8rem)",
                color: "#e8e6df",
                lineHeight: 1,
                paddingTop: "4px",
              }}>
                {step.n}
              </div>
              <div>
                <h3 style={{
                  fontFamily: "var(--font-serif)",
                  fontWeight: 700,
                  fontSize: "1.3rem",
                  color: "#111110",
                  marginBottom: "8px",
                }}>
                  {step.title}
                </h3>
                <p style={{
                  fontFamily: "var(--font-sans)",
                  fontSize: "15px",
                  color: "#888886",
                  lineHeight: 1.65,
                  maxWidth: "560px",
                }}>
                  {step.desc}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
