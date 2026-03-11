import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";
import { createServerClient } from "@/lib/supabase/server";
import Anthropic from "@anthropic-ai/sdk";

export const maxDuration = 60;

const resend = new Resend(process.env.RESEND_API_KEY);

export async function POST(req: NextRequest) {
  try {
    const event = await req.json();

    console.log("[email-inbound] Received event type:", event.type);

    // Only handle Resend inbound email events
    if (event.type !== "email.received") {
      return NextResponse.json({ ok: true });
    }

    const { email_id, from, to, subject, attachments } = event.data;
    console.log("[email-inbound] Email from:", from, "to:", to, "subject:", subject);

    // Only process emails sent to tasks@websitereveals.com
    const toAddresses = Array.isArray(to) ? to : [to];
    const isTaskEmail = toAddresses.some((addr: string) =>
      addr.toLowerCase().includes("tasks@websitereveals.com")
    );
    if (!isTaskEmail) {
      console.log("[email-inbound] Not a task email, skipping");
      return NextResponse.json({ ok: true });
    }

    // Fetch full email content from Resend (not included in webhook payload)
    console.log("[email-inbound] Fetching email content for:", email_id);
    const { data: email } = await resend.emails.receiving.get(email_id);

    // Prefer plain text, fall back to stripping HTML tags
    const content =
      email?.text ||
      (email?.html ? email.html.replace(/<[^>]*>/g, "") : "");

    if (!content.trim()) {
      console.log("[email-inbound] Empty email content, skipping");
      return NextResponse.json({ ok: true });
    }

    console.log("[email-inbound] Processing email, content length:", content.length);

    const message = subject ? `Subject: ${subject}\n\n${content}` : content;
    // sourceMetadata will be updated with original_sender after AI analysis
    let sourceMetadata: Record<string, unknown> = {
      from,
      to: toAddresses,
      subject,
      has_attachments: !!(attachments && attachments.length > 0),
    };

    // Process inline (same pattern as Slack route)
    const supabase = createServerClient();

    const [clientsRes, tasksRes] = await Promise.all([
      supabase.from("clients").select("*").order("created_at", { ascending: false }),
      supabase
        .from("tasks")
        .select("*")
        .in("status", ["backlog", "in_progress", "blocked"])
        .order("created_at", { ascending: false }),
    ]);

    const clients = (clientsRes.data || []) as Record<string, unknown>[];
    const activeTasks = (tasksRes.data || []) as Record<string, unknown>[];

    const clientList = clients
      .map(
        (c) =>
          `ID: ${c.id}, Name: ${c.first_name} ${c.last_name}, Company: ${c.company_name}, Email: ${c.email}`
      )
      .join("\n");
    const activeTaskList = activeTasks
      .map(
        (t) =>
          `ID: ${t.id}, Client: ${t.client_id}, Title: ${t.title}, Status: ${t.status}`
      )
      .join("\n");

    const anthropic = new Anthropic();
    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1000,
      system: `You are an agency intake assistant for Website Reveals, a web design agency. Analyze inbound emails and determine if a client is requesting work to be done (a task). Respond with JSON only, no markdown fences.

IMPORTANT CONTEXT: These emails are FORWARDED by the agency owner (Ben) from his personal email. The "From" address is Ben's email, NOT the client's. Look inside the email body for forwarded message headers like "From:", "---------- Forwarded message ----------", or similar patterns to identify the ACTUAL client who sent the original message. Match that person's name/email against the client list.

Only propose a task if the message contains a CLIENT requesting work — e.g. "can you update the homepage", "I need a new landing page", "please fix the contact form". Do NOT propose tasks for:
- Internal chatter, greetings, or test messages
- Someone asking a question (not requesting work)
- Follow-ups, status checks, or general conversation

If the message is NOT a client task request, set "proposed_task" to null.

Always suggest a response to send back to the client regardless.

Existing clients:
${clientList || "No clients yet."}

Active tasks:
${activeTaskList || "No active tasks."}`,
      messages: [
        {
          role: "user",
          content: `Analyze this inbound email (likely forwarded by agency owner):

Forwarded by: ${from}
${message}

Respond with JSON:
{
  "client_match": { "id": "<client_id>", "name": "<client name>" } | null,
  "original_sender": "<name and/or email of the actual client from the forwarded content, or null if not found>",
  "proposed_task": { "title": "<task title>", "description": "<task description>", "priority": "low"|"medium"|"high"|"urgent", "tags": ["<tag>", ...] } | null,
  "proposed_response": "<suggested reply to send to the client>"
}`,
        },
      ],
    });

    const responseText =
      response.content[0].type === "text" ? response.content[0].text : "";
    const result = JSON.parse(responseText);
    const hasTask = result.proposed_task !== null;

    console.log("[email-inbound] AI result - hasTask:", hasTask, "client:", result.client_match?.name, "originalSender:", result.original_sender);

    // Add original sender to metadata for reply handling
    sourceMetadata.original_sender = result.original_sender || null;

    // Store proposal (only if there's a task)
    let proposal: { id: string } | null = null;
    if (hasTask) {
      const { data, error: proposalError } = await supabase
        .from("inbound_proposals")
        .insert({
          source: "email",
          source_metadata: sourceMetadata,
          client_id: result.client_match?.id || null,
          proposed_task: result.proposed_task,
          proposed_response: result.proposed_response,
          status: "pending",
        })
        .select()
        .single();

      if (proposalError) {
        console.error("[email-inbound] Failed to store proposal:", proposalError);
      } else {
        proposal = data;
      }
    }

    // Send notification to Telegram
    const token = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = process.env.TELEGRAM_ADMIN_CHAT_ID;
    if (token && chatId) {
      const clientName = result.client_match
        ? result.client_match.name
        : "No matching client";

      const originalSender = result.original_sender || from;

      const lines: string[] = [
        `📧 Email from ${originalSender}`,
        `🏢 Client: ${clientName}`,
        ``,
        `📋 Subject: ${subject || "(no subject)"}`,
      ];

      if (hasTask && proposal) {
        const priorityEmoji =
          ({ low: "🟢", medium: "🟡", high: "🟠", urgent: "🔴" }[
            result.proposed_task.priority as string
          ] || "⚪");
        lines.push(
          ``,
          `📋 Proposed Task:`,
          `• Title: ${result.proposed_task.title}`,
          `• Priority: ${priorityEmoji} ${result.proposed_task.priority}`,
          `• Tags: ${result.proposed_task.tags.join(", ")}`,
          ``,
          `${result.proposed_task.description}`
        );
      }

      lines.push(``, `✉️ Suggested Response:`, `${result.proposed_response}`);

      if (hasTask && proposal) {
        lines.push(
          ``,
          `──────────────`,
          "💬 Reply to client: `reply proposal " + proposal.id + "`",
          "✅ Approve task: `approve proposal " + proposal.id + "`",
          "❌ Reject: `reject proposal " + proposal.id + "`"
        );
      } else {
        lines.push(``, `ℹ️ No client task detected.`);
      }

      const telegramMessage = lines.join("\n");

      let sendRes = await fetch(
        `https://api.telegram.org/bot${token}/sendMessage`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chat_id: chatId,
            text: telegramMessage,
            parse_mode: "Markdown",
          }),
        }
      );
      if (!sendRes.ok) {
        console.error("[email-inbound] Telegram Markdown failed, retrying plain:", await sendRes.text());
        sendRes = await fetch(
          `https://api.telegram.org/bot${token}/sendMessage`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ chat_id: chatId, text: telegramMessage }),
          }
        );
      }

      console.log("[email-inbound] Telegram notification sent");
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[email-inbound] Error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
