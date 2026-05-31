import { describe, it, expect, vi, afterEach } from "vitest";
import { pushBuilds } from "./adapter";
import type { BuildPayload } from "./toBuildPayload";

afterEach(() => vi.restoreAllMocks());

const builds: BuildPayload[] = [
  { external_id: "wr-tpl-0", form_type: "quick", brief: { business_name: "A", industry: "home-services" } },
  { external_id: "wr-tpl-1", form_type: "quick", brief: { business_name: "B", industry: "home-services" } },
];

describe("pushBuilds — post transport", () => {
  it("HMAC-signs and POSTs each build as wr-template; isolates per-build failure", async () => {
    const fetchMock = vi.fn(async (_url: string, opts: { body: string; headers: Record<string, string> }) => {
      const body = JSON.parse(opts.body);
      if (body.external_id === "wr-tpl-1") return new Response("boom", { status: 500 });
      return new Response(JSON.stringify({ build_id: "b-0", status: "queued" }), { status: 202 });
    });
    vi.stubGlobal("fetch", fetchMock as never);

    const out = await pushBuilds(builds, {
      transport: "post",
      buildUrl: "https://sl.example/api/builds",
      apiKey: "key",
      hmacSecret: "secret",
    });

    expect(out.transport).toBe("post");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const [, opts0] = fetchMock.mock.calls[0];
    expect(opts0.headers["x-source-id"]).toBe("wr-template");
    expect(opts0.headers["x-api-key"]).toBe("key");
    expect(opts0.headers["x-signature"]).toBeDefined();
    expect(opts0.headers["x-timestamp"]).toBeDefined();
    expect(out.results[0]).toMatchObject({ external_id: "wr-tpl-0", ok: true, build_id: "b-0" });
    expect(out.results[1]).toMatchObject({ external_id: "wr-tpl-1", ok: false, status: 500 });
  });

  it("treats a 200 duplicate response as success", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ build_id: "b-x", status: "queued", duplicate: true }), { status: 200 })) as never,
    );
    const out = await pushBuilds([builds[0]], { transport: "post", buildUrl: "https://x", apiKey: "k", hmacSecret: "s" });
    expect(out.results[0]).toMatchObject({ ok: true, duplicate: true, build_id: "b-x" });
  });

  it("retries on 429 honoring retry-after, then succeeds", async () => {
    let calls = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        calls++;
        if (calls === 1) return new Response("rate", { status: 429, headers: { "retry-after": "0" } });
        return new Response(JSON.stringify({ build_id: "b-r", status: "queued" }), { status: 202 });
      }) as never,
    );
    const out = await pushBuilds([builds[0]], { transport: "post", buildUrl: "https://x", apiKey: "k", hmacSecret: "s", maxRetries: 2 });
    expect(calls).toBe(2);
    expect(out.results[0]).toMatchObject({ ok: true, build_id: "b-r" });
  });

  it("requires api key + secret + url for the post transport", async () => {
    await expect(pushBuilds([builds[0]], { transport: "post", buildUrl: "https://x", hmacSecret: "s" })).rejects.toThrow(
      /SL_TEMPLATE_API_KEY/,
    );
  });
});

describe("pushBuilds — table transport", () => {
  it("writes the builds artifact via db and reports all builds ok", async () => {
    const updates: { sl_response: { builds: unknown[] } }[] = [];
    const db = {
      from: () => ({
        update: (row: { sl_response: { builds: unknown[] } }) => ({
          eq: () => {
            updates.push(row);
            return Promise.resolve({ error: null });
          },
        }),
      }),
    };
    const out = await pushBuilds(builds, { transport: "table", db: db as never, batchRowId: "row-1" });
    expect(out.transport).toBe("table");
    expect(out.results.every((r) => r.ok)).toBe(true);
    expect(updates).toHaveLength(1);
    expect(updates[0].sl_response.builds).toHaveLength(2);
  });
});
