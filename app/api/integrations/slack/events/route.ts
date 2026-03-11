import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const rawBody = await req.text();
    const body = JSON.parse(rawBody);

    // Slack URL verification challenge — must respond immediately
    if (body.type === "url_verification" && body.challenge) {
      return NextResponse.json({ challenge: body.challenge });
    }

    // Verify Slack signature if signing secret is configured
    if (process.env.SLACK_SIGNING_SECRET) {
      const { verifySlackSignature } = await import("@/lib/slack");
      const timestamp = req.headers.get("x-slack-request-timestamp") || "";
      const signature = req.headers.get("x-slack-signature") || "";
      if (!verifySlackSignature(process.env.SLACK_SIGNING_SECRET, timestamp, rawBody, signature)) {
        return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
      }
    }

    // Handle event callbacks
    if (body.type === "event_callback") {
      const event = body.event;

      if (event?.type === "app_mention") {
        const { text, user, channel } = event;
        const { tasks } = await import("@trigger.dev/sdk/v3");

        await tasks.trigger("ai-process-inbound", {
          content: text,
          sender: `Slack user <@${user}>`,
          source: "slack",
          metadata: {
            channel,
            user,
            thread_ts: event.thread_ts || event.ts,
            team: body.team_id,
          },
        });
      }
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[slack-events] Error:", err);
    return NextResponse.json({ ok: true });
  }
}
