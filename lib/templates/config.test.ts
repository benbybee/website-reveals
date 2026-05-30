import { describe, it, expect, afterEach } from "vitest";
import { templatesEnabled } from "./config";

afterEach(() => {
  delete process.env.TEMPLATES_ENABLED;
});

describe("templatesEnabled", () => {
  it("is false when unset", () => {
    expect(templatesEnabled()).toBe(false);
  });
  it("is true when '1'", () => {
    process.env.TEMPLATES_ENABLED = "1";
    expect(templatesEnabled()).toBe(true);
  });
});
