import { describe, it, expect } from "vitest";
import {
  applyProspectFilters,
  DNA_MISSING_OR,
  ADDRESS_MISSING_OR,
  type ProspectFilterable,
} from "./prospectFilters";

/** Recording stub that satisfies the structural builder slice. */
function stub() {
  const calls: Array<{ method: string; args: unknown[] }> = [];
  const q: ProspectFilterable<unknown> = {
    eq: (...args) => record("eq", args),
    neq: (...args) => record("neq", args),
    or: (...args) => record("or", args),
    contains: (...args) => record("contains", args),
  };
  function record(method: string, args: unknown[]) {
    calls.push({ method, args });
    return q;
  }
  return { q: q as ProspectFilterable<never>, calls };
}

function params(init: Record<string, string>) {
  return new URLSearchParams(init);
}

describe("applyProspectFilters", () => {
  it("applies nothing for empty params", () => {
    const { q, calls } = stub();
    applyProspectFilters(q, params({}));
    expect(calls).toEqual([]);
  });

  it("maps stage / website_status / agent to column equality", () => {
    const { q, calls } = stub();
    applyProspectFilters(q, params({ stage: "qualified", website_status: "has_site", agent: "rep@x.com" }));
    expect(calls).toEqual([
      { method: "eq", args: ["stage", "qualified"] },
      { method: "eq", args: ["website_status", "has_site"] },
      { method: "eq", args: ["agent_id", "rep@x.com"] },
    ]);
  });

  it("maps missing to completeness containment", () => {
    const { q, calls } = stub();
    applyProspectFilters(q, params({ missing: "phone" }));
    expect(calls).toEqual([{ method: "contains", args: ["completeness", { missing: ["phone"] }] }]);
  });

  it("dna=has requires BOTH logo and primary color (neq '' covers null and empty)", () => {
    const { q, calls } = stub();
    applyProspectFilters(q, params({ dna: "has" }));
    expect(calls).toEqual([
      { method: "neq", args: ["record->logo->>src_url", ""] },
      { method: "neq", args: ["record->brand_colors->>primary", ""] },
    ]);
  });

  it("dna=missing matches EITHER part absent via one or-group", () => {
    const { q, calls } = stub();
    applyProspectFilters(q, params({ dna: "missing" }));
    expect(calls).toEqual([{ method: "or", args: [DNA_MISSING_OR] }]);
    expect(DNA_MISSING_OR).toBe(
      'record->logo->>src_url.is.null,record->logo->>src_url.eq."",record->brand_colors->>primary.is.null,record->brand_colors->>primary.eq.""',
    );
  });

  it("address=has requires all four mailable parts", () => {
    const { q, calls } = stub();
    applyProspectFilters(q, params({ address: "has" }));
    expect(calls.map((c) => c.args[0])).toEqual([
      "record->address->>street",
      "record->address->>city",
      "record->address->>state",
      "record->address->>zip",
    ]);
    expect(calls.every((c) => c.method === "neq" && c.args[1] === "")).toBe(true);
  });

  it("address=missing matches ANY absent part via one or-group", () => {
    const { q, calls } = stub();
    applyProspectFilters(q, params({ address: "missing" }));
    expect(calls).toEqual([{ method: "or", args: [ADDRESS_MISSING_OR] }]);
  });

  it("composes dna and address into AND-ed groups", () => {
    const { q, calls } = stub();
    applyProspectFilters(q, params({ dna: "has", address: "missing" }));
    expect(calls).toEqual([
      { method: "neq", args: ["record->logo->>src_url", ""] },
      { method: "neq", args: ["record->brand_colors->>primary", ""] },
      { method: "or", args: [ADDRESS_MISSING_OR] },
    ]);
  });

  it("ignores unknown dna/address values instead of erroring", () => {
    const { q, calls } = stub();
    applyProspectFilters(q, params({ dna: "bogus", address: "" }));
    expect(calls).toEqual([]);
  });
});
