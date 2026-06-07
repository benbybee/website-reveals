// Core mailing orchestration: turn a campaign's eligible prospects into Lob
// postcards, idempotently. Shared by the Trigger.dev task (bulk) and the
// "Mail this campaign" API (small/manual). The tpl_mailings UNIQUE(prospect_id)
// constraint is the safety net: a claim-insert dedupes even under concurrency, so
// no prospect is ever mailed twice.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Address } from "@/lib/templates/types";
import type { PostcardDesign, ReturnAddress } from "@/lib/templates/mail/types";
import { toLobAddress, returnToLobAddress } from "@/lib/templates/mail/types";
import { verifyUsAddress, createPostcard } from "@/lib/templates/mail/lob";
import { uploadDocument, createAddressList, createJob, submitJob } from "@/lib/templates/mail/click2mail";
import { generateQrToken, qrTrackingUrl } from "@/lib/templates/mail/qr";
import { lobEnabled, c2mEnabled, type MailProvider } from "@/lib/templates/config";

// Per-card cost estimate (USD) for the spend-confirm gate + ledger. Lob's
// postcard object doesn't return price, so we estimate by size; override via env.
const UNIT_USD: Record<string, number> = {
  "4x6": Number(process.env.LOB_UNIT_USD_4X6 ?? 0.7),
  "6x9": Number(process.env.LOB_UNIT_USD_6X9 ?? 1.05),
  "6x11": Number(process.env.LOB_UNIT_USD_6X11 ?? 1.35),
};

export function estimateUnitUsd(size: string): number {
  return UNIT_USD[size] ?? UNIT_USD["4x6"];
}

interface EligibleProspect {
  id: string;
  business_name: string | null;
  address: Address | null;
  preview_url: string | null;
}

// live + ready + not suppressed + not already mailed.
export async function loadEligible(
  db: SupabaseClient,
  campaignId: string,
): Promise<EligibleProspect[]> {
  const { data: rows } = await db
    .from("tpl_prospects")
    .select("id, business_name, record")
    .eq("campaign_id", campaignId)
    .eq("stage", "live")
    .eq("mail_ready", true)
    .eq("do_not_mail", false)
    .limit(10000);

  const { data: mailed } = await db
    .from("tpl_mailings")
    .select("prospect_id")
    .eq("campaign_id", campaignId);
  const alreadyMailed = new Set((mailed ?? []).map((m) => m.prospect_id as string));

  return ((rows ?? []) as Record<string, unknown>[])
    .filter((p) => !alreadyMailed.has(p.id as string))
    .map((p) => {
      const record = (p.record as Record<string, unknown>) ?? {};
      return {
        id: p.id as string,
        business_name: (p.business_name as string) ?? null,
        address: (record.address as Address) ?? null,
        preview_url: (record.preview_url as string) ?? null,
      };
    });
}

export interface MailCampaignResult {
  dryRun: boolean;
  eligible: number;
  estimatedCostUsd: number;
  sent: number;
  undeliverable: number;
  failed: number;
  skipped: number;
}

export interface MailCampaignOptions {
  dryRun?: boolean;
  limit?: number; // optional cap (e.g. a test batch)
}

