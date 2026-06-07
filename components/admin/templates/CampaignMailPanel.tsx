"use client";

import { useEffect, useState } from "react";
import type { PostcardDesign, ReturnAddress } from "@/lib/templates/mail/types";

interface MailPreview {
  eligible: number;
  estimatedCostUsd: number;
  testMode: boolean;
  lobConfigured: boolean;
}

export function CampaignMailPanel({
  campaignId,
  initialDesignId,
  initialAddressId,
}: {
  campaignId: string;
  initialDesignId: string | null;
  initialAddressId: string | null;
}) {
  const [designs, setDesigns] = useState<PostcardDesign[]>([]);
  const [addresses, setAddresses] = useState<ReturnAddress[]>([]);
  const [designId, setDesignId] = useState(initialDesignId ?? "");
  const [addressId, setAddressId] = useState(initialAddressId ?? "");
  const [savingField, setSavingField] = useState<null | "design" | "address">(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const [dRes, aRes] = await Promise.all([
        fetch("/api/templates/postcard-designs"),
        fetch("/api/templates/return-addresses"),
      ]);
      const d = await dRes.json().catch(() => ({}));
      const a = await aRes.json().catch(() => ({}));
      if (dRes.ok) setDesigns(d.designs ?? []);
      if (aRes.ok) setAddresses(a.addresses ?? []);
    })();
  }, []);

  async function assign(field: "design" | "address", value: string) {
    setSavingField(field);
    setMsg(null);
    const body = field === "design" ? { postcard_design_id: value || null } : { return_address_id: value || null };
    try {
      const res = await fetch(`/api/templates/campaigns/${campaignId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Save failed");
    } catch (e) {
      setMsg(`Could not save: ${e instanceof Error ? e.message : e}`);
    } finally {
      setSavingField(null);
    }
  }

  async function mail() {
    setMsg(null);
    setBusy(true);
    try {
      const dryRes = await fetch(`/api/templates/campaigns/${campaignId}/mail`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ dryRun: true }),
      });
      const dry = (await dryRes.json()) as MailPreview & { error?: string };
      if (!dryRes.ok) throw new Error(dry.error || "Preview failed");
      if (dry.eligible === 0) { setMsg("No eligible prospects (need stage=live, mail-ready, not suppressed, not already mailed)."); return; }
      if (!dry.lobConfigured) { setMsg("LOB_API_KEY is not configured on the server."); return; }

      const mode = dry.testMode ? " (TEST mode — no real mail/charge)" : "";
      if (!confirm(`Mail ${dry.eligible} postcard(s) — est. $${dry.estimatedCostUsd.toFixed(2)}${mode}. One card per prospect, ever. Proceed?`)) return;

      const liveRes = await fetch(`/api/templates/campaigns/${campaignId}/mail`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ dryRun: false }),
      });
      const live = await liveRes.json();
      if (!liveRes.ok) throw new Error(live.error || "Mail dispatch failed");
      setMsg(`Mail run dispatched — run ${live.runId}${live.testMode ? " (test mode)" : ""}.`);
    } catch (e) {
      setMsg(`${e instanceof Error ? e.message : e}`);
    } finally {
      setBusy(false);
    }
  }

  const ready = designId && addressId;

  return (
    <div style={panel}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
        <h2 style={{ fontFamily: "var(--font-serif)", fontSize: "1.1rem", fontWeight: 700 }}>Direct mail</h2>
        <span style={{ fontSize: 12, color: "#888886" }}>Postcards to mail-ready prospects (stage = live).</span>
      </div>

      <div style={{ display: "flex", gap: 16, flexWrap: "wrap", alignItems: "flex-end" }}>
        <label style={fieldLabel}>Postcard design
          <select value={designId} disabled={savingField === "design"} onChange={(e) => { setDesignId(e.target.value); assign("design", e.target.value); }} style={select}>
            <option value="">— select —</option>
            {designs.map((d) => <option key={d.id} value={d.id}>{d.name} ({d.size})</option>)}
          </select>
        </label>
        <label style={fieldLabel}>Return address
          <select value={addressId} disabled={savingField === "address"} onChange={(e) => { setAddressId(e.target.value); assign("address", e.target.value); }} style={select}>
            <option value="">— select —</option>
            {addresses.map((a) => <option key={a.id} value={a.id}>{a.label} — {a.name}</option>)}
          </select>
        </label>
        <button onClick={mail} disabled={busy || !ready} style={{ ...mailBtn, opacity: ready && !busy ? 1 : 0.5, cursor: ready && !busy ? "pointer" : "not-allowed" }}>
          {busy ? "Working…" : "Mail this campaign"}
        </button>
      </div>

      {(designs.length === 0 || addresses.length === 0) && (
        <p style={{ fontSize: 12, color: "#b36b00", marginTop: 10 }}>
          {designs.length === 0 && "No designs uploaded. "}{addresses.length === 0 && "No return addresses. "}
          Add them under Mail settings.
        </p>
      )}
      {msg && <div style={msgBox}>{msg}</div>}
    </div>
  );
}

const panel: React.CSSProperties = { background: "#fff", border: "1.5px solid #e8e6df", borderRadius: 6, padding: 18, marginBottom: 18 };
const fieldLabel: React.CSSProperties = { fontFamily: "var(--font-mono)", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.05em", color: "#555553", fontWeight: 600, display: "flex", flexDirection: "column", gap: 4 };
const select: React.CSSProperties = { padding: "8px 10px", border: "1.5px solid #d8d6cf", borderRadius: 4, fontSize: 13, fontFamily: "var(--font-sans)", background: "#fff", minWidth: 220 };
const mailBtn: React.CSSProperties = { fontFamily: "var(--font-sans)", fontSize: 13, fontWeight: 600, color: "#fff", background: "#ff3d00", border: "none", borderRadius: 4, padding: "9px 18px" };
const msgBox: React.CSSProperties = { marginTop: 12, padding: "8px 12px", background: "#f5f4ef", border: "1px solid #e8e6df", borderRadius: 4, fontSize: 13, color: "#555553" };
