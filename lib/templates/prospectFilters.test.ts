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

// Every call applies the default "active only" filter (suppressed_at IS NULL)
// unless suppressed=only|all overrides it — so it trails the param-driven calls.
const SUP = { method: "or", args: ["suppressed_at.is.null"] };

describe("applyProspectFilters", () => {
  it("applies only the default active-only filter for empty params", () => {
    const { q, calls } = stub();
    applyProspectFilters(q, params({}));
    expect(calls).toEqual([SUP]);
  });

  it("maps stage / website_status / agent to column equality", () => {
    const { q, calls } = stub();
    applyProspectFilters(q, params({ stage: "qualified", website_status: "has_site", agent: "rep@x.com" }));
    expect(calls).toEqual([
      { method: "eq", args: ["stage", "qualified"] },
      { method: "eq", args: ["website_status", "has_site"] },
      { method: "eq", args: ["agent_id", "rep@x.com"] },
      SUP,
    ]);
  });

  it("maps missing to completeness containment", () => {
    const { q, calls } = stub();
    applyProspectFilters(q, params({ missing: "phone" }));
    expect(calls).toEqual([{ method: "contains", args: ["completeness", { missing: ["phone"] }] }, SUP]);
  });

  it("dna=has requires BOTH logo and primary color (neq '' covers null and empty)", () => {
    const { q, calls } = stub();
    applyProspectFilters(q, params({ dna: "has" }));
    expect(calls).toEqual([
      { method: "neq", args: ["record->logo->>src_url", ""] },
      { method: "neq", args: ["record->brand_colors->>primary", ""] },
      SUP,
    ]);
  });

  it("dna=missing matches EITHER part absent via one or-group", () => {
    const { q, calls } = stub();
    applyProspectFilters(q, params({ dna: "missing" }));
    expect(calls).toEqual([{ method: "or", args: [DNA_MISSING_OR] }, SUP]);
    expect(DNA_MISSING_OR).toBe(
      'record->logo->>src_url.is.null,record->logo->>src_url.eq."",record->brand_colors->>primary.is.null,record->brand_colors->>primary.eq.""',
    );
  });

  it("address=has requires all four mailable parts", () => {
    const { q, calls } = stub();
    applyProspectFilters(q, params({ address: "has" }));
    const addressCalls = calls.slice(0, 4);
    expect(addressCalls.map((c) => c.args[0])).toEqual([
      "record->address->>street",
      "record->address->>city",
      "record->address->>state",
      "record->address->>zip",
    ]);
    expect(addressCalls.every((c) => c.method === "neq" && c.args[1] === "")).toBe(true);
    expect(calls[4]).toEqual(SUP);
  });

  it("address=missing matches ANY absent part via one or-group", () => {
    const { q, calls } = stub();
    applyProspectFilters(q, params({ address: "missing" }));
    expect(calls).toEqual([{ method: "or", args: [ADDRESS_MISSING_OR] }, SUP]);
  });

  it("composes dna and address into AND-ed groups", () => {
    const { q, calls } = stub();
    applyProspectFilters(q, params({ dna: "has", address: "missing" }));
    expect(calls).toEqual([
      { method: "neq", args: ["record->logo->>src_url", ""] },
      { method: "neq", args: ["record->brand_colors->>primary", ""] },
      { method: "or", args: [ADDRESS_MISSING_OR] },
      SUP,
    ]);
  });

  it("site=has requires a generated preview_url (neq '')", () => {
    const { q, calls } = stub();
    applyProspectFilters(q, params({ site: "has" }));
    expect(calls).toEqual([{ method: "neq", args: ["preview_url", ""] }, SUP]);
  });

  it("site=missing matches null/empty preview_url via one or-group", () => {
    const { q, calls } = stub();
    applyProspectFilters(q, params({ site: "missing" }));
    expect(calls).toEqual([{ method: "or", args: ['preview_url.is.null,preview_url.eq.""'] }, SUP]);
  });

  it("exported=yes|no map to exported_at null checks", () => {
    const yes = stub();
    applyProspectFilters(yes.q, params({ exported: "yes" }));
    expect(yes.calls).toEqual([{ method: "or", args: ["exported_at.not.is.null"] }, SUP]);
    const no = stub();
    applyProspectFilters(no.q, params({ exported: "no" }));
    expect(no.calls).toEqual([{ method: "or", args: ["exported_at.is.null"] }, SUP]);
  });

  it("rep=<uuid> filters by assigned sales rep", () => {
    const { q, calls } = stub();
    applyProspectFilters(q, params({ rep: "rep-123" }));
    expect(calls).toEqual([{ method: "eq", args: ["sales_rep_id", "rep-123"] }, SUP]);
  });

  it("rep=unassigned matches leads with no rep", () => {
    const { q, calls } = stub();
    applyProspectFilters(q, params({ rep: "unassigned" }));
    expect(calls).toEqual([{ method: "or", args: ["sales_rep_id.is.null"] }, SUP]);
  });

  it("hides suppressed leads by default (active-only)", () => {
    const { q, calls } = stub();
    applyProspectFilters(q, params({}));
    expect(calls).toEqual([SUP]);
  });

  it("suppressed=only surfaces ONLY suppressed leads (no default exclude)", () => {
    const { q, calls } = stub();
    applyProspectFilters(q, params({ suppressed: "only" }));
    expect(calls).toEqual([{ method: "or", args: ["suppressed_at.not.is.null"] }]);
  });

  it("suppressed=all shows both (no suppression filter at all)", () => {
    const { q, calls } = stub();
    applyProspectFilters(q, params({ suppressed: "all" }));
    expect(calls).toEqual([]);
  });

  it("ignores unknown dna/address values but still applies the active-only default", () => {
    const { q, calls } = stub();
    applyProspectFilters(q, params({ dna: "bogus", address: "" }));
    expect(calls).toEqual([SUP]);
  });
});
