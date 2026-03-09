import { formatBrief, getStepsForFormType, SHARED_INSTRUCTIONS, buildImageInstructions, buildInspirationInstructions } from "./base";

export function buildStandardPrompt(formData: Record<string, unknown>, fileUrls: string[] = []): string {
  const brief = formatBrief(formData, getStepsForFormType("standard"));
  const businessName = (formData.business_name as string) || "Client";
  const imageInstructions = buildImageInstructions(formData, fileUrls);
  const inspirationInstructions = buildInspirationInstructions(formData);

  const brandColors = formData.brand_colors as string | undefined;
  const hexCodes = formData.hex_codes as string | undefined;
  const colorDirective = brandColors || hexCodes
    ? `- **ENFORCE brand colors throughout:** ${brandColors || ""}${hexCodes ? ` (hex: ${hexCodes})` : ""}. Use these as CSS custom properties (--color-primary, --color-accent, etc.) and apply them consistently to headings, buttons, links, backgrounds, and accents. Do NOT substitute with defaults.`
    : `- The client did not provide specific brand colors. Research their industry and competitors to derive a distinctive, non-generic palette. Avoid defaulting to blue/gray.`;

  return `You are building a WordPress website for "${businessName}".

## Mode: Standard Build
This client provided solid detail across business info, goals, audience, brand, and services.
Build a comprehensive site:
- Build the pages the client selected. If none were selected, default to: Home, About, individual Service pages, Contact, plus any others their goals suggest.
- Write copy that speaks directly to their target audience and addresses objections.
- Feature their differentiators and trust builders prominently.
- Include testimonials and FAQ sections if they provided that content.

## Design Direction
${colorDirective}
- Use the client's personality descriptors and look/feel preferences to select typography, spacing, and visual weight. "Bold and energetic" means large type, strong contrast, dynamic layouts. "Elegant and minimal" means restrained palette, generous whitespace, refined serif fonts.
- Choose a Google Font pairing that matches the brand personality — NOT Inter, Roboto, or Open Sans unless the client specifically requested a neutral tech feel.
- Vary section layouts across the site. Alternate between: full-width heroes, split content (text + image), card grids, overlapping/offset layouts, editorial columns, and accent-background sections. Do NOT use the same centered-text-over-image pattern for every section.
${inspirationInstructions ? `\n${inspirationInstructions}\n` : ""}
${imageInstructions}
${SHARED_INSTRUCTIONS}
## Client Brief

${brief}`;
}
