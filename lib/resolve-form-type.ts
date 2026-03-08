export type FormType = "quick" | "standard" | "in-depth" | "novalux" | "new-client";

/**
 * Derive the canonical form type from a form session's data.
 * Regular forms store _mode in formData. Custom forms store _source.
 * Future form types should add their _source value here.
 */
export function resolveFormType(
  formData: Record<string, unknown>,
): FormType {
  const source = formData._source as string | undefined;

  // Custom form sources take priority
  if (source === "novalux") return "novalux";
  if (source === "new-client") return "new-client";

  // Fall back to mode (quick/standard/in-depth)
  const mode = formData._mode as string | undefined;
  if (mode === "quick") return "quick";
  if (mode === "standard") return "standard";

  // Default to in-depth (the full 11-step form has no _mode set)
  return "in-depth";
}
