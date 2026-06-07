import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { templatesEnabled } from "@/lib/templates/config";
import { tplDb } from "@/lib/templates/db";

const SIZES = new Set(["4x6", "6x9", "6x11"]);

interface CreateBody {
  name?: string;
  size?: string;
  front_url?: string | null;
  back_url?: string | null;
}

export async function GET() {
  if (!templatesEnabled()) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  const db = tplDb();
  const { data } = await db
    .from("tpl_postcard_designs")
    .select("*")
    .eq("archived", false)
    .order("created_at", { ascending: false });
  return NextResponse.json({ ok: true, designs: data ?? [] });
}

// JSON metadata only. Artwork is uploaded browser->Supabase via a signed URL
// (POST /postcard-designs/sign-upload); the resulting public URLs are sent here.
// Front/back optional at create so a draft can be saved and artwork added later.
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

  const name = (body.name ?? "").trim();
  const size = (body.size ?? "4x6").trim();
  if (!name) return NextResponse.json({ error: "missing_name" }, { status: 400 });
  if (!SIZES.has(size)) return NextResponse.json({ error: "invalid_size" }, { status: 400 });

  const db = tplDb();
  const { data, error } = await db
    .from("tpl_postcard_designs")
    .insert({
      name,
      size,
      front_url: body.front_url ?? null,
      back_url: body.back_url ?? null,
      created_by: auth.user.email,
    })
    .select("*")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, design: data });
}
