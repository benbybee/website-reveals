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
}) {
  const { token, formType, formData, callbackUrl, priority } = args;

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
  const RENAMED_OR_DROPPED = new Set([
    "current_url",
    "inspiration_sites",
    "domain_name",
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
  brief.contact_email = contactEmail;

  // Field-name translation: WR-local → SL canonical
  const currentUrl = str(formData, "current_url");
  if (currentUrl) brief.domain_name = currentUrl;

  const inspiration = formData.inspiration_sites;
  const refUrls = extractUrlsFromInspiration(inspiration);
  if (refUrls.length > 0) brief.reference_sites = refUrls;

  // Flag for SL's mapper so it knows contact_* is rep-owned, not client-owned.
  // (SL will drop the field server-side if its schema doesn't list it.)
  if (isSalesSubmission) {
    brief.is_sales_rep_submission = true;
  }

  const ownerName =
    str(formData, "contact_person") ||
    str(formData, "contact_name") ||
    (contactEmail ? contactEmail!.split("@")[0] : "Owner");

  return {
    external_id: token,
    form_type: slFormType,
    brief,
    kura: {
      owner_email: contactEmail!,
      owner_name: ownerName,
      industry: industry!,
      slug: slugify(businessName!),
    },
    ...(callbackUrl ? { callback_url: callbackUrl } : {}),
    options: { priority: priority || "normal" },
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
