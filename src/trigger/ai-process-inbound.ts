import { task } from "@trigger.dev/sdk/v3";
import { createClient } from "@supabase/supabase-js";
import Anthropic from "@anthropic-ai/sdk";
import type { Client, Task } from "@/lib/types/client-tasks";

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export const aiProcessInbound = task({
  id: "ai-process-inbound",
  maxDuration: 120,
  run: async (payload: {
    message: string;
    source: "slack" | "email";
    sourceMetadata: Record<string, unknown>;
  }) => {
    const supabase = getSupabase();

    // Fetch context
    const [clientsRes, tasksRes] = await Promise.all([
      supabase
        .from("clients")
        .select("*")
        .order("created_at", { ascending: false }),
      supabase
        .from("tasks")
        .select("*")
        .in("status", ["backlog", "in_progress", "blocked"])
        .order("created_at", { ascending: false }),
    ]);

    const clients = (clientsRes.data || []) as Client[];
    const activeTasks = (tasksRes.data || []) as Task[];

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

    // Call Claude for analysis
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
          content: `Analyze this inbound ${payload.source} message and extract a task proposal:

"${payload.message}"

Respond with JSON:
{
  "client_match": { "id": "<client_id>", "name": "<client name>" } | null,
  "proposed_task": { "title": "<task title>", "description": "<task description>", "priority": "low"|"medium"|"high"|"urgent", "tags": ["<tag>", ...] },
  "proposed_response": "<suggested reply to the client>"
}`,
        },
      ],
    });

    const text =
      response.content[0].type === "text" ? response.content[0].text : "";
    const result = JSON.parse(text);

    // Store the proposal
    const { data: proposal, error: proposalError } = await supabase
      .from("inbound_proposals")
      .insert({
        source: payload.source,
        source_metadata: payload.sourceMetadata,
        client_id: result.client_match?.id || null,
        proposed_task: result.proposed_task,
        proposed_response: result.proposed_response,
        status: "pending",
      })
      .select()
      .single();

    if (proposalError) {
      throw new Error(
        `Failed to store proposal: ${proposalError.message}`
      );
    }

    // Send proposal to Telegram for approval
    const token = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = process.env.TELEGRAM_ADMIN_CHAT_ID;

    if (token && chatId) {
      const clientName = result.client_match
        ? result.client_match.name
        : "Unknown client";

      const telegramMessage = `*New Inbound Proposal*
Source: ${payload.source}
Client: ${clientName}

*Proposed Task:*
Title: ${result.proposed_task.title}
Priority: ${result.proposed_task.priority}
Tags: ${result.proposed_task.tags.join(", ")}

${result.proposed_task.description}

*Proposed Response:*
${result.proposed_response}

To approve: "approve proposal ${proposal.id}"
To reject: "reject proposal ${proposal.id}"`;

      await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          text: telegramMessage,
          parse_mode: "Markdown",
        }),
      });
    }

    return {
      proposalId: proposal.id,
      clientMatch: result.client_match,
      proposedTask: result.proposed_task,
      proposedResponse: result.proposed_response,
    };
  },
});
