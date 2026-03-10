import { getPortalSession } from "@/lib/portal-auth";
import { getClientById } from "@/lib/clients";
import { getClientTaskCounts } from "@/lib/tasks";
import { redirect } from "next/navigation";
import type { TaskStatus } from "@/lib/types/client-tasks";

const STATUS_CONFIG: Record<
  TaskStatus,
  { label: string; color: string }
> = {
  backlog: { label: "Backlog", color: "#888886" },
  in_progress: { label: "In Progress", color: "#2196f3" },
  blocked: { label: "Blocked", color: "#ff6b35" },
  complete: { label: "Complete", color: "#4caf50" },
};

const STATUS_ORDER: TaskStatus[] = [
  "backlog",
  "in_progress",
  "blocked",
  "complete",
];

export default async function PortalDashboard() {
  const session = await getPortalSession();
  if (!session) redirect("/portal/login");

  const client = await getClientById(session.client_id);
  if (!client) redirect("/portal/login");

  const counts = await getClientTaskCounts(session.client_id);

  return (
    <div>
      <h1
        style={{
          fontSize: "28px",
          fontFamily: "Georgia, 'Times New Roman', serif",
          color: "#e8e6df",
          fontWeight: 400,
          margin: "0 0 4px 0",
        }}
      >
        Welcome, {client.first_name}
      </h1>
      <p
        style={{
          fontSize: "14px",
          color: "#888886",
          margin: "0 0 32px 0",
        }}
      >
        {client.company_name}
      </p>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, 1fr)",
          gap: "12px",
        }}
      >
        {STATUS_ORDER.map((status) => {
          const config = STATUS_CONFIG[status];
          return (
            <div
              key={status}
              style={{
                backgroundColor: "#1a1a19",
                border: "1px solid #333",
                borderRadius: "6px",
                padding: "20px",
              }}
            >
              <div
                style={{
                  fontSize: "11px",
                  fontFamily:
                    "ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, monospace",
                  textTransform: "uppercase",
                  color: config.color,
                  letterSpacing: "0.04em",
                  marginBottom: "8px",
                }}
              >
                {config.label}
              </div>
              <div
                style={{
                  fontSize: "36px",
                  fontWeight: 700,
                  color: "#e8e6df",
                  lineHeight: 1,
                }}
              >
                {counts[status]}
              </div>
            </div>
          );
        })}
      </div>

      {/* Responsive override for small screens */}
      <style>{`
        @media (max-width: 640px) {
          div[style*="grid-template-columns: repeat(4"] {
            grid-template-columns: repeat(2, 1fr) !important;
          }
        }
      `}</style>
    </div>
  );
}
