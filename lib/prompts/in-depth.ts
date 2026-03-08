import { formatBrief, getStepsForFormType, SHARED_INSTRUCTIONS } from "./base";

export function buildInDepthPrompt(formData: Record<string, unknown>): string {
  const brief = formatBrief(formData, getStepsForFormType("in-depth"));
  const businessName = (formData.business_name as string) || "Client";

  return `You are building a WordPress website for "${businessName}".

## Mode: In-Depth Premium Build
This client completed the full 11-step questionnaire with extensive detail.
Build a premium, highly tailored site:
- Full page structure based on their specifications (see "Pages and Navigation" section).
- Deep competitive positioning woven into all copy.
- Address every FAQ and objection they listed — turn them into conversion-driving content.
- Reference sites they admire should inform visual direction.
- Brand personality, "do not" lists, and messaging preferences must be strictly followed.
- Include problem/solution framing from their customer insights.
- Blog templates if they requested blog content.
${SHARED_INSTRUCTIONS}
## Client Brief

${brief}`;
}
