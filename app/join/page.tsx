import { notFound } from "next/navigation";
import { templatesEnabled } from "@/lib/templates/config";
import { FindYourSite } from "@/components/templates/FindYourSite";

export const dynamic = "force-dynamic";
export const metadata = { title: "Find your website" };

export default function JoinPage() {
  if (!templatesEnabled()) notFound();
  return (
    <main style={{ minHeight: "100vh", background: "#faf9f5", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div style={{ width: "100%", maxWidth: 460 }}>
        <h1 style={{ fontFamily: "var(--font-serif)", fontSize: "1.75rem", fontWeight: 700, marginBottom: 8 }}>
          Find your website
        </h1>
        <p style={{ fontSize: 14, color: "#555553", marginBottom: 20 }}>
          Enter your business name and the ZIP code on your postcard to see the site we built for you.
        </p>
        <FindYourSite />
      </div>
    </main>
  );
}
