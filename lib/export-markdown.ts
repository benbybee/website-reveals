import { FORM_STEPS, QUICK_STEPS, STANDARD_STEPS, type Question } from "@/lib/form-steps";

const DNS_LABELS: Record<string, string> = {
  godaddy: "GoDaddy",
  namecheap: "Namecheap",
  cloudflare: "Cloudflare",
  google: "Google / Squarespace",
  networksolutions: "Network Solutions",
  other: "Other / Not sure",
};

export function generateMarkdown(
  formData: Record<string, unknown>,
  dnsProvider: string | null,
  submittedAt: string | null,
): string {
  const str = (key: string): string | undefined => {
    const v = formData[key];
    if (Array.isArray(v)) return v.join(", ");
    return typeof v === "string" ? v : undefined;
  };
  const name = str("business_name") || "Unknown Business";
  const source = str("_source") || "claim-your-site";
  const date = submittedAt
    ? new Date(submittedAt).toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
      })
    : "N/A";

  const lines: string[] = [];
  lines.push(`# ${name} — Website Brief`);
  lines.push("");
  lines.push(`**Source:** ${source} | **Submitted:** ${date}`);
  lines.push("");

  // Business Details
  lines.push("## Business Details");
  if (str("business_name")) lines.push(`- **Business Name:** ${str("business_name")}`);
  if (str("contact_person")) lines.push(`- **Contact:** ${str("contact_person")}`);
  if (str("email")) lines.push(`- **Email:** ${str("email")}`);
  if (str("phone")) lines.push(`- **Phone:** ${str("phone")}`);
  if (str("address")) lines.push(`- **Address:** ${str("address")}`);
  if (str("current_url")) lines.push(`- **Current URL:** ${str("current_url")}`);
  lines.push("");

  // Service Area
  if (str("service_areas")) {
    lines.push("## Service Area");
    lines.push(str("service_areas")!);
    lines.push("");
  }

  // Domain & DNS
  if (str("domain_name") || dnsProvider) {
    lines.push("## Domain & DNS");
    if (str("domain_name")) lines.push(`- **Domain:** ${str("domain_name")}`);
    if (dnsProvider) lines.push(`- **DNS Provider:** ${DNS_LABELS[dnsProvider] || dnsProvider}`);
    lines.push("");
  }

  // Additional Details
  if (str("details")) {
    lines.push("## Additional Details");
    lines.push(str("details")!);
    lines.push("");
  }

  // Questionnaire Responses (from multi-step forms)
  const mode = str("_mode");
  let steps = FORM_STEPS;
  if (mode === "quick") steps = QUICK_STEPS;
  else if (mode === "standard") steps = STANDARD_STEPS;

  const knownKeys = new Set([
    "business_name", "contact_person", "email", "phone", "address",
    "current_url", "service_areas", "domain_name", "details",
    "_source", "_mode",
  ]);

  const questionnaireAnswers: { label: string; value: string }[] = [];
  const allQuestions: Question[] = steps.flatMap((s) => s.questions);

  for (const q of allQuestions) {
    if (knownKeys.has(q.id)) continue;
    const raw = formData[q.id];
    const val = Array.isArray(raw) ? raw.join(", ") : typeof raw === "string" ? raw : undefined;
    if (val && val.trim()) {
      questionnaireAnswers.push({ label: q.label, value: val });
    }
  }

  if (questionnaireAnswers.length > 0) {
    lines.push("## Questionnaire Responses");
    for (const a of questionnaireAnswers) {
      lines.push(`### ${a.label}`);
      lines.push(a.value);
      lines.push("");
    }
  }

  return lines.join("\n");
}
