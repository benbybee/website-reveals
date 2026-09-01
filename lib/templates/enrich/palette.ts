import { normalizeHex, luminance } from "./colors";

// Deterministic brand-palette extraction (gap 2) — pure HTML/CSS parse, NO LLM.
// Pulls #hex / rgb() / hsl() color tokens from inline styles + <style> blocks,
// ranks them by frequency, drops near-white/near-black noise, and returns the
// top few. This is the palette that REVIVES the currently-dead
// brandColorsFromPalette path (colors.ts), turning HTML colors into SL's 4
// brand tokens with zero LLM.

// Luminance is 0–255 (see colors.ts). Drop the extremes: page background white
// and body-text black are not brand colors and swamp the frequency ranking.
const NEAR_BLACK = 15;
const NEAR_WHITE = 240;
const MAX_HEXES = 6;

function toHex(r: number, g: number, b: number): string | null {
  const clamp = (n: number) => Math.max(0, Math.min(255, Math.round(n)));
  const h = (n: number) => clamp(n).toString(16).padStart(2, "0");
  return normalizeHex(`#${h(r)}${h(g)}${h(b)}`);
}

function hslToHex(h: number, s: number, l: number): string | null {
  const sat = s / 100;
  const lig = l / 100;
  const c = (1 - Math.abs(2 * lig - 1)) * sat;
  const hp = (((h % 360) + 360) % 360) / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  let r = 0;
  let g = 0;
  let b = 0;
  if (hp < 1) [r, g, b] = [c, x, 0];
  else if (hp < 2) [r, g, b] = [x, c, 0];
  else if (hp < 3) [r, g, b] = [0, c, x];
  else if (hp < 4) [r, g, b] = [0, x, c];
  else if (hp < 5) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  const m = lig - c / 2;
  return toHex((r + m) * 255, (g + m) * 255, (b + m) * 255);
}

/** Frequency-ranked brand hexes from a page's HTML/CSS, noise excluded. */
export function hexesFromHtml(html: string): string[] {
  const counts = new Map<string, number>();
  const bump = (hex: string | null) => {
    if (hex) counts.set(hex, (counts.get(hex) ?? 0) + 1);
  };

  for (const m of html.matchAll(/#([0-9a-fA-F]{6}|[0-9a-fA-F]{3})(?![0-9a-fA-F])/g)) {
    bump(normalizeHex(m[0]));
  }
  for (const m of html.matchAll(/rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})/gi)) {
    bump(toHex(+m[1], +m[2], +m[3]));
  }
  for (const m of html.matchAll(/hsla?\(\s*(\d{1,3})\s*,\s*(\d{1,3})%\s*,\s*(\d{1,3})%/gi)) {
    bump(hslToHex(+m[1], +m[2], +m[3]));
  }

  return [...counts.entries()]
    .filter(([hex]) => {
      const l = luminance(hex);
      return l > NEAR_BLACK && l < NEAR_WHITE;
    })
    .sort((a, b) => b[1] - a[1])
    .slice(0, MAX_HEXES)
    .map(([hex]) => hex);
}
