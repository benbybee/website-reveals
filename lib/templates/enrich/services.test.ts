import { describe, it, expect } from "vitest";
import { deriveServices } from "./services";

describe("deriveServices", () => {
  it("maps GBP categories to services", () => {
    expect(deriveServices(["Pest control service"])).toEqual([{ name: "Pest control service" }]);
  });

  it("merges FB services and dedupes case-insensitively by name", () => {
    const out = deriveServices(
      ["Pest Control Service"],
      ["pest control service", { name: "Termite Control", description: "Inspection + treatment" }],
    );
    expect(out).toEqual([
      { name: "Pest Control Service" },
      { name: "Termite Control", description: "Inspection + treatment" },
    ]);
  });

  it("ignores blank entries", () => {
    expect(deriveServices(["", "  "], [{ name: "" }])).toEqual([]);
  });
});
