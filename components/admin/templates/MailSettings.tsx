"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createBrowserClient } from "@/lib/supabase/client";
import type { PostcardDesign, ReturnAddress, PostcardSize } from "@/lib/templates/mail/types";

const SIZES: PostcardSize[] = ["4x6", "6x9", "6x11"];
const POSTCARD_BUCKET = "tpl-postcards";

// Upload artwork browser->Supabase directly via a signed URL so large
// print-resolution files never hit the serverless function's body cap.
async function uploadArtwork(designName: string, side: "front" | "back", file: File): Promise<string> {
  const signRes = await fetch("/api/templates/postcard-designs/sign-upload", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ designName, side, contentType: file.type }),
  });
  const sign = await signRes.json();
  if (!signRes.ok) throw new Error(sign.error || "Could not sign upload");

  const supa = createBrowserClient();
  const { error } = await supa.storage
    .from(POSTCARD_BUCKET)
    .uploadToSignedUrl(sign.path, sign.token, file, { contentType: file.type, upsert: true });
  if (error) throw new Error(`Storage upload failed: ${error.message}`);
  return sign.publicUrl as string;
}

export function MailSettings({
  initialDesigns,
  initialAddresses,
  lobConfigured,
  testMode,
}: {
  initialDesigns: PostcardDesign[];
  initialAddresses: ReturnAddress[];
  lobConfigured: boolean;
  testMode: boolean;
}) {
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
        <Link href="/admin/templates" style={{ fontSize: 13, color: "#888886", textDecoration: "none" }}>← Template Sites</Link>
        <LobBadge configured={lobConfigured} testMode={testMode} />
      </div>
      <h1 style={{ fontFamily: "var(--font-serif)", fontSize: "1.75rem", fontWeight: 700, marginBottom: 4 }}>Mail settings</h1>
      <p style={{ fontSize: 14, color: "#555553", marginBottom: 24 }}>
        Upload postcard artwork and manage sender addresses. Assign a design + return address to a campaign on its detail page, then mail it.
      </p>

      <DesignsSection initialDesigns={initialDesigns} />
      <div style={{ height: 32 }} />
      <AddressesSection initialAddresses={initialAddresses} />
    </div>
  );
}

function LobBadge({ configured, testMode }: { configured: boolean; testMode: boolean }) {
  if (!configured) {
    return <span style={{ ...pill, color: "#b3300a", borderColor: "#ffcdc0" }}>LOB not configured</span>;
  }
  return testMode
    ? <span style={{ ...pill, color: "#b36b00", borderColor: "#f0d8a0" }}>LOB test mode</span>
    : <span style={{ ...pill, color: "#0a7a3d", borderColor: "#bfe6cd" }}>LOB live</span>;
}

/* ---------------- Postcard designs ---------------- */

