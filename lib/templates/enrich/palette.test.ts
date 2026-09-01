import { describe, it, expect } from "vitest";
import { hexesFromHtml } from "./palette";
import { brandColorsFromPalette } from "./colors";

const HTML = `<style>
  .a { color: #1a73e8; background: #ffffff; }
  .b { color: #1A73E8; }
  .c { border: 1px solid #1a73e8; }
  .hero { background: rgb(255, 111, 0); }
  .foot { color: #000; }
  .link { color: hsl(210, 100%, 50%); }
</style>`;

describe("hexesFromHtml", () => {
  it("ranks brand hexes by frequency and normalizes casing/shorthand", () => {
    const hexes = hexesFromHtml(HTML);
    expect(hexes[0]).toBe("#1a73e8"); // appears 3x → most frequent
    expect(hexes).toContain("#ff6f00"); // from rgb()
  });

  it("excludes near-white and near-black noise", () => {
    const hexes = hexesFromHtml(HTML);
    expect(hexes).not.toContain("#ffffff");
    expect(hexes).not.toContain("#000000");
  });

  it("feeds brandColorsFromPalette to yield a 4-token BrandColors (revives the dead path)", () => {
    const colors = brandColorsFromPalette(hexesFromHtml(HTML));
    expect(colors).not.toBeNull();
    expect(colors).toHaveProperty("primary");
    expect(colors).toHaveProperty("accent");
    expect(colors).toHaveProperty("neutral_dark");
    expect(colors).toHaveProperty("neutral_light");
  });

  it("returns [] for HTML with no colors", () => {
    expect(hexesFromHtml("<p>no colors here</p>")).toEqual([]);
  });
});
