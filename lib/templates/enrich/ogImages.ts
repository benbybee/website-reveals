// Deterministic homepage asset extraction (gap 2) — pure HTML parse, NO LLM and
// NO Firecrawl. Pulls a logo candidate (apple-touch-icon → og:logo → favicon)
// and content photos (og:image + CSS hero backgrounds + real / lazy <img> +
// srcset), absolutized against the page URL, with data-URIs, tracking pixels,
// tiny icons, AND brand marks (logos / service icons / transparent PNGs) dropped
// so a template's gallery gets real photography, not the logo repeated as icons.

export interface SiteAssets {
  logoUrl?: string;
  photos: string[];
}

const MAX_PHOTOS = 6;

// Obvious non-content junk: tracking beacons, spacers, analytics pixels, sprites.
const JUNK =
  /(1x1|pixel|spacer|blank\.(gif|png)|beacon|\/tr\?|google-analytics|googletagmanager|doubleclick|facebook\.com\/tr|sprite)/i;

// Brand marks are NOT content photos — the logo is captured separately, and
// service-category icons / transparent PNGs are decoration, not photography.
// `png-alpha` / `transparent` almost always signal an icon or logo on these
// sites (real photos are opaque jpg/webp).
const NON_PHOTO =
  /(logo|favicon|apple-touch|png-alpha|transparent|[-_/]icons?[-_/.]|\bicons?\b|badge|award)/i;

// Framework starter-kit default marks are NOT a brand logo — shipping vite.svg as
// the logo is worse than no logo (it also suppresses the Firecrawl fallback that
// could render the JS SPA and find the real one). Drop them from logo detection.
const FRAMEWORK_DEFAULT_LOGO =
  /(\/(vite|next|nuxt|react|vue|svelte|gatsby|remix|astro|angular)\.svg|logo(192|512)\.png)(\?|$)/i;

/** Parse the attributes of a single tag string into a lowercased-key map. */
function attrs(tag: string): Record<string, string> {
  const out: Record<string, string> = {};
  const re = /([a-zA-Z_:-]+)\s*=\s*["']([^"']*)["']/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(tag))) out[m[1].toLowerCase()] = m[2];
  return out;
}

function tags(html: string, name: string): Record<string, string>[] {
  return [...html.matchAll(new RegExp(`<${name}\\b[^>]*>`, "gi"))].map((m) => attrs(m[0]));
}

/** Resolve a src against the page URL; null for empty / data: / unparseable. */
function resolveUrl(src: string | undefined, baseUrl: string): string | null {
  const s = (src ?? "").trim();
  if (!s || s.startsWith("data:")) return null;
  try {
    return new URL(s, baseUrl).toString();
  } catch {
    return null;
  }
}

function firstResolvable(candidates: (string | undefined)[], baseUrl: string): string | undefined {
  for (const c of candidates) {
    const u = resolveUrl(c, baseUrl);
    if (u) return u;
  }
  return undefined;
}

/** Largest URL from a srcset ("a.jpg 320w, b.jpg 1200w") by width descriptor. */
function largestFromSrcset(srcset?: string): string | undefined {
  if (!srcset) return undefined;
  let best: string | undefined;
  let bestW = -1;
  for (const part of srcset.split(",")) {
    const [url, w] = part.trim().split(/\s+/);
    const width = w && /^\d+w$/.test(w) ? parseInt(w, 10) : 0;
    if (url && width >= bestW) {
      bestW = width;
      best = url;
    }
  }
  return best;
}

export function extractSiteAssets(html: string, baseUrl: string): SiteAssets {
  const metas = tags(html, "meta");
  const links = tags(html, "link");
  const imgs = tags(html, "img");

  const relIs = (a: Record<string, string>, want: string) =>
    (a.rel ?? "").toLowerCase().split(/\s+/).includes(want);
  const metaKey = (a: Record<string, string>) => (a.property ?? a.name ?? "").toLowerCase();

  const appleTouch = links.find((a) => (a.rel ?? "").toLowerCase().includes("apple-touch-icon"))?.href;
  const ogLogo = metas.find((a) => metaKey(a) === "og:logo")?.content;
  const favicon = links.find((a) => relIs(a, "icon") || relIs(a, "shortcut"))?.href;
  const logoUrl = firstResolvable(
    [appleTouch, ogLogo, favicon].filter((h) => h && !FRAMEWORK_DEFAULT_LOGO.test(h)),
    baseUrl,
  );

  const ogImages = metas
    .filter((a) => ["og:image", "og:image:url", "og:image:secure_url"].includes(metaKey(a)))
    .map((a) => a.content);

  // CSS background-image url(...) from inline styles + <style> blocks (heroes).
  const bgUrls = [
    ...html.matchAll(/background(?:-image)?\s*:\s*url\(\s*['"]?([^'")]+)['"]?\s*\)/gi),
  ].map((m) => m[1]);

  // Content imgs: real src + lazy attrs + the largest srcset. Drop declared-tiny.
  const imgSrcs = imgs
    .filter((a) => {
      const w = Number(a.width);
      const h = Number(a.height);
      return !((w && w <= 32) || (h && h <= 32));
    })
    .flatMap((a) => [
      a.src,
      a["data-src"],
      a["data-lazy-src"],
      a["data-original"],
      a["data-bg"],
      largestFromSrcset(a.srcset),
    ]);

  const seen = new Set<string>();
  const photos: string[] = [];
  for (const raw of [...ogImages, ...bgUrls, ...imgSrcs]) {
    if (!raw || JUNK.test(raw) || NON_PHOTO.test(raw)) continue;
    const u = resolveUrl(raw, baseUrl);
    if (!u || u === logoUrl || seen.has(u)) continue;
    seen.add(u);
    photos.push(u);
    if (photos.length >= MAX_PHOTOS) break;
  }

  return logoUrl ? { logoUrl, photos } : { photos };
}
