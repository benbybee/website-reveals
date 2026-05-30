import type { BrandColors } from "../types";

/**
 * Deterministic brand-color derivation. Given a candidate palette (hex strings —
 * e.g. the dominant colors of a logo), pick the 4 SL brand tokens:
 *   primary/accent  = the two most saturated colors
 *   neutral_dark    = darkest color
 *   neutral_light   = lightest color
 *
 * The pixel-level palette extraction from a logo image is wired in with the
 * Facebook/logo source; this is the pure transform SL's contract consumes.
 * Returns null when there aren't enough valid colors to fill the 4-key shape.
 */
export function brandColorsFromPalette(palette: string[]): BrandColors | null {
  const valid = palette.map(normalizeHex).filter((c): c is string => c !== null);
  const unique = [...new Set(valid)];
  if (unique.length < 2) return null;

  const byLum = [...unique].sort((a, b) => luminance(a) - luminance(b));
  const neutral_dark = byLum[0];
  const neutral_light = byLum[byLum.length - 1];

  const bySat = [...unique].sort((a, b) => saturation(b) - saturation(a));
  const primary = bySat[0];
  const accent = bySat.find((c) => c !== primary) ?? bySat[1] ?? bySat[0];

  return { primary, accent, neutral_dark, neutral_light };
}

/** Normalize "#abc" / "abcdef" / "#ABCDEF" → lowercase "#rrggbb", else null. */
export function normalizeHex(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let h = raw.trim().toLowerCase().replace(/^#/, "");
  if (/^[0-9a-f]{3}$/.test(h)) h = h.split("").map((c) => c + c).join("");
  if (!/^[0-9a-f]{6}$/.test(h)) return null;
  return `#${h}`;
}

function rgb(hex: string): [number, number, number] {
  const h = hex.replace(/^#/, "");
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

/** Relative luminance (0–255 scale, perceptual weights). */
export function luminance(hex: string): number {
  const [r, g, b] = rgb(hex);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** HSL saturation (0–1). */
function saturation(hex: string): number {
  const [r, g, b] = rgb(hex).map((v) => v / 255) as [number, number, number];
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  if (max === min) return 0;
  const l = (max + min) / 2;
  const d = max - min;
  return l > 0.5 ? d / (2 - max - min) : d / (max + min);
}
