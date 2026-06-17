import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { templatesEnabled } from "@/lib/templates/config";
import { tplDb } from "@/lib/templates/db";
import { applyProspectFilters } from "@/lib/templates/prospectFilters";
import type { CanonicalRecord } from "@/lib/templates/types";

// Streamed CSV of a campaign's prospects. Applies the SAME shared filters as
// the list route (stage, website_status, agent, missing, dna, address) so
// "export what you're looking at" works, and supports column selection via
// ?fields=a,b,c. Used for the CSV arm of the GTM layer (the operator can hand
// a list to a mail house instead of, or alongside, the Lob send).

type FieldKey =
  | "business_name"
  | "city"
  | "state"
  | "phone"
  | "email"
  | "website"
  | "website_status"
  | "stage"
  | "agent_id"
  | "confidence"
  | "street"
  | "zip"
  | "country"
  | "logo_url"
  | "primary_color"
  | "mail_ready"
  | "do_not_mail"
  | "created_at";

interface ProspectRow {
  id: string;
  business_name: string | null;
  city: string | null;
  state: string | null;
  phone: string | null;
  website: string | null;
  website_status: string | null;
  stage: string | null;
  agent_id: string | null;
  confidence: number | null;
  mail_ready: boolean | null;
  do_not_mail: boolean | null;
  created_at: string | null;
  record: CanonicalRecord | null;
}

const DEFAULT_FIELDS: FieldKey[] = [
  "business_name",
  "street",
  "city",
  "state",
  "zip",
  "phone",
  "email",
  "website",
  "website_status",
  "stage",
];

const ALL_FIELDS = new Set<FieldKey>([
  "business_name",
  "city",
  "state",
  "phone",
  "email",
  "website",
  "website_status",
  "stage",
  "agent_id",
  "confidence",
  "street",
  "zip",
  "country",
  "logo_url",
  "primary_color",
  "mail_ready",
  "do_not_mail",
  "created_at",
]);

function valueFor(field: FieldKey, row: ProspectRow): string {
  switch (field) {
    case "email":
      return row.record?.email ?? "";
    // The whole address comes from the canonical record — the same source the
    // dna/address filters and the mail send read. Mixing in the promoted
    // city/state columns would let a row pass `address=has` yet export
    // different (or blank) parts than the filter validated.
    case "street":
      return row.record?.address?.street ?? "";
    case "city":
      return row.record?.address?.city ?? row.city ?? "";
    case "state":
      return row.record?.address?.state ?? row.state ?? "";
    case "zip":
      return row.record?.address?.zip ?? "";
    case "country":
      return row.record?.address?.country ?? "";
    case "logo_url":
      return row.record?.logo?.src_url ?? "";
    case "primary_color":
      return row.record?.brand_colors?.primary ?? "";
    case "confidence":
      return row.confidence == null ? "" : String(row.confidence);
    case "mail_ready":
      return row.mail_ready ? "true" : "false";
    case "do_not_mail":
      return row.do_not_mail ? "true" : "false";
    default: {
      const v = row[field as keyof ProspectRow];
      return v == null ? "" : String(v);
    }
  }
}

function csvCell(s: string): string {
  // Always quote; escape embedded quotes by doubling. Prevents comma/newline
  // breakage and neutralizes spreadsheet formula injection on leading =+-@.
  const safe = /^[=+\-@]/.test(s) ? `'${s}` : s;
  return `"${safe.replace(/"/g, '""')}"`;
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!templatesEnabled()) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  const { id } = await params;
  const sp = req.nextUrl.searchParams;

  const requested = (sp.get("fields") ?? "")
    .split(",")
    .map((f) => f.trim())
    .filter((f): f is FieldKey => ALL_FIELDS.has(f as FieldKey));
  const fields = requested.length ? requested : DEFAULT_FIELDS;

  const db = tplDb();

  // Keyset-page the full set: Supabase caps a select at 1000 rows, which would
  // silently truncate the CSV on larger campaigns. Ordered by id so pages
  // can't skip or repeat rows.
  const PAGE = 1000;
  const rows: ProspectRow[] = [];
  for (let lastId = ""; ; ) {
    let query = db
      .from("tpl_prospects")
      .select(
        "id, business_name, city, state, phone, website, website_status, stage, agent_id, confidence, mail_ready, do_not_mail, created_at, record",
      )
      .eq("campaign_id", id);

    query = applyProspectFilters(query, sp);
    if (sp.get("mail_ready") === "true") query = query.eq("mail_ready", true);
    if (sp.get("do_not_mail") === "false") query = query.eq("do_not_mail", false);
    if (lastId) query = query.gt("id", lastId);
    query = query.order("id", { ascending: true }).limit(PAGE);

    const { data, error } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    const page = (data ?? []) as unknown as ProspectRow[];
    rows.push(...page);
    if (page.length < PAGE) break;
    lastId = page[page.length - 1].id;
  }

  // Stamp these rows as exported so the operator can filter exported vs not
  // (e.g. hand only the not-yet-exported batch to Click2Mail). Chunked to stay
  // under PostgREST's URL length limit on large campaigns.
  if (rows.length > 0) {
    const exportedAt = new Date().toISOString();
    const ids = rows.map((r) => r.id);
    for (let i = 0; i < ids.length; i += 500) {
      await db.from("tpl_prospects").update({ exported_at: exportedAt }).in("id", ids.slice(i, i + 500));
    }
  }

  const header = fields.map(csvCell).join(",");
  const body = rows.map((r) => fields.map((f) => csvCell(valueFor(f, r))).join(",")).join("\r\n");
  const csv = `${header}\r\n${body}`;

  const filename = `campaign-${id}-prospects.csv`;
  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
