import { SHARED_INSTRUCTIONS, sanitizeValue } from "./base";

/**
 * Novalux has a custom single-page form with fewer fields.
 * The brief is built manually since it doesn't use FORM_STEPS.
 */
export function buildNovaluxPrompt(formData: Record<string, unknown>): string {
  const fd = formData as Record<string, string | undefined>;
  const businessName = fd.business_name || "Client";

  const brief = [
    `### Business Details`,
    fd.business_name ? `**Business Name:** ${sanitizeValue(fd.business_name)}` : "",
    fd.contact_person ? `**Primary Contact:** ${sanitizeValue(fd.contact_person)}` : "",
    fd.email ? `**Email:** ${sanitizeValue(fd.email)}` : "",
    fd.phone ? `**Phone:** ${sanitizeValue(fd.phone)}` : "",
    fd.address ? `**Address:** ${sanitizeValue(fd.address)}` : "",
    "",
    `### Service Area`,
    fd.service_areas ? sanitizeValue(fd.service_areas) : "Not specified",
    "",
    `### Domain`,
    fd.domain_name ? `**Domain:** ${sanitizeValue(fd.domain_name)}` : "No domain specified",
    fd.dns_provider ? `**DNS Provider:** ${sanitizeValue(fd.dns_provider)}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  return `You are building a WordPress website for "${businessName}".

## Mode: NovaLux Client
This is a NovaLux partner client. Build a professional site based on the info provided:
- Pages: Home, About, Services, Contact — plus any others the business details suggest.
- Use a clean, modern design appropriate for their industry.
- Write compelling copy based on the business name, services, and service areas.
${SHARED_INSTRUCTIONS}
## Client Brief

${brief}`;
}
