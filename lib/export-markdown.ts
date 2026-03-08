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
  const fd = formData as Record<string, string | undefined>;
  const name = fd.business_name || "Unknown Business";
  const source = fd._source || "claim-your-site";
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
  if (fd.business_name) lines.push(`- **Business Name:** ${fd.business_name}`);
  if (fd.contact_person) lines.push(`- **Contact:** ${fd.contact_person}`);
  if (fd.email) lines.push(`- **Email:** ${fd.email}`);
  if (fd.phone) lines.push(`- **Phone:** ${fd.phone}`);
  if (fd.address) lines.push(`- **Address:** ${fd.address}`);
  if (fd.current_url) lines.push(`- **Current URL:** ${fd.current_url}`);
  lines.push("");

  // Service Area
  if (fd.service_areas) {
    lines.push("## Service Area");
    lines.push(fd.service_areas);
    lines.push("");
  }

  // Domain & DNS
  if (fd.domain_name || dnsProvider) {
    lines.push("## Domain & DNS");
    if (fd.domain_name) lines.push(`- **Domain:** ${fd.domain_name}`);
    if (dnsProvider) lines.push(`- **DNS Provider:** ${DNS_LABELS[dnsProvider] || dnsProvider}`);
    lines.push("");
  }

  // Additional Details
  if (fd.details) {
    lines.push("## Additional Details");
    lines.push(fd.details);
    lines.push("");
  }

  // Questionnaire Responses (from multi-step forms)
  const mode = fd._mode as string | undefined;
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
    const val = fd[q.id];
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
