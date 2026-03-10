import { getPortalSession } from "@/lib/portal-auth";
import { getClientById } from "@/lib/clients";
import Link from "next/link";
import { PortalLogoutButton } from "./PortalLogoutButton";

export default async function PortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getPortalSession();
  let clientName: string | null = null;

  if (session) {
    const client = await getClientById(session.client_id);
    if (client) {
      clientName = `${client.first_name} ${client.last_name}`;
    }
  }

  return (
    <div
      style={{
        backgroundColor: "#111110",
        minHeight: "100vh",
        color: "#e8e6df",
      }}
    >
      {session && (
        <>
          <header
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "16px 24px",
              borderBottom: "1px solid #333",
            }}
          >
            <Link
              href="/portal"
              style={{
                color: "#ff3d00",
                fontSize: "12px",
                textTransform: "uppercase",
                fontFamily:
                  "ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, monospace",
                letterSpacing: "0.08em",
                textDecoration: "none",
                fontWeight: 600,
              }}
            >
              WEBSITE REVEALS
            </Link>
            <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
              {clientName && (
                <span
                  style={{
                    color: "#e8e6df",
                    fontSize: "13px",
                    fontFamily:
                      "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
                  }}
                >
                  {clientName}
                </span>
              )}
              <PortalLogoutButton />
            </div>
          </header>
          <nav
            style={{
              display: "flex",
              gap: "0",
              padding: "0 24px",
              borderBottom: "1px solid #333",
            }}
          >
            <Link
              href="/portal"
              style={{
                padding: "12px 16px",
                fontSize: "13px",
                fontFamily:
                  "ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, monospace",
                textTransform: "uppercase",
                color: "#e8e6df",
                textDecoration: "none",
                borderBottom: "2px solid transparent",
                letterSpacing: "0.04em",
              }}
            >
              Dashboard
            </Link>
            <Link
              href="/portal/tasks"
              style={{
                padding: "12px 16px",
                fontSize: "13px",
                fontFamily:
                  "ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, monospace",
                textTransform: "uppercase",
                color: "#e8e6df",
                textDecoration: "none",
                borderBottom: "2px solid transparent",
                letterSpacing: "0.04em",
              }}
            >
              Tasks
            </Link>
          </nav>
        </>
      )}
      <main
        style={{
          padding: "32px 24px",
          maxWidth: "900px",
          margin: "0 auto",
        }}
      >
        {children}
      </main>
    </div>
  );
}
