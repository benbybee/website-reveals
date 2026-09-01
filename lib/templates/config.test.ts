import { describe, it, expect, afterEach } from "vitest";
import {
  templatesEnabled,
  googlePlacesEnabled,
  slTemplatePhotosEnabled,
  REP_DAILY_BUDGET_USD,
} from "./config";

afterEach(() => {
  delete process.env.TEMPLATES_ENABLED;
  delete process.env.GOOGLE_PLACES_API_KEY;
  delete process.env.SL_TEMPLATE_PHOTOS_ENABLED;
  delete process.env.REP_DAILY_BUDGET_USD;
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
  it("defaults to 5 when unset", () => {
    expect(REP_DAILY_BUDGET_USD()).toBe(5);
  });
  it("defaults to 5 for a non-numeric value", () => {
    process.env.REP_DAILY_BUDGET_USD = "not-a-number";
    expect(REP_DAILY_BUDGET_USD()).toBe(5);
  });
  it("reads a numeric override", () => {
    process.env.REP_DAILY_BUDGET_USD = "12.5";
    expect(REP_DAILY_BUDGET_USD()).toBe(12.5);
  });
});
