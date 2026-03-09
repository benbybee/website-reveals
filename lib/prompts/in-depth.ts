import { formatBrief, getStepsForFormType, SHARED_INSTRUCTIONS, buildImageInstructions, buildInspirationInstructions } from "./base";

export function buildInDepthPrompt(formData: Record<string, unknown>, fileUrls: string[] = []): string {
  const brief = formatBrief(formData, getStepsForFormType("in-depth"));
  const businessName = (formData.business_name as string) || "Client";
  const imageInstructions = buildImageInstructions(formData, fileUrls);
  const inspirationInstructions = buildInspirationInstructions(formData);

  const brandColors = formData.brand_colors as string | undefined;
  const hexCodes = formData.hex_codes as string | undefined;
  const colorDirective = brandColors || hexCodes
    ? `- **ENFORCE brand colors as the foundation:** ${brandColors || ""}${hexCodes ? ` (hex: ${hexCodes})` : ""}. Define as CSS custom properties and use them for ALL primary UI elements (buttons, headings, links, section backgrounds, borders, accents). The inspiration sites inform the design LANGUAGE — the client's colors are the design IDENTITY.`
    : `- No specific brand colors provided. Extract a palette from the inspiration sites the client admires, then adapt it: shift hues, adjust saturation, or recombine to create something inspired-by but not copied-from.`;

  return `You are building a WordPress website for "${businessName}".

## Mode: In-Depth Premium Build
This client completed the full 11-step questionnaire with extensive detail.
Build a premium, highly tailored site:
- Full page structure based on their specifications (see "Pages and Navigation" section).
- Deep competitive positioning woven into all copy.
- Address every FAQ and objection they listed — turn them into conversion-driving content.
- Brand personality, "do not" lists, and messaging preferences must be strictly followed.
- Include problem/solution framing from their customer insights.
- Blog templates if they requested blog content.

## Design Direction — Premium Quality Expected
This is the most detailed form type. The design must reflect that investment:
${colorDirective}
- **Typography must be intentional:** Select a Google Font pairing that embodies the brand personality. Use clear hierarchy: display font for hero headings, a complementary font for subheadings, and a highly readable body font. Vary weights and sizes across the page to create visual rhythm.
- **Layout must be diverse and sophisticated:** Use at least 3 different section layout patterns per page. Mix full-width, contained-width, split layouts, overlapping elements, and editorial grids. No two consecutive sections should use the same layout pattern.
- **Micro-interactions and polish:** Add subtle hover effects on cards and buttons, smooth scroll behavior, and CSS transitions. This should feel like a custom-designed site, not a template.
- **Whitespace is a design tool:** Use generous section padding (80-120px), intentional element spacing, and breathing room around CTAs. Premium sites have room to breathe.
${inspirationInstructions ? `\n${inspirationInstructions}\n` : ""}
${imageInstructions}
${SHARED_INSTRUCTIONS}
## Client Brief

${brief}`;
}
