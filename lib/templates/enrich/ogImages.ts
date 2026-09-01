// Deterministic homepage asset extraction (gap 2) — pure HTML parse, NO LLM and
// NO Firecrawl. Pulls a logo candidate (apple-touch-icon → og:logo → favicon)
// and content photos (og:image + hero <img>), absolutized against the page URL,
// with data-URIs, tracking pixels, and tiny icons dropped.

export interface SiteAssets {
  logoUrl?: string;
  photos: string[];
}

const MAX_PHOTOS = 6;

// Obvious non-content junk: tracking beacons, spacers, analytics pixels.
const JUNK =
  /(1x1|pixel|spacer|blank\.(gif|png)|beacon|\/tr\?|google-analytics|googletagmanager|doubleclick|facebook\.com\/tr)/i;

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
  const logoUrl = firstResolvable([appleTouch, ogLogo, favicon], baseUrl);

  const ogImages = metas
    .filter((a) => ["og:image", "og:image:url", "og:image:secure_url"].includes(metaKey(a)))
    .map((a) => a.content);

  const imgSrcs = imgs
    .filter((a) => {
      const w = Number(a.width);
      const h = Number(a.height);
      return !((w && w <= 32) || (h && h <= 32)); // drop declared-tiny icons
    })
    .map((a) => a.src || a["data-src"]);

  const seen = new Set<string>();
  const photos: string[] = [];
  for (const raw of [...ogImages, ...imgSrcs]) {
    if (!raw || JUNK.test(raw)) continue;
    const u = resolveUrl(raw, baseUrl);
    if (!u || u === logoUrl || seen.has(u)) continue;
    seen.add(u);
    photos.push(u);
    if (photos.length >= MAX_PHOTOS) break;
  }

  return logoUrl ? { logoUrl, photos } : { photos };
}
