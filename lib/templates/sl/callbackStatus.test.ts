import { describe, it, expect } from "vitest";
import { slStatusToStage } from "./callbackStatus";

describe("slStatusToStage", () => {
  it("maps in-flight statuses to building", () => {
    expect(slStatusToStage("queued")).toBe("building");
    expect(slStatusToStage("running")).toBe("building");
  });
  it("maps the terminal success status to live", () => {
    expect(slStatusToStage("succeeded")).toBe("live");
  });
  it("maps failure statuses to build_failed", () => {
    expect(slStatusToStage("failed")).toBe("build_failed");
    expect(slStatusToStage("canceled")).toBe("build_failed");
  });
  it("returns null for statuses SL never sends", () => {
    expect(slStatusToStage("building")).toBeNull();
    expect(slStatusToStage("live")).toBeNull();
    expect(slStatusToStage("weird")).toBeNull();
  });
});
