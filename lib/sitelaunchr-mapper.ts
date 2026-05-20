import type { FormType } from "@/lib/resolve-form-type";

const MAX_SLUG_LEN = 60;

/**
 * Build a Kura-compatible slug from the business name.
 * Constraints from SL spec: lowercase, alphanumeric + hyphens, 1–60 chars,
 * no leading/trailing hyphen.
 */
export function slugify(input: string): string {
  const cleaned = (input || "client")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, MAX_SLUG_LEN)
    .replace(/-+$/, "");
  return cleaned || "client";
}

function str(fd: Record<string, unknown>, key: string): string | undefined {
  const v = fd[key];
  return typeof v === "string" && v.trim() !== "" ? v : undefined;
}

/**
 * `inspiration_sites` comes in as free-form textarea (URLs mixed with
 * commentary, one per line, possibly bullets). SL's reference_sites
 * expects an array of bare URLs. Extracts http(s) URLs from whatever
 * shape the input takes (string, array, undefined) and returns a
 * deduplicated array.
 */
function extractUrlsFromInspiration(input: unknown): string[] {
  let text = "";
  if (typeof input === "string") {
    text = input;
  } else if (Array.isArray(input)) {
    text = input.map((x) => String(x)).join("\n");
  } else {
    return [];
  }
  const matches = text.match(/https?:\/\/[^\s,)<>"']+/gi) || [];
  // Strip trailing punctuation that often hangs off URLs in prose
  const cleaned = matches.map((u) => u.replace(/[.,;:!?)]+$/, ""));
  return Array.from(new Set(cleaned));
}

/**
 * SL brand/image contract requires strict #RRGGBB(AA) hex.
 * Drop anything that doesn't match — SL will reject the whole brand block
 * if any color is malformed.
 */
function isValidHex(s: unknown): s is string {
  return typeof s === "string" && /^#[0-9a-f]{6}([0-9a-f]{2})?$/i.test(s);
}

/**
 * SL requires absolute https URLs for all image fields. http://, relative
 * paths, data: URIs, and protocol-relative URLs all get rejected. We drop
 * them on our side so the brand block is clean before dispatch.
 */
function isValidHttpsUrl(s: unknown): s is string {
  if (typeof s !== "string") return false;
  try {
    const u = new URL(s);
    return u.protocol === "https:";
  } catch {
    return false;
  }
}

/** Accept array of hex strings or a comma/space-separated string. Dedup, lowercase, validate. */
function parseBrandColors(input: unknown): string[] {
  let raw: string[];
  if (Array.isArray(input)) {
    raw = input.map((s) => String(s));
  } else if (typeof input === "string") {
    raw = input.split(/[,\s]+/);
  } else {
    return [];
  }
  const seen = new Set<string>();
  const out: string[] = [];
  for (const s of raw) {
    const trimmed = s.trim();
    if (!isValidHex(trimmed)) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(key);
  }
  return out;
}

/** Accept array of URLs or a string containing URLs. Validate https, dedup. */
function parseImageUrls(input: unknown): string[] {
  let raw: string[];
  if (Array.isArray(input)) {
    raw = input.map((s) => String(s));
  } else if (typeof input === "string") {
    raw = input.match(/https:\/\/[^\s,)<>"']+/gi) || [];
  } else {
    return [];
  }
  const seen = new Set<string>();
  const out: string[] = [];
  for (const s of raw) {
    const trimmed = s.trim().replace(/[.,;:!?)]+$/, "");
    if (!isValidHttpsUrl(trimmed)) continue;
    if (seen.has(trimmed)) continue;
    seen.add(trimmed);
    out.push(trimmed);
  }
  return out;
}

/**
 * Convert our internal form_data + token into the payload SiteLaunchr expects.
 * Strips our private `_source`/`_mode` keys. SL's wrMapper drops any unknown
 * keys server-side, so over-sending is fine.
 *
 * Throws if a required SL field is missing — caller should fail loudly so the
 * submitter sees the issue rather than silently misrouting.
 */
