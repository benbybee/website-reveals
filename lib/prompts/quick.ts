import { formatBrief, getStepsForFormType, SHARED_INSTRUCTIONS } from "./base";

export function buildQuickPrompt(formData: Record<string, unknown>): string {
  const brief = formatBrief(formData, getStepsForFormType("quick"));
  const businessName = (formData.business_name as string) || "Client";

  return `You are building a WordPress website for "${businessName}".

## Mode: Quick Build
This client provided minimal information via a quick intake form.
Fill in reasonable defaults for anything not specified:
- Create a focused site: Home (with hero, services overview, CTA), About, Contact.
- Use a clean, professional design that fits their industry.
- Generate compelling copy based on the business type and services listed.
- Keep it simple — this client values speed over exhaustive detail.
${SHARED_INSTRUCTIONS}
## Client Brief

${brief}`;
}
