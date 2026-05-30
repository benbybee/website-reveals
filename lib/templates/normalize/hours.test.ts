import { describe, it, expect } from "vitest";
import { parse12h } from "./hours";

describe("parse12h", () => {
  it("parses morning time", () => expect(parse12h("8:00 AM")).toBe("08:00"));
  it("parses afternoon time", () => expect(parse12h("5:30 PM")).toBe("17:30"));
  it("parses midnight", () => expect(parse12h("12:00 AM")).toBe("00:00"));
  it("parses noon", () => expect(parse12h("12:00 PM")).toBe("12:00"));
  it("returns null for Closed", () => expect(parse12h("Closed")).toBeNull());
  it("returns null for junk", () => expect(parse12h("whenever")).toBeNull());
});
