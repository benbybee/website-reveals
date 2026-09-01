import { describe, it, expect, afterEach } from "vitest";
import { runInstantPreview } from "./instantPreview";

afterEach(() => {
  delete process.env.REP_DAILY_BUDGET_USD;
});

// db stub: tpl_industries via .maybeSingle(); tpl_cost_events via awaited chain.
function mockDb(cfg: { industry?: unknown; spentRows?: { usd: number }[] }) {
  return {
    from() {
      const b: Record<string, unknown> = {};
      for (const m of ["select", "eq", "gte", "order"]) b[m] = () => b;
      b.maybeSingle = () => Promise.resolve({ data: cfg.industry ?? null, error: null });
      b.then = (res: (v: unknown) => unknown) =>
        Promise.resolve({ data: cfg.spentRows ?? [], error: null }).then(res);
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

  it("rejects when the rep is over their daily budget (no paid Places call)", async () => {
    // Default cap $5; spent 4.99 + 0.021 estimate > 5 → over budget.
    const db = mockDb({ industry: readyIndustry, spentRows: [{ usd: 4.99 }] });
    const out = await runInstantPreview({
      db: db as never,
      rep,
      placeId: "place-1",
      industrySlug: "hvac",
    });
    expect(out).toEqual({ ok: false, code: "over_budget", cap: 5 });
  });
});
