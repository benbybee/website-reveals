import { task } from "@trigger.dev/sdk/v3";
import { createClient } from "@supabase/supabase-js";
import Anthropic from "@anthropic-ai/sdk";
import type { Task, AiVelocityLog } from "@/lib/types/client-tasks";

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export const aiEstimate = task({
  id: "ai-estimate",
  maxDuration: 120,
  run: async (payload: { taskId: string }) => {
    const supabase = getSupabase();

    // Fetch the task
    const { data: taskData, error: taskError } = await supabase
      .from("tasks")
      .select("*")
      .eq("id", payload.taskId)
      .single();

    if (taskError || !taskData) {
      throw new Error(`Task not found: ${payload.taskId}`);
    }

    const targetTask = taskData as Task;

    // Fetch velocity logs for context
    const { data: velocityData } = await supabase
      .from("ai_velocity_log")
      .select("*")
      .order("completed_at", { ascending: false })
      .limit(100);

    const velocityLogs = (velocityData || []) as AiVelocityLog[];

    const velocitySummary = velocityLogs
      .map(
        (v) =>
          `tags=${v.tags.join(",")}, estimate=${v.time_estimate_minutes}min, actual=${v.time_tracked_minutes}min, complexity=${v.complexity_score}, completed=${v.completed_at}`
      )
      .join("\n");

    // Call Claude for estimation
    const anthropic = new Anthropic();
    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 500,
      system: `You are a project estimation assistant. Analyze the task and historical velocity data to estimate complexity and completion time. Respond with JSON only, no markdown fences.

Historical velocity data:
${velocitySummary || "No historical data available."}`,
      messages: [
        {
          role: "user",
          content: `Estimate this task:
Title: ${targetTask.title}
Description: ${targetTask.description || "N/A"}
Tags: ${targetTask.tags.join(", ") || "None"}
Priority: ${targetTask.priority}
Time Estimate: ${targetTask.time_estimate_minutes ? `${targetTask.time_estimate_minutes} minutes` : "Not set"}
Current Status: ${targetTask.status}

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
    const estimatedCompletionDate = completionDate.toISOString().split("T")[0];

    // Update the task with estimation results
    const { error: updateError } = await supabase
      .from("tasks")
      .update({
        complexity_score: parsed.complexity_score,
        estimated_completion_date: estimatedCompletionDate,
        updated_at: new Date().toISOString(),
      })
      .eq("id", payload.taskId);

    if (updateError) {
      throw new Error(`Failed to update task: ${updateError.message}`);
    }

    return {
      complexity_score: parsed.complexity_score,
      estimated_completion_date: estimatedCompletionDate,
      confidence: parsed.confidence,
      reasoning: parsed.reasoning,
    };
  },
});
