import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { templatesEnabled } from "@/lib/templates/config";
import { tplDb } from "@/lib/templates/db";
import type { CanonicalRecord } from "@/lib/templates/types";

// Streamed CSV of a campaign's prospects. Mirrors the list filters (stage,
// website_status, agent, missing) so "export what you're looking at" works, and
// supports column selection via ?fields=a,b,c. Used for the CSV arm of the GTM
// layer (the operator can hand a list to a mail house instead of, or alongside,
// the Lob send).

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
  | "mail_ready"
  | "do_not_mail"
  | "created_at";

interface ProspectRow {
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
  "mail_ready",
  "do_not_mail",
  "created_at",
]);

function valueFor(field: FieldKey, row: ProspectRow): string {
  switch (field) {
    case "email":
      return row.record?.email ?? "";
    case "street":
      return row.record?.address?.street ?? "";
    case "zip":
      return row.record?.address?.zip ?? "";
    case "country":
      return row.record?.address?.country ?? "";
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
  let query = db
    .from("tpl_prospects")
    .select(
      "business_name, city, state, phone, website, website_status, stage, agent_id, confidence, mail_ready, do_not_mail, created_at, record",
    )
    .eq("campaign_id", id);

  const stage = sp.get("stage");
  if (stage) query = query.eq("stage", stage);
  const websiteStatus = sp.get("website_status");
  if (websiteStatus) query = query.eq("website_status", websiteStatus);
  const agent = sp.get("agent");
  if (agent) query = query.eq("agent_id", agent);
  const missing = sp.get("missing");
  if (missing) query = query.contains("completeness", { missing: [missing] });
  if (sp.get("mail_ready") === "true") query = query.eq("mail_ready", true);
  if (sp.get("do_not_mail") === "false") query = query.eq("do_not_mail", false);

  query = query.order("created_at", { ascending: false });

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const rows = (data ?? []) as unknown as ProspectRow[];
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
