import { SHARED_INSTRUCTIONS, sanitizeValue, buildImageInstructions } from "./base";

/**
 * New Client quick intake — minimal fields: business name, current URL, details.
 * Claude Code must scrape the existing site to understand the business.
 */
export function buildNewClientPrompt(formData: Record<string, unknown>, fileUrls: string[] = []): string {
  const fd = formData as Record<string, string | undefined>;
  const businessName = fd.business_name || "Client";
  const imageInstructions = buildImageInstructions(formData, fileUrls);

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

1. **Scrape their existing website with Firecrawl** at the URL provided. Extract EVERYTHING:
   - What industry/niche they're in
   - What services or products they offer
   - Their brand colors (extract exact hex values from CSS), tone, and visual style
   - Their contact info, service areas, and any testimonials
   - Their current page structure and navigation
   - **ALL images** — logo, hero images, team photos, product/service photos. Download and reuse these on the new site.

2. **Analyze their current design to understand what to keep and what to improve:**
   - If the current site has a distinctive style, evolve it — don't throw it away entirely
   - Keep their brand colors but apply them to a modern, polished design system
   - Maintain their content hierarchy but improve layout, typography, and spacing

3. **Build a significantly better version** that feels like a natural evolution:
   - Modern, conversion-focused design that respects their existing brand identity
   - Clear service pages with compelling copy refined from their current content
   - Strong CTAs and contact integration
   - Varied section layouts — do NOT default to centered-text-over-image for everything
   - Choose a Google Font pairing that matches their brand personality

4. If no current URL is provided or the site is unreachable, research their industry using Firecrawl and build a distinctive site based on competitor analysis.

${imageInstructions}
${SHARED_INSTRUCTIONS}
## Client Brief

${brief}`;
}
