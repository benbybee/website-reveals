export function templatesEnabled(): boolean {
  return process.env.TEMPLATES_ENABLED === "1";
}

export const APIFY_TOKEN = () => process.env.APIFY_TOKEN ?? "";
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
