export function templatesEnabled(): boolean {
  return process.env.TEMPLATES_ENABLED === "1";
}

export const APIFY_TOKEN = () => process.env.APIFY_TOKEN ?? "";

// Lob direct-mail (postcards). A `test_`-prefixed key hits Lob's test mode (no
// real mail, no charge); a `live_` key sends real cards. The mail-campaign task
// and address-verification both read this. Empty = mailing disabled.
export const LOB_API_KEY = () => (process.env.LOB_API_KEY ?? "").trim();
export const lobEnabled = () => LOB_API_KEY().length > 0;
export const lobIsTestMode = () => LOB_API_KEY().startsWith("test_");

// Click2Mail MOL Pro REST API (alternative postcard provider). HTTP Basic auth
// with the account username/password. The base URL selects the environment:
// stage-rest.click2mail.com is the sandbox (no real mail/charge),
// rest.click2mail.com is production. Empty creds = Click2Mail disabled.
export const C2M_USERNAME = () => (process.env.C2M_USERNAME ?? "").trim();
export const C2M_PASSWORD = () => (process.env.C2M_PASSWORD ?? "").trim();
export const C2M_BASE_URL = () =>
  (process.env.C2M_BASE_URL ?? "https://rest.click2mail.com/molpro").trim().replace(/\/+$/, "");
export const c2mEnabled = () => C2M_USERNAME().length > 0 && C2M_PASSWORD().length > 0;
export const c2mIsTestMode = () => /stage-rest\.click2mail\.com/i.test(C2M_BASE_URL());

export type MailProvider = "lob" | "click2mail" | "export";

// Is the given provider ready to dispatch an automated send? `export` never is
// (it is a manual CSV path), so the caller routes it to the export flow instead.
export function mailProviderConfigured(p: MailProvider): boolean {
  if (p === "lob") return lobEnabled();
  if (p === "click2mail") return c2mEnabled();
  return false;
}

export function mailProviderIsTestMode(p: MailProvider): boolean {
  if (p === "lob") return lobIsTestMode();
  if (p === "click2mail") return c2mIsTestMode();
  return false;
}
export const SL_TEMPLATE_TRANSPORT = () =>
  (process.env.SL_TEMPLATE_TRANSPORT ?? "post") as "post" | "table";

// SL delivers per-build: one POST per prospect to /api/builds (no batch endpoint).
// Defaults to the shared SITELAUNCHR_API_URL (/api/builds) the `wr` source already
// uses — wr-template hits the same endpoint, only the source/auth differ.
export const SL_TEMPLATE_BUILD_URL = () =>
  (process.env.SL_TEMPLATE_BUILD_URL ?? process.env.SITELAUNCHR_API_URL ?? "").trim();

// wr-template is a distinct SL source from `wr`, so the operator provisions it
// its own sources row → its own api_key + HMAC secret. These are SEPARATE from
// SITELAUNCHR_API_KEY / SITELAUNCHR_HMAC_SECRET (which belong to the `wr` source).
export const SL_TEMPLATE_SOURCE_ID = "wr-template";
export const SL_TEMPLATE_API_KEY = () => (process.env.SL_TEMPLATE_API_KEY ?? "").trim();
export const SL_TEMPLATE_HMAC_SECRET = () => (process.env.SL_TEMPLATE_HMAC_SECRET ?? "").trim();

// Stage-2 conversion endpoint (POST /api/conversions on SL) — fires the Kura
// promote when a prospect converts. Distinct route from intake (/api/builds),
// signed with the SAME wr-template creds. Defaults to deriving the conversion
// URL from the build URL by swapping the path, so a single SITELAUNCHR_API_URL
// configures both; override explicitly with SL_TEMPLATE_CONVERSION_URL.
export const SL_TEMPLATE_CONVERSION_URL = () => {
  const explicit = (process.env.SL_TEMPLATE_CONVERSION_URL ?? "").trim();
  if (explicit) return explicit;
  const build = SL_TEMPLATE_BUILD_URL();
  if (!build) return "";
  try {
    const u = new URL(build);
    u.pathname = "/api/conversions";
    return u.toString();
  } catch {
    return "";
  }
};
