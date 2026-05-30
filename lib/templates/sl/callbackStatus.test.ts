import { describe, it, expect } from "vitest";
import { slStatusToStage } from "./callbackStatus";

describe("slStatusToStage", () => {
  it("maps building-ish statuses", () => {
    expect(slStatusToStage("running")).toBe("building");
    expect(slStatusToStage("building")).toBe("building");
  });
  it("maps success statuses to live", () => {
    expect(slStatusToStage("succeeded")).toBe("live");
    expect(slStatusToStage("live")).toBe("live");
  });
  it("maps failure statuses to build_failed", () => {
    expect(slStatusToStage("failed")).toBe("build_failed");
    expect(slStatusToStage("canceled")).toBe("build_failed");
  });
  it("returns null for unknown status", () => {
    expect(slStatusToStage("weird")).toBeNull();
  });
});