export async function mailCampaign(
  db: SupabaseClient,
  campaignId: string,
  opts: MailCampaignOptions = {},
): Promise<MailCampaignResult> {
  const { data: campaign } = await db
    .from("tpl_campaigns")
    .select("id, postcard_design_id, return_address_id, mail_provider")
    .eq("id", campaignId)
    .maybeSingle();
  if (!campaign) throw new Error("campaign_not_found");
  if (!campaign.postcard_design_id) throw new Error("no_design_assigned");
  if (!campaign.return_address_id) throw new Error("no_return_address_assigned");

  const provider = ((campaign.mail_provider as MailProvider) ?? "lob");

  const { data: design } = await db
    .from("tpl_postcard_designs")
    .select("*")
    .eq("id", campaign.postcard_design_id)
    .maybeSingle<PostcardDesign>();
  if (!design) throw new Error("design_not_found");
  if (!design.front_url || !design.back_url) throw new Error("design_incomplete");

  const { data: ret } = await db
    .from("tpl_return_addresses")
    .select("*")
    .eq("id", campaign.return_address_id)
    .maybeSingle<ReturnAddress>();
  if (!ret) throw new Error("return_address_not_found");

  let eligible = await loadEligible(db, campaignId);
  if (opts.limit && opts.limit > 0) eligible = eligible.slice(0, opts.limit);

  const unit = estimateUnitUsd(design.size);
  const result: MailCampaignResult = {
    dryRun: Boolean(opts.dryRun),
    eligible: eligible.length,
    estimatedCostUsd: Number((eligible.length * unit).toFixed(2)),
    sent: 0,
    undeliverable: 0,
    failed: 0,
    skipped: 0,
  };

  if (opts.dryRun) return result;

  // 'export' has no automated send — the operator pulls the CSV by hand. The API
  // layer routes the export provider to the CSV endpoint instead of calling us,
  // so reaching here is an operator/caller error.
  if (provider === "export") throw new Error("export_no_automated_send");

  if (provider === "click2mail") {
    if (!c2mEnabled()) throw new Error("click2mail_not_configured");
    return mailViaClick2Mail(db, { campaignId, design, ret, eligible, unit, result });
  }

  // Default provider: Lob (one card per prospect, synchronous).
  if (!lobEnabled()) throw new Error("lob_not_configured");

  const fromAddr = returnToLobAddress(ret);

  for (const p of eligible) {
    if (!p.address || !p.address.street || !p.address.zip) {
      result.skipped++;
      continue;
    }

    // Claim the prospect atomically. The UNIQUE(prospect_id) constraint means a
    // concurrent run (or a prior partial) loses the race and we skip. The QR
    // token is minted here so it is frozen on the card record before the Lob
    // create call references it in merge_variables.
    const qrToken = generateQrToken();
    const { error: claimErr } = await db.from("tpl_mailings").insert({
      prospect_id: p.id,
      campaign_id: campaignId,
      design_id: design.id,
      return_address_id: ret.id,
      status: "queued",
      address_snapshot: p.address,
      preview_url_snapshot: p.preview_url,
      qr_token: qrToken,
    });
    if (claimErr) {
      result.skipped++; // already claimed/mailed (unique violation) or insert error
      continue;
    }

    try {
      const verify = await verifyUsAddress({
        primary_line: p.address.street,
        city: p.address.city,
        state: p.address.state,
        zip_code: p.address.zip,
      });
      if (!verify.deliverable) {
        await db
          .from("tpl_mailings")
          .update({ status: "undeliverable", error: `deliverability=${verify.deliverability}` })
          .eq("prospect_id", p.id);
        result.undeliverable++;
        continue;
      }

      const card = await createPostcard({
        to: toLobAddress(p.business_name ?? "Business Owner", p.address),
        from: fromAddr,
        front: design.front_url,
        back: design.back_url,
        size: design.size,
        description: `tpl campaign ${campaignId} / prospect ${p.id}`,
        merge_variables: {
          business_name: p.business_name ?? "",
          preview_url: p.preview_url ?? "",
          // Tracked redirect — scans are logged + attributed before forwarding to
          // the preview. The HTML back-template should encode qr_url as the QR.
          qr_url: qrTrackingUrl(qrToken),
        },
        idempotency_key: `tpl-mail-${p.id}`,
      });

      await db
        .from("tpl_mailings")
        .update({
          status: "sent",
          lob_id: card.id,
          tracking_url: card.url,
          cost_usd: unit,
          sent_at: new Date().toISOString(),
        })
        .eq("prospect_id", p.id);
      result.sent++;
    } catch (err) {
      await db
        .from("tpl_mailings")
        .update({ status: "failed", error: err instanceof Error ? err.message : String(err) })
        .eq("prospect_id", p.id);
      result.failed++;
    }
  }

  return result;
}

