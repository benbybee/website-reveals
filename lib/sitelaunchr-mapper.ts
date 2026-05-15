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

  // Strip our internal keys; SL's mapper drops any unknown fields
  const brief: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(formData)) {
    if (k.startsWith("_")) continue;
    if (v === undefined || v === null || v === "") continue;
    brief[k] = v;
  }
  // Ensure required fields are present in `brief` even if duplicated above
  brief.business_name = businessName;
  brief.contact_email = contactEmail;
  brief.industry = industry;

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
  if (process.env.SITELAUNCHR_ENABLED !== "1") return false;
  const sources = (process.env.SITELAUNCHR_SOURCES || "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  // Empty allow-list = route everything when ENABLED=1
  if (sources.length === 0) return true;
  return sources.includes(source.toLowerCase());
}
