import { NextRequest, NextResponse } from "next/server";
import { tasks } from "@trigger.dev/sdk/v3";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const { from, to, subject, text, html } = body;

    // Only process emails sent to tasks@websitereveals.com
    if (!to || !String(to).toLowerCase().includes("tasks@websitereveals.com")) {
      return NextResponse.json({ ok: true });
    }

    // Prefer plain text, fall back to stripping HTML tags
    const content = text || (html ? html.replace(/<[^>]*>/g, "") : "");

    if (!content.trim()) {
      return NextResponse.json({ ok: true });
    }

    await tasks.trigger("ai-process-inbound", {
      content,
      sender: from,
      source: "email",
      subject,
      metadata: {
        from,
        to,
        subject,
        has_attachments: !!(body.attachments && body.attachments.length > 0),
      },
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[email-inbound] Error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
