import { describe, it, expect, afterEach } from "vitest";
import {
  templatesEnabled,
  googlePlacesEnabled,
  slTemplatePhotosEnabled,
  REP_DAILY_BUDGET_USD,
  REP_DAILY_BUILD_LIMIT,
  SL_TEMPLATE_BUILD_EST_USD,
} from "./config";

afterEach(() => {
  delete process.env.TEMPLATES_ENABLED;
  delete process.env.GOOGLE_PLACES_API_KEY;
  delete process.env.SL_TEMPLATE_PHOTOS_ENABLED;
  delete process.env.REP_DAILY_BUDGET_USD;
  delete process.env.REP_DAILY_BUILD_LIMIT;
  delete process.env.SL_TEMPLATE_BUILD_EST_USD;
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

describe("googlePlacesEnabled", () => {
  it("is false when GOOGLE_PLACES_API_KEY unset", () => {
    expect(googlePlacesEnabled()).toBe(false);
  });
  it("is false when set to whitespace only", () => {
    process.env.GOOGLE_PLACES_API_KEY = "   ";
    expect(googlePlacesEnabled()).toBe(false);
  });
  it("is true when a key is set", () => {
    process.env.GOOGLE_PLACES_API_KEY = "AIza-fake-key";
    expect(googlePlacesEnabled()).toBe(true);
  });
});

describe("slTemplatePhotosEnabled", () => {
  it("defaults to false when unset (C2 photos[] gate off)", () => {
    expect(slTemplatePhotosEnabled()).toBe(false);
  });
  it("is false for any value other than 'true'", () => {
    process.env.SL_TEMPLATE_PHOTOS_ENABLED = "1";
    expect(slTemplatePhotosEnabled()).toBe(false);
  });
  it("is true (case-insensitive) when explicitly 'true'", () => {
    process.env.SL_TEMPLATE_PHOTOS_ENABLED = "TRUE";
    expect(slTemplatePhotosEnabled()).toBe(true);
  });
});

describe("REP_DAILY_BUDGET_USD", () => {
  it("defaults to 10 when unset (loose backstop; count cap is the real guard)", () => {
    expect(REP_DAILY_BUDGET_USD()).toBe(10);
  });
  it("defaults to 10 for a non-numeric value", () => {
    process.env.REP_DAILY_BUDGET_USD = "not-a-number";
    expect(REP_DAILY_BUDGET_USD()).toBe(10);
  });
  it("reads a numeric override", () => {
    process.env.REP_DAILY_BUDGET_USD = "12.5";
    expect(REP_DAILY_BUDGET_USD()).toBe(12.5);
  });
});

describe("REP_DAILY_BUILD_LIMIT", () => {
  it("defaults to 30 when unset", () => {
    expect(REP_DAILY_BUILD_LIMIT()).toBe(30);
  });
  it("defaults to 30 for a non-numeric value", () => {
    process.env.REP_DAILY_BUILD_LIMIT = "nope";
    expect(REP_DAILY_BUILD_LIMIT()).toBe(30);
  });
  it("reads a numeric override", () => {
    process.env.REP_DAILY_BUILD_LIMIT = "10";
    expect(REP_DAILY_BUILD_LIMIT()).toBe(10);
  });
});

describe("SL_TEMPLATE_BUILD_EST_USD", () => {
  it("defaults to 0.03 when unset (SL's confirmed worst-case)", () => {
    expect(SL_TEMPLATE_BUILD_EST_USD()).toBe(0.03);
  });
  it("reads a numeric override", () => {
    process.env.SL_TEMPLATE_BUILD_EST_USD = "6.5";
    expect(SL_TEMPLATE_BUILD_EST_USD()).toBe(6.5);
  });
});
