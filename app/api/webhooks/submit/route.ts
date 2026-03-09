import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { Resend } from "resend";
import { getDnsInstructions } from "@/lib/dns-instructions";
import { tasks } from "@trigger.dev/sdk/v3";
import { buildPrompt } from "@/lib/prompts";
import { validateApiKey, validateOrigin, checkRateLimit } from "@/lib/webhook-auth";
import type { FormType } from "@/lib/resolve-form-type";

const ALLOWED_FORM_TYPES: FormType[] = ["quick", "standard", "in-depth"];

function getResend() {
  return new Resend(process.env.RESEND_API_KEY);
}

export async function POST(req: NextRequest) {
  // Auth
  const apiKey = req.headers.get("x-api-key");
  if (!validateApiKey(apiKey)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const origin = req.headers.get("origin");
  if (!validateOrigin(origin)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (!checkRateLimit(ip)) {
    return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 });
  }

  // Parse & validate
  let body: { form_type?: string; form_data?: Record<string, unknown> };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { form_type, form_data } = body;

  if (!form_type || !ALLOWED_FORM_TYPES.includes(form_type as FormType)) {
    return NextResponse.json(
      { error: `form_type must be one of: ${ALLOWED_FORM_TYPES.join(", ")}` },
      { status: 400 }
    );
  }

  if (!form_data || typeof form_data !== "object") {
    return NextResponse.json({ error: "form_data is required" }, { status: 400 });
  }

  const missing: string[] = [];
  if (!form_data.business_name) missing.push("business_name");
  if (!form_data.contact_email) missing.push("contact_email");
  if (missing.length > 0) {
    return NextResponse.json(
      { error: "Missing required fields", fields: missing },
      { status: 400 }
    );
  }

  const formType = form_type as FormType;
  const taggedFormData = {
    ...form_data,
    _source: "external",
    _mode: formType,
  };

  const supabase = createServerClient();

  // Create form session
  const { data: session, error: insertErr } = await supabase
    .from("form_sessions")
    .insert({
      form_data: taggedFormData,
      email: form_data.contact_email as string,
      dns_provider: (form_data.dns_provider as string) || null,
      current_step: 999,
      submitted_at: new Date().toISOString(),
    })
    .select("token")
    .single();

  if (insertErr || !session) {
    console.error("[webhook] Failed to create session:", insertErr?.message);
    return NextResponse.json({ error: "Failed to create submission" }, { status: 500 });
  }

  const token = session.token;
  const businessName = (form_data.business_name as string) || "Your Business";
  const resend = getResend();

  // DNS instructions to client
  const clientEmail = form_data.contact_email as string;
  const dnsProvider = (form_data.dns_provider as string) || "other";
  const ipAddress = process.env.AGENCY_IP_ADDRESS || "TBD";

  try {
    const dnsHtml = getDnsInstructions(dnsProvider, ipAddress, businessName);
    await resend.emails.send({
      from: "Website Reveals <creativemarketing@websitereveals.com>",
      to: clientEmail,
      subject: `Next Step: Point Your Domain — ${businessName}`,
      html: dnsHtml,
    });
  } catch (emailErr) {
    console.error("[webhook] DNS email failed:", emailErr);
  }

  // Agency notification
  if (process.env.AGENCY_EMAIL) {
    try {
      const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_BASE_URL || "https://obsession-marketing-onboarding.vercel.app";
      await resend.emails.send({
        from: "Website Reveals <creativemarketing@websitereveals.com>",
        to: process.env.AGENCY_EMAIL,
        subject: `New External Submission — ${businessName}`,
        html: `<p>A new website build has been submitted via the external webhook.</p>
               <p><strong>${businessName}</strong><br>Form type: ${formType}<br>Contact: ${clientEmail}</p>
               <p><a href="${siteUrl}/api/export/${token}">Download export</a></p>`,
      });
    } catch (emailErr) {
      console.error("[webhook] Agency email failed:", emailErr);
    }
  }

  // Creative team notification
  try {
    await resend.emails.send({
      from: "Website Reveals <creativemarketing@websitereveals.com>",
      to: "creative@obsessionmarketing.com",
      subject: `Form Submitted — ${businessName}`,
      html: `<p>A new questionnaire has been submitted for <strong>${businessName}</strong>.</p>
             <p>Form type: ${formType}<br>Source: external webhook<br>Contact email: ${clientEmail}<br>Contact phone: ${(form_data.contact_phone as string) || "Not provided"}<br>Business email: ${(form_data.email as string) || "Not provided"}<br>Business phone: ${(form_data.phone as string) || "Not provided"}</p>`,
    });
  } catch (emailErr) {
    console.error("[webhook] Creative email failed:", emailErr);
  }

  // Queue build
  try {
    console.log("[webhook] Starting build queue for token:", token);
    const prompt = buildPrompt(formType, taggedFormData, []);

    const { data: buildJob, error: buildInsertErr } = await supabase
      .from("build_jobs")
      .insert({ token, form_type: formType })
      .select("id")
      .single();

    if (buildJob) {
      const triggerResult = await tasks.trigger("build-website", {
        buildJobId: buildJob.id,
        token,
        formType,
        prompt,
      });
      console.log("[webhook] Trigger result:", JSON.stringify(triggerResult));
    } else {
      console.error("[webhook] Build job insert failed:", buildInsertErr?.message);
    }
  } catch (buildErr) {
    console.error("[webhook] Failed to queue build job:", buildErr);
  }

  return NextResponse.json({ ok: true, token });
}
