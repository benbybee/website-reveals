import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { templatesEnabled, type MailProvider } from "@/lib/templates/config";
import { tplDb } from "@/lib/templates/db";

const MAIL_PROVIDERS: MailProvider[] = ["lob", "click2mail", "export"];

interface LocationInput {
  state: string;
  city?: string;
  radius?: number;
}

interface PatchBody {
  postcard_design_id?: string | null;
  return_address_id?: string | null;
  mail_provider?: string;
  locations?: LocationInput[];
  target_count?: number;
  audit_enabled?: boolean;
}

// Edit a campaign (the long-lived list) and/or assign its mail settings. The
// postcard design + return address are soft references; setting null detaches.
// Editing locations/target lets the user develop the list — add cities, raise
// the target — without creating a second campaign for the same (industry, state).
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!templatesEnabled()) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  const { id } = await params;
  let body: PatchBody;
  try {
    body = (await req.json()) as PatchBody;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const db = tplDb();
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };

  if (body.postcard_design_id !== undefined) {
    if (body.postcard_design_id) {
      const { data: d } = await db.from("tpl_postcard_designs").select("id").eq("id", body.postcard_design_id).maybeSingle();
      if (!d) return NextResponse.json({ error: "design_not_found" }, { status: 400 });
    }
    patch.postcard_design_id = body.postcard_design_id;
  }
  if (body.return_address_id !== undefined) {
    if (body.return_address_id) {
      const { data: r } = await db.from("tpl_return_addresses").select("id").eq("id", body.return_address_id).maybeSingle();
      if (!r) return NextResponse.json({ error: "return_address_not_found" }, { status: 400 });
    }
    patch.return_address_id = body.return_address_id;
  }
  if (body.mail_provider !== undefined) {
    if (!MAIL_PROVIDERS.includes(body.mail_provider as MailProvider)) {
      return NextResponse.json({ error: "invalid_mail_provider" }, { status: 400 });
    }
    patch.mail_provider = body.mail_provider;
  }
  if (body.locations !== undefined) {
    if (!Array.isArray(body.locations) || body.locations.length === 0) {
      return NextResponse.json({ error: "at least one location is required" }, { status: 400 });
    }
    for (const loc of body.locations) {
      if (!loc || typeof loc.state !== "string" || !loc.state.trim()) {
        return NextResponse.json({ error: "each location requires a state" }, { status: 400 });
      }
    }
    const states = [...new Set(body.locations.map((l) => l.state.trim().toUpperCase()))];
    if (states.length > 1) {
      return NextResponse.json(
        { error: "A campaign covers a single state. Create one campaign per state." },
        { status: 400 },
      );
    }
    patch.locations = body.locations;
    patch.state = states[0];
  }
  if (body.target_count !== undefined) {
    patch.target_count = Math.max(0, Math.floor(body.target_count));
  }
  if (body.audit_enabled !== undefined) {
    patch.audit_enabled = body.audit_enabled === true;
  }

  const { data, error } = await db
    .from("tpl_campaigns")
    .update(patch)
    .eq("id", id)
    .select("id, postcard_design_id, return_address_id, mail_provider, locations, target_count, audit_enabled, state")
    .single();
  if (error) {
    if (error.code === "23505") {
      return NextResponse.json(
        { error: "A campaign for that industry + state already exists." },
        { status: 409 },
      );
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, campaign: data });
}
