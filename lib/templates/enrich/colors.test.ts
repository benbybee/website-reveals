import { describe, it, expect } from "vitest";
import { brandColorsFromPalette, normalizeHex, luminance } from "./colors";

describe("brandColorsFromPalette", () => {
  it("returns null when fewer than 2 valid colors", () => {
    expect(brandColorsFromPalette([])).toBeNull();
    expect(brandColorsFromPalette(["#000000", "not-a-color"])).toBeNull();
  });

  it("fills all 4 brand tokens with valid hex", () => {
    const c = brandColorsFromPalette(["#0a3d62", "#e58e26", "#1e272e", "#f5f6fa"]);
    expect(c).not.toBeNull();
    for (const v of Object.values(c!)) expect(v).toMatch(/^#[0-9a-f]{6}$/);
  });

  it("orders neutral_dark darker than neutral_light", () => {
    const c = brandColorsFromPalette(["#0a3d62", "#e58e26", "#1e272e", "#f5f6fa"])!;
    expect(luminance(c.neutral_dark!)).toBeLessThan(luminance(c.neutral_light!));
  });

  it("picks the most saturated color as primary", () => {
    // pure orange is more saturated than the navy/greys
    const c = brandColorsFromPalette(["#808080", "#ff7a00", "#101010", "#fafafa"])!;
    expect(c.primary).toBe("#ff7a00");
  });
});

describe("normalizeHex", () => {
  it("expands shorthand and lowercases", () => {
    expect(normalizeHex("#ABC")).toBe("#aabbcc");
    expect(normalizeHex("0A3D62")).toBe("#0a3d62");
  });
  it("rejects garbage", () => {
    expect(normalizeHex("rgb(0,0,0)")).toBeNull();
    expect(normalizeHex("#12")).toBeNull();
  });
});
