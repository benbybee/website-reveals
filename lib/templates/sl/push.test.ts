import { describe, it, expect, vi, afterEach } from "vitest";
import { buildPayloads, assembleAndPush } from "./push";
import type { CanonicalRecord } from "../types";

afterEach(() => vi.restoreAllMocks());

const rec: CanonicalRecord = {
  source_id: "wr-tpl-1",
  business_name: "Joe",
  industry_slug: "home-services",
  address: { street: "1 Main", city: "Mesa", state: "AZ", zip: "85201", country: "US" },
  phone: "+14805551234",
  photos: [{ slot: "hero", src_url: "https://x/p.jpg" }],
};

// Thenable chain stub: every builder method returns the builder; awaiting it
// resolves to `awaited`; .single()/.maybeSingle() resolve to `single`.
function chain(awaited: unknown, single: unknown) {
  const b: Record<string, unknown> = {};
  for (const m of ["select", "eq", "is", "in", "gte", "order", "update", "insert", "delete"]) {
    b[m] = () => b;
  }
  b.single = () => Promise.resolve(single);
  b.maybeSingle = () => Promise.resolve(single);
  b.then = (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) =>
    Promise.resolve(awaited).then(res, rej);
  return b;
}

function mockDb(opts: { prospects: { record: CanonicalRecord }[]; ready: unknown[] }) {
  return {
    from(table: string) {
      if (table === "tpl_prospects") return chain({ data: opts.prospects, error: null }, null);
      if (table === "tpl_industries") return chain({ data: opts.ready, error: null }, null);
      if (table === "tpl_sl_batches")
        return chain({ error: null }, { data: { id: "batch-row" }, error: null });
      return chain({ data: [], error: null }, { data: null, error: null });
    },
  };
}

describe("buildPayloads", () => {
  it("maps records to SL per-build payloads", () => {
    const builds = buildPayloads([rec, { ...rec, source_id: "wr-tpl-2" }]);
    expect(builds.length).toBe(2);
    expect(builds[0]).toHaveProperty("brief.business_name", "Joe");
    expect(builds[0].external_id).toBe("wr-tpl-1");
  });
});

describe("assembleAndPush — dry run", () => {
  it("builds + persists a batch row without dispatching", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock as never);

    const db = mockDb({
      prospects: [{ record: rec }],
      ready: [{ slug: "home-services", display_name: "Home Services", sl_slug: "home-services" }],
    });

    const out = await assembleAndPush(db as never, "camp", { dryRun: true });

    expect(out.recordCount).toBe(1);
    expect(out.dryRun).toBe(true);
    expect(out.skipped ?? []).toHaveLength(0);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("assembleAndPush — template-coverage gate (gap 1)", () => {
  it("drops prospects whose industry has no live template, with a reason", async () => {
    const supported = { ...rec, source_id: "wr-tpl-hvac", industry_slug: "hvac" };
    const unsupported = { ...rec, source_id: "wr-tpl-plumb", industry_slug: "plumbing" };

    const db = mockDb({
      prospects: [{ record: supported }, { record: unsupported }],
      // Only hvac is template-ready.
      ready: [{ slug: "hvac", display_name: "HVAC", sl_slug: "hvac" }],
    });

    const out = await assembleAndPush(db as never, "camp", { dryRun: true });

    expect(out.recordCount).toBe(1); // only the supported one becomes a build
    expect(out.skipped).toHaveLength(1);
    expect(out.skipped?.[0]).toMatchObject({
      source_id: "wr-tpl-plumb",
      industry: "plumbing",
      reason: "template_not_ready",
    });
  });
});
