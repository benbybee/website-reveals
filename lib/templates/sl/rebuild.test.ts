import { describe, it, expect, vi, afterEach } from "vitest";
import { rebuildProspects } from "./rebuild";
import type { CanonicalRecord } from "../types";

afterEach(() => vi.restoreAllMocks());

const valid: CanonicalRecord = {
  source_id: "wr-tpl-1",
  business_name: "Joe",
  industry_slug: "home-services",
  address: { street: "1 Main", city: "Mesa", state: "AZ", zip: "85201", country: "US" },
  phone: "+14805551234",
};
// Missing business_name AND industry → toBuildPayload yields an invalid payload.
const invalid = { source_id: "wr-tpl-2" } as unknown as CanonicalRecord;

function dbWith(rows: { id: string; record: CanonicalRecord }[]) {
  return {
    from: () => ({
      select: () => ({ in: () => Promise.resolve({ data: rows, error: null }) }),
    }),
  };
}

describe("rebuildProspects", () => {
  it("dry-run counts valid payloads and never dispatches", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock as never);

    const out = await rebuildProspects(
      dbWith([{ id: "a", record: valid }]) as never,
      ["a"],
      { dryRun: true },
    );

    expect(out.recordCount).toBe(1);
    expect(out.dryRun).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("skips prospects whose record can't produce a valid SL payload", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock as never);

    const out = await rebuildProspects(
      dbWith([{ id: "a", record: valid }, { id: "b", record: invalid }]) as never,
      ["a", "b"],
      { dryRun: true },
    );

    expect(out.recordCount).toBe(1);
    expect(out.skipped).toHaveLength(1);
    expect(out.skipped[0].id).toBe("b");
  });

  it("no-ops on an empty id list", async () => {
    const out = await rebuildProspects(dbWith([]) as never, []);
    expect(out.recordCount).toBe(0);
    expect(out.push).toBeUndefined();
  });
});
