import Link from "next/link";

export function Navbar() {
  return (
    <header style={{
      position: "fixed", top: 0, left: 0, right: 0, zIndex: 50,
      background: "rgba(250,249,245,0.96)",
      borderBottom: "1px solid #e8e6df",
      backdropFilter: "blur(8px)",
      WebkitBackdropFilter: "blur(8px)",
    }}>
      <div className="wrap" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", height: "64px" }}>
        <Link href="/" style={{ fontFamily: "var(--font-serif)", fontWeight: 700, fontSize: "18px", color: "#111110", textDecoration: "none" }}>
          Obsession<span style={{ color: "#ff3d00" }}>.</span>
        </Link>
        <div style={{ display: "flex", alignItems: "center", gap: "32px" }}>
          <Link href="#work" style={{ fontFamily: "var(--font-sans)", fontSize: "14px", color: "#888886", textDecoration: "none" }}>Work</Link>
          <Link href="#process" style={{ fontFamily: "var(--font-sans)", fontSize: "14px", color: "#888886", textDecoration: "none" }}>Process</Link>
        </div>
        <Link href="/start" className="btn-orange" style={{ padding: "9px 20px", fontSize: "13px" }}>
          Get Started
        </Link>
      </div>
    </header>
  );
}
