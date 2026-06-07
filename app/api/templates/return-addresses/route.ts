import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { templatesEnabled } from "@/lib/templates/config";
import { tplDb } from "@/lib/templates/db";

interface CreateBody {
  label?: string;
  name?: string;
  address_line1?: string;
  address_line2?: string;
  city?: string;
  state?: string;
  zip?: string;
  country?: string;
  is_default?: boolean;
}

const REQUIRED: (keyof CreateBody)[] = ["label", "name", "address_line1", "city", "state", "zip"];

export async function GET() {
  if (!templatesEnabled()) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  const db = tplDb();
  const { data } = await db
    .from("tpl_return_addresses")
    .select("*")
    .eq("archived", false)
    .order("is_default", { ascending: false })
    .order("label", { ascending: true });
  return NextResponse.json({ ok: true, addresses: data ?? [] });
}

export async function POST(req: NextRequest) {
  if (!templatesEnabled()) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  let body: CreateBody;
  try {
    body = (await req.json()) as CreateBody;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const missing = REQUIRED.filter((k) => !String(body[k] ?? "").trim());
  if (missing.length) return NextResponse.json({ error: "missing_fields", missing }, { status: 400 });
  if (String(body.state).trim().length !== 2) {
    return NextResponse.json({ error: "state_must_be_2_letter" }, { status: 400 });
  }

  const db = tplDb();
  // Enforce single default: clear existing default if this one claims it.
  if (body.is_default) {
    await db.from("tpl_return_addresses").update({ is_default: false }).eq("is_default", true);
  }

  const { data, error } = await db
    .from("tpl_return_addresses")
    .insert({
      label: body.label!.trim(),
      name: body.name!.trim(),
      address_line1: body.address_line1!.trim(),
      address_line2: body.address_line2?.trim() || null,
      city: body.city!.trim(),
      state: body.state!.trim().toUpperCase(),
      zip: body.zip!.trim(),
      country: (body.country?.trim() || "US").toUpperCase(),
      is_default: Boolean(body.is_default),
      created_by: auth.user.email,
    })
    .select("*")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, address: data });
}
