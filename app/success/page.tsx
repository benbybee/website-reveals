import Link from "next/link";

export const metadata = {
  title: "Submitted! — Obsession Marketing",
};

const NEXT_STEPS = [
  "We review your answers and build your custom strategy",
  "You point your domain following the email we sent",
  "We design and build your website (14–21 days)",
  "You review and approve the final site",
  "We launch — you start getting leads",
];

export default function SuccessPage() {
  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "24px",
        background: "#faf9f5",
      }}
    >
      <div style={{ width: "100%", maxWidth: "560px" }}>
        {/* Check */}
        <div
          style={{
            width: "52px",
            height: "52px",
            border: "1.5px solid #e8e6df",
            borderRadius: "50%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            marginBottom: "28px",
            fontSize: "22px",
            color: "#ff3d00",
          }}
        >
          ✓
        </div>

        <p className="eyebrow" style={{ marginBottom: "16px" }}>Questionnaire Submitted</p>

        <h1
          style={{
            fontFamily: "var(--font-serif)",
            fontWeight: 900,
            fontSize: "clamp(2rem, 4vw, 3rem)",
            lineHeight: 1,
            letterSpacing: "-0.02em",
            color: "#111110",
            marginBottom: "16px",
          }}
        >
          You&apos;re all set!
        </h1>

        <p
          style={{
            fontFamily: "var(--font-sans)",
            fontSize: "15px",
            color: "#888886",
            lineHeight: 1.65,
            marginBottom: "8px",
          }}
        >
          Your questionnaire has been submitted. Our team will review your answers and
          reach out within 1–2 business days.
        </p>
        <p
          style={{
            fontFamily: "var(--font-sans)",
            fontSize: "14px",
            color: "#888886",
            lineHeight: 1.65,
            marginBottom: "48px",
          }}
        >
          We also emailed you DNS instructions so you can get your domain pointed when you&apos;re ready.
        </p>

        {/* Divider */}
        <div style={{ borderTop: "1px solid #e8e6df", marginBottom: "36px" }} />

        <h2
          style={{
            fontFamily: "var(--font-serif)",
            fontWeight: 700,
            fontSize: "1.2rem",
            color: "#111110",
            marginBottom: "24px",
          }}
        >
          What happens next
        </h2>

        <ol style={{ listStyle: "none", padding: 0, margin: "0 0 48px" }}>
          {NEXT_STEPS.map((step, i) => (
            <li
              key={i}
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: "16px",
                paddingBottom: "16px",
                marginBottom: "16px",
                borderBottom: i < NEXT_STEPS.length - 1 ? "1px solid #e8e6df" : undefined,
              }}
            >
              <span
                style={{
                  flexShrink: 0,
                  fontFamily: "var(--font-mono)",
                  fontSize: "10px",
                  color: "#ff3d00",
                  border: "1.5px solid #ff3d00",
                  width: "24px",
                  height: "24px",
                  borderRadius: "50%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  marginTop: "1px",
                  letterSpacing: 0,
                }}
              >
                {i + 1}
              </span>
              <span
                style={{
                  fontFamily: "var(--font-sans)",
                  fontSize: "14px",
                  color: "#888886",
                  lineHeight: 1.6,
                }}
              >
                {step}
              </span>
            </li>
          ))}
        </ol>

        <Link
          href="/"
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: "11px",
            letterSpacing: "0.06em",
            color: "#888886",
            textDecoration: "none",
          }}
        >
          ← obsessionmarketing.com
        </Link>
      </div>
    </div>
  );
}