// Click2Mail batch flow: one job covers the whole eligible set. We claim each
// prospect (UNIQUE(prospect_id) dedupes), build a single address-list CSV with
// the variable-data merge columns (incl. qr_url for C2M's native QR field),
// upload the artwork as a document, create the job, and submit it. Per-card
// deliverability is C2M's responsibility (CASS/NCOA on submit), so unlike the
// Lob path there is no per-prospect verify step here.
//
// CONFIRM IN SANDBOX: the address-list field mapping, the document artwork shape
// (single combined PDF vs. front/back), and how the return address is applied
// are Click2Mail account/catalog specifics — validate with a sandbox dry run
// before the first live send (see click2mail.ts).
async function mailViaClick2Mail(
  db: SupabaseClient,
  ctx: {
    campaignId: string;
    design: PostcardDesign;
    ret: ReturnAddress;
    eligible: EligibleProspect[];
    unit: number;
    result: MailCampaignResult;
  },
): Promise<MailCampaignResult> {
  const { campaignId, design, ret, eligible, unit, result } = ctx;

  // 1) Claim each mailable prospect, minting a QR token frozen on the row.
  const claimed: { prospect: EligibleProspect; qrToken: string }[] = [];
  for (const p of eligible) {
    if (!p.address || !p.address.street || !p.address.zip) {
      result.skipped++;
      continue;
    }
    const qrToken = generateQrToken();
    const { error: claimErr } = await db.from("tpl_mailings").insert({
      prospect_id: p.id,
      campaign_id: campaignId,
      design_id: design.id,
      return_address_id: ret.id,
      status: "queued",
      provider: "click2mail",
      address_snapshot: p.address,
      preview_url_snapshot: p.preview_url,
      qr_token: qrToken,
    });
    if (claimErr) {
      result.skipped++; // already claimed/mailed (unique violation) or insert error
      continue;
    }
    claimed.push({ prospect: p, qrToken });
  }

  if (claimed.length === 0) return result;

  const prospectIds = claimed.map((c) => c.prospect.id);

  try {
    // 2) Build the address-list CSV (header row + one row per claimed prospect).
    const headers = ["name", "address1", "city", "state", "zip", "business_name", "preview_url", "qr_url"];
    const lines = [headers.join(",")];
    for (const { prospect: p, qrToken } of claimed) {
      const a = p.address!;
      lines.push(
        [
          p.business_name ?? "Business Owner",
          a.street,
          a.city,
          a.state,
          a.zip,
          p.business_name ?? "",
          p.preview_url ?? "",
          qrTrackingUrl(qrToken),
        ]
          .map(csvCell)
          .join(","),
      );
    }
    const csv = lines.join("\r\n");

    // 3) Upload artwork → 4) create address list → 5) create job → 6) submit.
    const doc = await uploadDocument({
      name: `tpl-${campaignId}-${design.id}`,
      size: design.size,
      assetUrl: design.back_url!,
    });
    const list = await createAddressList({
      name: `tpl-${campaignId}`,
      csv,
      mapping: {
        "Full Name": "name",
        "Address Line 1": "address1",
        City: "city",
        State: "state",
        "Postal Code": "zip",
      },
    });
    const job = await createJob({
      name: `tpl-${campaignId}`,
      documentId: doc.id,
      addressListId: list.id,
      size: design.size,
    });
    const submitted = await submitJob(job.id);

    // 7) Record the batch handle on every claimed row. The job covers them all;
    // per-card cost is the batch cost split evenly, falling back to the estimate.
    const perCard =
      submitted.cost != null && claimed.length > 0
        ? Number((submitted.cost / claimed.length).toFixed(4))
        : unit;
    await db
      .from("tpl_mailings")
      .update({
        status: "sent",
        provider_job_id: job.id,
        cost_usd: perCard,
        sent_at: new Date().toISOString(),
      })
      .in("prospect_id", prospectIds);
    result.sent = claimed.length;
  } catch (err) {
    // The job never submitted — mark the whole claimed batch failed so a retry
    // can re-claim them (the rows remain, carrying the error for diagnosis).
    await db
      .from("tpl_mailings")
      .update({ status: "failed", error: err instanceof Error ? err.message : String(err) })
      .in("prospect_id", prospectIds);
    result.failed = claimed.length;
  }

  return result;
}

// CSV cell: always quote, double embedded quotes, and neutralize spreadsheet
// formula injection on a leading =+-@. Mirrors the export route's encoder.
function csvCell(v: string): string {
  const s = v ?? "";
  const safe = /^[=+\-@]/.test(s) ? `'${s}` : s;
  return `"${safe.replace(/"/g, '""')}"`;
}
