import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { Resend } from "resend";

function getResend() {
  return new Resend(process.env.RESEND_API_KEY);
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  const { email } = await req.json();

  if (!email || !email.includes("@")) {
    return NextResponse.json({ error: "Invalid email" }, { status: 400 });
  }

  const supabase = createServerClient();

  const { error } = await supabase
    .from("form_sessions")
    .update({ email })
    .eq("token", token);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const resumeUrl = `${process.env.NEXT_PUBLIC_BASE_URL}/q/${token}`;
  const resend = getResend();

  await resend.emails.send({
    from: "Website Reveals <creativemarketing@websitereveals.com>",
    to: email,
    subject: "Continue Your Website Questionnaire",
    html: `
      <div style="font-family:sans-serif;max-width:600px;margin:0 auto;background:#0a0a0f;color:#f8fafc;padding:40px;border-radius:12px;">
        <h1 style="color:#3b82f6;font-size:24px;margin-bottom:16px;">Your progress is saved!</h1>
        <p style="color:#94a3b8;margin-bottom:24px;">Click the button below to pick up right where you left off. This link is valid for 30 days.</p>
        <a href="${resumeUrl}" style="display:inline-block;background:linear-gradient(135deg,#3b82f6,#06b6d4);color:white;padding:14px 28px;border-radius:8px;text-decoration:none;font-weight:600;">
          Continue My Questionnaire &rarr;
        </a>
        <p style="color:#64748b;margin-top:32px;font-size:12px;">
          Or copy this link: ${resumeUrl}<br/>
          Link expires in 30 days.
        </p>
      </div>
    `,
  });

  return NextResponse.json({ ok: true });
}
