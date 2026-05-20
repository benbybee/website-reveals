"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import type { FirecrawlBranding, FirecrawlBusinessJson, ScrapeResult } from "@/lib/firecrawl";

type Stage =
  | "ask_existing" // Step 1: existing site Y/N
  | "enter_url" // Step 2a: paste URL
  | "scraping" // Loading
  | "review_scrape" // Step 3a: accept/reject each scraped item
  | "manual_entry" // Step 2b: no-site path
  | "industry" // Common: required industry field
  | "references" // Common: reference URLs
  | "additional_info" // Common: optional notes
  | "submitting"
  | "submitted";

interface RepProps {
  first_name: string;
  last_name: string | null;
  email: string;
}

interface ReviewState {
  business_name: { value: string; accepted: boolean };
  email: { value: string; accepted: boolean };
  phone: { value: string; accepted: boolean };
  address: { value: string; accepted: boolean };
  service_areas: { value: string; accepted: boolean };
  about_text: { value: string; accepted: boolean };
  services: Array<{ value: string; accepted: boolean }>;
  colors: Array<{ hex: string; role: string; accepted: boolean }>;
  logo: { url: string; accepted: boolean } | null;
  images: Array<{ url: string; accepted: boolean }>;
}

interface ManualState {
  business_name: string;
  email: string;
  phone: string;
  service_areas: string;
  all_services: string;
  differentiators: string;
}

