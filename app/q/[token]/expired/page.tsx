import Link from "next/link";

export const metadata = {
  title: "Link Expired — Obsession Marketing",
};

export default function ExpiredPage() {
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
      <div style={{ width: "100%", maxWidth: "440px" }}>
        <p className="eyebrow" style={{ marginBottom: "20px" }}>Link Expired</p>

        <h1
          style={{
            fontFamily: "var(--font-serif)",
            fontWeight: 900,
            fontSize: "clamp(1.8rem, 3.5vw, 2.6rem)",
            lineHeight: 1,
            letterSpacing: "-0.02em",
            color: "#111110",
            marginBottom: "16px",
          }}
        >
          Your link has expired
        </h1>

        <p
          style={{
            fontFamily: "var(--font-sans)",
            fontSize: "14px",
            color: "#888886",
            lineHeight: 1.65,
            marginBottom: "36px",
          }}
        >
          Resume links are valid for 30 days. This one has expired. Start a new
          questionnaire and we&apos;ll save your progress with a fresh link.
        </p>

        <Link href="/start" className="btn-orange" style={{ fontSize: "14px", padding: "12px 28px" }}>
          Start New Questionnaire →
        </Link>
      </div>
    </div>
  );
}
