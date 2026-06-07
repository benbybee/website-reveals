import { NextRequest, NextResponse } from "next/server";
import { tasks as triggerTasks } from "@trigger.dev/sdk/v3";
import { requireAdmin } from "@/lib/admin-auth";
import {
  templatesEnabled,
  mailProviderConfigured,
  mailProviderIsTestMode,
  type MailProvider,
} from "@/lib/templates/config";
import { tplDb } from "@/lib/templates/db";
import { mailCampaign } from "@/lib/templates/mail/send";
import { TPL_TASK_IDS } from "@/lib/templates/trigger/ids";

interface MailBody {
  dryRun?: boolean;
  limit?: number;
}

/**
 * Mail a campaign. The UI calls this twice: first with `dryRun:true` to get the
 * eligible count + estimated cost for the spend-confirm gate, then (on confirm)
 * with `dryRun:false` to dispatch the tpl-mail-campaign Trigger.dev task. The
 * actual send is idempotent (one card per prospect, ever).
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!templatesEnabled()) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  const { id } = await params;
  let body: MailBody = {};
  try {
    body = (await req.json()) as MailBody;
  } catch {
    // empty body → treat as dry-run preview
    body = { dryRun: true };
  }

  const db = tplDb();

  // The campaign's mail_provider decides preflight + dispatch. 'export' is a
  // manual CSV path (the UI links straight to /export), so it is never dispatched
  // through this route.
  const { data: campaign } = await db
    .from("tpl_campaigns")
    .select("id, postcard_design_id, return_address_id, mail_provider")
    .eq("id", id)
    .maybeSingle();
  if (!campaign) return NextResponse.json({ error: "campaign_not_found" }, { status: 404 });
  const provider = ((campaign.mail_provider as MailProvider) ?? "lob");

  if (body.dryRun) {
    try {
      const preview = await mailCampaign(db, id, { dryRun: true, limit: body.limit });
      return NextResponse.json({
        ok: true,
        provider,
        testMode: mailProviderIsTestMode(provider),
        providerConfigured: mailProviderConfigured(provider),
        ...preview,
      });
    } catch (err) {
      return NextResponse.json({ error: err instanceof Error ? err.message : "preview_failed" }, { status: 400 });
    }
  }

  // Live send — preflight before dispatching so the operator gets an immediate,
  // classified error instead of a silent failed task run.
  if (provider === "export") return NextResponse.json({ error: "export_no_automated_send" }, { status: 400 });
  if (!mailProviderConfigured(provider)) {
    return NextResponse.json({ error: `${provider}_not_configured` }, { status: 400 });
  }
  if (!campaign.postcard_design_id) return NextResponse.json({ error: "no_design_assigned" }, { status: 400 });
  if (!campaign.return_address_id) return NextResponse.json({ error: "no_return_address_assigned" }, { status: 400 });

  const handle = await triggerTasks.trigger(TPL_TASK_IDS.mailCampaign, { campaignId: id, limit: body.limit });
  return NextResponse.json({ ok: true, runId: handle.id, provider, testMode: mailProviderIsTestMode(provider) });
}
