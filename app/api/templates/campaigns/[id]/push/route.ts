import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { templatesEnabled, SL_TEMPLATE_TRANSPORT } from "@/lib/templates/config";
import { tplDb } from "@/lib/templates/db";
import { assembleAndPush } from "@/lib/templates/sl/push";

interface PushBody {
  dryRun?: boolean;
}

/** Task 8.8 — assemble a campaign's qualified prospects and push to SL. */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!templatesEnabled()) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  const { id } = await params;
  let body: PushBody = {};
  try {
    body = (await req.json()) as PushBody;
  } catch {
    // empty body is fine — defaults to a live push
  }

  const transport = SL_TEMPLATE_TRANSPORT() === "table" ? "table" : "post";

  try {
    const result = await assembleAndPush(tplDb(), id, {
      dryRun: body.dryRun === true,
      transport,
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : "push failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
