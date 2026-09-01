import { describe, it, expect, afterEach } from "vitest";
import { runInstantPreview } from "./instantPreview";

afterEach(() => {
  delete process.env.REP_DAILY_BUDGET_USD;
  delete process.env.REP_DAILY_BUILD_LIMIT;
  delete process.env.SL_TEMPLATE_BUILD_EST_USD;
});

// db stub: tpl_industries via .maybeSingle(); tpl_cost_events (spend sum AND
// build count) via the awaited chain, resolving to { data, count }.
function mockDb(cfg: { industry?: unknown; spentRows?: { usd: number }[]; buildCount?: number }) {
  return {
    from() {
      const b: Record<string, unknown> = {};
      for (const m of ["select", "eq", "gte", "order"]) b[m] = () => b;
      b.maybeSingle = () => Promise.resolve({ data: cfg.industry ?? null, error: null });
      b.then = (res: (v: unknown) => unknown) =>
        Promise.resolve({ data: cfg.spentRows ?? [], count: cfg.buildCount ?? 0, error: null }).then(res);
      return b;
    },
  };
}

const rep = { rep_id: "rep-1", email: "rep@wr.co" };
const readyIndustry = {
  slug: "hvac",
  display_name: "HVAC",
  sl_slug: "hvac",
  sl_template_ready: true,
};

describe("runInstantPreview — guards", () => {
  it("rejects an industry with no live template (no paid Places call)", async () => {
    const db = mockDb({ industry: { ...readyIndustry, sl_template_ready: false } });
    const out = await runInstantPreview({
      db: db as never,
      rep,
      placeId: "place-1",
      industrySlug: "plumbing",
    });
    expect(out).toEqual({ ok: false, code: "template_not_ready" });
  });

  it("rejects when the rep hit the daily build-count cap (default 30)", async () => {
    const db = mockDb({ industry: readyIndustry, buildCount: 30 });
    const out = await runInstantPreview({
      db: db as never,
      rep,
      placeId: "place-1",
      industrySlug: "hvac",
    });
    expect(out).toEqual({ ok: false, code: "daily_limit", limit: 30 });
  });

  it("rejects when the rep is over the daily dollar budget (no paid Places call)", async () => {
    // Under the build-count cap, but recorded spend + one build's estimate > $10 cap.
    const db = mockDb({ industry: readyIndustry, buildCount: 2, spentRows: [{ usd: 10 }] });
    const out = await runInstantPreview({
      db: db as never,
      rep,
      placeId: "place-1",
      industrySlug: "hvac",
    });
    expect(out).toEqual({ ok: false, code: "over_budget", cap: 10 });
  });
});
