import { describe, it, expect, vi, afterEach } from "vitest";
import { pushBatch } from "./adapter";
import type { BatchChunk } from "./chunk";

afterEach(() => vi.restoreAllMocks());

interface Rec {
  source_id: string;
}
const chunks: BatchChunk<Rec>[] = [
  { campaign_id: "c", batch_id: "b", chunk_index: 0, chunk_total: 2, records: [{ source_id: "s0" }] },
  { campaign_id: "c", batch_id: "b", chunk_index: 1, chunk_total: 2, records: [{ source_id: "s1" }] },
];

describe("pushBatch — post transport", () => {
  it("HMAC-signs and POSTs each chunk; isolates per-chunk failure", async () => {
    const fetchMock = vi.fn(async (_url: string, opts: { body: string; headers: Record<string, string> }) => {
      const body = JSON.parse(opts.body);
      if (body.chunk_index === 1) return new Response("boom", { status: 500 });
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock as never);

    const out = await pushBatch(chunks, {
      transport: "post",
      batchUrl: "https://sl.example/batch",
      hmacSecret: "secret",
    });

    expect(out.transport).toBe("post");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const [, opts0] = fetchMock.mock.calls[0];
    expect(opts0.headers["x-signature"]).toBeDefined();
    expect(opts0.headers["x-timestamp"]).toBeDefined();
    expect(out.results[0]).toMatchObject({ chunk_index: 0, ok: true });
    expect(out.results[1]).toMatchObject({ chunk_index: 1, ok: false });
  });
});

describe("pushBatch — table transport", () => {
  it("writes the artifact via db and reports all chunks ok", async () => {
    const updates: unknown[] = [];
    const db = {
      from: () => ({
        update: (row: unknown) => ({
          eq: () => {
            updates.push(row);
            return Promise.resolve({ error: null });
          },
        }),
      }),
    };
    const out = await pushBatch(chunks, { transport: "table", db: db as never, batchRowId: "row-1" });
    expect(out.transport).toBe("table");
    expect(out.results.every((r) => r.ok)).toBe(true);
    expect(updates).toHaveLength(1);
  });
});

describe("pushBatch — identical record JSON across transports", () => {
  it("serializes the same records regardless of transport", async () => {
    let postedRecords: unknown;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, opts: { body: string }) => {
        postedRecords = JSON.parse(opts.body).records;
        return new Response("{}", { status: 200 });
      }) as never,
    );
    await pushBatch([chunks[0]], { transport: "post", batchUrl: "https://x", hmacSecret: "s" });

    let tabledRecords: unknown;
    const db = {
      from: () => ({
        update: (row: { sl_response: { chunks: { records: unknown }[] } }) => ({
          eq: () => {
            tabledRecords = row.sl_response.chunks[0].records;
            return Promise.resolve({ error: null });
          },
        }),
      }),
    };
    await pushBatch([chunks[0]], { transport: "table", db: db as never, batchRowId: "r" });

    expect(postedRecords).toEqual(tabledRecords);
  });
});
