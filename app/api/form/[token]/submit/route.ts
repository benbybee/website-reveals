import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { Resend } from "resend";
import { getDnsInstructions } from "@/lib/dns-instructions";
import { tasks } from "@trigger.dev/sdk/v3";
import { resolveFormType } from "@/lib/resolve-form-type";
import { buildPrompt } from "@/lib/prompts";
import { FORM_STEPS } from "@/lib/form-steps";
import { escapeHtml } from "@/lib/sanitize";
import { getClientByEmail, createClient, updateClient } from "@/lib/clients";
import { sendWelcomeEmail } from "@/lib/task-emails";
import { createTask } from "@/lib/tasks";
import { sendTelegramMessage } from "@/lib/telegram";
import { dispatchBuild, SiteLaunchrError } from "@/lib/sitelaunchr";
import { buildSiteLaunchrPayload, shouldRouteToSiteLaunchr } from "@/lib/sitelaunchr-mapper";
import { isNotificationEnabled, audienceForSubmission } from "@/lib/notification-settings";

function getResend() {
  return new Resend(process.env.RESEND_API_KEY);
}

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  const supabase = createServerClient();

  const { data: session, error } = await supabase
    .from("form_sessions")
    .select("*")
    .eq("token", token)
    .single();

  if (error || !session) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  // Already submitted — don't re-process
  if (session.submitted_at) {
    return NextResponse.json({ ok: true });
  }

  const formData = (session.form_data as Record<string, unknown>) || {};
  const businessName = (formData.business_name as string) || "Your Business";
  const ipAddress = process.env.AGENCY_IP_ADDRESS || "TBD";
  const dnsProvider = (session.dns_provider as string) || "other";
  const formType = resolveFormType(formData);
  const submissionSource = (formData._source as string) || "claim-your-site";

  // Link sales rep if /sales submission AND contact_email matches an active rep
  let salesRepId: string | null = null;
  if (submissionSource === "sales") {
    const repEmail = (formData.contact_email as string) || "";
    if (repEmail) {
      const { data: rep } = await supabase
        .from("sales_reps")
        .select("id")
        .ilike("email", repEmail)
        .eq("active", true)
        .maybeSingle();
      salesRepId = rep?.id || null;
    }
  }

  // Mark as submitted + attach sales rep if applicable
  await supabase
    .from("form_sessions")
    .update({
      submitted_at: new Date().toISOString(),
      ...(salesRepId ? { sales_rep_id: salesRepId } : {}),
    })
    .eq("token", token);
  const contactAudience = audienceForSubmission(submissionSource);
  const [contactAllowed, adminAllowed] = await Promise.all([
    isNotificationEnabled(contactAudience),
    isNotificationEnabled("admin"),
  ]);

  // Auto-create client from form submission
  let buildTaskId: string | undefined;
  const isSalesSubmission = submissionSource === "sales";
  let clientId: string | undefined;

  if (isSalesSubmission) {
    // ── Sales path ──
    // Every /sales submission represents a DIFFERENT business; the sales rep
    // is associated via sales_rep_id, not by sharing the client.email field.
    // We always create a fresh client per submission (no dedup by rep email),
    // and use the business's own email if provided — or a synthetic
    // @websitereveals.local address keyed on the token if not.
    const businessEmail = (formData.email as string) || "";
    const businessPhone = (formData.phone as string) || (formData.contact_phone as string) || "";
    const slug = businessName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40);
    const syntheticEmail = `nomail-${slug || "client"}-${token.slice(0, 8)}@websitereveals.local`;
    const preferredEmail = businessEmail && businessEmail.includes("@") ? businessEmail : syntheticEmail;

    const buildClient = async (email: string) => {
      const { client } = await createClient({
        first_name: businessName || "Client",
        last_name: "",
        company_name: businessName || "Unknown",
        email,
        phone: businessPhone,
        website_url: formData.current_website as string,
        form_session_token: token,
        sales_rep_id: salesRepId,
      });
      return client;
    };

    try {
      try {
        const client = await buildClient(preferredEmail);
        clientId = client.id;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        // Real business email already in use → fall back to synthetic so we
        // still get a dedicated client record per submission.
        if (msg.toLowerCase().includes("duplicate") && preferredEmail !== syntheticEmail) {
          console.warn(`[submit:sales] Business email ${preferredEmail} collided; using synthetic.`);
          const client = await buildClient(syntheticEmail);
          clientId = client.id;
        } else {
          throw err;
        }
      }
      // Welcome email intentionally skipped for sales submissions — the rep
      // manages the client and the synthetic email isn't deliverable anyway.
    } catch (clientErr) {
      console.error("[submit:sales] Client creation failed:", clientErr);
    }
  } else if (
    (formData.contact_email as string) ||
    (formData.email as string) ||
    (session.email as string)
  ) {
    // ── Existing non-sales path: dedup by contact_email ──
    const autoCreateEmail =
      (formData.contact_email as string) ||
      (formData.email as string) ||
      (session.email as string);
    try {
      const existingClient = await getClientByEmail(autoCreateEmail);
      if (!existingClient) {
        const contactName = (formData.contact_person as string) || (formData.contact_name as string) || "";
        const nameParts = contactName.split(" ");
        const { client, pin } = await createClient({
          first_name: nameParts[0] || "Client",
          last_name: nameParts.slice(1).join(" ") || "",
          company_name: (formData.business_name as string) || "Unknown",
          email: autoCreateEmail,
          phone: (formData.contact_phone as string) || (formData.phone as string),
          website_url: formData.current_website as string,
          form_session_token: token,
          sales_rep_id: salesRepId,
        });
        if (contactAllowed) {
          await sendWelcomeEmail(client, pin);
        }
        clientId = client.id;
      } else {
        const patch: Record<string, unknown> = {};
        if (!existingClient.form_session_token) patch.form_session_token = token;
        if (!existingClient.sales_rep_id && salesRepId) patch.sales_rep_id = salesRepId;
        if (Object.keys(patch).length > 0) {
          await updateClient(existingClient.id, patch);
        }
        clientId = existingClient.id;
      }
    } catch (clientErr) {
      console.error("[submit] Client auto-creation failed:", clientErr);
    }
  }

  // Create a task to track this website build (runs for both paths if we got a client)
  if (clientId) {
    try {
      const buildTask = await createTask({
        client_id: clientId,
        title: `Website Build — ${businessName}`,
        description: `Automated website build queued from form submission.\nForm type: ${formType}`,
        status: "backlog",
        priority: "high",
        tags: ["website-build", formType],
      });
      buildTaskId = buildTask.id;
    } catch (taskErr) {
      console.error("[submit] Build task creation failed:", taskErr);
    }
  }

  const resend = getResend();

  // Email to client/sales-rep with DNS instructions (gated by contact audience toggle)
  const clientEmail =
    (formData.contact_email as string) ||
    (formData.email as string) ||
    (session.email as string);
  if (clientEmail && contactAllowed) {
    const dnsHtml = getDnsInstructions(dnsProvider, ipAddress, businessName);
    await resend.emails.send({
      from: "Website Reveals <creativemarketing@websitereveals.com>",
      to: clientEmail,
      subject: `Next Step: Point Your Domain \u2014 ${escapeHtml(businessName)}`,
      html: dnsHtml,
    });
  }

  // Email to agency with full submission summary (admin audience)
  if (process.env.AGENCY_EMAIL && adminAllowed) {
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://obsession-marketing-onboarding.vercel.app";
    const exportUrl = `${siteUrl}/api/export/${token}`;
    await resend.emails.send({
      from: "Website Reveals <creativemarketing@websitereveals.com>",
      to: process.env.AGENCY_EMAIL,
      subject: `New Questionnaire Submission \u2014 ${escapeHtml(businessName)}`,
      html: buildAgencySummary(session as Record<string, unknown>, exportUrl),
    });
  }

  // Notify creative@ of every form submission (admin audience)
  if (adminAllowed) {
    await resend.emails.send({
      from: "Website Reveals <creativemarketing@websitereveals.com>",
      to: "creative@obsessionmarketing.com",
      subject: `Form Submitted — ${escapeHtml(businessName)}`,
      html: `<p>A new questionnaire has been submitted for <strong>${escapeHtml(businessName)}</strong>.</p>
             <p>Form type: ${escapeHtml(formType)}<br>Contact email: ${escapeHtml((formData.contact_email as string) || "Not provided")}<br>Contact phone: ${escapeHtml((formData.contact_phone as string) || "Not provided")}<br>Business email: ${escapeHtml((formData.email as string) || "Not provided")}<br>Business phone: ${escapeHtml((formData.phone as string) || "Not provided")}</p>`,
    });
  }

  // ── Queue automated website build ──────────────────────────
  const useSiteLaunchr = shouldRouteToSiteLaunchr(submissionSource);

  try {
    console.log("[build] Starting build queue for token:", token);
    console.log("[build] Resolved form type:", formType, "source:", submissionSource, "→ pipeline:", useSiteLaunchr ? "sitelaunchr" : "claude-code");

    if (useSiteLaunchr) {
      // ── SiteLaunchr path ──
      let slPayload;
      try {
        slPayload = buildSiteLaunchrPayload({
          token,
          formType,
          formData,
          callbackUrl: process.env.SITELAUNCHR_CALLBACK_URL,
        });
      } catch (mapErr) {
        console.error("[build:sl] Payload build failed:", mapErr);
        throw mapErr;
      }

      const dispatch = await dispatchBuild(slPayload);
      console.log("[build:sl] Dispatched:", dispatch.build_id, "status:", dispatch.status, "duplicate:", !!dispatch.duplicate);

      const { error: buildInsertErr } = await supabase
        .from("build_jobs")
        .insert({
          token,
          form_type: formType,
          pipeline: "sitelaunchr",
          status: "queued",
          external_id: token,
          sl_build_id: dispatch.build_id,
          sl_phase: dispatch.status,
          sl_phase_at: new Date().toISOString(),
          task_id: buildTaskId,
        });

      if (buildInsertErr) {
        console.error("[build:sl] DB insert failed:", buildInsertErr.message);
      }
    } else {
      // ── Existing Claude-Code-on-VPS path (Trigger.dev) ──
      const fileUrls = (session.file_urls as string[]) || [];
      const prompt = buildPrompt(formType, formData, fileUrls);
      console.log("[build] Prompt length:", prompt.length);

      const { data: buildJob, error: buildInsertErr } = await supabase
        .from("build_jobs")
        .insert({ token, form_type: formType, pipeline: "claude-code" })
        .select("id")
        .single();

      console.log("[build] Insert result:", buildJob?.id, "error:", buildInsertErr?.message);

      if (buildJob) {
        const triggerResult = await tasks.trigger("build-website", {
          buildJobId: buildJob.id,
          token,
          formType,
          prompt,
          taskId: buildTaskId,
        });
        console.log("[build] Trigger result:", JSON.stringify(triggerResult));
      }
    }
  } catch (buildErr) {
    // Log but don't fail the submission — emails already sent
    if (buildErr instanceof SiteLaunchrError) {
      console.error("[build:sl] Dispatch failed:", buildErr.status, buildErr.code, buildErr.message);
    } else {
      console.error("[build] Failed to queue build job:", buildErr);
    }
  }

  // Notify admin via Telegram (admin audience)
  if (adminAllowed) {
    try {
      const contactEmail = (formData.contact_email as string) || (formData.email as string) || "";
      const telegramMsg = `*New Form Submission*\nBusiness: ${businessName}\nForm type: ${formType}\nEmail: ${contactEmail}\nDNS: ${dnsProvider}`;
      await sendTelegramMessage(telegramMsg);
    } catch (tgErr) {
      console.error("[submit] Telegram notification failed:", tgErr);
    }
  }

  return NextResponse.json({ ok: true });
}

