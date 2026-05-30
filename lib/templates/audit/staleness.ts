// Staleness scoring for the on-demand deep audit. Consumes the tech-stack and
// Lighthouse actor outputs (real shapes captured in Task 3.2) and flags sites
// that are weak enough to be worth replacing with a template build.

export interface TechStackResult {
  url?: string;
  technologies?: { name?: string; category?: string }[];
  techCount?: number;
  categories?: string[];
  status?: string;
  statusCode?: number;
  error?: string | null;
}

export interface LighthouseResult {
  results?: {
    url?: string;
    success?: boolean;
    scores?: Record<string, { score?: number }>;
  }[];
}

export interface StalenessResult {
  stale: boolean;
  score: number; // count of stale signals
  signals: string[];
}

const PERF_MIN = 50;
const SEO_MIN = 50;

/**
 * Score a site's staleness from tech-stack + Lighthouse audits. A site is
 * "stale" (replacement-worthy) when it has any hard signal: not HTTPS,
 * unreachable, or sub-threshold performance. Soft signals (low SEO, no detected
 * tech) add to the score but don't alone flip `stale`.
 */
export function scoreStaleness(input: {
  techstack?: TechStackResult | null;
  lighthouse?: LighthouseResult | null;
}): StalenessResult {
  const signals: string[] = [];
  const hard = new Set<string>();

  const ts = input.techstack;
  if (ts) {
    const url = ts.url ?? "";
    if (url && /^http:\/\//i.test(url)) {
      signals.push("no_https");
      hard.add("no_https");
    }
    const unreachable = (ts.status && ts.status !== "success") || (ts.statusCode ?? 0) >= 400 || !!ts.error;
    if (unreachable) {
      signals.push("site_unreachable");
      hard.add("site_unreachable");
    } else if ((ts.techCount ?? 0) === 0) {
      signals.push("no_detected_tech");
    }
  }

  const lhResult = input.lighthouse?.results?.[0];
  if (lhResult) {
    if (lhResult.success === false) {
      signals.push("audit_failed");
    } else {
      const perf = lhResult.scores?.performance?.score;
      if (typeof perf === "number" && perf < PERF_MIN) {
        signals.push("low_performance");
        hard.add("low_performance");
      }
      const seo = lhResult.scores?.seo?.score;
      if (typeof seo === "number" && seo < SEO_MIN) signals.push("low_seo");
    }
  }

  return { stale: hard.size > 0, score: signals.length, signals };
}
