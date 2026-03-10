import { createHmac, timingSafeEqual } from "crypto";

export function verifySlackSignature(
  signingSecret: string,
  timestamp: string,
  body: string,
  signature: string
): boolean {
  // Reject requests older than 5 minutes
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - parseInt(timestamp, 10)) > 300) {
    return false;
  }

  const sigBasestring = `v0:${timestamp}:${body}`;
  const hmac = createHmac("sha256", signingSecret)
    .update(sigBasestring)
    .digest("hex");
  const computed = `v0=${hmac}`;

  if (computed.length !== signature.length) return false;

  return timingSafeEqual(Buffer.from(computed), Buffer.from(signature));
}

export async function postSlackMessage(
  channel: string,
  text: string
): Promise<void> {
  const token = process.env.SLACK_BOT_TOKEN;
  if (!token) throw new Error("SLACK_BOT_TOKEN is not set");

  const response = await fetch("https://slack.com/api/chat.postMessage", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ channel, text }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Slack API error: ${error}`);
  }

  const data = (await response.json()) as { ok: boolean; error?: string };
  if (!data.ok) {
    throw new Error(`Slack API error: ${data.error}`);
  }
}
