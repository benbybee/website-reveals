import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";

export const maxDuration = 60;

async function sendTelegram(text: string, chatId: string) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return;
  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: "Markdown" }),
  });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    if (!body.message?.text) {
      return NextResponse.json({ ok: true });
    }

    const text: string = body.message.text;
    const chatId: string = String(body.message.chat.id);

    if (chatId !== process.env.TELEGRAM_ADMIN_CHAT_ID) {
      return NextResponse.json({ ok: true });
    }

    // Process inline instead of via Trigger.dev
    const supabase = createServerClient();

    // Fetch conversation history
    const { data: history } = await supabase
      .from("telegram_conversations")
      .select("role, content")
      .eq("chat_id", chatId)
      .order("created_at", { ascending: false })
      .limit(10);

    const conversationHistory = (history || [])
      .reverse()
      .map((h) => ({
        role: h.role as "user" | "assistant",
        content: h.content as string,
      }));

    // Fetch context
    const [clientsRes, tasksRes, proposalsRes] = await Promise.all([
      supabase.from("clients").select("*").order("company_name"),
      supabase
        .from("tasks")
        .select("*")
        .in("status", ["backlog", "in_progress", "blocked"])
        .order("created_at", { ascending: false }),
      supabase
        .from("inbound_proposals")
        .select("*")
        .eq("status", "pending")
        .order("created_at", { ascending: false }),
    ]);

    const clients = (clientsRes.data || []) as Record<string, unknown>[];
    const activeTasks = (tasksRes.data || []) as Record<string, unknown>[];
    const pendingProposals = (proposalsRes.data || []) as Record<string, unknown>[];

    const clientList = clients
      .map(
        (c) =>
          `- ${c.first_name} ${c.last_name} (${c.company_name}) — ${c.email} [ID: ${c.id}]`
      )
      .join("\n");

    const taskList = activeTasks
      .map(
        (t) =>
          `- [${(t.id as string).slice(0, 8)}] ${t.title} — ${t.status} (Client: ${(t.client_id as string)?.slice(0, 8) || "none"})`
      )
      .join("\n");

    const proposalList = pendingProposals
      .map((p) => {
        const pt = p.proposed_task as Record<string, unknown>;
        return `- [${p.id}] "${pt.title}" — Source: ${p.source}, Client: ${p.client_id || "none"}`;
      })
      .join("\n");

    const systemPrompt = `You are Ben's AI assistant for managing client tasks at Website Reveals. You communicate via Telegram.

You can:
- Create tasks for clients
- Update task status (backlog, in_progress, blocked, complete)
- Delete tasks (ask for confirmation first)
- Create new clients
- Check task/client status
- Approve or reject inbound proposals

KNOWN CLIENTS:
${clientList || "No clients yet."}

ACTIVE TASKS:
${taskList || "No active tasks."}

PENDING PROPOSALS (awaiting your approval/rejection):
${proposalList || "No pending proposals."}

Respond with JSON only, no markdown fences:
{
  "intent": "create_task" | "update_task" | "delete_task" | "create_client" | "check_status" | "approve_proposal" | "reject_proposal" | "conversation",
  "data": { ... },
  "response": "<conversational response to Ben>"
}

For create_task: data = { "client_id": "...", "title": "...", "description": "...", "priority": "...", "tags": [...] }
For update_task: data = { "task_id": "...", "status": "...", "notes": "..." }
For delete_task: data = { "task_id": "...", "confirm": true/false }
For create_client: data = { "first_name": "...", "last_name": "...", "company_name": "...", "email": "..." }
For approve_proposal: data = { "proposal_id": "..." }
For reject_proposal: data = { "proposal_id": "..." }`;

    const { default: Anthropic } = await import("@anthropic-ai/sdk");
    const anthropic = new Anthropic();
    const messages = [
      ...conversationHistory.map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      })),
      { role: "user" as const, content: text },
    ];

    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1000,
      system: systemPrompt,
      messages,
    });

    const responseText =
      response.content[0].type === "text" ? response.content[0].text : "";
    const result = JSON.parse(responseText);

    // Execute intent
    try {
      switch (result.intent) {
        case "create_task": {
          const d = result.data;
          const { data: newTask, error } = await supabase
            .from("tasks")
            .insert({
              client_id: d.client_id,
              title: d.title,
              description: d.description || null,
              priority: d.priority || "medium",
              tags: d.tags || [],
              status: "backlog",
            })
            .select()
            .single();
          if (error) throw error;
          await supabase.from("task_status_history").insert({
            task_id: newTask.id,
            old_status: null,
            new_status: "backlog",
            changed_by: "ai-agent",
          });
          break;
        }
        case "update_task": {
          const d = result.data;
          const { data: current } = await supabase
            .from("tasks")
            .select("status")
            .eq("id", d.task_id)
            .single();
          const updateData: Record<string, unknown> = {
            status: d.status,
            updated_at: new Date().toISOString(),
          };
          if (d.status === "complete") {
            updateData.completed_at = new Date().toISOString();
          }
          await supabase
            .from("tasks")
            .update(updateData)
            .eq("id", d.task_id);
          await supabase.from("task_status_history").insert({
            task_id: d.task_id,
            old_status: current?.status || null,
            new_status: d.status,
            notes: d.notes || null,
            changed_by: "ai-agent",
          });
          break;
        }
        case "delete_task": {
          const d = result.data;
          if (d.confirm) {
            await supabase.from("tasks").delete().eq("id", d.task_id);
          }
          break;
        }
        case "create_client": {
          const d = result.data;
          const { createHash, randomInt } = await import("crypto");
          const pin = String(randomInt(100000, 999999));
          const pinHash = createHash("sha256").update(pin).digest("hex");
          await supabase.from("clients").insert({
            first_name: d.first_name,
            last_name: d.last_name || "",
            company_name: d.company_name,
            email: d.email.toLowerCase(),
            pin_hash: pinHash,
          });
          result.response += `\nPIN: ${pin}`;
          break;
        }
        case "approve_proposal": {
          const d = result.data;
          const { data: proposal } = await supabase
            .from("inbound_proposals")
            .select("*")
            .eq("id", d.proposal_id)
            .single();
          if (proposal) {
            const pt = proposal.proposed_task as Record<string, unknown>;
            await supabase.from("tasks").insert({
              client_id: proposal.client_id || null,
              title: pt.title,
              description: pt.description || null,
              priority: (pt.priority as string) || "medium",
              tags: (pt.tags as string[]) || [],
              status: "backlog",
            });
            await supabase
              .from("inbound_proposals")
              .update({
                status: "approved",
                resolved_at: new Date().toISOString(),
              })
              .eq("id", d.proposal_id);
          }
          break;
        }
        case "reject_proposal": {
          const d = result.data;
          await supabase
            .from("inbound_proposals")
            .update({
              status: "rejected",
              resolved_at: new Date().toISOString(),
            })
            .eq("id", d.proposal_id);
          break;
        }
      }
    } catch (execErr) {
      const errMsg =
        execErr instanceof Error ? execErr.message : String(execErr);
      result.response += `\n\nError: ${errMsg}`;
    }

    // Save conversation
    await supabase.from("telegram_conversations").insert([
      { chat_id: chatId, role: "user", content: text },
      { chat_id: chatId, role: "assistant", content: result.response },
    ]);

    // Send response
    await sendTelegram(result.response, chatId);

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[telegram-webhook] Error:", err);
    return NextResponse.json({ ok: true });
  }
}
