import Link from "next/link";

export function Footer() {
  return (
    <footer style={{ background: "#111110", borderTop: "1px solid #1f1f1e", padding: "40px 0" }}>
      <div className="wrap" style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: "24px" }}>
        <Link href="/" style={{ fontFamily: "var(--font-serif)", fontWeight: 700, fontSize: "16px", color: "#faf9f5", textDecoration: "none" }}>
          Obsession<span style={{ color: "#ff3d00" }}>.</span>
        </Link>

        <div style={{ display: "flex", flexWrap: "wrap", gap: "24px" }}>
          {[
            { label: "Work", href: "#work" },
            { label: "Process", href: "#process" },
            { label: "Start a Project", href: "/start" },
            { label: "obsessionmarketing.com ↗", href: "https://obsessionmarketing.com", external: true },
          ].map((link) => (
            <a
              key={link.label}
              href={link.href}
              {...(link.external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
              style={{ fontFamily: "var(--font-sans)", fontSize: "13px", color: "#888886", textDecoration: "none" }}
            >
              {link.label}
            </a>
          ))}
        </div>

        <p style={{ fontFamily: "var(--font-mono)", fontSize: "11px", color: "#444442" }}>
          © {new Date().getFullYear()} Obsession Marketing
        </p>
      </div>
    </footer>
  );
}
