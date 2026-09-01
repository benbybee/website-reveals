import { describe, it, expect } from "vitest";
import { templateReadyIndustries, isTemplateReady } from "./registry";

// Minimal chainable stand-in for the supabase query builder: records the table +
// filters + selected columns, and resolves the terminal call to a fixed result.
function mockDb(config: { ready?: unknown[]; readyError?: unknown; single?: unknown }) {
  const calls: { table: string; select?: string; filters: Record<string, unknown> }[] = [];
  const db = {
    calls,
    from(table: string) {
      const rec = { table, filters: {} as Record<string, unknown>, select: undefined as string | undefined };
      calls.push(rec);
      const builder = {
        select(cols: string) {
          rec.select = cols;
          return builder;
        },
        eq(col: string, val: unknown) {
          rec.filters[col] = val;
          return builder;
        },
        order() {
          return Promise.resolve({ data: config.ready ?? [], error: config.readyError ?? null });
        },
        maybeSingle() {
          return Promise.resolve({ data: config.single ?? null, error: null });
        },
      };
      return builder;
    },
  };
  return db;
}

describe("templateReadyIndustries", () => {
  it("returns only sl_template_ready rows, ordered by display_name", async () => {
    const rows = [
      { slug: "hvac", display_name: "HVAC", sl_slug: "hvac" },
      { slug: "landscaping", display_name: "Landscaping", sl_slug: "landscaping" },
    ];
    const db = mockDb({ ready: rows });

    const out = await templateReadyIndustries(db as never);

    expect(out).toEqual(rows);
    expect(db.calls[0].table).toBe("tpl_industries");
    expect(db.calls[0].filters.sl_template_ready).toBe(true);
    expect(db.calls[0].select).toContain("sl_slug");
  });

  it("throws when the query errors", async () => {
    const db = mockDb({ readyError: { message: "boom" } });
    await expect(templateReadyIndustries(db as never)).rejects.toBeTruthy();
  });
});

describe("isTemplateReady", () => {
  it("is true when the row's sl_template_ready is true", async () => {
    const db = mockDb({ single: { sl_template_ready: true } });
    expect(await isTemplateReady(db as never, "hvac")).toBe(true);
    expect(db.calls[0].filters.slug).toBe("hvac");
  });

  it("is false when the row is not ready", async () => {
    const db = mockDb({ single: { sl_template_ready: false } });
    expect(await isTemplateReady(db as never, "roofing")).toBe(false);
  });

  it("is false when the industry does not exist", async () => {
    const db = mockDb({ single: null });
    expect(await isTemplateReady(db as never, "nope")).toBe(false);
  });
});
