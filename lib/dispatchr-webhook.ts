/**
 * Outbound webhook to Dispatchr (joindispatchr.com) — Ben's personal
 * Mission Control. Lets Dispatchr observe WR's intake pipeline without
 * polling the database.
 *
 * Endpoint:        POST $WEBSITEREVEALS_DISPATCHR_WEBHOOK_URL
 * Auth:            x-wr-webhook-secret: $WEBSITEREVEALS_DISPATCHR_WEBHOOK_SECRET
 * Timeout:         3s (AbortController)
 * Failure policy:  silent — every error is console.warn-ed and swallowed.
 *                  Never throws into the caller. Missing env vars = no-op.
 *
 * Mirrors the fire-and-forget pattern used by sendTelegramMessage / Resend
 * elsewhere in the codebase: caller `await`s but never has to think about
 * delivery failures.
 */

export type WrEvent =
  | {
      type: "submission.new";
      token: string;
      businessName: string;
      contactEmail: string | null;
      source: string;
      formType: string;
      briefPreview: string;
    }
  | {
      type: "build.dispatched";
      token: string;
      businessName: string;
      buildId: string;
    }
  | {
      type: "build.live";
      token: string;
      businessName: string;
      siteUrl: string | null;
      kuraPortalUrl: string | null;
    }
  | {
      type: "build.failed";
      token: string;
      businessName: string;
      errorMessage: string;
    }
  | {
      type: "build.stuck";
      token: string;
      businessName: string;
      buildId: string;
      ageHours: number;
    }
  | {
      type: "submission.abandoned";
      token: string;
      businessName: string;
      contactEmail: string | null;
      currentStep: number;
      ageHours: number;
    };

const TIMEOUT_MS = 3000;

export async function notifyDispatchr(event: WrEvent): Promise<void> {
  const url = (process.env.WEBSITEREVEALS_DISPATCHR_WEBHOOK_URL || "").trim();
  const secret = (process.env.WEBSITEREVEALS_DISPATCHR_WEBHOOK_SECRET || "").trim();

  if (!url || !secret) {
    // Silent no-op when not configured (e.g. local dev without secrets)
    if (process.env.NODE_ENV !== "production") {
      console.log(`[dispatchr] skipping ${event.type} (env not configured)`);
    }
    return;
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-wr-webhook-secret": secret,
      },
      body: JSON.stringify(event),
      signal: controller.signal,
    });
    if (!res.ok) {
      // Try to capture a brief error body for debugging
      let detail = "";
      try {
        detail = (await res.text()).slice(0, 200);
      } catch {
        /* ignore */
      }
      console.warn(`[dispatchr] ${event.type} HTTP ${res.status}${detail ? ` — ${detail}` : ""}`);
    } else {
      console.log(`[dispatchr] ${event.type} delivered`);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("aborted") || msg.includes("AbortError")) {
      console.warn(`[dispatchr] ${event.type} timed out after ${TIMEOUT_MS}ms`);
    } else {
      console.warn(`[dispatchr] ${event.type} failed: ${msg}`);
    }
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Build the briefPreview used in submission.new events: the first 240 chars
 * of the form_data JSON with all internal `_`-prefixed keys removed.
 */
export function buildBriefPreview(formData: Record<string, unknown>): string {
  const filtered: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(formData)) {
    if (k.startsWith("_")) continue;
    if (v === undefined || v === null || v === "") continue;
    filtered[k] = v;
  }
  return JSON.stringify(filtered).slice(0, 240);
}
