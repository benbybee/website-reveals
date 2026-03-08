import { PORTFOLIO_SITES } from "@/lib/portfolio";

export function Portfolio() {
  return (
    <section id="work" style={{ background: "#ffffff", borderTop: "1px solid #e8e6df" }}>
      <div className="wrap" style={{ paddingTop: "80px", paddingBottom: "80px" }}>

        {/* Header */}
        <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginBottom: "48px" }}>
          <p className="eyebrow">Our Work</p>
          <h2 style={{
            fontFamily: "var(--font-serif)",
            fontWeight: 700,
            fontSize: "clamp(2rem, 4vw, 3.2rem)",
            lineHeight: 1,
            letterSpacing: "-0.01em",
            color: "#111110",
          }}>
            Sites we&apos;ve built
          </h2>
        </div>

        {/* Grid */}
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))",
          gap: "2px",
          background: "#e8e6df",
          border: "1px solid #e8e6df",
        }}>
          {PORTFOLIO_SITES.map((site) => (
            <a
              key={site.name}
              href={site.url}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: "block",
                background: "#faf9f5",
                textDecoration: "none",
                position: "relative",
                overflow: "hidden",
              }}
              className="group"
            >
              {/* Screenshot */}
              <div style={{ height: "220px", overflow: "hidden" }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={site.image}
                  alt={site.name}
                  style={{
                    width: "100%",
                    height: "100%",
                    objectFit: "cover",
                    objectPosition: "top",
                    display: "block",
                    transition: "transform 0.5s ease",
                  }}
                  className="group-hover:scale-105"
                />
              </div>

              {/* Hover overlay */}
              <div
                className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-200"
                style={{ background: "rgba(17,17,16,0.65)" }}
              >
                <span style={{
                  fontFamily: "var(--font-sans)",
                  fontWeight: 600,
                  fontSize: "13px",
                  background: "#ff3d00",
                  color: "#ffffff",
                  padding: "9px 20px",
                  borderRadius: "3px",
                }}>
                  View Live Site ↗
                </span>
              </div>

              {/* Footer */}
              <div style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "14px 18px",
                borderTop: "1px solid #e8e6df",
                background: "#ffffff",
              }}>
                <span style={{ fontFamily: "var(--font-sans)", fontSize: "14px", fontWeight: 500, color: "#111110" }}>
                  {site.name}
                </span>
                <span style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: "10px",
                  letterSpacing: "0.1em",
                  textTransform: "uppercase",
                  color: "#888886",
                }}>
                  {site.tag}
                </span>
              </div>
            </a>
          ))}
        </div>
      </div>
    </section>
  );
}
