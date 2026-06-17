"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { slugify, isValidSlug } from "@/lib/templates/normalize/slug";

export interface SalesProspect {
  id: string;
  business_name: string | null;
  city: string | null;
  state: string | null;
  phone: string | null;
  website: string | null;
  stage: string;
  agent_id: string | null;
  preview_url: string | null;
  lookup_count: number;
  last_looked_up_at: string | null;
  click_count: number;
  last_clicked_at: string | null;
  call_count: number;
  last_called_at: string | null;
  sold_at: string | null;
  campaign_id: string | null;
}

export function SalesBoard({
  prospects,
  userEmail,
  stages,
  campaigns = [],
}: {
  prospects: SalesProspect[];
  userEmail: string;
  stages: string[];
  campaigns?: { id: string; label: string }[];
}) {
  const router = useRouter();
  const [mineOnly, setMineOnly] = useState(false);
  const [engagedFirst, setEngagedFirst] = useState(false);
  const [campaignFilter, setCampaignFilter] = useState("");
  const [soldFilter, setSoldFilter] = useState(""); // "" | "sold" | "unsold"
  const [engagementFilter, setEngagementFilter] = useState(""); // "" | "looked_up" | "opened"
  const [busyId, setBusyId] = useState<string | null>(null);
  const [convertFor, setConvertFor] = useState<SalesProspect | null>(null);
  const [callFor, setCallFor] = useState<SalesProspect | null>(null);

  const filtered = prospects.filter((p) => {
    if (mineOnly && p.agent_id !== userEmail) return false;
    if (campaignFilter && p.campaign_id !== campaignFilter) return false;
    if (soldFilter === "sold" && !p.sold_at) return false;
    if (soldFilter === "unsold" && p.sold_at) return false;
    if (engagementFilter === "looked_up" && p.lookup_count <= 0) return false;
    if (engagementFilter === "opened" && p.click_count <= 0) return false;
    return true;
  });
  // "Engaged first" surfaces the prospects most likely to convert — those who
  // opened their preview site. Sort by click_count desc, then most-recent click.
  const visible = engagedFirst
    ? [...filtered].sort((a, b) => {
        if (b.click_count !== a.click_count) return b.click_count - a.click_count;
        return (b.last_clicked_at ?? "").localeCompare(a.last_clicked_at ?? "");
      })
    : filtered;

  async function setStage(id: string, stage: string) {
    setBusyId(id);
    try {
      await fetch(`/api/templates/prospects/${id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ stage, agent_id: userEmail }),
      });
      router.refresh();
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
        <Link href="/admin/templates" style={{ fontSize: 13, color: "#888886", textDecoration: "none" }}>← Template Sites</Link>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "#555553" }}>
            <input type="checkbox" checked={engagedFirst} onChange={(e) => setEngagedFirst(e.target.checked)} />
            Engaged first
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "#555553" }}>
            <input type="checkbox" checked={mineOnly} onChange={(e) => setMineOnly(e.target.checked)} />
            My prospects only
          </label>
        </div>
      </div>
      <h1 style={{ fontFamily: "var(--font-serif)", fontSize: "1.75rem", fontWeight: 700, marginBottom: 14 }}>Sales board</h1>

      <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
        <select value={campaignFilter} onChange={(e) => setCampaignFilter(e.target.value)} style={filterSel}>
          <option value="">All campaigns / industries</option>
          {campaigns.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
        </select>
        <select value={soldFilter} onChange={(e) => setSoldFilter(e.target.value)} style={filterSel}>
          <option value="">Any sold status</option>
          <option value="sold">Sold</option>
          <option value="unsold">Not sold</option>
        </select>
        <select value={engagementFilter} onChange={(e) => setEngagementFilter(e.target.value)} style={filterSel}>
          <option value="">Any engagement</option>
          <option value="looked_up">Looked up</option>
          <option value="opened">Opened site</option>
        </select>
        <span style={{ fontSize: 12, color: "#888886", alignSelf: "center" }}>{visible.length} shown</span>
      </div>

      <div style={{ background: "#fff", border: "1.5px solid #e8e6df", borderRadius: 6, overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: "var(--font-sans)" }}>
          <thead>
            <tr style={{ background: "#f5f4ef", borderBottom: "1.5px solid #e8e6df" }}>
              <th style={th}>Business</th>
              <th style={th}>Location</th>
              <th style={th}>Phone</th>
              <th style={{ ...th, width: 80 }}>Looked up</th>
              <th style={{ ...th, width: 70 }}>Opened</th>
              <th style={{ ...th, width: 70 }}>Calls</th>
              <th style={th}>Preview</th>
              <th style={th}>Agent</th>
              <th style={{ ...th, width: 90 }}>Sold</th>
              <th style={{ ...th, width: 160 }}>Stage</th>
              <th style={{ ...th, width: 90 }} />
            </tr>
          </thead>
          <tbody>
            {visible.length === 0 && <tr><td colSpan={11} style={{ ...td, textAlign: "center", color: "#888886", padding: 28 }}>No prospects in the sales funnel.</td></tr>}
            {visible.map((p) => (
              <tr key={p.id} style={{ borderTop: "1px solid #f0eeea" }}>
                <td style={td}>
                  <span style={{ fontWeight: 600, color: "#111110" }}>{p.business_name || "—"}</span>
                </td>
                <td style={{ ...td, color: "#555553" }}>{[p.city, p.state].filter(Boolean).join(", ") || "—"}</td>
                <td style={td}>
                  {p.phone ? <a href={`tel:${p.phone}`} style={{ color: "#ff3d00", textDecoration: "none", fontFamily: "var(--font-mono)", fontSize: 12 }}>{p.phone}</a> : <span style={{ color: "#bbb" }}>—</span>}
                </td>
                <td style={{ ...td, textAlign: "center" }}><EngageBadge count={p.lookup_count} at={p.last_looked_up_at} glyph="🔍" tone="muted" title="Looked up" /></td>
                <td style={{ ...td, textAlign: "center" }}><EngageBadge count={p.click_count} at={p.last_clicked_at} glyph="▶" tone="green" title="Opened site" /></td>
                <td style={{ ...td, textAlign: "center" }}><CallBadge count={p.call_count} lastCalledAt={p.last_called_at} /></td>
                <td style={td}>
                  {p.preview_url ? <a href={p.preview_url} target="_blank" rel="noreferrer" style={{ color: "#0a4a7a", fontSize: 12 }}>view →</a> : <span style={{ color: "#bbb", fontSize: 12 }}>—</span>}
                </td>
                <td style={{ ...td, fontSize: 11, color: "#888886", fontFamily: "var(--font-mono)" }}>{p.agent_id || "unassigned"}</td>
                <td style={{ ...td, textAlign: "center" }}><SoldBadge soldAt={p.sold_at} /></td>
                <td style={td}>
                  {p.stage === "converted" ? (
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, fontWeight: 600, color: "#1a7a3a" }}>converted ✓</span>
                  ) : (
                    <select value={stages.includes(p.stage) ? p.stage : ""} disabled={busyId === p.id} onChange={(e) => setStage(p.id, e.target.value)} style={{ padding: "5px 8px", border: "1.5px solid #d8d6cf", borderRadius: 4, fontSize: 12, fontFamily: "var(--font-mono)", background: "#fff" }}>
                      {!stages.includes(p.stage) && <option value="" disabled>{p.stage}</option>}
                      {stages.map((s) => <option key={s} value={s}>{s}</option>)}
                    </select>
                  )}
                </td>
                <td style={{ ...td, textAlign: "right", whiteSpace: "nowrap" }}>
                  {p.stage === "live" && (
                    <button onClick={() => setConvertFor(p)} style={convertBtn}>Convert</button>
                  )}
                  <button onClick={() => setCallFor(p)} style={ghostBtn}>Log call</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {convertFor && (
        <ConvertModal
          prospect={convertFor}
          agentEmail={userEmail}
          onClose={() => setConvertFor(null)}
          onConverted={() => {
            setConvertFor(null);
            router.refresh();
          }}
        />
      )}

      {callFor && (
        <LogCallModal
          prospect={callFor}
          agentEmail={userEmail}
          onClose={() => setCallFor(null)}
          onLogged={() => {
            setCallFor(null);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}

function EngageBadge({ count, at, glyph, tone, title }: { count: number; at: string | null; glyph: string; tone: "green" | "muted"; title: string }) {
  if (count <= 0) return <span style={{ color: "#c9c7c0", fontSize: 12 }} title={`No ${title.toLowerCase()} yet`}>—</span>;
  const when = at ? new Date(at).toLocaleDateString() : "";
  const c = tone === "green"
    ? { color: "#0a7a3d", background: "#e7f5ec", border: "1px solid #b7e0c4" }
    : { color: "#555553", background: "#f0eeea", border: "1px solid #d8d6cf" };
  return (
    <span title={`${title} ${count}×${when ? ` — last ${when}` : ""}`}
      style={{ display: "inline-block", fontFamily: "var(--font-mono)", fontSize: 12, fontWeight: 600, borderRadius: 4, padding: "2px 6px", ...c }}>
      {glyph} {count}
    </span>
  );
}

/** Sold pill — green "SOLD" with the sold date on hover, em-dash when not sold.
 * A rep sets this from their portal; the operator converts later. */
function SoldBadge({ soldAt }: { soldAt: string | null }) {
  if (!soldAt) return <span style={{ color: "#c9c7c0", fontSize: 12 }} title="Not sold yet">—</span>;
  const when = new Date(soldAt).toLocaleDateString();
  return (
    <span title={`Marked sold ${when}`}
      style={{ display: "inline-block", fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700, color: "#fff", background: "#1a7a3a", padding: "3px 7px", borderRadius: 3, textTransform: "uppercase", letterSpacing: "0.04em" }}>
      sold
    </span>
  );
}

/** Call-count pill with last-called date on hover. */
function CallBadge({ count, lastCalledAt }: { count: number; lastCalledAt: string | null }) {
  if (count <= 0) return <span style={{ color: "#c9c7c0", fontSize: 12 }} title="Not called yet">—</span>;
  const when = lastCalledAt ? new Date(lastCalledAt).toLocaleDateString() : "";
  return (
    <span
      title={`Called ${count}×${when ? ` — last ${when}` : ""}`}
      style={{ display: "inline-block", fontFamily: "var(--font-mono)", fontSize: 12, fontWeight: 600, color: "#555553", background: "#f0eeea", border: "1px solid #d8d6cf", borderRadius: 4, padding: "2px 6px" }}
    >
      ☎ {count}
    </span>
  );
}

const CALL_OUTCOMES: { value: string; label: string }[] = [
  { value: "connected", label: "Connected" },
  { value: "voicemail", label: "Left voicemail" },
  { value: "no_answer", label: "No answer" },
  { value: "callback", label: "Callback scheduled" },
  { value: "not_interested", label: "Not interested" },
  { value: "wrong_number", label: "Wrong number" },
];

/** Structured call-log form: outcome dropdown + notes, replacing the old
 * window.prompt. Posts to the activity endpoint which routes calls through the
 * atomic tpl_log_call RPC (bumps call_count + last_called_at). */
function LogCallModal({
  prospect,
  agentEmail,
  onClose,
  onLogged,
}: {
  prospect: SalesProspect;
  agentEmail: string;
  onClose: () => void;
  onLogged: () => void;
}) {
  const [outcome, setOutcome] = useState("connected");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/templates/sales/activity`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          prospect_id: prospect.id,
          kind: "call",
          outcome,
          // body is required by the endpoint; fall back to the outcome label.
          body: notes.trim() || CALL_OUTCOMES.find((o) => o.value === outcome)?.label || outcome,
          agent_id: agentEmail,
        }),
      });
      if (res.ok) {
        onLogged();
        return;
      }
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      setError(`Failed to log call: ${data.error ?? `HTTP ${res.status}`}`);
    } catch (e) {
      setError(`Network error: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div role="dialog" aria-modal="true" style={overlay} onClick={onClose}>
      <div style={modal} onClick={(e) => e.stopPropagation()}>
        <h2 style={{ fontFamily: "var(--font-serif)", fontSize: "1.25rem", fontWeight: 700, margin: "0 0 4px" }}>
          Log call — {prospect.business_name || "prospect"}
        </h2>
        <p style={{ fontSize: 12, color: "#888886", margin: "0 0 16px" }}>
          Called {prospect.call_count}× so far. Agent: {agentEmail}
        </p>

        <label style={lbl}>Outcome *</label>
        <select style={{ ...inp, fontFamily: "var(--font-sans)" }} value={outcome} onChange={(e) => setOutcome(e.target.value)} autoFocus>
          {CALL_OUTCOMES.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>

        <label style={lbl}>Notes</label>
        <textarea style={{ ...inp, minHeight: 80, resize: "vertical" }} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="What was discussed, next steps…" />

        {error && <div style={errBox}>{error}</div>}

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 18 }}>
          <button onClick={onClose} style={ghostBtn} disabled={submitting}>Cancel</button>
          <button onClick={submit} style={{ ...convertBtn, opacity: submitting ? 0.5 : 1, cursor: submitting ? "not-allowed" : "pointer" }} disabled={submitting}>
            {submitting ? "Saving…" : "Save call"}
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Captures the owner data collected on the conversion call (owner email/name, a
 * URL-safe Kura slug, optional custom domain) and POSTs it to the convert
 * endpoint, which fires the signed WR→SL conversion webhook. Slug defaults to a
 * slugified business name and is validated against SL's contract before submit.
 */
function ConvertModal({
  prospect,
  agentEmail,
  onClose,
  onConverted,
}: {
  prospect: SalesProspect;
  agentEmail: string;
  onClose: () => void;
  onConverted: () => void;
}) {
  const [ownerEmail, setOwnerEmail] = useState("");
  const [ownerName, setOwnerName] = useState("");
  const [slug, setSlug] = useState(slugify(prospect.business_name ?? ""));
  const [domain, setDomain] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const emailOk = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(ownerEmail.trim());
  const slugOk = isValidSlug(slug.trim());
  const canSubmit = emailOk && slugOk && !submitting;

  async function submit() {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/templates/prospects/${prospect.id}/convert`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          owner_email: ownerEmail.trim(),
          owner_name: ownerName.trim() || undefined,
          slug: slug.trim(),
          domain_name: domain.trim() || undefined,
        }),
      });
      if (res.ok) {
        onConverted();
        return;
      }
      const data = (await res.json().catch(() => ({}))) as { error?: string; retryable?: boolean };
      if (res.status === 409 && data.error === "build_not_ready") {
        setError("Preview isn't ready yet (build not succeeded). Try again once the preview is live.");
      } else if (res.status === 404) {
        setError("SL has no build for this prospect (build_not_found).");
      } else if (data.retryable) {
        setError(`Temporary error (${data.error ?? "unknown"}). Safe to retry.`);
      } else {
        setError(`Conversion failed: ${data.error ?? `HTTP ${res.status}`}`);
      }
    } catch (e) {
      setError(`Network error: ${e instanceof Error ? e.message : String(e)}. Safe to retry.`);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div role="dialog" aria-modal="true" style={overlay} onClick={onClose}>
      <div style={modal} onClick={(e) => e.stopPropagation()}>
        <h2 style={{ fontFamily: "var(--font-serif)", fontSize: "1.25rem", fontWeight: 700, margin: "0 0 4px" }}>
          Convert {prospect.business_name || "prospect"}
        </h2>
        <p style={{ fontSize: 12, color: "#888886", margin: "0 0 16px" }}>
          Fires the Kura promote. Owner data is collected on the rep call. Agent: {agentEmail}
        </p>

        <label style={lbl}>Owner email *</label>
        <input style={inp} type="email" value={ownerEmail} onChange={(e) => setOwnerEmail(e.target.value)} placeholder="owner@business.com" autoFocus />

        <label style={lbl}>Owner name</label>
        <input style={inp} value={ownerName} onChange={(e) => setOwnerName(e.target.value)} placeholder="Jane Doe" />

        <label style={lbl}>Kura slug *</label>
        <input style={{ ...inp, fontFamily: "var(--font-mono)" }} value={slug} onChange={(e) => setSlug(e.target.value)} placeholder="acme-plumbing" />
        {!slugOk && slug.trim() !== "" && (
          <span style={hint}>lowercase letters, numbers, hyphens; 1–60 chars; no leading/trailing hyphen</span>
        )}

        <label style={lbl}>Custom domain (optional)</label>
        <input style={inp} value={domain} onChange={(e) => setDomain(e.target.value)} placeholder="acmeplumbing.com" />

        {error && <div style={errBox}>{error}</div>}

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 18 }}>
          <button onClick={onClose} style={ghostBtn} disabled={submitting}>Cancel</button>
          <button onClick={submit} style={{ ...convertBtn, opacity: canSubmit ? 1 : 0.5, cursor: canSubmit ? "pointer" : "not-allowed" }} disabled={!canSubmit}>
            {submitting ? "Converting…" : "Convert & promote"}
          </button>
        </div>
      </div>
    </div>
  );
}

