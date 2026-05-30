import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { scoreStaleness, type TechStackResult, type LighthouseResult } from "./staleness";

const techstack = JSON.parse(
  readFileSync(fileURLToPath(new URL("../__fixtures__/techstack.json", import.meta.url)), "utf8"),
) as TechStackResult[];
const lighthouse = JSON.parse(
  readFileSync(fileURLToPath(new URL("../__fixtures__/lighthouse.json", import.meta.url)), "utf8"),
) as LighthouseResult[];

describe("scoreStaleness (fixture-based)", () => {
  it("does not flag a healthy real site (https, reachable, perf 72, seo 92)", () => {
    const result = scoreStaleness({ techstack: techstack[0], lighthouse: lighthouse[0] });
    expect(result.stale).toBe(false);
    expect(result.signals).toEqual([]);
    expect(result.score).toBe(0);
  });

  it("flags a non-https site as stale (hard signal)", () => {
    const result = scoreStaleness({
      techstack: { url: "http://example.com", techCount: 3, status: "success", statusCode: 200 },
    });
    expect(result.stale).toBe(true);
    expect(result.signals).toContain("no_https");
  });

  it("flags an unreachable site as stale", () => {
    const result = scoreStaleness({
      techstack: { url: "https://down.example", status: "error", statusCode: 503, error: "timeout" },
    });
    expect(result.stale).toBe(true);
    expect(result.signals).toContain("site_unreachable");
  });

  it("flags sub-threshold performance as stale", () => {
    const result = scoreStaleness({
      lighthouse: { results: [{ url: "https://slow.example", success: true, scores: { performance: { score: 31 }, seo: { score: 80 } } }] },
    });
    expect(result.stale).toBe(true);
    expect(result.signals).toContain("low_performance");
  });

  it("treats low SEO and no detected tech as soft signals only", () => {
    const result = scoreStaleness({
      techstack: { url: "https://ok.example", techCount: 0, status: "success", statusCode: 200 },
      lighthouse: { results: [{ url: "https://ok.example", success: true, scores: { performance: { score: 90 }, seo: { score: 22 } } }] },
    });
    expect(result.stale).toBe(false);
    expect(result.signals).toContain("no_detected_tech");
    expect(result.signals).toContain("low_seo");
    expect(result.score).toBe(2);
  });

  it("flags a failed lighthouse audit as a soft signal", () => {
    const result = scoreStaleness({
      lighthouse: { results: [{ url: "https://x.example", success: false }] },
    });
    expect(result.stale).toBe(false);
    expect(result.signals).toContain("audit_failed");
  });
});
