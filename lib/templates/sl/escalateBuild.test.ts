import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../sales-reps", () => ({ getSalesRepById: vi.fn() }));
vi.mock("../../notification-settings", () => ({ isNotificationEnabled: vi.fn() }));
vi.mock("../mail/repBuildEmail", () => ({
  buildLiveEmail: vi.fn(() => ({ subject: "live", html: "<live>" })),
  buildFailedEmail: vi.fn(() => ({ subject: "failed", html: "<failed>" })),
  sendRepBuildEmail: vi.fn(async () => {}),
}));

import { escalateTerminalBuild } from "./escalateBuild";
import { getSalesRepById } from "../../sales-reps";
import { isNotificationEnabled } from "../../notification-settings";
import { buildLiveEmail, buildFailedEmail, sendRepBuildEmail } from "../mail/repBuildEmail";

// db stub: dedup .maybeSingle() → configurable; records inserts.
function mockDb(dup: unknown = null) {
  const inserts: Record<string, unknown>[] = [];
  const db = {
    inserts,
    from() {
      const b: Record<string, unknown> = {};
      b.select = () => b;
      b.eq = () => b;
      b.maybeSingle = () => Promise.resolve({ data: dup, error: null });
      b.insert = (row: Record<string, unknown>) => {
        inserts.push(row);
        return Promise.resolve({ error: null });
      };
      return b;
    },
  };
  return db;
}

const base = {
  sourceId: "wr-gbp-abc",
  stage: "live" as const,
  businessName: "Reece HVAC",
  salesRepId: "rep-1",
  campaignId: "camp-1",
  previewUrl: "https://reece.pages.dev",
  errorMessage: null,
  buildId: "build-1",
  costUsd: null as number | null,
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(isNotificationEnabled).mockResolvedValue(true);
  vi.mocked(getSalesRepById).mockResolvedValue({
    id: "rep-1",
    email: "rep@wr.co",
    first_name: "Rae",
    last_name: "Vega",
  } as never);
});

describe("escalateTerminalBuild — rep email", () => {
  it("emails the rep with the preview URL on a live wr-gbp build", async () => {
    await escalateTerminalBuild(mockDb() as never, base);
    expect(buildLiveEmail).toHaveBeenCalledWith(
      expect.objectContaining({ businessName: "Reece HVAC", previewUrl: "https://reece.pages.dev" }),
    );
    expect(sendRepBuildEmail).toHaveBeenCalledWith("rep@wr.co", { subject: "live", html: "<live>" });
  });

  it("emails a failure notice on a build_failed wr-gbp build", async () => {
    await escalateTerminalBuild(mockDb() as never, {
      ...base,
      stage: "build_failed",
      previewUrl: null,
      errorMessage: "template 400",
    });
    expect(buildFailedEmail).toHaveBeenCalledWith(
      expect.objectContaining({ businessName: "Reece HVAC", error: "template 400" }),
    );
    expect(sendRepBuildEmail).toHaveBeenCalledTimes(1);
  });

  it("does NOT email for a non-rep build (source_id not wr-gbp-*)", async () => {
    await escalateTerminalBuild(mockDb() as never, { ...base, sourceId: "wr-tpl-xyz" });
    expect(sendRepBuildEmail).not.toHaveBeenCalled();
  });

  it("does NOT email when sales_rep notifications are disabled", async () => {
    vi.mocked(isNotificationEnabled).mockResolvedValue(false);
    await escalateTerminalBuild(mockDb() as never, base);
    expect(sendRepBuildEmail).not.toHaveBeenCalled();
  });
});

describe("escalateTerminalBuild — cost", () => {
  it("records the real cost when provided (idempotent insert)", async () => {
    const db = mockDb(null);
    await escalateTerminalBuild(db as never, { ...base, costUsd: 0.0123 });
    expect(db.inserts).toHaveLength(1);
    expect(db.inserts[0]).toMatchObject({
      stage: "build",
      actor: "sitelaunchr",
      usd: 0.0123,
      rep_id: "rep-1",
      run_id: "build-1",
    });
  });

  it("skips the insert when a cost event for this build already exists", async () => {
    const db = mockDb({ id: "existing" });
    await escalateTerminalBuild(db as never, { ...base, costUsd: 0.0123 });
    expect(db.inserts).toHaveLength(0);
  });

  it("records no cost on the reconcile path (costUsd null)", async () => {
    const db = mockDb(null);
    await escalateTerminalBuild(db as never, { ...base, costUsd: null });
    expect(db.inserts).toHaveLength(0);
  });
});