function buildAgencySummary(session: Record<string, unknown>, exportUrl: string): string {
  const formData = (session.form_data as Record<string, unknown>) || {};

  const rows = FORM_STEPS.flatMap((step) =>
    [
      `<tr><td colspan="2" style="padding:12px 8px 4px;font-weight:700;color:#111110;border-top:2px solid #e8e6df;font-size:13px;letter-spacing:0.05em;text-transform:uppercase">${escapeHtml(step.title)}</td></tr>`,
      ...step.questions
        .filter((q) => formData[q.id] !== undefined && formData[q.id] !== null && formData[q.id] !== "")
        .map((q) => {
          const val = formData[q.id];
          const display = Array.isArray(val) ? (val as string[]).join(", ") : String(val);
          return `<tr><td style="padding:8px;color:#888886;font-size:13px;vertical-align:top;width:40%;border-bottom:1px solid #e8e6df">${escapeHtml(q.label)}</td><td style="padding:8px;color:#111110;font-size:13px;border-bottom:1px solid #e8e6df">${escapeHtml(display)}</td></tr>`;
        }),
    ]
  ).join("");

  return `
    <div style="font-family:sans-serif;max-width:800px;margin:0 auto;background:#ffffff;color:#111110;padding:40px;">
      <h1 style="font-size:22px;font-weight:700;margin-bottom:6px;">New Questionnaire — ${escapeHtml((formData.business_name as string) || "Client")}</h1>
      <p style="color:#888886;margin-bottom:24px;font-size:14px;">Submitted ${new Date().toLocaleString("en-US", { dateStyle: "long", timeStyle: "short" })}</p>

      <div style="background:#fff5f2;border:1.5px solid #ff3d00;border-radius:4px;padding:16px 20px;margin-bottom:32px;">
        <p style="font-size:12px;color:#888886;margin-bottom:6px;letter-spacing:0.08em;text-transform:uppercase;font-weight:600;">Export for Claude Code</p>
        <a href="${exportUrl}" style="color:#ff3d00;font-weight:600;font-size:14px;word-break:break-all;">${exportUrl}</a>
        <p style="font-size:12px;color:#888886;margin-top:6px;">Click to download a formatted .txt file ready to paste into Claude Code.</p>
      </div>

      <table style="width:100%;border-collapse:collapse;margin-bottom:24px;font-size:13px;">
        <tr><td style="padding:8px;color:#888886;border-bottom:1px solid #e8e6df">Client Email</td><td style="padding:8px;border-bottom:1px solid #e8e6df">${escapeHtml((session.email as string) || "Not provided")}</td></tr>
        <tr><td style="padding:8px;color:#888886;border-bottom:1px solid #e8e6df">DNS Provider</td><td style="padding:8px;border-bottom:1px solid #e8e6df">${escapeHtml((session.dns_provider as string) || "Not selected")}</td></tr>
      </table>

      <table style="width:100%;border-collapse:collapse;">${rows}</table>
    </div>
  `;
}
