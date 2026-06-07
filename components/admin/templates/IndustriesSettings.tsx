"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { slugifyIndustry, type TplIndustry } from "@/lib/templates/industries";

export function IndustriesSettings({ initialIndustries }: { initialIndustries: TplIndustry[] }) {
  const router = useRouter();
  const [industries, setIndustries] = useState<TplIndustry[]>(initialIndustries);
  const [name, setName] = useState("");
  const [categories, setCategories] = useState("");
  const [slSlug, setSlSlug] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [removingSlug, setRemovingSlug] = useState<string | null>(null);

  const previewSlug = slugifyIndustry(name);

  async function refresh() {
    const res = await fetch("/api/templates/industries");
    const json = await res.json().catch(() => ({}));
    if (res.ok) setIndustries(json.industries ?? []);
  }

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!name.trim()) return setError("Industry name is required.");
    setBusy(true);
    try {
      const res = await fetch("/api/templates/industries", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ display_name: name.trim(), google_categories: categories, sl_slug: slSlug.trim() || undefined }),
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error === "industry_already_exists" ? `An industry with slug "${json.slug}" already exists.` : json.error || "Failed to add industry");
      }
      setName(""); setCategories(""); setSlSlug("");
      await refresh();
      router.refresh();
    } catch (err) {
      setError(String(err instanceof Error ? err.message : err));
    } finally {
      setBusy(false);
    }
  }

  async function remove(slug: string, displayName: string) {
    if (!confirm(`Remove "${displayName}"? This only works if no campaign uses it.`)) return;
    setRemovingSlug(slug);
    setError(null);
    try {
      const res = await fetch(`/api/templates/industries/${encodeURIComponent(slug)}`, { method: "DELETE" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(json.error === "industry_in_use" ? `Can't remove — ${json.campaigns} campaign(s) still use this industry.` : json.error || "Failed to remove");
      }
      await refresh();
      router.refresh();
    } catch (err) {
      setError(String(err instanceof Error ? err.message : err));
    } finally {
      setRemovingSlug(null);
    }
  }

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
        <Link href="/admin/templates" style={{ fontSize: 13, color: "#888886", textDecoration: "none" }}>← Campaigns</Link>
        <Link href="/admin/templates/mail" style={navBtn}>Mail settings</Link>
      </div>
      <div style={{ marginBottom: 22 }}>
        <h1 style={{ fontFamily: "var(--font-serif)", fontSize: "2rem", fontWeight: 700, marginBottom: 6 }}>Industries</h1>
        <p style={{ fontSize: 14, color: "#555553" }}>
          The service-industry taxonomy campaigns select from. Each row maps a Google Maps search term set to a stable slug
          and an SL template key. Slugs are generated from the name and can&apos;t change once created.
        </p>
      </div>

      <form onSubmit={create} style={card}>
        {error && <div style={errorBox}>{error}</div>}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 14 }}>
          <label style={fieldLabel}>
            Industry name
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Pest Control" style={input} />
            {name.trim() && <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "#888886", marginTop: 4, display: "block" }}>slug: {previewSlug || "—"}</span>}
          </label>
          <label style={fieldLabel}>
            SL template key <span style={{ textTransform: "none", fontWeight: 400, color: "#888886" }}>(optional, defaults to slug)</span>
            <input value={slSlug} onChange={(e) => setSlSlug(e.target.value)} placeholder={previewSlug || "pest-control"} style={input} />
          </label>
        </div>
        <label style={fieldLabel}>
          Google Maps categories <span style={{ textTransform: "none", fontWeight: 400, color: "#888886" }}>(comma-separated search terms)</span>
          <input value={categories} onChange={(e) => setCategories(e.target.value)} placeholder="Pest control service" style={input} />
        </label>
        <button type="submit" disabled={busy} style={{ ...primaryBtn, marginTop: 16 }}>{busy ? "Adding…" : "+ Add industry"}</button>
      </form>

      <div style={{ background: "#fff", border: "1.5px solid #e8e6df", borderRadius: 6, overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: "var(--font-sans)" }}>
          <thead>
            <tr style={{ background: "#f5f4ef", borderBottom: "1.5px solid #e8e6df" }}>
              <th style={th}>Industry</th>
              <th style={th}>Slug</th>
              <th style={th}>Google categories</th>
              <th style={th}>SL key</th>
              <th style={{ ...th, width: 80 }} />
            </tr>
          </thead>
          <tbody>
            {industries.length === 0 && (
              <tr><td colSpan={5} style={{ ...td, textAlign: "center", color: "#888886", padding: 32 }}>No industries yet.</td></tr>
            )}
            {industries.map((ind) => (
              <tr key={ind.slug} style={{ borderTop: "1px solid #f0eeea" }}>
                <td style={{ ...td, fontWeight: 600, color: "#111110" }}>{ind.display_name}</td>
                <td style={{ ...td, fontFamily: "var(--font-mono)", fontSize: 12, color: "#555553" }}>{ind.slug}</td>
                <td style={{ ...td, color: "#555553" }}>{ind.google_categories?.join(", ") || <span style={{ color: "#b3300a" }}>none — falls back to slug</span>}</td>
                <td style={{ ...td, fontFamily: "var(--font-mono)", fontSize: 12, color: "#555553" }}>{ind.sl_slug}</td>
                <td style={{ ...td, textAlign: "right" }}>
                  <button onClick={() => remove(ind.slug, ind.display_name)} disabled={removingSlug === ind.slug} style={ghostBtn}>
                    {removingSlug === ind.slug ? "…" : "Remove"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const th: React.CSSProperties = { padding: "10px 14px", textAlign: "left", fontFamily: "var(--font-mono)", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.06em", color: "#555553", fontWeight: 600 };
const td: React.CSSProperties = { padding: "12px 14px", fontSize: 13, verticalAlign: "middle" };
const card: React.CSSProperties = { background: "#fff", border: "1.5px solid #e8e6df", borderRadius: 6, padding: 20, marginBottom: 22 };
const input: React.CSSProperties = { width: "100%", padding: "8px 10px", border: "1.5px solid #d8d6cf", borderRadius: 4, fontSize: 13, fontFamily: "var(--font-sans)", marginTop: 4 };
const fieldLabel: React.CSSProperties = { fontFamily: "var(--font-mono)", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.05em", color: "#555553", fontWeight: 600, display: "block" };
const primaryBtn: React.CSSProperties = { fontFamily: "var(--font-sans)", fontSize: 13, fontWeight: 600, color: "#fff", background: "#ff3d00", border: "none", borderRadius: 4, padding: "8px 18px", cursor: "pointer" };
const ghostBtn: React.CSSProperties = { fontFamily: "var(--font-sans)", fontSize: 12, fontWeight: 500, color: "#555553", background: "transparent", border: "1.5px solid #d8d6cf", borderRadius: 4, padding: "6px 12px", cursor: "pointer" };
const navBtn: React.CSSProperties = { fontFamily: "var(--font-mono)", fontSize: 12, textTransform: "uppercase", letterSpacing: "0.05em", color: "#555553", textDecoration: "none", border: "1.5px solid #d8d6cf", borderRadius: 3, padding: "6px 14px", fontWeight: 600 };
const errorBox: React.CSSProperties = { background: "#fff0ec", border: "1.5px solid #ffcdc0", color: "#b3300a", padding: "8px 12px", borderRadius: 4, fontSize: 13, marginBottom: 16 };
