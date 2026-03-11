import { NextRequest, NextResponse } from "next/server";
import { tasks } from "@trigger.dev/sdk/v3";
import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

export async function POST(req: NextRequest) {
  try {
    const event = await req.json();

    // Only handle Resend inbound email events
    if (event.type !== "email.received") {
      return NextResponse.json({ ok: true });
    }

    const { email_id, from, to, subject, attachments } = event.data;

    // Only process emails sent to tasks@websitereveals.com
    const toAddresses = Array.isArray(to) ? to : [to];
    const isTaskEmail = toAddresses.some((addr: string) =>
      addr.toLowerCase().includes("tasks@websitereveals.com")
    );
    if (!isTaskEmail) {
      return NextResponse.json({ ok: true });
    }

    // Fetch full email content from Resend (not included in webhook payload)
    const { data: email } = await resend.emails.receiving.get(email_id);

    // Prefer plain text, fall back to stripping HTML tags
    const content =
      email?.text ||
      (email?.html ? email.html.replace(/<[^>]*>/g, "") : "");

    if (!content.trim()) {
      return NextResponse.json({ ok: true });
    }

    await tasks.trigger("ai-process-inbound", {
      message: subject ? `Subject: ${subject}\n\n${content}` : content,
      source: "email",
      sourceMetadata: {
        from,
        to: toAddresses,
        subject,
        has_attachments: !!(attachments && attachments.length > 0),
      },
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[email-inbound] Error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
