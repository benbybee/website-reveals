import { describe, it, expect, vi, afterEach } from "vitest";
import {
  buildConversionPayload,
  validateConversionInput,
  classifyConversionResponse,
  postConversion,
  type ConversionInput,
} from "./convert";

afterEach(() => vi.restoreAllMocks());

const base: ConversionInput = {
  external_id: "wr-tpl-ChIJ123",
  slug: "acme-plumbing",
  owner_email: "owner@acmeplumbing.com",
  owner_name: "Jane Doe",
  industry: "plumbing",
};

describe("buildConversionPayload", () => {
  it("builds the locked SL shape and omits absent optionals", () => {
    const p = buildConversionPayload({ external_id: "x", slug: "s-lug", owner_email: "o@e.com" });
    expect(p).toEqual({ external_id: "x", kura_input: { slug: "s-lug", owner_email: "o@e.com" } });
    expect(p).not.toHaveProperty("domain");
    expect(p).not.toHaveProperty("contact");
  });

  it("includes owner_name, industry, domain, and allowlisted-or-not ghl url when present", () => {
    const p = buildConversionPayload({
      ...base,
      domain_name: "acmeplumbing.com",
      ghl_webhook_url: "https://services.leadconnectorhq.com/hooks/abc",
    });
    expect(p.kura_input).toEqual({
      slug: "acme-plumbing",
      owner_email: "owner@acmeplumbing.com",
      owner_name: "Jane Doe",
      industry: "plumbing",
    });
    expect(p.domain).toEqual({ name: "acmeplumbing.com" });
    expect(p.contact).toEqual({ ghl_webhook_url: "https://services.leadconnectorhq.com/hooks/abc" });
  });

  it("never sends build_id or kura_project_id", () => {
    const p = buildConversionPayload(base) as unknown as Record<string, unknown>;
    expect(p).not.toHaveProperty("build_id");
    expect(p).not.toHaveProperty("kura_project_id");
  });
});

describe("validateConversionInput", () => {
  it("requires external_id, owner_email, and a URL-safe slug", () => {
    expect(validateConversionInput(base).ok).toBe(true);
    expect(validateConversionInput({ ...base, slug: "Not Valid" }).missing).toContain("slug");
    expect(validateConversionInput({ ...base, owner_email: "" }).missing).toContain("owner_email");
    expect(validateConversionInput({ ...base, external_id: "" }).missing).toContain("external_id");
  });
});

describe("classifyConversionResponse", () => {
  it("202 converting → success", () => {
    expect(classifyConversionResponse(202, { build_id: "b1", status: "converting" })).toMatchObject({
      ok: true,
      status: "converting",
      build_id: "b1",
    });
  });

  it("200 already_converting → idempotent success", () => {
    expect(classifyConversionResponse(200, { already_converting: true, build_id: "b1" })).toMatchObject({
      ok: true,
      status: "already_converting",
    });
  });

  it("409 build_not_ready → retryable failure", () => {
    expect(classifyConversionResponse(409, { error: "build_not_ready" })).toMatchObject({
      ok: false,
      status: "build_not_ready",
      retryable: true,
    });
  });

  it("404 build_not_found → non-retryable", () => {
    expect(classifyConversionResponse(404, { error: "build_not_found" })).toMatchObject({
      ok: false,
      status: "build_not_found",
      retryable: false,
    });
  });

  it("403 not_a_conversion_source and a non-template 409 → non-retryable error", () => {
    expect(classifyConversionResponse(403, { error: "not_a_conversion_source" })).toMatchObject({
      ok: false,
      status: "error",
      retryable: false,
    });
    expect(classifyConversionResponse(409, { error: "not_template" })).toMatchObject({
      ok: false,
      status: "error",
      retryable: false,
    });
  });

  it("429 and 5xx → retryable error", () => {
    expect(classifyConversionResponse(429, {})).toMatchObject({ retryable: true });
    expect(classifyConversionResponse(500, {})).toMatchObject({ retryable: true });
  });
});

describe("postConversion", () => {
  it("HMAC-signs and POSTs as wr-template with the locked body", async () => {
    let seen: { url: string; opts: { body: string; headers: Record<string, string> } } | null = null;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, opts: { body: string; headers: Record<string, string> }) => {
        seen = { url, opts };
        return new Response(JSON.stringify({ build_id: "b1", status: "converting" }), { status: 202 });
      }) as never,
    );

    const out = await postConversion(base, {
      url: "https://sl.example/api/conversions",
      apiKey: "key",
      hmacSecret: "secret",
    });

    expect(out).toMatchObject({ ok: true, status: "converting", build_id: "b1" });
    expect(seen!.url).toBe("https://sl.example/api/conversions");
    expect(seen!.opts.headers["x-source-id"]).toBe("wr-template");
    expect(seen!.opts.headers["x-api-key"]).toBe("key");
    expect(seen!.opts.headers["x-signature"]).toBeDefined();
    expect(seen!.opts.headers["x-timestamp"]).toBeDefined();
    expect(JSON.parse(seen!.opts.body)).toEqual({
      external_id: "wr-tpl-ChIJ123",
      kura_input: { slug: "acme-plumbing", owner_email: "owner@acmeplumbing.com", owner_name: "Jane Doe", industry: "plumbing" },
    });
  });

  it("classifies a network throw as a retryable error", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("econnrefused"); }) as never);
    const out = await postConversion(base, { url: "https://x", apiKey: "k", hmacSecret: "s" });
    expect(out).toMatchObject({ ok: false, status: "error", retryable: true });
  });

  it("requires url + api key + secret", async () => {
    await expect(postConversion(base, { apiKey: "k", hmacSecret: "s" })).rejects.toThrow(/SL_TEMPLATE_CONVERSION_URL/);
  });
});
