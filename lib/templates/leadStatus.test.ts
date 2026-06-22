import { describe, it, expect } from "vitest";
import { LEAD_STATUSES, isValidLeadStatus, leadStatusLabel, DEFAULT_LEAD_STATUS } from "./leadStatus";

describe("leadStatus", () => {
  it("exposes the seven pipeline statuses with 'new' as default", () => {
    expect(LEAD_STATUSES.map((s) => s.value)).toEqual([
      "new", "no_answer", "follow_up", "scheduled_demo", "contacted", "not_interested", "sold",
    ]);
    expect(DEFAULT_LEAD_STATUS).toBe("new");
  });

  it("validates known values and rejects others", () => {
    expect(isValidLeadStatus("sold")).toBe(true);
    expect(isValidLeadStatus("scheduled_demo")).toBe(true);
    expect(isValidLeadStatus("bogus")).toBe(false);
    expect(isValidLeadStatus(null)).toBe(false);
    expect(isValidLeadStatus(123)).toBe(false);
  });

  it("labels values, falling back to New", () => {
    expect(leadStatusLabel("sold")).toBe("Mark Sold");
    expect(leadStatusLabel("follow_up")).toBe("Follow Up Needed");
    expect(leadStatusLabel(null)).toBe("New");
    expect(leadStatusLabel("bogus")).toBe("New");
  });
});