export function buildSiteLaunchrPayload(args: {
  token: string;
  formType: FormType;
  formData: Record<string, unknown>;
  callbackUrl?: string;
  priority?: "normal" | "high";
  /**
   * Override the external_id sent to SL. Defaults to the form_session token.
   * Set this for resubmits so SL's idempotency (source_id + external_id)
   * doesn't return the previous attempt's build_id as a duplicate.
   */
  externalId?: string;
}) {
  const { token, formType, formData, callbackUrl, priority, externalId } = args;

  const businessName = str(formData, "business_name");
  const contactEmail = str(formData, "contact_email") || str(formData, "email");
  const industry = str(formData, "industry");
  const isSalesSubmission = (formData._source as string) === "sales";

  const missing: string[] = [];
  if (!businessName) missing.push("business_name");
  if (!contactEmail) missing.push("contact_email");
  if (!industry) missing.push("industry");
  if (missing.length > 0) {
    throw new Error(`SiteLaunchr payload missing required field(s): ${missing.join(", ")}`);
  }

  // SL only honors quick / standard / in-depth — fall sales/new-client/novalux into "standard"
  const slFormType: "quick" | "standard" | "in-depth" =
    formType === "quick" || formType === "standard" || formType === "in-depth" ? formType : "standard";

  // Strip our internal keys; SL's mapper drops any unknown fields.
  // We forward all contact_* fields as-is; for /sales submissions the contact
  // belongs to the rep, not the client, and SL is responsible for not surfacing
  // those values on the client's built site. The is_sales_submission flag
  // below gives SL the signal it needs to know the brief came in via /sales.
  //
  // Field-name translation (per SL's docs/integrations/wr-cutover.md):
  //   WR `current_url`        → SL `domain_name`  (URL SL scrapes for assets)
  //   WR `inspiration_sites`  → SL `reference_sites` (array of design refs)
  //   WR `domain_name`        → DROPPED  (means "intended target" in WR, but
  //                              that collides with SL's claim on the same
  //                              name. Intended-target is handled out-of-band
  //                              via the DNS-instructions email.)
  // v2 fields (brand_colors, logo_url, has_logo, image_urls) are dropped
  // from the flat brief and re-nested under brief.brand below per the SL
  // brand/image contract. _form_version is an internal marker we never send.
  //
  // standard_pages used to ship flat at brief root; SL's new contract wants it
  // nested under brief.pages.standard_pages. brand_personality is WR's legacy
  // field name; SL canonical is "personality" — translated below.
  const RENAMED_OR_DROPPED = new Set([
    "current_url",
    "inspiration_sites",
    "domain_name",
    "brand_colors",
    "logo_url",
    "has_logo",
    "image_urls",
    "standard_pages",
    "brand_personality",
  ]);
  const brief: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(formData)) {
    if (k.startsWith("_")) continue;
    if (v === undefined || v === null || v === "") continue;
    if (RENAMED_OR_DROPPED.has(k)) continue;
    brief[k] = v;
  }

  // Required fields (enforced earlier; set last so they can't be overwritten)
  brief.business_name = businessName;
  brief.industry = industry;
  // Send contact in every form we know of — flat, nested, literal-dotted key.
  // SL's current validator rejects two of these but doesn't tell us which one
  // it wants; sending all three is harmless (SL drops fields it doesn't
  // recognize) and unblocks builds the moment SL fixes their side. Strip
  // once SL confirms the canonical shape.
  brief.contact_email = contactEmail;
  brief["contact.email"] = contactEmail;
  const contactObj: Record<string, unknown> = { email: contactEmail };
  const contactPhone = str(formData, "contact_phone");
  if (contactPhone) contactObj.phone = contactPhone;
  const contactPerson = str(formData, "contact_person") || str(formData, "contact_name");
  if (contactPerson) contactObj.person = contactPerson;
  brief.contact = contactObj;

  // Field-name translation: WR-local → SL canonical
  const currentUrl = str(formData, "current_url");
  if (currentUrl) brief.domain_name = currentUrl;

  const inspiration = formData.inspiration_sites;
  const refUrls = extractUrlsFromInspiration(inspiration);
  if (refUrls.length > 0) brief.reference_sites = refUrls;

  // brief.pages.standard_pages — SL's v4 contract wants the page list nested,
  // not flat. Accept either string[] (v2 checkbox group) or comma-string (older
  // form submissions) and emit only when there's something to send.
  const standardPagesRaw = formData.standard_pages;
  const standardPages: string[] = Array.isArray(standardPagesRaw)
    ? standardPagesRaw.map((p) => String(p)).filter((p) => p.trim())
    : typeof standardPagesRaw === "string" && standardPagesRaw.trim()
      ? standardPagesRaw.split(",").map((p) => p.trim()).filter(Boolean)
      : [];
  if (standardPages.length > 0) {
    brief.pages = { standard_pages: standardPages };
  }

  // brand_personality → personality (SL canonical); look_and_feel passes
  // through unchanged. Both ride at brief root per SL's audit feedback.
  const brandPersonality = str(formData, "brand_personality");
  if (brandPersonality) brief.personality = brandPersonality;

  // Flag for SL's mapper so it knows contact_* is rep-owned, not client-owned.
  // (SL will drop the field server-side if its schema doesn't list it.)
  if (isSalesSubmission) {
    brief.is_sales_rep_submission = true;
  }

  // v2 brand/image contract: /sales-v2 submissions ship scraped logo, colors,
  // and images. SL's v4 design engine expects them under brief.brand (not flat)
  // and validates hex + https strictly. Build the brand block here; for v1
  // submissions there's nothing to nest, so we skip it entirely.
  const isV2Submission = str(formData, "_form_version") === "v2";
  if (isV2Submission) {
    const logoUrlRaw = str(formData, "logo_url");
    const logoUrl = logoUrlRaw && isValidHttpsUrl(logoUrlRaw) ? logoUrlRaw : undefined;
    const colors = parseBrandColors(formData.brand_colors);
    const images = parseImageUrls(formData.image_urls);

    const brand: Record<string, unknown> = {
      has_logo: !!logoUrl,
      colors,
      reference_urls: refUrls,
      // No semantic distinction in the form yet — surface the first scraped
      // image as the hero candidate, rest as gallery. SL is free to reshuffle.
      hero_images: images.slice(0, 1),
      gallery: images.slice(1),
      team_photos: [],
      service_photos: [],
      testimonial_avatars: [],
    };
    if (logoUrl) brand.logo_url = logoUrl;

    brief.brand = brand;
  }

  const ownerName =
    str(formData, "contact_person") ||
    str(formData, "contact_name") ||
    (contactEmail ? contactEmail!.split("@")[0] : "Owner");

  const options: Record<string, unknown> = { priority: priority || "normal" };
  // v4 design engine is what consumes brief.brand. Only route v2 submissions
  // there; v1 submissions stay on whatever engine SL defaults to.
  if (isV2Submission) options.design_engine = "v4";

  return {
    external_id: externalId || token,
    form_type: slFormType,
    brief,
    kura: {
      owner_email: contactEmail!,
      owner_name: ownerName,
      industry: industry!,
      slug: slugify(businessName!),
    },
    ...(callbackUrl ? { callback_url: callbackUrl } : {}),
    options,
  };
}

/**
 * Should this submission be routed to SiteLaunchr instead of the Trigger.dev
 * build-website task? Gated by env so we can soft-launch on `sales` only.
 */
export function shouldRouteToSiteLaunchr(source: string): boolean {
  // Defensive: `.trim()` everywhere — past versions of the env-push script
  // stored values with trailing newlines, which silently broke routing.
  if ((process.env.SITELAUNCHR_ENABLED || "").trim() !== "1") return false;
  const sources = (process.env.SITELAUNCHR_SOURCES || "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  // Empty allow-list = route everything when ENABLED=1
  if (sources.length === 0) return true;
  return sources.includes(source.trim().toLowerCase());
}
