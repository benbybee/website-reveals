import { describe, it, expect, vi, afterEach } from "vitest";
import { buildChunks, assembleAndPush } from "./push";
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

describe("buildChunks", () => {
  it("maps records to prep.brief and chunks them", () => {
    const chunks = buildChunks([rec, { ...rec, source_id: "wr-tpl-2" }], "camp", "batch", 1);
    expect(chunks.length).toBe(2);
    expect(chunks[0].records[0]).toHaveProperty("brief.business.name", "Joe");
  });
});

describe("assembleAndPush — dry run", () => {
  it("builds + persists a batch row without dispatching", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock as never);

    const inserts: Record<string, unknown>[] = [];
    const db = {
      from: (table: string) => {
        if (table === "tpl_prospects") {
          return {
            select: () => ({ eq: () => ({ eq: () => Promise.resolve({ data: [{ record: rec }], error: null }) }) }),
          };
        }
        return {
          insert: (row: Record<string, unknown>) => {
            inserts.push(row);
            return { select: () => ({ single: () => Promise.resolve({ data: { id: "batch-row" }, error: null }) }) };
          },
          update: () => ({ eq: () => Promise.resolve({ error: null }) }),
        };
      },
    };

    const out = await assembleAndPush(db as never, "camp", { dryRun: true });

    expect(out.recordCount).toBe(1);
    expect(out.chunkCount).toBe(1);
    expect(out.dryRun).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(inserts).toHaveLength(1);
    expect(inserts[0].status).toBe("dry_run");
  });
});
