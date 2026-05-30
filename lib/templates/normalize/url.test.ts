import { describe, it, expect } from "vitest";
import { absolutize } from "./url";

describe("absolutize", () => {
  it("adds https scheme when missing", () => expect(absolutize("example.com")).toBe("https://example.com"));
  it("passes through https", () => expect(absolutize("https://example.com/x")).toBe("https://example.com/x"));
  it("leaves http untouched (no forced upgrade)", () => expect(absolutize("http://example.com")).toBe("http://example.com"));
  it("trims whitespace", () => expect(absolutize("  example.com  ")).toBe("https://example.com"));
  it("returns null for empty", () => expect(absolutize("")).toBeNull());
  it("returns null for junk", () => expect(absolutize("not a url")).toBeNull());
});
