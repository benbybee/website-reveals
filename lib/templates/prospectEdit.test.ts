import { describe, it, expect } from "vitest";
import { mergeRecordEdit } from "./prospectEdit";

const existing = {
  business_name: "Old Name",
  phone: "555-0001",
  address: { street: "1 Main St", city: "Denver", state: "CO", zip: "80014", country: "US" },
  logo: { src_url: "https://x/logo.png" },
};

describe("mergeRecordEdit", () => {
  it("returns null when nothing touches the record", () => {
    expect(mergeRecordEdit(existing, undefined, undefined)).toBeNull();
    expect(mergeRecordEdit(existing, {}, null)).toBeNull();
  });

  it("mirrors scalar field edits into the record without losing other keys", () => {
    const out = mergeRecordEdit(existing, { business_name: "New Name", phone: "555-0002" }, undefined)!;
    expect(out.business_name).toBe("New Name");
    expect(out.phone).toBe("555-0002");
    expect(out.logo).toEqual({ src_url: "https://x/logo.png" });
    expect(out.address).toEqual(existing.address);
  });

  it("mirrors address part edits into record.address, preserving untouched parts", () => {
    const out = mergeRecordEdit(existing, { street: "2 Oak Ave", zip: "80015" }, undefined)!;
    expect(out.address).toEqual({ street: "2 Oak Ave", city: "Denver", state: "CO", zip: "80015", country: "US" });
  });

  it("builds an address from scratch when the record had none", () => {
    const out = mergeRecordEdit({ business_name: "X" }, { city: "Aurora", state: "CO" }, undefined)!;
    expect(out.address).toEqual({ city: "Aurora", state: "CO" });
  });

  it("accepts empty-string edits (clearing a field) like the columns do", () => {
    const out = mergeRecordEdit(existing, { city: "" }, undefined)!;
    expect((out.address as Record<string, unknown>).city).toBe("");
  });

  it("lets an explicit record patch win over synced field edits", () => {
    const out = mergeRecordEdit(existing, { business_name: "From Fields" }, { business_name: "From Patch" })!;
    expect(out.business_name).toBe("From Patch");
  });

  it("lets an explicit record.address patch win over synced address edits", () => {
    const out = mergeRecordEdit(existing, { city: "From Fields" }, { address: { city: "From Patch" } })!;
    expect((out.address as Record<string, unknown>).city).toBe("From Patch");
    // explicit address patch replaces parts it names; synced edits fill the rest
    expect((out.address as Record<string, unknown>).street).toBe("1 Main St");
  });

  it("applies a record patch alone (legacy power-user path)", () => {
    const out = mergeRecordEdit(existing, undefined, { description: "hello" })!;
    expect(out.description).toBe("hello");
    expect(out.business_name).toBe("Old Name");
  });

  it("ignores non-string field values", () => {
    const out = mergeRecordEdit(existing, { city: undefined }, undefined);
    expect(out).toBeNull();
  });
});
