import { describe, it, expect, vi, afterEach } from "vitest";
import { runActor, recordCostFromRun } from "./client";

afterEach(() => {
  vi.restoreAllMocks();
  delete process.env.APIFY_TOKEN;
});

describe("runActor", () => {
  it("starts an async run and returns the dataset items + authoritative run id", async () => {
    process.env.APIFY_TOKEN = "tok123";
    const items = [{ a: 1 }, { a: 2 }];
    // runActor starts the run async (POST /acts/{id}/runs) to get an authoritative
    // run id, then fetches items from the run's dataset. Mock both calls by URL.
    const fetchMock = vi.fn((url: string) => {
      if (typeof url === "string" && url.includes("/runs?")) {
        return Promise.resolve(
          new Response(
            JSON.stringify({ data: { id: "run-abc", status: "SUCCEEDED", defaultDatasetId: "ds-1" } }),
            { status: 201, headers: { "content-type": "application/json" } },
          ),
        );
      }
      return Promise.resolve(
        new Response(JSON.stringify(items), { status: 200, headers: { "content-type": "application/json" } }),
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    const input = { searchStringsArray: ["pest control Gilbert AZ"], maxCrawledPlaces: 3 };
    const res = await runActor("compass/crawler-google-places", input);

    // First call starts the async run (not the old run-sync endpoint).
    const [startUrl, startOpts] = fetchMock.mock.calls[0];
    expect(startUrl).toContain("/acts/compass~crawler-google-places/runs");
    expect(startUrl).toContain("token=tok123");
    expect(startOpts.method).toBe("POST");
    expect(startOpts.headers["content-type"]).toBe("application/json");
    expect(startOpts.body).toBe(JSON.stringify(input));
    // Items come from the run's dataset; run id is read off the run object.
    expect(res.items).toEqual(items);
    expect(res.runId).toBe("run-abc");
  });

  it("throws on a non-2xx response", async () => {
    process.env.APIFY_TOKEN = "tok123";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("nope", { status: 500 })),
    );
    await expect(runActor("x/y", {})).rejects.toThrow();
  });
});

describe("recordCostFromRun", () => {
  it("computes usd from units x actor rate and inserts a cost row", async () => {
    const inserted: unknown[] = [];
    const db = {
      from: (table: string) => ({
        insert: (row: unknown) => {
          inserted.push({ table, row });
          return Promise.resolve({ error: null });
        },
      }),
    };

    await recordCostFromRun(db as never, {
      campaignId: "camp-1",
      stage: "discover",
      actor: "compass/crawler-google-places",
      units: 100,
      runId: "run-abc",
    });

    expect(inserted).toHaveLength(1);
    const { table, row } = inserted[0] as { table: string; row: Record<string, unknown> };
    expect(table).toBe("tpl_cost_events");
    expect(row.campaign_id).toBe("camp-1");
    expect(row.stage).toBe("discover");
    expect(row.units).toBe(100);
    expect(row.usd).toBeCloseTo(0.7, 5); // 100 * 0.007
    expect(row.run_id).toBe("run-abc");
  });
});
