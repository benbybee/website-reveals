import { SHARED_INSTRUCTIONS, sanitizeValue } from "./base";

/**
 * New Client quick intake — minimal fields: business name, current URL, details.
 * Claude Code must scrape the existing site to understand the business.
 */
export function buildNewClientPrompt(formData: Record<string, unknown>): string {
  const fd = formData as Record<string, string | undefined>;
  const businessName = fd.business_name || "Client";

  const brief = [
    `### Business Details`,
    fd.business_name ? `**Business Name:** ${sanitizeValue(fd.business_name)}` : "",
    fd.current_url ? `**Current Website:** ${sanitizeValue(fd.current_url)}` : "",
    "",
    `### Additional Context`,
    fd.details ? sanitizeValue(fd.details) : "No additional details provided.",
  ]
    .filter(Boolean)
    .join("\n");

  return `You are building a WordPress website for "${businessName}".

## Mode: New Client (Minimal Intake)
This client submitted a quick intake form with only their business name, current website URL, and optional notes.
You have very little information — here's how to handle it:

1. **Scrape their existing website** at the URL provided to understand:
   - What industry/niche they're in
   - What services or products they offer
   - Their brand colors, tone, and visual style
   - Their contact info, service areas, and any testimonials
   - Their current page structure

2. **Use what you learn to build a significantly better version** of their site:
   - Modern, conversion-focused design
   - Clear service pages with compelling copy
   - Strong CTAs and contact integration
   - Professional layout that outperforms their current site

3. If no current URL is provided or the site is unreachable, build a clean professional site based on the business name and any details provided.
${SHARED_INSTRUCTIONS}
## Client Brief

${brief}`;
}