export function SalesV2Shell({ rep }: { rep: RepProps }) {
  const router = useRouter();
  const [stage, setStage] = useState<Stage>("ask_existing");
  const [hasExisting, setHasExisting] = useState<boolean | null>(null);
  const [url, setUrl] = useState("");
  const [scrapeError, setScrapeError] = useState<string | null>(null);
  const [review, setReview] = useState<ReviewState | null>(null);
  const [manual, setManual] = useState<ManualState>({
    business_name: "",
    email: "",
    phone: "",
    service_areas: "",
    all_services: "",
    differentiators: "",
  });
  const [industry, setIndustry] = useState("");
  const [refUrls, setRefUrls] = useState<string[]>([""]);
  const [additionalInfo, setAdditionalInfo] = useState("");
  const [submitError, setSubmitError] = useState<string | null>(null);

  // ── Scrape handler ────────────────────────────────────────────────
  const runScrape = useCallback(async () => {
    if (!url.trim()) return;
    setStage("scraping");
    setScrapeError(null);
    try {
      const res = await fetch("/api/sales-v2/scrape", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: url.trim() }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error || `Scrape failed (${res.status})`);
      const result = body as ScrapeResult;
      setReview(buildReviewState(result.branding, result.business));
      setStage("review_scrape");
    } catch (err) {
      setScrapeError(err instanceof Error ? err.message : "Scrape failed");
      setStage("enter_url");
    }
  }, [url]);

  // ── Submit handler ────────────────────────────────────────────────
  const runSubmit = useCallback(async () => {
    setStage("submitting");
    setSubmitError(null);
    try {
      // 1) Start a form session
      const startRes = await fetch("/api/form/start", { method: "POST" });
      const startBody = await startRes.json();
      if (!startRes.ok || !startBody.token) {
        throw new Error("Could not start form session");
      }
      const token = startBody.token as string;

      // 2) Build form_data from current state
      const formData = buildFormData({
        hasExisting,
        url,
        review,
        manual,
        rep,
        industry,
        refUrls,
        additionalInfo,
      });

      // 3) Save form_data to the session via PUT
      const saveRes = await fetch(`/api/form/${token}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          current_step: 999,
          form_data: formData,
          dns_provider: null,
        }),
      });
      if (!saveRes.ok) throw new Error("Could not save form data");

      // 4) Submit
      const submitRes = await fetch(`/api/form/${token}/submit`, { method: "POST" });
      const submitBody = await submitRes.json().catch(() => ({}));
      if (!submitRes.ok) {
        throw new Error(submitBody?.error || `Submit failed (${submitRes.status})`);
      }
      setStage("submitted");
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Submission failed");
      setStage("additional_info");
    }
  }, [hasExisting, url, review, manual, rep, industry, refUrls, additionalInfo]);

  // ── Render ────────────────────────────────────────────────────────
  return (
    <div style={pageStyle}>
      <div style={innerStyle}>
        <Header rep={rep} />

        {stage === "ask_existing" && (
          <Stage1
            onYes={() => {
              setHasExisting(true);
              setStage("enter_url");
            }}
            onNo={() => {
              setHasExisting(false);
              setStage("manual_entry");
            }}
          />
        )}

        {stage === "enter_url" && (
          <Stage2EnterUrl
            url={url}
            setUrl={setUrl}
            onScrape={runScrape}
            error={scrapeError}
            onBack={() => setStage("ask_existing")}
          />
        )}

        {stage === "scraping" && <ScrapingLoader url={url} />}

        {stage === "review_scrape" && review && (
          <Stage3Review
            review={review}
            setReview={setReview}
            onBack={() => setStage("enter_url")}
            onNext={() => setStage("industry")}
          />
        )}

        {stage === "manual_entry" && (
          <Stage2Manual
            manual={manual}
            setManual={setManual}
            onBack={() => setStage("ask_existing")}
            onNext={() => setStage("industry")}
          />
        )}

        {stage === "industry" && (
          <StageIndustry
            industry={industry}
            setIndustry={setIndustry}
            onBack={() => setStage(hasExisting ? "review_scrape" : "manual_entry")}
            onNext={() => setStage("references")}
          />
        )}

        {stage === "references" && (
          <StageReferences
            urls={refUrls}
            setUrls={setRefUrls}
            onBack={() => setStage("industry")}
            onNext={() => setStage("additional_info")}
          />
        )}

        {stage === "additional_info" && (
          <StageAdditional
            text={additionalInfo}
            setText={setAdditionalInfo}
            onBack={() => setStage("references")}
            onSubmit={runSubmit}
            error={submitError}
          />
        )}

        {stage === "submitting" && <SubmittingLoader />}

        {stage === "submitted" && <SubmittedSuccess onAnother={() => router.refresh()} />}
      </div>
    </div>
  );
}

// ─── Stage components ──────────────────────────────────────────────

function Header({ rep }: { rep: RepProps }) {
  return (
    <div style={{ marginBottom: 28 }}>
      <p style={eyebrowStyle}>New client site · {rep.first_name}{rep.last_name ? ` ${rep.last_name}` : ""}</p>
      <h1 style={pageTitle}>Submit a new build</h1>
    </div>
  );
}

function Stage1({ onYes, onNo }: { onYes: () => void; onNo: () => void }) {
  return (
    <Card>
      <h2 style={h2Style}>Does the client already have a website?</h2>
      <p style={pStyle}>If yes, we&apos;ll scrape it to pre-fill the questionnaire. You&apos;ll get to review every field before submitting.</p>
      <div style={{ display: "flex", gap: 12, marginTop: 24 }}>
        <button onClick={onYes} className="btn-orange" style={primaryBtn}>Yes, they have a site</button>
        <button onClick={onNo} style={secondaryBtn}>No existing site</button>
      </div>
    </Card>
  );
}

function Stage2EnterUrl({
  url,
  setUrl,
  onScrape,
  error,
  onBack,
}: {
  url: string;
  setUrl: (s: string) => void;
  onScrape: () => void;
  error: string | null;
  onBack: () => void;
}) {
  return (
    <Card>
      <h2 style={h2Style}>What&apos;s their website URL?</h2>
      <p style={pStyle}>We&apos;ll pull business info, services, contact details, brand colors, and the logo.</p>
      <input
        type="url"
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        placeholder="https://theirbusiness.com"
        style={inputStyle}
        onKeyDown={(e) => {
          if (e.key === "Enter" && url.trim()) onScrape();
        }}
      />
      {error && (
        <div style={errorBoxStyle}>{error}</div>
      )}
      <div style={navRow}>
        <button onClick={onBack} style={backBtn}>← Back</button>
        <button onClick={onScrape} disabled={!url.trim()} className="btn-orange" style={primaryBtn}>
          Scrape →
        </button>
      </div>
    </Card>
  );
}

function ScrapingLoader({ url }: { url: string }) {
  return (
    <Card>
      <div style={{ textAlign: "center", padding: "32px 0" }}>
        <div style={spinnerStyle} />
        <p style={{ ...pStyle, marginTop: 16 }}>
          Scraping <strong>{url}</strong>…
        </p>
        <p style={{ fontSize: 12, color: "#888886", marginTop: 8 }}>This takes 10–30 seconds.</p>
      </div>
    </Card>
  );
}

function Stage3Review({
  review,
  setReview,
  onBack,
  onNext,
}: {
  review: ReviewState;
  setReview: (r: ReviewState) => void;
  onBack: () => void;
  onNext: () => void;
}) {
  // Helper to update a text field (and auto-accept on edit)
  const updateText = (key: keyof Pick<ReviewState, "business_name" | "email" | "phone" | "address" | "service_areas" | "about_text">, val: string) => {
    setReview({ ...review, [key]: { value: val, accepted: true } });
  };
  const toggleAccept = (key: keyof Pick<ReviewState, "business_name" | "email" | "phone" | "address" | "service_areas" | "about_text">) => {
    setReview({ ...review, [key]: { ...review[key], accepted: !review[key].accepted } });
  };

  // Counts for "Accept all" buttons
  const colorsAllAccepted = review.colors.length > 0 && review.colors.every((c) => c.accepted);
  const servicesAllAccepted = review.services.length > 0 && review.services.every((s) => s.accepted);
  const imagesAllAccepted = review.images.length > 0 && review.images.every((i) => i.accepted);

  return (
    <Card>
      <h2 style={h2Style}>Review what we found</h2>
      <p style={pStyle}>Accept what&apos;s right, edit what&apos;s close, reject what&apos;s wrong.</p>

      {/* Business info */}
      <Section title="Business info">
        <EditableRow
          label="Business name"
          value={review.business_name.value}
          accepted={review.business_name.accepted}
          onChange={(v) => updateText("business_name", v)}
          onToggle={() => toggleAccept("business_name")}
        />
        <EditableRow
          label="Email"
          value={review.email.value}
          accepted={review.email.accepted}
          onChange={(v) => updateText("email", v)}
          onToggle={() => toggleAccept("email")}
        />
        <EditableRow
          label="Phone"
          value={review.phone.value}
          accepted={review.phone.accepted}
          onChange={(v) => updateText("phone", v)}
          onToggle={() => toggleAccept("phone")}
        />
        <EditableRow
          label="Address"
          value={review.address.value}
          accepted={review.address.accepted}
          onChange={(v) => updateText("address", v)}
          onToggle={() => toggleAccept("address")}
        />
        <EditableRow
          label="Service areas"
          value={review.service_areas.value}
          accepted={review.service_areas.accepted}
          onChange={(v) => updateText("service_areas", v)}
          onToggle={() => toggleAccept("service_areas")}
          multiline
        />
        <EditableRow
          label="About"
          value={review.about_text.value}
          accepted={review.about_text.accepted}
          onChange={(v) => updateText("about_text", v)}
          onToggle={() => toggleAccept("about_text")}
          multiline
        />
      </Section>

      {/* Logo */}
      {review.logo && (
        <Section title="Logo">
          <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "10px 0" }}>
            <div style={logoPreviewStyle}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={review.logo.url} alt="Logo" style={{ maxWidth: 96, maxHeight: 96, objectFit: "contain" }} />
            </div>
            <div style={{ flex: 1, fontSize: 12, color: "#555553", wordBreak: "break-all" }}>{review.logo.url}</div>
            <AcceptToggle
              accepted={review.logo.accepted}
              onToggle={() => setReview({ ...review, logo: review.logo ? { ...review.logo, accepted: !review.logo.accepted } : null })}
            />
          </div>
        </Section>
      )}

      {/* Brand colors */}
      {review.colors.length > 0 && (
        <Section
          title="Brand colors"
          action={
            <button
              onClick={() => setReview({ ...review, colors: review.colors.map((c) => ({ ...c, accepted: !colorsAllAccepted })) })}
              style={miniBtn}
            >
              {colorsAllAccepted ? "Reject all" : "Accept all"}
            </button>
          }
        >
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
            {review.colors.map((c, idx) => (
              <button
                key={idx}
                onClick={() => {
                  const next = [...review.colors];
                  next[idx] = { ...c, accepted: !c.accepted };
                  setReview({ ...review, colors: next });
                }}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: 4,
                  background: "transparent",
                  border: c.accepted ? "2px solid #2e7d32" : "2px solid #e8e6df",
                  borderRadius: 6,
                  padding: 6,
                  cursor: "pointer",
                  opacity: c.accepted ? 1 : 0.55,
                }}
              >
                <span style={{ width: 56, height: 56, background: c.hex, borderRadius: 4, border: "1px solid #ddd" }} />
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "#555553" }}>{c.hex}</span>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "#888886", textTransform: "uppercase" }}>{c.role}</span>
              </button>
            ))}
          </div>
        </Section>
      )}

      {/* Services */}
      {review.services.length > 0 && (
        <Section
          title="Services"
          action={
            <button
              onClick={() => setReview({ ...review, services: review.services.map((s) => ({ ...s, accepted: !servicesAllAccepted })) })}
              style={miniBtn}
            >
              {servicesAllAccepted ? "Reject all" : "Accept all"}
            </button>
          }
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {review.services.map((s, idx) => (
              <label key={idx} style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer", padding: "4px 0" }}>
                <input
                  type="checkbox"
                  checked={s.accepted}
                  onChange={() => {
                    const next = [...review.services];
                    next[idx] = { ...s, accepted: !s.accepted };
                    setReview({ ...review, services: next });
                  }}
                />
                <input
                  type="text"
                  value={s.value}
                  onChange={(e) => {
                    const next = [...review.services];
                    next[idx] = { ...s, value: e.target.value, accepted: true };
                    setReview({ ...review, services: next });
                  }}
                  style={{ ...inputStyle, padding: "4px 8px", fontSize: 13, flex: 1 }}
                />
              </label>
            ))}
          </div>
        </Section>
      )}

      {/* Images */}
      {review.images.length > 0 && (
        <Section
          title="Images"
          action={
            <button
              onClick={() => setReview({ ...review, images: review.images.map((i) => ({ ...i, accepted: !imagesAllAccepted })) })}
              style={miniBtn}
            >
              {imagesAllAccepted ? "Reject all" : "Accept all"}
            </button>
          }
        >
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: 8 }}>
            {review.images.map((img, idx) => (
              <button
                key={idx}
                onClick={() => {
                  const next = [...review.images];
                  next[idx] = { ...img, accepted: !img.accepted };
                  setReview({ ...review, images: next });
                }}
                style={{
                  position: "relative",
                  border: img.accepted ? "3px solid #2e7d32" : "3px solid #e8e6df",
                  borderRadius: 6,
                  background: "#f5f4ef",
                  padding: 0,
                  cursor: "pointer",
                  opacity: img.accepted ? 1 : 0.4,
                  overflow: "hidden",
                  aspectRatio: "4/3",
                }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={img.url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              </button>
            ))}
          </div>
        </Section>
      )}

      <div style={navRow}>
        <button onClick={onBack} style={backBtn}>← Back</button>
        <button onClick={onNext} className="btn-orange" style={primaryBtn}>Next →</button>
      </div>
    </Card>
  );
}

function Stage2Manual({
  manual,
  setManual,
  onBack,
  onNext,
}: {
  manual: ManualState;
  setManual: (s: ManualState) => void;
  onBack: () => void;
  onNext: () => void;
}) {
  const valid = manual.business_name.trim() && manual.email.includes("@");
  return (
    <Card>
      <h2 style={h2Style}>Tell us about the business</h2>
      <p style={pStyle}>No existing site to scrape — enter what you know.</p>

      <FieldLabel>Business name *</FieldLabel>
      <input value={manual.business_name} onChange={(e) => setManual({ ...manual, business_name: e.target.value })} style={inputStyle} />

      <FieldLabel>Email (customers will see this) *</FieldLabel>
      <input type="email" value={manual.email} onChange={(e) => setManual({ ...manual, email: e.target.value })} style={inputStyle} />

      <FieldLabel>Phone (customers will call this)</FieldLabel>
      <input type="tel" value={manual.phone} onChange={(e) => setManual({ ...manual, phone: e.target.value })} style={inputStyle} />

      <FieldLabel>Service areas</FieldLabel>
      <textarea value={manual.service_areas} onChange={(e) => setManual({ ...manual, service_areas: e.target.value })} style={{ ...inputStyle, minHeight: 60 }} />

      <FieldLabel>Services offered</FieldLabel>
      <textarea value={manual.all_services} onChange={(e) => setManual({ ...manual, all_services: e.target.value })} style={{ ...inputStyle, minHeight: 60 }} />

      <FieldLabel>What makes them different from competitors?</FieldLabel>
      <textarea value={manual.differentiators} onChange={(e) => setManual({ ...manual, differentiators: e.target.value })} style={{ ...inputStyle, minHeight: 60 }} />

      <div style={navRow}>
        <button onClick={onBack} style={backBtn}>← Back</button>
        <button onClick={onNext} disabled={!valid} className="btn-orange" style={{ ...primaryBtn, opacity: valid ? 1 : 0.4 }}>Next →</button>
      </div>
    </Card>
  );
}

function StageIndustry({
  industry,
  setIndustry,
  onBack,
  onNext,
}: {
  industry: string;
  setIndustry: (s: string) => void;
  onBack: () => void;
  onNext: () => void;
}) {
  return (
    <Card>
      <h2 style={h2Style}>Industry / category</h2>
      <p style={pStyle}>One or two words — used for industry-appropriate imagery and design references.</p>
      <input
        value={industry}
        onChange={(e) => setIndustry(e.target.value)}
        placeholder="e.g. plumber, chiropractor, dental, landscaping"
        style={inputStyle}
      />
      <div style={navRow}>
        <button onClick={onBack} style={backBtn}>← Back</button>
        <button onClick={onNext} disabled={!industry.trim()} className="btn-orange" style={{ ...primaryBtn, opacity: industry.trim() ? 1 : 0.4 }}>Next →</button>
      </div>
    </Card>
  );
}

function StageReferences({
  urls,
  setUrls,
  onBack,
  onNext,
}: {
  urls: string[];
  setUrls: (u: string[]) => void;
  onBack: () => void;
  onNext: () => void;
}) {
  return (
    <Card>
      <h2 style={h2Style}>Sites the client likes</h2>
      <p style={pStyle}>Reference URLs we&apos;ll use as design inspiration. Add as many as you want.</p>
      {urls.map((u, idx) => (
        <div key={idx} style={{ display: "flex", gap: 8, marginBottom: 8 }}>
          <input
            type="url"
            value={u}
            onChange={(e) => {
              const next = [...urls];
              next[idx] = e.target.value;
              setUrls(next);
            }}
            placeholder="https://example.com"
            style={{ ...inputStyle, flex: 1 }}
          />
          {urls.length > 1 && (
            <button
              onClick={() => setUrls(urls.filter((_, i) => i !== idx))}
              style={{ ...secondaryBtn, padding: "8px 12px" }}
            >
              ✕
            </button>
          )}
        </div>
      ))}
      <button onClick={() => setUrls([...urls, ""])} style={secondaryBtn}>+ Add another</button>
      <div style={navRow}>
        <button onClick={onBack} style={backBtn}>← Back</button>
        <button onClick={onNext} className="btn-orange" style={primaryBtn}>Next →</button>
      </div>
    </Card>
  );
}

function StageAdditional({
  text,
  setText,
  onBack,
  onSubmit,
  error,
}: {
  text: string;
  setText: (s: string) => void;
  onBack: () => void;
  onSubmit: () => void;
  error: string | null;
}) {
  return (
    <Card>
      <h2 style={h2Style}>Anything else?</h2>
      <p style={pStyle}>Optional. Notes about the client, special requests, things you want the build to emphasize.</p>
      <textarea value={text} onChange={(e) => setText(e.target.value)} style={{ ...inputStyle, minHeight: 140 }} placeholder="Optional..." />
      {error && <div style={errorBoxStyle}>{error}</div>}
      <div style={navRow}>
        <button onClick={onBack} style={backBtn}>← Back</button>
        <button onClick={onSubmit} className="btn-orange" style={primaryBtn}>Submit →</button>
      </div>
    </Card>
  );
}

function SubmittingLoader() {
  return (
    <Card>
      <div style={{ textAlign: "center", padding: "32px 0" }}>
        <div style={spinnerStyle} />
        <p style={{ ...pStyle, marginTop: 16 }}>Submitting…</p>
      </div>
    </Card>
  );
}

function SubmittedSuccess({ onAnother }: { onAnother: () => void }) {
  return (
    <Card>
      <div style={{ textAlign: "center", padding: "32px 0" }}>
        <div style={{ fontSize: 44, marginBottom: 16 }}>✅</div>
        <h2 style={{ ...h2Style, textAlign: "center" }}>Submitted</h2>
        <p style={{ ...pStyle, marginTop: 8 }}>
          The build is queued. You&apos;ll get an email when it&apos;s ready for client review.
        </p>
        <button onClick={onAnother} className="btn-orange" style={{ ...primaryBtn, marginTop: 24 }}>
          Submit another →
        </button>
      </div>
    </Card>
  );
}

// ─── Shared UI primitives ──────────────────────────────────────────

function Card({ children }: { children: React.ReactNode }) {
  return <div style={cardStyle}>{children}</div>;
}

function Section({
  title,
  action,
  children,
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div style={{ borderTop: "1px solid #e8e6df", marginTop: 16, paddingTop: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <h3 style={h3Style}>{title}</h3>
        {action}
      </div>
      {children}
    </div>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <label style={fieldLabelStyle}>{children}</label>;
}

function EditableRow({
  label,
  value,
  accepted,
  onChange,
  onToggle,
  multiline,
}: {
  label: string;
  value: string;
  accepted: boolean;
  onChange: (v: string) => void;
  onToggle: () => void;
  multiline?: boolean;
}) {
  return (
    <div style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "6px 0", borderBottom: "1px solid #f0eeea" }}>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 11, color: "#888886", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 2 }}>{label}</div>
        {multiline ? (
          <textarea value={value} onChange={(e) => onChange(e.target.value)} style={{ ...inputStyle, padding: "6px 10px", fontSize: 13, minHeight: 40 }} />
        ) : (
          <input value={value} onChange={(e) => onChange(e.target.value)} style={{ ...inputStyle, padding: "6px 10px", fontSize: 13 }} />
        )}
      </div>
      <AcceptToggle accepted={accepted} onToggle={onToggle} />
    </div>
  );
}

function AcceptToggle({ accepted, onToggle }: { accepted: boolean; onToggle: () => void }) {
  return (
    <button
      onClick={onToggle}
      style={{
        marginTop: 18,
        background: accepted ? "#2e7d32" : "#fff",
        color: accepted ? "#fff" : "#888886",
        border: accepted ? "1px solid #2e7d32" : "1.5px solid #e8e6df",
        borderRadius: 4,
        padding: "4px 10px",
        fontSize: 11,
        fontWeight: 600,
        fontFamily: "var(--font-mono)",
        textTransform: "uppercase",
        letterSpacing: "0.04em",
        cursor: "pointer",
        flexShrink: 0,
      }}
    >
      {accepted ? "✓ Accepted" : "Accept"}
    </button>
  );
}

// ─── Helpers ───────────────────────────────────────────────────────

/**
 * SL only accepts absolute https URLs for logo/images and #RRGGBB(AA) hex for
 * colors. Filter at the review boundary so the rep doesn't see candidates that
 * silently get dropped by the mapper at submit time (e.g. inline data: URI
 * logos from sites built with Astro/Vite). Mirrors the validators in
 * lib/sitelaunchr-mapper.ts.
 */
function isHttpsUrl(s: string | undefined): s is string {
  if (!s) return false;
  try {
    return new URL(s).protocol === "https:";
  } catch {
    return false;
  }
}
function isHex(s: string | undefined): s is string {
  return !!s && /^#[0-9a-f]{6}([0-9a-f]{2})?$/i.test(s);
}

function buildReviewState(branding: FirecrawlBranding, biz: FirecrawlBusinessJson): ReviewState {
  // Palette in display order, dedupe by hex
  const order: Array<keyof NonNullable<FirecrawlBranding["colors"]>> = [
    "primary",
    "secondary",
    "accent",
    "background",
    "textPrimary",
    "link",
  ];
  const colors: ReviewState["colors"] = [];
  const seenHex = new Set<string>();
  for (const role of order) {
    const hex = branding.colors?.[role];
    if (isHex(hex)) {
      const key = hex.toUpperCase();
      if (!seenHex.has(key)) {
        seenHex.add(key);
        colors.push({ hex, role: String(role), accepted: true });
      }
    }
  }

  // Combine hero + gallery for the rep to pick from. Hero is meaningful for
  // SL (it gets routed to brand.hero_images), but the rep doesn't need to know
  // — we treat the first accepted image as hero in the mapper.
  const heroUrl = biz.hero_image_url;
  const galleryUrls = biz.gallery_image_urls || [];
  const allImages = [heroUrl, ...galleryUrls].filter(isHttpsUrl);
  const seenImg = new Set<string>();
  const dedupedImages: string[] = [];
  for (const u of allImages) {
    if (!seenImg.has(u)) {
      seenImg.add(u);
      dedupedImages.push(u);
    }
    if (dedupedImages.length >= 12) break;
  }

  const logoUrl = branding.images?.logo;
  return {
    business_name: { value: biz.business_name || "", accepted: !!biz.business_name },
    email: { value: biz.email || "", accepted: !!biz.email },
    phone: { value: biz.phone || "", accepted: !!biz.phone },
    address: { value: biz.address || "", accepted: !!biz.address },
    service_areas: { value: (biz.service_areas || []).join(", "), accepted: (biz.service_areas || []).length > 0 },
    about_text: { value: biz.about_text || "", accepted: !!biz.about_text },
    services: (biz.services || []).map((s) => ({ value: s, accepted: true })),
    colors,
    logo: isHttpsUrl(logoUrl) ? { url: logoUrl, accepted: true } : null,
    images: dedupedImages.map((u) => ({ url: u, accepted: true })),
  };
}

function buildFormData(args: {
  hasExisting: boolean | null;
  url: string;
  review: ReviewState | null;
  manual: ManualState;
  rep: RepProps;
  industry: string;
  refUrls: string[];
  additionalInfo: string;
}): Record<string, unknown> {
  const { hasExisting, url, review, manual, rep, industry, refUrls, additionalInfo } = args;

  const fd: Record<string, unknown> = {
    _source: "sales",
    _mode: "quick",
    _form_version: "v2",
    industry,
    contact_email: rep.email,
    contact_person: rep.first_name + (rep.last_name ? ` ${rep.last_name}` : ""),
    anything_else: additionalInfo || "",
    inspiration_sites: refUrls.filter((u) => u.trim()).join("\n"),
  };

  if (hasExisting && review) {
    fd.business_name = review.business_name.accepted ? review.business_name.value : "";
    fd.email = review.email.accepted ? review.email.value : "";
    fd.phone = review.phone.accepted ? review.phone.value : "";
    fd.address = review.address.accepted ? review.address.value : "";
    fd.service_areas = review.service_areas.accepted ? review.service_areas.value : "";
    fd.about_text = review.about_text.accepted ? review.about_text.value : "";
    fd.current_url = url;
    fd.all_services = review.services.filter((s) => s.accepted).map((s) => s.value).join(", ");
    fd.brand_colors = review.colors.filter((c) => c.accepted).map((c) => c.hex).join(", ");
    if (review.logo?.accepted) {
      fd.has_logo = "Yes";
      fd.logo_url = review.logo.url;
    }
    const acceptedImages = review.images.filter((i) => i.accepted).map((i) => i.url);
    if (acceptedImages.length > 0) fd.image_urls = acceptedImages;
  } else {
    fd.business_name = manual.business_name;
    fd.email = manual.email;
    fd.phone = manual.phone;
    fd.service_areas = manual.service_areas;
    fd.all_services = manual.all_services;
    fd.differentiators = manual.differentiators;
  }

  return fd;
}

// ─── Styles ────────────────────────────────────────────────────────

const pageStyle: React.CSSProperties = {
  minHeight: "100vh",
  background: "#faf9f5",
  padding: "32px 16px 80px",
};
const innerStyle: React.CSSProperties = {
  maxWidth: 760,
  margin: "0 auto",
};
const eyebrowStyle: React.CSSProperties = {
  fontFamily: "var(--font-mono)",
  fontSize: 11,
  textTransform: "uppercase",
  letterSpacing: "0.08em",
  color: "#888886",
  marginBottom: 6,
};
const pageTitle: React.CSSProperties = {
  fontFamily: "var(--font-serif)",
  fontSize: "clamp(1.6rem, 4vw, 2.25rem)",
  fontWeight: 700,
  color: "#111110",
};
const cardStyle: React.CSSProperties = {
  background: "#fff",
  border: "1.5px solid #e8e6df",
  borderRadius: 6,
  padding: 28,
  fontFamily: "var(--font-sans)",
};
const h2Style: React.CSSProperties = {
  fontFamily: "var(--font-serif)",
  fontSize: "1.4rem",
  fontWeight: 700,
  color: "#111110",
  marginBottom: 8,
};
const h3Style: React.CSSProperties = {
  fontFamily: "var(--font-mono)",
  fontSize: 11,
  textTransform: "uppercase",
  letterSpacing: "0.08em",
  color: "#888886",
  fontWeight: 600,
  margin: 0,
};
const pStyle: React.CSSProperties = {
  fontSize: 14,
  color: "#555553",
  lineHeight: 1.6,
};
const fieldLabelStyle: React.CSSProperties = {
  display: "block",
  fontFamily: "var(--font-mono)",
  fontSize: 11,
  textTransform: "uppercase",
  letterSpacing: "0.05em",
  color: "#888886",
  fontWeight: 600,
  marginTop: 14,
  marginBottom: 6,
};
const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "10px 14px",
  border: "1.5px solid #d8d6cf",
  borderRadius: 3,
  fontSize: 14,
  fontFamily: "var(--font-sans)",
  background: "#faf9f5",
  outline: "none",
  boxSizing: "border-box",
};
const errorBoxStyle: React.CSSProperties = {
  marginTop: 12,
  padding: "10px 14px",
  background: "#fff5f2",
  border: "1px solid #ffcdc0",
  borderRadius: 3,
  fontSize: 13,
  color: "#b3300a",
};
const navRow: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  marginTop: 24,
  paddingTop: 18,
  borderTop: "1px solid #e8e6df",
};
const primaryBtn: React.CSSProperties = {
  fontSize: 14,
  padding: "10px 22px",
  cursor: "pointer",
};
const secondaryBtn: React.CSSProperties = {
  fontSize: 14,
  padding: "10px 18px",
  background: "transparent",
  color: "#555553",
  border: "1.5px solid #d8d6cf",
  borderRadius: 3,
  cursor: "pointer",
  fontFamily: "var(--font-sans)",
};
const backBtn: React.CSSProperties = {
  ...secondaryBtn,
  padding: "8px 14px",
  fontSize: 13,
};
const miniBtn: React.CSSProperties = {
  fontSize: 11,
  padding: "3px 10px",
  background: "transparent",
  color: "#555553",
  border: "1px solid #d8d6cf",
  borderRadius: 3,
  cursor: "pointer",
  fontFamily: "var(--font-mono)",
  textTransform: "uppercase",
  letterSpacing: "0.04em",
};
const logoPreviewStyle: React.CSSProperties = {
  width: 100,
  height: 100,
  background: "#f5f4ef",
  border: "1px solid #e8e6df",
  borderRadius: 4,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  flexShrink: 0,
};
const spinnerStyle: React.CSSProperties = {
  width: 32,
  height: 32,
  borderRadius: "50%",
  border: "2px solid #e8e6df",
  borderTopColor: "#ff3d00",
  animation: "spin 0.7s linear infinite",
  margin: "0 auto",
};
