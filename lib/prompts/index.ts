import type { FormType } from "@/lib/resolve-form-type";
import { buildQuickPrompt } from "./quick";
import { buildStandardPrompt } from "./standard";
import { buildInDepthPrompt } from "./in-depth";
import { buildNovaluxPrompt } from "./novalux";
import { buildNewClientPrompt } from "./new-client";

type PromptBuilder = (formData: Record<string, unknown>, fileUrls: string[]) => string;

/**
 * Registry of prompt builders keyed by form type.
 * To add a new form type:
 *   1. Create lib/prompts/<type>.ts with a buildXxxPrompt function
 *   2. Add it to this map
 */
const PROMPT_BUILDERS: Record<FormType, PromptBuilder> = {
  quick: buildQuickPrompt,
  standard: buildStandardPrompt,
  "in-depth": buildInDepthPrompt,
  novalux: buildNovaluxPrompt,
  "new-client": buildNewClientPrompt,
};

export function buildPrompt(
  formType: FormType,
  formData: Record<string, unknown>,
  fileUrls: string[] = [],
): string {
  const builder = PROMPT_BUILDERS[formType];
  if (!builder) {
    throw new Error(`No prompt template for form type: ${formType}`);
  }
  return builder(formData, fileUrls);
}
