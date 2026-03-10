import Anthropic from "@anthropic-ai/sdk";
import { createServerClient } from "@/lib/supabase/server";
import type { Task, Client, AiVelocityLog } from "@/lib/types/client-tasks";

const MODEL = "claude-sonnet-4-20250514";

interface AgentContext {
  clients: Client[];
  activeTasks: Task[];
  velocityLogs: AiVelocityLog[];
}

interface EstimateResult {
  complexity_score: number;
  estimated_completion_date: string;
  confidence: "low" | "medium" | "high";
}

interface InboundResult {
  client_match: { id: string; name: string } | null;
  proposed_task: {
    title: string;
    description: string;
    priority: "low" | "medium" | "high" | "urgent";
    tags: string[];
  };
  proposed_response: string;
}

interface TelegramCommandResult {
  intent:
    | "create_task"
    | "update_task"
    | "delete_task"
    | "create_client"
    | "check_status"
    | "approve_proposal"
    | "reject_proposal"
    | "conversation";
  data: Record<string, unknown>;
  response: string;
}

function getAnthropicClient(): Anthropic {
  return new Anthropic();
}

export async function getAgentContext(): Promise<AgentContext> {
  const supabase = createServerClient();

  const [clientsRes, tasksRes, velocityRes] = await Promise.all([
    supabase.from("clients").select("*").order("created_at", { ascending: false }),
    supabase
      .from("tasks")
      .select("*")
      .in("status", ["backlog", "in_progress", "blocked"])
      .order("created_at", { ascending: false }),
    supabase
      .from("ai_velocity_log")
      .select("*")
      .order("completed_at", { ascending: false })
      .limit(100),
  ]);

  return {
    clients: (clientsRes.data || []) as Client[],
    activeTasks: (tasksRes.data || []) as Task[],
    velocityLogs: (velocityRes.data || []) as AiVelocityLog[],
  };
}

export async function aiEstimateTask(
  task: Task,
  context: AgentContext
): Promise<EstimateResult> {
  const client = getAnthropicClient();

  const velocitySummary = context.velocityLogs
    .map(
      (v) =>
        `tags=${v.tags.join(",")}, estimate=${v.time_estimate_minutes}min, actual=${v.time_tracked_minutes}min, complexity=${v.complexity_score}, completed=${v.completed_at}`
    )
    .join("\n");

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 500,
    system: `You are a project estimation assistant. Analyze the task and historical velocity data to estimate complexity and completion time. Respond with JSON only, no markdown fences.

Historical velocity data:
${velocitySummary || "No historical data available."}`,
    messages: [
      {
        role: "user",
        content: `Estimate this task:
Title: ${task.title}
Description: ${task.description || "N/A"}
Tags: ${task.tags.join(", ") || "None"}
Priority: ${task.priority}
Time Estimate: ${task.time_estimate_minutes ? `${task.time_estimate_minutes} minutes` : "Not set"}
Current Status: ${task.status}

Respond with JSON: { "complexity_score": <1-5>, "estimated_days_to_complete": <number>, "confidence": "low"|"medium"|"high", "reasoning": "<brief explanation>" }`,
      },
    ],
  });

  const text =
    response.content[0].type === "text" ? response.content[0].text : "";
  const parsed = JSON.parse(text);

  const completionDate = new Date();
  completionDate.setDate(
    completionDate.getDate() + parsed.estimated_days_to_complete
  );

  return {
    complexity_score: parsed.complexity_score,
    estimated_completion_date: completionDate.toISOString().split("T")[0],
    confidence: parsed.confidence,
  };
}

export async function aiProcessInbound(
  message: string,
  context: AgentContext
): Promise<InboundResult> {
  const client = getAnthropicClient();

  const clientList = context.clients
    .map((c) => `ID: ${c.id}, Name: ${c.first_name} ${c.last_name}, Company: ${c.company_name}, Email: ${c.email}`)
    .join("\n");

  const activeTaskList = context.activeTasks
    .map((t) => `ID: ${t.id}, Client: ${t.client_id}, Title: ${t.title}, Status: ${t.status}`)
    .join("\n");

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 1000,
    system: `You are an agency intake assistant. Analyze inbound messages from Slack or email, match them to existing clients, and propose tasks. Respond with JSON only, no markdown fences.

Existing clients:
${clientList || "No clients yet."}

Active tasks:
${activeTaskList || "No active tasks."}`,
    messages: [
      {
        role: "user",
        content: `Analyze this inbound message and extract a task proposal:

"${message}"

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
  return JSON.parse(text) as InboundResult;
}

export async function aiProcessTelegramCommand(
  message: string,
  conversationHistory: Array<{ role: "user" | "assistant"; content: string }>,
  context: AgentContext
): Promise<TelegramCommandResult> {
  const anthropic = getAnthropicClient();

  const clientList = context.clients
    .map((c) => `ID: ${c.id}, Name: ${c.first_name} ${c.last_name}, Company: ${c.company_name}, Email: ${c.email}`)
    .join("\n");

  const activeTaskList = context.activeTasks
    .map((t) => `ID: ${t.id}, Client: ${t.client_id}, Title: ${t.title}, Status: ${t.status}, Priority: ${t.priority}`)
    .join("\n");

  const systemPrompt = `You are an agency management AI assistant accessible via Telegram. You help manage clients and tasks.

Your capabilities:
- create_task: Create a new task for a client. Data: { client_id, title, description, priority, tags }
- update_task: Update a task's status. Data: { task_id, status, notes }
- delete_task: Delete a task. Data: { task_id, confirm: boolean }
- create_client: Create a new client. Data: { first_name, last_name, company_name, email, phone?, website_url? }
- check_status: Check status of tasks/clients. Data: { query }
- approve_proposal: Approve an inbound proposal. Data: { proposal_id }
- reject_proposal: Reject an inbound proposal. Data: { proposal_id, reason }
- conversation: General conversation, no action needed. Data: {}

Existing clients:
${clientList || "No clients yet."}

Active tasks:
${activeTaskList || "No active tasks."}

Respond with JSON only, no markdown fences:
{ "intent": "<intent>", "data": { ... }, "response": "<markdown message to send back>" }`;

  const messages: Array<{ role: "user" | "assistant"; content: string }> = [
    ...conversationHistory,
    { role: "user", content: message },
  ];

  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 1000,
    system: systemPrompt,
    messages,
  });

  const text =
    response.content[0].type === "text" ? response.content[0].text : "";
  return JSON.parse(text) as TelegramCommandResult;
}
