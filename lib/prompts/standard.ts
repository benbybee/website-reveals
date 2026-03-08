import { formatBrief, getStepsForFormType, SHARED_INSTRUCTIONS } from "./base";

export function buildStandardPrompt(formData: Record<string, unknown>): string {
  const brief = formatBrief(formData, getStepsForFormType("standard"));
  const businessName = (formData.business_name as string) || "Client";

  return `You are building a WordPress website for "${businessName}".

## Mode: Standard Build
This client provided solid detail across business info, goals, audience, brand, and services.
Build a comprehensive site:
- Pages: Home, About, individual Service pages, Contact, plus any others their goals suggest.
- Use their brand colors, personality descriptors, and look/feel preferences.
- Write copy that speaks directly to their target audience and addresses objections.
- Feature their differentiators and trust builders prominently.
- Include testimonials and FAQ sections if they provided that content.
${SHARED_INSTRUCTIONS}
## Client Brief

${brief}`;
}
