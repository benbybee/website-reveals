/**
 * Firecrawl SaaS wrapper for the /sales-v2 scrape endpoint.
 *
 * Two outputs we care about:
 *  1. `branding` — colors, fonts, logo URL (Firecrawl runs an LLM to pick the
 *     logo from candidates and infer the color palette from inline styles +
 *     fetched CSS). Returns hex codes with semantic roles.
 *  2. `json` — structured business info via LLM extraction against our schema.
 *
 * Both are returned in one round-trip per Firecrawl docs.
 *
 * Env: FIRECRAWL_API_KEY (required at runtime; empty → throws)
 */

const FIRECRAWL_API = "https://api.firecrawl.dev/v2/scrape";
const TIMEOUT_MS = 60_000;

export interface FirecrawlBranding {
  colors?: {
    primary?: string;
    secondary?: string;
    accent?: string;
    background?: string;
    textPrimary?: string;
    link?: string;
    [k: string]: string | undefined;
  };
  fonts?: Array<{ family: string; role?: string }>;
  images?: {
    logo?: string;
    favicon?: string;
    ogImage?: string;
    logoAlt?: string;
    logoHref?: string;
  };
  personality?: { tone?: string; energy?: string; targetAudience?: string };
  confidence?: { colors?: number; buttons?: number; overall?: number };
}

export interface FirecrawlBusinessJson {
  business_name?: string;
  tagline?: string;
  phone?: string;
  email?: string;
  address?: string;
  service_areas?: string[];
  services?: string[];
  social_media?: Record<string, string>;
  hero_image_url?: string;
  gallery_image_urls?: string[];
  about_text?: string;
  testimonials?: Array<{ quote: string; author: string }>;
}

export interface ScrapeResult {
  url: string;
  branding: FirecrawlBranding;
  business: FirecrawlBusinessJson;
  metadata: Record<string, unknown>;
  raw_credits_used?: number;
}

const BUSINESS_JSON_SCHEMA = {
  type: "object",
  properties: {
    business_name: { type: "string" },
    tagline: { type: "string" },
    phone: { type: "string" },
    email: { type: "string" },
    address: { type: "string" },
    service_areas: { type: "array", items: { type: "string" } },
    services: {
      type: "array",
      items: { type: "string" },
      description: "List of services or products offered",
    },
    social_media: {
      type: "object",
      properties: {
        facebook: { type: "string" },
        instagram: { type: "string" },
        twitter: { type: "string" },
        linkedin: { type: "string" },
        youtube: { type: "string" },
      },
    },
    hero_image_url: {
      type: "string",
      description:
        "URL of the main hero/banner image on the homepage. Skip if it's just the logo.",
    },
    gallery_image_urls: {
      type: "array",
      items: { type: "string" },
      description:
        "URLs of meaningful content images (work samples, team, products) — exclude decorative icons and logos. Max 8.",
    },
    about_text: { type: "string", description: "Short paragraph about the business if present" },
    testimonials: {
      type: "array",
      items: {
        type: "object",
        properties: { quote: { type: "string" }, author: { type: "string" } },
      },
    },
  },
  required: ["business_name"],
};

const BUSINESS_JSON_PROMPT =
  "Extract business contact and content info from this website. Return only what's explicitly on the site, not inferred. For services, list the actual offerings the business provides, not navigation labels.";

