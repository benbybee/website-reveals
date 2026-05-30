import { describe, it, expect } from "vitest";
import { toE164 } from "./phone";

describe("toE164", () => {
  it("formats a 10-digit US number", () => expect(toE164("(480) 555-1234")).toBe("+14805551234"));
  it("keeps an existing +1", () => expect(toE164("+1 480 555 1234")).toBe("+14805551234"));
  it("strips a leading 1", () => expect(toE164("1-480-555-1234")).toBe("+14805551234"));
  it("returns null for junk", () => expect(toE164("call us!")).toBeNull());
  it("returns null for wrong length", () => expect(toE164("555-1234")).toBeNull());
  it("returns null for empty", () => expect(toE164(null)).toBeNull());
});
