import { formatBrief, getStepsForFormType, SHARED_INSTRUCTIONS, buildImageInstructions, buildInspirationInstructions } from "./base";

export function buildQuickPrompt(formData: Record<string, unknown>, fileUrls: string[] = []): string {
  const brief = formatBrief(formData, getStepsForFormType("quick"));
  const businessName = (formData.business_name as string) || "Client";
  const imageInstructions = buildImageInstructions(formData, fileUrls);
  const inspirationInstructions = buildInspirationInstructions(formData);

  return `You are building a WordPress website for "${businessName}".

## Mode: Quick Build
This client provided minimal information via a quick intake form.
Fill in reasonable defaults for anything not specified:
- Build the pages the client selected. If none were selected, default to: Home (with hero, services overview, CTA), About, Contact.
- Generate compelling copy based on the business type and services listed.
- Keep it simple — this client values speed over exhaustive detail.

## Design Direction
Do NOT default to a generic white-background, blue-primary, sans-serif template. Instead:
- **Research the client's industry** using Firecrawl — find 2-3 top competitors in their space and analyze their visual style.
- Pick a design personality that fits the industry: a law firm should feel authoritative and polished, a yoga studio should feel calm and organic, a tech startup should feel sharp and modern.
- Choose a non-default Google Font pairing (NOT Inter, Roboto, or Open Sans as body font).
- Use the client's brand colors if provided. If not, derive a palette from their industry — avoid generic blue/gray.
- Vary your layout: not every site needs a full-width hero with centered text. Consider split heroes, asymmetric layouts, overlapping sections, or editorial-style layouts.
${inspirationInstructions ? `\n${inspirationInstructions}\n` : ""}
${imageInstructions}
${SHARED_INSTRUCTIONS}
## Client Brief

${brief}`;
}