export async function scrapeBusinessSite(url: string): Promise<ScrapeResult> {
  const apiKey = (process.env.FIRECRAWL_API_KEY || "").trim();
  if (!apiKey) {
    throw new Error("FIRECRAWL_API_KEY not configured");
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetch(FIRECRAWL_API, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        url,
        formats: [
          "branding",
          {
            type: "json",
            prompt: BUSINESS_JSON_PROMPT,
            schema: BUSINESS_JSON_SCHEMA,
          },
        ],
        onlyMainContent: false,
      }),
      signal: controller.signal,
    });
  } catch (err) {
    clearTimeout(timeoutId);
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("aborted") || msg.includes("AbortError")) {
      throw new Error(`Firecrawl scrape timed out after ${TIMEOUT_MS}ms`);
    }
    throw new Error(`Firecrawl scrape failed: ${msg}`);
  }
  clearTimeout(timeoutId);

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Firecrawl returned HTTP ${res.status}: ${text.slice(0, 300)}`);
  }

  const body = (await res.json()) as {
    success?: boolean;
    data?: {
      branding?: FirecrawlBranding;
      json?: FirecrawlBusinessJson;
      metadata?: Record<string, unknown>;
    };
    error?: string;
  };

  if (body.success === false) {
    throw new Error(`Firecrawl returned success=false: ${body.error || "no error message"}`);
  }

  const data = body.data || {};
  return {
    url,
    branding: data.branding || {},
    business: data.json || {},
    metadata: data.metadata || {},
    raw_credits_used: (data.metadata as { creditsUsed?: number })?.creditsUsed,
  };
}

export interface BrandDNA {
  url: string;
  logoUrl?: string;
  primaryColor?: string;
  colors: FirecrawlBranding["colors"];
  creditsUsed?: number;
}

/**
 * Branding-only scrape for the templates pipeline. Unlike scrapeBusinessSite,
 * this requests ONLY the `branding` format (no json extraction) — we want just
 * the logo and a single primary color so the SL preview looks like the
 * prospect's brand. Dropping the json format avoids the 4 LLM extraction
 * credits per page, so this is the cheapest way to get brand DNA at scale.
 *
 * Logo falls back to favicon when no proper logo is detected. Primary color
 * falls back through accent → link so we still surface *a* brand color when
 * the LLM doesn't tag one as "primary".
 */
export async function scrapeBrandDNA(url: string): Promise<BrandDNA> {
  const apiKey = (process.env.FIRECRAWL_API_KEY || "").trim();
  if (!apiKey) {
    throw new Error("FIRECRAWL_API_KEY not configured");
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetch(FIRECRAWL_API, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ url, formats: ["branding"], onlyMainContent: false }),
      signal: controller.signal,
    });
  } catch (err) {
    clearTimeout(timeoutId);
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("aborted") || msg.includes("AbortError")) {
      throw new Error(`Firecrawl brand scrape timed out after ${TIMEOUT_MS}ms`);
    }
    throw new Error(`Firecrawl brand scrape failed: ${msg}`);
  }
  clearTimeout(timeoutId);

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Firecrawl returned HTTP ${res.status}: ${text.slice(0, 300)}`);
  }

  const body = (await res.json()) as {
    success?: boolean;
    data?: { branding?: FirecrawlBranding; metadata?: Record<string, unknown> };
    error?: string;
  };

  if (body.success === false) {
    throw new Error(`Firecrawl returned success=false: ${body.error || "no error message"}`);
  }

  const branding = body.data?.branding || {};
  const colors = branding.colors || {};
  const logoUrl = branding.images?.logo || branding.images?.favicon || undefined;
  const primaryColor = pickHex(colors.primary) || pickHex(colors.accent) || pickHex(colors.link);

  return {
    url,
    logoUrl,
    primaryColor,
    colors,
    creditsUsed: (body.data?.metadata as { creditsUsed?: number })?.creditsUsed,
  };
}

function pickHex(v: string | undefined): string | undefined {
  return typeof v === "string" && v.startsWith("#") ? v : undefined;
}

/**
 * Cheap heuristic helper for the UI — returns the set of color hex codes
 * the rep should be shown for accept/reject, in palette priority order.
 * Dedupes (sometimes Firecrawl returns the same hex under multiple roles).
 */
export function extractDisplayPalette(branding: FirecrawlBranding): Array<{ hex: string; role: string }> {
  const colors = branding.colors || {};
  const order: Array<keyof typeof colors> = [
    "primary",
    "secondary",
    "accent",
    "background",
    "textPrimary",
    "link",
  ];
  const seen = new Set<string>();
  const out: Array<{ hex: string; role: string }> = [];
  for (const role of order) {
    const v = colors[role];
    if (typeof v !== "string" || !v.startsWith("#")) continue;
    const key = v.toUpperCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ hex: v, role: String(role) });
  }
  return out;
}
