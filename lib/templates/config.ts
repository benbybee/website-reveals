export function templatesEnabled(): boolean {
  return process.env.TEMPLATES_ENABLED === "1";
}

export const APIFY_TOKEN = () => process.env.APIFY_TOKEN ?? "";
export const SL_TEMPLATE_TRANSPORT = () =>
  (process.env.SL_TEMPLATE_TRANSPORT ?? "post") as "post" | "table";
export const SL_TEMPLATE_BATCH_URL = () => process.env.SL_TEMPLATE_BATCH_URL ?? "";
