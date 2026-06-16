import { describe, it, expect, vi, afterEach } from "vitest";
import { readBuild, reconcileAction, type BuildState } from "./readBuild";

const CTX = { buildUrl: "https://sl.example/api/builds", apiKey: "key123", hmacSecret: "s".repeat(64) };

afterEach(() => vi.restoreAllMocks());

describe("readBuild", () => {
  it("GETs /:build_id with the empty-body source HMAC and returns the build", async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve(
        new Response(
          JSON.stringify({ build_id: "b1", external_id: "wr-tpl-x", status: "succeeded", site_url: "https://x.pages.dev" }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const r = await readBuild("b1", CTX);
    expect(r.ok).toBe(true);
    expect(r.build?.status).toBe("succeeded");
    expect(r.build?.site_url).toBe("https://x.pages.dev");

    const [url, opts] = fetchMock.mock.calls[0] as unknown as [string, { method: string; headers: Record<string, string> }];
    expect(url).toBe("https://sl.example/api/builds/b1");
    expect(opts.method).toBe("GET");
    expect(opts.headers["x-source-id"]).toBe("wr-template");
    expect(opts.headers["x-api-key"]).toBe("key123");
    expect(opts.headers["x-timestamp"]).toMatch(/^\d+$/);
    expect(opts.headers["x-signature"]).toMatch(/^[0-9a-f]{64}$/); // hex HMAC-SHA256
  });

  it("returns not-ok on 404 / non-2xx", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(new Response("", { status: 404 }))));
    const r = await readBuild("nope", CTX);
    expect(r.ok).toBe(false);
    expect(r.status).toBe(404);
  });

  it("returns missing_config when creds are absent", async () => {
    const r = await readBuild("b1", { buildUrl: "", apiKey: "", hmacSecret: "" });
    expect(r.ok).toBe(false);
    expect(r.error).toBe("missing_config");
  });
});

describe("reconcileAction", () => {
  const s = (status: string, site_url?: string | null, error_message?: string | null): BuildState => ({ status, site_url, error_message });

  it("succeeded + site_url → live", () => {
    expect(reconcileAction(s("succeeded", "https://x.pages.dev"))).toEqual({ kind: "live", preview_url: "https://x.pages.dev" });
  });
  it("succeeded WITHOUT site_url → wait (never go live with no url)", () => {
    expect(reconcileAction(s("succeeded", "")).kind).toBe("wait");
  });
  it("failed / canceled / kura_push_failed → build_failed", () => {
    expect(reconcileAction(s("failed", null, "boom")).kind).toBe("build_failed");
    expect(reconcileAction(s("canceled")).kind).toBe("build_failed");
    expect(reconcileAction(s("kura_push_failed")).kind).toBe("build_failed");
  });
  it("in-flight statuses → wait", () => {
    expect(reconcileAction(s("queued")).kind).toBe("wait");
    expect(reconcileAction(s("running")).kind).toBe("wait");
    expect(reconcileAction(s("building")).kind).toBe("wait");
  });
});
