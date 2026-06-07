import { task, logger } from "@trigger.dev/sdk/v3";
import { tplDb } from "@/lib/templates/db";
import { mailCampaign } from "@/lib/templates/mail/send";
import { TPL_TASK_IDS } from "@/lib/templates/trigger/ids";

/**
 * tpl-mail-campaign: mail the campaign's eligible prospects (stage `live`,
 * mail_ready, not suppressed, not already mailed) as Lob postcards. Idempotent
 * via tpl_mailings UNIQUE(prospect_id) — re-running never double-mails. The
 * operator triggers this explicitly after a cost confirm; verification gates each
 * send and one bad address can't sink the run (per-prospect isolation lives in
 * mailCampaign). A `test_` Lob key runs test mode (no real mail/charge).
 */
export const tplMailCampaignTask = task({
  id: TPL_TASK_IDS.mailCampaign,
  maxDuration: 1800,
  queue: { concurrencyLimit: 1 },
  run: async (payload: { campaignId: string; limit?: number }) => {
    const db = tplDb();
    logger.log("tpl-mail-campaign start", { campaignId: payload.campaignId, limit: payload.limit });
    const result = await mailCampaign(db, payload.campaignId, { limit: payload.limit });
    logger.log("tpl-mail-campaign done", { ...result });
    return result;
  },
});
