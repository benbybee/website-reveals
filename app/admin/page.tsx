import { createServerClient } from "@/lib/supabase/server";
import { createSSRClient } from "@/lib/supabase/server-ssr";
import { SubmissionsTable } from "@/components/admin/SubmissionsTable";
import type { FormSession } from "@/lib/supabase/types";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Admin — Obsession Marketing",
};

export default async function AdminPage() {
  const supabase = createServerClient();
  const ssrClient = await createSSRClient();
  const {
    data: { user },
  } = await ssrClient.auth.getUser();

  const { data: sessions, error } = await supabase
    .from("form_sessions")
    .select("*")
    .not("submitted_at", "is", null)
    .order("submitted_at", { ascending: false });

  if (error) {
    console.error("Failed to fetch submissions:", error);
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#faf9f5",
        padding: "32px 24px 80px",
      }}
    >
      <div style={{ maxWidth: "1100px", margin: "0 auto" }}>
        {/* Header */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: "36px",
            flexWrap: "wrap",
            gap: "16px",
          }}
        >
          <div>
            <p className="eyebrow" style={{ marginBottom: "6px" }}>
              Admin
            </p>
            <h1
              style={{
                fontFamily: "var(--font-serif)",
                fontSize: "clamp(1.5rem, 4vw, 2rem)",
                fontWeight: 700,
                color: "#111110",
              }}
            >
              Submissions
            </h1>
          </div>
          <div
            style={{ display: "flex", alignItems: "center", gap: "16px" }}
          >
            <span
              style={{
                fontFamily: "var(--font-sans)",
                fontSize: "13px",
                color: "#888886",
              }}
            >
              {user?.email}
            </span>
            <form action="/admin/logout" method="POST">
              <button
                type="submit"
                style={{
                  fontFamily: "var(--font-sans)",
                  fontSize: "13px",
                  fontWeight: 500,
                  color: "#888886",
                  background: "transparent",
                  border: "1.5px solid #d8d6cf",
                  borderRadius: "3px",
                  padding: "6px 16px",
                  cursor: "pointer",
                }}
              >
                Sign Out
              </button>
            </form>
          </div>
        </div>

        <SubmissionsTable sessions={(sessions as FormSession[]) || []} />
      </div>
    </div>
  );
}
