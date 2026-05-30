import { describe, it, expect } from "vitest";
import { sourceId } from "./sourceId";

describe("sourceId", () => {
  it("prefixes a place_id", () => expect(sourceId("ChIJabc123")).toBe("wr-tpl-ChIJabc123"));
  it("trims whitespace", () => expect(sourceId("  ChIJabc123 ")).toBe("wr-tpl-ChIJabc123"));
  it("throws on empty", () => expect(() => sourceId("")).toThrow());
  it("throws on null", () => expect(() => sourceId(null as never)).toThrow());
});
