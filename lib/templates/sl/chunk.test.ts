import { describe, it, expect } from "vitest";
import { chunkBatch } from "./chunk";

describe("chunkBatch", () => {
  it("splits 3500 records into 7 chunks of ≤500", () => {
    const recs = Array.from({ length: 3500 }, (_, i) => ({ source_id: `s${i}` }));
    const chunks = chunkBatch(recs as never, "camp-1", "batch-1", 500);
    expect(chunks.length).toBe(7);
    expect(chunks.every((c) => c.records.length <= 500)).toBe(true);
    expect(chunks[0]).toMatchObject({
      campaign_id: "camp-1",
      batch_id: "batch-1",
      chunk_index: 0,
      chunk_total: 7,
    });
  });
  it("returns a single chunk under the limit", () => {
    expect(chunkBatch([{ source_id: "a" }] as never, "c", "b", 500).length).toBe(1);
  });
  it("returns no chunks for an empty input", () => {
    expect(chunkBatch([] as never, "c", "b", 500).length).toBe(0);
  });
});
