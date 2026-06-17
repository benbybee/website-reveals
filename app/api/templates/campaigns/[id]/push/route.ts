import { NextRequest, NextResponse, after } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { templatesEnabled, SL_TEMPLATE_TRANSPORT } from "@/lib/templates/config";
import { tplDb } from "@/lib/templates/db";
import { assembleAndPush } from "@/lib/templates/sl/push";
import { pushBuilds } from "@/lib/templates/sl/adapter";

// The deferred SL POST loop runs inside this invocation via after(), so give it
// room beyond the 60s default. (Capped to the plan limit by Vercel.)
export const maxDuration = 300;

interface PushBody {
  dryRun?: boolean;
  /** Selected prospects to dispatch (by tpl_prospects.id). Omit to push all qualified. */
  prospectIds?: string[];
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
    // `defer: true` builds the payloads + persists the batch row but hands the
    // post-transport SL loop back to us instead of awaiting it inline.
    const result = await assembleAndPush(tplDb(), id, {
      dryRun: body.dryRun === true,
      transport,
      prospectIds: Array.isArray(body.prospectIds) && body.prospectIds.length > 0 ? body.prospectIds : undefined,
      defer: true,
    });

    // Run the slow per-build SL POST loop AFTER the response is sent. The client
    // modal closes immediately with the count; the Builds page live-polling then
    // shows each build move building → live as SL works through them. Without
    // this the request blocks on N sequential SL POSTs and can outlast the
    // function timeout, leaving the UI stuck while the builds already ran — the
    // reported bug. (The eventual 500+-scale path swaps this after() block for a
    // durable queue; the response contract stays identical, so it's additive.)
    if (result.deferredBuilds && result.deferredBuilds.length > 0) {
      const builds = result.deferredBuilds;
      const batchRowId = result.batchRowId;
      after(async () => {
        const db = tplDb();
        try {
          const push = await pushBuilds(builds, { transport: "post" });
          const allOk = push.results.every((r) => r.ok);
          await db
            .from("tpl_sl_batches")
            .update({ status: allOk ? "delivered" : "partial", sl_response: { results: push.results } })
            .eq("id", batchRowId);
        } catch (err) {
          await db
            .from("tpl_sl_batches")
            .update({ status: "error", sl_response: { error: err instanceof Error ? err.message : String(err) } })
            .eq("id", batchRowId);
        }
      });
    }

    // deferredBuilds is a server-internal handoff — don't ship the raw payloads
    // to the client. recordCount (the count the toast shows) stays in the result.
    const clientResult = { ...result };
    delete clientResult.deferredBuilds;
    return NextResponse.json({ ok: true, ...clientResult });
  } catch (err) {
    const message = err instanceof Error ? err.message : "push failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