function DesignsSection({ initialDesigns }: { initialDesigns: PostcardDesign[] }) {
  const router = useRouter();
  const [designs, setDesigns] = useState(initialDesigns);
  const [showForm, setShowForm] = useState(initialDesigns.length === 0);
  const [name, setName] = useState("");
  const [size, setSize] = useState<PostcardSize>("4x6");
  const [front, setFront] = useState<File | null>(null);
  const [back, setBack] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const designName = name.trim();
    if (!designName) return setError("Name is required.");
    setBusy(true);
    try {
      const front_url = front ? await uploadArtwork(designName, "front", front) : null;
      const back_url = back ? await uploadArtwork(designName, "back", back) : null;
      const res = await fetch("/api/templates/postcard-designs", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: designName, size, front_url, back_url }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Save failed");
      setDesigns((d) => [json.design as PostcardDesign, ...d]);
      setName(""); setFront(null); setBack(null); setShowForm(false);
      router.refresh();
    } catch (err) {
      setError(String(err instanceof Error ? err.message : err));
    } finally {
      setBusy(false);
    }
  }

  async function archive(id: string) {
    if (!confirm("Archive this design? Campaigns still referencing it will lose the assignment.")) return;
    const res = await fetch(`/api/templates/postcard-designs/${id}`, { method: "DELETE" });
    if (res.ok) setDesigns((d) => d.filter((x) => x.id !== id));
  }

  return (
    <section>
      <div style={sectionHead}>
        <h2 style={sectionTitle}>Postcard designs</h2>
        <button onClick={() => setShowForm((v) => !v)} style={primaryBtn}>{showForm ? "Cancel" : "+ Upload design"}</button>
      </div>

      {showForm && (
        <form onSubmit={submit} style={card}>
          {error && <div style={errorBox}>{error}</div>}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 140px", gap: 16, marginBottom: 16 }}>
            <label style={fieldLabel}>Name<input value={name} onChange={(e) => setName(e.target.value)} placeholder="Spring promo 4x6" style={input} /></label>
            <label style={fieldLabel}>Size
              <select value={size} onChange={(e) => setSize(e.target.value as PostcardSize)} style={input}>
                {SIZES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </label>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
            <label style={fieldLabel}>Front (PNG/JPG/PDF)<input type="file" accept="image/png,image/jpeg,application/pdf" onChange={(e) => setFront(e.target.files?.[0] ?? null)} style={fileInput} /></label>
            <label style={fieldLabel}>Back (PNG/JPG/PDF)<input type="file" accept="image/png,image/jpeg,application/pdf" onChange={(e) => setBack(e.target.files?.[0] ?? null)} style={fileInput} /></label>
          </div>
          <p style={hintText}>
            For per-prospect tracking the back artwork must be an HTML template using merge fields
            (<code style={code}>{"{{preview_url}}"}</code>, <code style={code}>{"{{qr_url}}"}</code>, <code style={code}>{"{{business_name}}"}</code>).
            A flat image will mail identically to every prospect.
          </p>
          <button type="submit" disabled={busy} style={primaryBtn}>{busy ? "Uploading…" : "Save design"}</button>
        </form>
      )}

      <div style={grid}>
        {designs.length === 0 && <div style={emptyCell}>No designs yet.</div>}
        {designs.map((d) => (
          <div key={d.id} style={designCard}>
            <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
              <Thumb url={d.front_url} label="front" />
              <Thumb url={d.back_url} label="back" />
            </div>
            <div style={{ fontWeight: 600, fontSize: 13, color: "#111110" }}>{d.name}</div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "#888886" }}>{d.size}</div>
            <button onClick={() => archive(d.id)} style={{ ...ghostBtn, marginTop: 8, fontSize: 11 }}>Archive</button>
          </div>
        ))}
      </div>
    </section>
  );
}

function Thumb({ url, label }: { url: string | null; label: string }) {
  if (!url) return <div style={{ ...thumb, display: "flex", alignItems: "center", justifyContent: "center", color: "#bbb", fontSize: 10 }}>no {label}</div>;
  const isPdf = url.toLowerCase().endsWith(".pdf");
  if (isPdf) return <a href={url} target="_blank" rel="noreferrer" style={{ ...thumb, display: "flex", alignItems: "center", justifyContent: "center", color: "#0a4a7a", fontSize: 10, textDecoration: "none" }}>PDF {label}</a>;
  // eslint-disable-next-line @next/next/no-img-element
  return <a href={url} target="_blank" rel="noreferrer"><img src={url} alt={label} style={thumb} /></a>;
}

/* ---------------- Return addresses ---------------- */

const BLANK_ADDR = { label: "", name: "", address_line1: "", address_line2: "", city: "", state: "", zip: "", country: "US", is_default: false };

