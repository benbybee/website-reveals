/**
 * Normalize a URL: add an https scheme only when none is present (we never
 * force http->https, to avoid breaking a URL that only resolves over http).
 * Returns null for empty/invalid input.
 */
export function absolutize(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed || /\s/.test(trimmed)) return null;
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const u = new URL(withScheme);
    if (!u.hostname.includes(".")) return null;
    return withScheme;
  } catch {
    return null;
  }
}