const filterSel: React.CSSProperties = { padding: "6px 10px", border: "1.5px solid #d8d6cf", borderRadius: 4, fontSize: 13, fontFamily: "var(--font-sans)", background: "#fff", color: "#333", cursor: "pointer" };
const th: React.CSSProperties = { padding: "9px 12px", textAlign: "left", fontFamily: "var(--font-mono)", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.05em", color: "#555553", fontWeight: 600 };
const td: React.CSSProperties = { padding: "10px 12px", fontSize: 13, verticalAlign: "middle" };
const ghostBtn: React.CSSProperties = { fontFamily: "var(--font-sans)", fontSize: 12, fontWeight: 500, color: "#555553", background: "#fff", border: "1.5px solid #d8d6cf", borderRadius: 4, padding: "5px 10px", cursor: "pointer" };
const convertBtn: React.CSSProperties = { fontFamily: "var(--font-sans)", fontSize: 12, fontWeight: 600, color: "#fff", background: "#1a7a3a", border: "1.5px solid #1a7a3a", borderRadius: 4, padding: "5px 10px", cursor: "pointer", marginRight: 6 };
const overlay: React.CSSProperties = { position: "fixed", inset: 0, background: "rgba(17,17,16,0.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50, padding: 16 };
const modal: React.CSSProperties = { background: "#fff", border: "1.5px solid #e8e6df", borderRadius: 8, padding: 24, width: "100%", maxWidth: 420, boxShadow: "0 12px 40px rgba(0,0,0,0.18)" };
const lbl: React.CSSProperties = { display: "block", fontFamily: "var(--font-mono)", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.05em", color: "#555553", fontWeight: 600, margin: "10px 0 4px" };
const inp: React.CSSProperties = { width: "100%", padding: "8px 10px", border: "1.5px solid #d8d6cf", borderRadius: 4, fontSize: 13, fontFamily: "var(--font-sans)", boxSizing: "border-box" };
const hint: React.CSSProperties = { display: "block", fontSize: 11, color: "#b04a1a", marginTop: 4 };
const errBox: React.CSSProperties = { marginTop: 14, padding: "8px 10px", background: "#fdecea", border: "1px solid #f3c0b8", borderRadius: 4, fontSize: 12, color: "#8a2a1a" };
