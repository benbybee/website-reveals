import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import { createServerClient } from "@/lib/supabase/server";

export const maxDuration = 60;

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

    // Handle event callbacks — respond immediately, process in background
    if (body.type === "event_callback") {
      const event = body.event;
      const eventId = body.event_id;

      // Only handle message events (not app_mention) to avoid duplicates
      const isRelevantMessage =
        event?.type === "message" &&
        !event.bot_id &&
        event.subtype !== "bot_message" &&
        event.text &&
        process.env.SLACK_ADMIN_USER_ID &&
        event.text.includes(`<@${process.env.SLACK_ADMIN_USER_ID}>`);

      if (isRelevantMessage) {
        // Process in background so Slack gets an immediate 200 (no retries)
        after(async () => {
          try {
            const { text, user, channel } = event;
            const supabase = createServerClient();

            // Deduplicate on message timestamp + channel
            const messageTs = event.ts;
            if (messageTs) {
              const { data: existing } = await supabase
                .from("inbound_proposals")
                .select("id")
                .eq("source", "slack")
                .filter("source_metadata->>message_ts", "eq", messageTs)
                .filter("source_metadata->>channel", "eq", channel)
                .limit(1);

              if (existing && existing.length > 0) {
                return;
              }
            }

            // Resolve user and channel names from Slack API
            const { getSlackUserName, getSlackChannelName } = await import("@/lib/slack");
            const [userName, channelName] = await Promise.all([
              getSlackUserName(user),
              getSlackChannelName(channel),
            ]);

            const [clientsRes, tasksRes] = await Promise.all([
              supabase.from("clients").select("*").order("created_at", { ascending: false }),
              supabase.from("tasks").select("*").in("status", ["backlog", "in_progress", "blocked"]).order("created_at", { ascending: false }),
            ]);

            const clients = (clientsRes.data || []) as Record<string, unknown>[];
            const activeTasks = (tasksRes.data || []) as Record<string, unknown>[];

            const clientList = clients
              .map((c) => `ID: ${c.id}, Name: ${c.first_name} ${c.last_name}, Company: ${c.company_name}, Email: ${c.email}`)
              .join("\n");
            const activeTaskList = activeTasks
              .map((t) => `ID: ${t.id}, Client: ${t.client_id}, Title: ${t.title}, Status: ${t.status}`)
              .join("\n");

            const { default: Anthropic } = await import("@anthropic-ai/sdk");
            const anthropic = new Anthropic();
            const response = await anthropic.messages.create({
              model: "claude-sonnet-4-20250514",
              max_tokens: 1000,
              system: `You are an agency intake assistant. Analyze inbound messages from Slack or email, match them to existing clients, and propose tasks. Respond with JSON only, no markdown fences.

Existing clients:
${clientList || "No clients yet."}

Active tasks:
${activeTaskList || "No active tasks."}`,
              messages: [
                {
                  role: "user",
                  content: `Analyze this inbound slack message and extract a task proposal:

"${text}" (from ${userName} in ${channelName})

Respond with JSON:
{
  "client_match": { "id": "<client_id>", "name": "<client name>" } | null,
  "proposed_task": { "title": "<task title>", "description": "<task description>", "priority": "low"|"medium"|"high"|"urgent", "tags": ["<tag>", ...] },
  "proposed_response": "<suggested reply to the client>"
}`,
                },
              ],
            });

            const responseText = response.content[0].type === "text" ? response.content[0].text : "";
            const result = JSON.parse(responseText);

            // Store the proposal
            const { data: proposal, error: proposalError } = await supabase
              .from("inbound_proposals")
              .insert({
                source: "slack",
                source_metadata: { channel, user, thread_ts: event.thread_ts || event.ts, team: body.team_id, event_id: eventId, message_ts: event.ts },
                client_id: result.client_match?.id || null,
                proposed_task: result.proposed_task,
                proposed_response: result.proposed_response,
                status: "pending",
              })
              .select()
              .single();

            if (proposalError) {
              console.error("[slack-events] Failed to store proposal:", proposalError);
              return;
            }

            // Send proposal to Telegram for approval
            const token = process.env.TELEGRAM_BOT_TOKEN;
            const chatId = process.env.TELEGRAM_ADMIN_CHAT_ID;
            if (token && chatId && proposal) {
              const clientName = result.client_match ? result.client_match.name : "No matching client";
              const priorityEmoji = { low: "🟢", medium: "🟡", high: "🟠", urgent: "🔴" }[result.proposed_task.priority as string] || "⚪";

              // Strip Slack mention markup from original message for readability
              const cleanText = text.replace(/<@[A-Z0-9]+>/g, "").trim();

              const telegramMessage = [
                `📥 New Proposal from Slack`,
                ``,
                `👤 From: ${userName} in ${channelName}`,
                `🏢 Client: ${clientName}`,
                ``,
                `💬 Original message:`,
                `"${cleanText}"`,
                ``,
                `📋 Task:`,
                `• Title: ${result.proposed_task.title}`,
                `• Priority: ${priorityEmoji} ${result.proposed_task.priority}`,
                `• Tags: ${result.proposed_task.tags.join(", ")}`,
                ``,
                `${result.proposed_task.description}`,
                ``,
                `✉️ Suggested Response:`,
                `${result.proposed_response}`,
                ``,
                `──────────────`,
                "💬 Reply in Slack: `reply proposal " + proposal.id + "`",
                "✅ Approve task: `approve proposal " + proposal.id + "`",
                "❌ Reject: `reject proposal " + proposal.id + "`",
              ].join("\n");

              // Try with Markdown (for click-to-copy backtick commands), fall back to plain
              let sendRes = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ chat_id: chatId, text: telegramMessage, parse_mode: "Markdown" }),
              });
              if (!sendRes.ok) {
                console.error("[slack-events] Telegram Markdown send failed, retrying plain:", await sendRes.text());
                sendRes = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ chat_id: chatId, text: telegramMessage }),
                });
                if (!sendRes.ok) {
                  console.error("[slack-events] Telegram plain send also failed:", await sendRes.text());
                }
              }
            }
          } catch (err) {
            console.error("[slack-events] Background processing error:", err);
          }
        });
      }
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[slack-events] Error:", err);
    return NextResponse.json({ ok: true });
  }
}