function AddressesSection({ initialAddresses }: { initialAddresses: ReturnAddress[] }) {
  const router = useRouter();
  const [addresses, setAddresses] = useState(initialAddresses);
  const [showForm, setShowForm] = useState(initialAddresses.length === 0);
  const [form, setForm] = useState({ ...BLANK_ADDR });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function set<K extends keyof typeof form>(k: K, v: (typeof form)[K]) { setForm((f) => ({ ...f, [k]: v })); }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!form.label.trim() || !form.name.trim() || !form.address_line1.trim() || !form.city.trim() || !form.state.trim() || !form.zip.trim()) {
      return setError("Label, name, street, city, state, and zip are required.");
    }
    setBusy(true);
    try {
      const res = await fetch("/api/templates/return-addresses", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(form),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Save failed");
      setAddresses((a) => [json.address as ReturnAddress, ...a.map((x) => form.is_default ? { ...x, is_default: false } : x)]);
      setForm({ ...BLANK_ADDR }); setShowForm(false);
      router.refresh();
    } catch (err) {
      setError(String(err instanceof Error ? err.message : err));
    } finally {
      setBusy(false);
    }
  }

  async function makeDefault(id: string) {
    const res = await fetch(`/api/templates/return-addresses/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ is_default: true }),
    });
    if (res.ok) setAddresses((a) => a.map((x) => ({ ...x, is_default: x.id === id })));
  }

  async function archive(id: string) {
    if (!confirm("Archive this address?")) return;
    const res = await fetch(`/api/templates/return-addresses/${id}`, { method: "DELETE" });
    if (res.ok) setAddresses((a) => a.filter((x) => x.id !== id));
  }

  return (
    <section>
      <div style={sectionHead}>
        <h2 style={sectionTitle}>Return addresses</h2>
        <button onClick={() => setShowForm((v) => !v)} style={primaryBtn}>{showForm ? "Cancel" : "+ Add address"}</button>
      </div>

      {showForm && (
        <form onSubmit={submit} style={card}>
          {error && <div style={errorBox}>{error}</div>}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 12 }}>
            <label style={fieldLabel}>Label<input value={form.label} onChange={(e) => set("label", e.target.value)} placeholder="HQ" style={input} /></label>
            <label style={fieldLabel}>Sender name<input value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="Website Reveals" style={input} /></label>
          </div>
          <label style={fieldLabel}>Street<input value={form.address_line1} onChange={(e) => set("address_line1", e.target.value)} style={input} /></label>
          <label style={fieldLabel}>Street 2 (optional)<input value={form.address_line2} onChange={(e) => set("address_line2", e.target.value)} style={input} /></label>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 90px 120px 90px", gap: 12, margin: "12px 0" }}>
            <label style={fieldLabel}>City<input value={form.city} onChange={(e) => set("city", e.target.value)} style={input} /></label>
            <label style={fieldLabel}>State<input value={form.state} onChange={(e) => set("state", e.target.value.toUpperCase().slice(0, 2))} maxLength={2} placeholder="AZ" style={input} /></label>
            <label style={fieldLabel}>Zip<input value={form.zip} onChange={(e) => set("zip", e.target.value)} style={input} /></label>
            <label style={fieldLabel}>Country<input value={form.country} onChange={(e) => set("country", e.target.value.toUpperCase().slice(0, 2))} maxLength={2} style={input} /></label>
          </div>
          <label style={{ display: "flex", alignItems: "center", gap: 8, margin: "8px 0 16px", fontSize: 13, color: "#555553" }}>
            <input type="checkbox" checked={form.is_default} onChange={(e) => set("is_default", e.target.checked)} />
            Set as default sender
          </label>
          <button type="submit" disabled={busy} style={primaryBtn}>{busy ? "Saving…" : "Save address"}</button>
        </form>
      )}

      <div style={{ background: "#fff", border: "1.5px solid #e8e6df", borderRadius: 6, overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: "var(--font-sans)" }}>
          <thead>
            <tr style={{ background: "#f5f4ef", borderBottom: "1.5px solid #e8e6df" }}>
              <th style={th}>Label</th><th style={th}>Sender</th><th style={th}>Address</th><th style={{ ...th, width: 160 }} />
            </tr>
          </thead>
          <tbody>
            {addresses.length === 0 && <tr><td colSpan={4} style={{ ...td, textAlign: "center", color: "#888886", padding: 24 }}>No addresses yet.</td></tr>}
            {addresses.map((a) => (
              <tr key={a.id} style={{ borderTop: "1px solid #f0eeea" }}>
                <td style={td}>
                  <span style={{ fontWeight: 600 }}>{a.label}</span>
                  {a.is_default && <span style={{ ...pill, marginLeft: 8, color: "#0a7a3d", borderColor: "#bfe6cd" }}>default</span>}
                </td>
                <td style={{ ...td, color: "#555553" }}>{a.name}</td>
                <td style={{ ...td, color: "#555553", fontSize: 12 }}>{[a.address_line1, a.city, a.state, a.zip].filter(Boolean).join(", ")}</td>
                <td style={{ ...td, textAlign: "right", whiteSpace: "nowrap" }}>
                  {!a.is_default && <button onClick={() => makeDefault(a.id)} style={ghostBtn}>Make default</button>}
                  <button onClick={() => archive(a.id)} style={{ ...ghostBtn, marginLeft: 6 }}>Archive</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

const sectionHead: React.CSSProperties = { display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 };
const sectionTitle: React.CSSProperties = { fontFamily: "var(--font-serif)", fontSize: "1.25rem", fontWeight: 700 };
const grid: React.CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 14 };
const designCard: React.CSSProperties = { background: "#fff", border: "1.5px solid #e8e6df", borderRadius: 6, padding: 12 };
const thumb: React.CSSProperties = { width: "100%", height: 80, objectFit: "cover", borderRadius: 4, border: "1px solid #e8e6df", background: "#f5f4ef" };
const emptyCell: React.CSSProperties = { gridColumn: "1 / -1", textAlign: "center", color: "#888886", padding: 24, fontSize: 13, background: "#fff", border: "1.5px solid #e8e6df", borderRadius: 6 };
const th: React.CSSProperties = { padding: "9px 12px", textAlign: "left", fontFamily: "var(--font-mono)", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.05em", color: "#555553", fontWeight: 600 };
const td: React.CSSProperties = { padding: "10px 12px", fontSize: 13, verticalAlign: "middle" };
const card: React.CSSProperties = { background: "#fff", border: "1.5px solid #e8e6df", borderRadius: 6, padding: 20, marginBottom: 18 };
const input: React.CSSProperties = { width: "100%", padding: "8px 10px", border: "1.5px solid #d8d6cf", borderRadius: 4, fontSize: 13, fontFamily: "var(--font-sans)", marginTop: 4, boxSizing: "border-box" };
const fileInput: React.CSSProperties = { display: "block", marginTop: 4, fontSize: 12 };
const fieldLabel: React.CSSProperties = { fontFamily: "var(--font-mono)", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.05em", color: "#555553", fontWeight: 600, display: "block" };
const primaryBtn: React.CSSProperties = { fontFamily: "var(--font-sans)", fontSize: 13, fontWeight: 600, color: "#fff", background: "#ff3d00", border: "none", borderRadius: 4, padding: "8px 16px", cursor: "pointer" };
const ghostBtn: React.CSSProperties = { fontFamily: "var(--font-sans)", fontSize: 12, fontWeight: 500, color: "#555553", background: "#fff", border: "1.5px solid #d8d6cf", borderRadius: 4, padding: "5px 10px", cursor: "pointer" };
const errorBox: React.CSSProperties = { background: "#fff0ec", border: "1.5px solid #ffcdc0", color: "#b3300a", padding: "8px 12px", borderRadius: 4, fontSize: 13, marginBottom: 16 };
const pill: React.CSSProperties = { fontFamily: "var(--font-mono)", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.05em", border: "1.5px solid #d8d6cf", borderRadius: 10, padding: "2px 8px", fontWeight: 600 };
const hintText: React.CSSProperties = { fontSize: 12, color: "#888886", lineHeight: 1.5, margin: "0 0 16px" };
const code: React.CSSProperties = { fontFamily: "var(--font-mono)", fontSize: 11, background: "#f5f4ef", padding: "1px 4px", borderRadius: 3, color: "#b3300a" };
