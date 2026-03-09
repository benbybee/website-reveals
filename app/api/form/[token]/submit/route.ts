import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { Resend } from "resend";
import { getDnsInstructions } from "@/lib/dns-instructions";
import { tasks } from "@trigger.dev/sdk/v3";
import { resolveFormType } from "@/lib/resolve-form-type";
import { buildPrompt } from "@/lib/prompts";

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

  // Mark as submitted
  await supabase
    .from("form_sessions")
    .update({ submitted_at: new Date().toISOString() })
    .eq("token", token);

  const formData = (session.form_data as Record<string, unknown>) || {};
  const businessName = (formData.business_name as string) || "Your Business";
  const ipAddress = process.env.AGENCY_IP_ADDRESS || "TBD";
  const dnsProvider = (session.dns_provider as string) || "other";
  const formType = resolveFormType(formData);

  const resend = getResend();

  // Email to client with DNS instructions
  if (session.email) {
    const dnsHtml = getDnsInstructions(dnsProvider, ipAddress, businessName);
    await resend.emails.send({
      from: "Website Reveals <creativemarketing@websitereveals.com>",
      to: session.email as string,
      subject: `Next Step: Point Your Domain \u2014 ${businessName}`,
      html: dnsHtml,
    });
  }

  // Email to agency with full submission summary
  if (process.env.AGENCY_EMAIL) {
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://obsession-marketing-onboarding.vercel.app";
    const exportUrl = `${siteUrl}/api/export/${token}`;
    await resend.emails.send({
      from: "Website Reveals <creativemarketing@websitereveals.com>",
      to: process.env.AGENCY_EMAIL,
      subject: `New Questionnaire Submission \u2014 ${businessName}`,
      html: buildAgencySummary(session as Record<string, unknown>, exportUrl),
    });
  }

  // Notify creative@ of every form submission
  await resend.emails.send({
    from: "Website Reveals <creativemarketing@websitereveals.com>",
    to: "creative@obsessionmarketing.com",
    subject: `Form Submitted — ${businessName}`,
    html: `<p>A new questionnaire has been submitted for <strong>${businessName}</strong>.</p>
           <p>Form type: ${formType}<br>Client email: ${session.email || "Not provided"}</p>`,
  });

  // ── Queue automated website build ──────────────────────────
  try {
    console.log("[build] Starting build queue for token:", token);
    console.log("[build] Resolved form type:", formType);
    const prompt = buildPrompt(formType, formData);
    console.log("[build] Prompt length:", prompt.length);

    // Create build job
    const { data: buildJob, error: buildInsertErr } = await supabase
      .from("build_jobs")
      .insert({ token, form_type: formType })
      .select("id")
      .single();

    console.log("[build] Insert result:", buildJob?.id, "error:", buildInsertErr?.message);

    if (buildJob) {
      // Fire Trigger.dev task (non-blocking)
      const triggerResult = await tasks.trigger("build-website", {
        buildJobId: buildJob.id,
        token,
        formType,
        prompt,
      });
      console.log("[build] Trigger result:", JSON.stringify(triggerResult));
    }
  } catch (buildErr) {
    // Log but don't fail the submission — emails already sent
    console.error("[build] Failed to queue build job:", buildErr);
  }

  return NextResponse.json({ ok: true });
}

function buildAgencySummary(session: Record<string, unknown>, exportUrl: string): string {
  const formData = (session.form_data as Record<string, unknown>) || {};

  // Build rows using readable labels from form steps
  const { FORM_STEPS: steps } = require("@/lib/form-steps");
  const rows = steps.flatMap((step: { title: string; questions: { id: string; label: string }[] }) =>
    [
      `<tr><td colspan="2" style="padding:12px 8px 4px;font-weight:700;color:#111110;border-top:2px solid #e8e6df;font-size:13px;letter-spacing:0.05em;text-transform:uppercase">${step.title}</td></tr>`,
      ...step.questions
        .filter((q) => formData[q.id] !== undefined && formData[q.id] !== null && formData[q.id] !== "")
        .map((q) => {
          const val = formData[q.id];
          const display = Array.isArray(val) ? (val as string[]).join(", ") : String(val);
          return `<tr><td style="padding:8px;color:#888886;font-size:13px;vertical-align:top;width:40%;border-bottom:1px solid #e8e6df">${q.label}</td><td style="padding:8px;color:#111110;font-size:13px;border-bottom:1px solid #e8e6df">${display}</td></tr>`;
        }),
    ]
  ).join("");

  return `
    <div style="font-family:sans-serif;max-width:800px;margin:0 auto;background:#ffffff;color:#111110;padding:40px;">
      <h1 style="font-size:22px;font-weight:700;margin-bottom:6px;">New Questionnaire — ${(formData.business_name as string) || "Client"}</h1>
      <p style="color:#888886;margin-bottom:24px;font-size:14px;">Submitted ${new Date().toLocaleString("en-US", { dateStyle: "long", timeStyle: "short" })}</p>

      <div style="background:#fff5f2;border:1.5px solid #ff3d00;border-radius:4px;padding:16px 20px;margin-bottom:32px;">
        <p style="font-size:12px;color:#888886;margin-bottom:6px;letter-spacing:0.08em;text-transform:uppercase;font-weight:600;">Export for Claude Code</p>
        <a href="${exportUrl}" style="color:#ff3d00;font-weight:600;font-size:14px;word-break:break-all;">${exportUrl}</a>
        <p style="font-size:12px;color:#888886;margin-top:6px;">Click to download a formatted .txt file ready to paste into Claude Code.</p>
      </div>

      <table style="width:100%;border-collapse:collapse;margin-bottom:24px;font-size:13px;">
        <tr><td style="padding:8px;color:#888886;border-bottom:1px solid #e8e6df">Client Email</td><td style="padding:8px;border-bottom:1px solid #e8e6df">${session.email || "Not provided"}</td></tr>
        <tr><td style="padding:8px;color:#888886;border-bottom:1px solid #e8e6df">DNS Provider</td><td style="padding:8px;border-bottom:1px solid #e8e6df">${session.dns_provider || "Not selected"}</td></tr>
      </table>

      <table style="width:100%;border-collapse:collapse;">${rows}</table>
    </div>
  `;
}
