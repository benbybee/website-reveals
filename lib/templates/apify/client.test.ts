import { describe, it, expect, vi, afterEach } from "vitest";
import { runActor, recordCostFromRun } from "./client";

afterEach(() => {
  vi.restoreAllMocks();
  delete process.env.APIFY_TOKEN;
});

describe("runActor", () => {
  it("POSTs to the run-sync-get-dataset-items endpoint with token + body", async () => {
    process.env.APIFY_TOKEN = "tok123";
    const items = [{ a: 1 }, { a: 2 }];
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(items), {
        status: 201,
        headers: { "content-type": "application/json", "x-apify-run-id": "run-abc" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const input = { searchStringsArray: ["pest control Gilbert AZ"], maxCrawledPlaces: 3 };
    const res = await runActor("compass/crawler-google-places", input);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, opts] = fetchMock.mock.calls[0];
    expect(url).toContain("/acts/compass~crawler-google-places/run-sync-get-dataset-items");
    expect(url).toContain("token=tok123");
    expect(opts.method).toBe("POST");
    expect(opts.headers["content-type"]).toBe("application/json");
    expect(opts.body).toBe(JSON.stringify(input));
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
