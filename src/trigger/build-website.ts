import { task } from "@trigger.dev/sdk/v3";
import { createClient } from "@supabase/supabase-js";
import { Resend } from "resend";
import { spawn } from "child_process";
import { createReadStream } from "fs";
import { mkdtemp, writeFile, rm } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";

const FROM = "Website Reveals <creativemarketing@websitereveals.com>";
const MAX_DURATION_SECONDS = 1800;

function getNotifyList(formType: string): string[] {
  if (formType === "new-client") {
    return ["justin@obsessionmarketing.com", "creative@obsessionmarketing.com"];
  }
  return ["creative@obsessionmarketing.com"];
}

export const buildWebsite = task({
  id: "build-website",
  // Claude Code builds can take 10-30+ minutes
  maxDuration: MAX_DURATION_SECONDS,
  run: async (payload: {
    buildJobId: string;
    token: string;
    formType: string;
    prompt: string;
    taskId?: string;
  }) => {
    const { buildJobId, token, formType, prompt, taskId } = payload;

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );
    const resend = new Resend(process.env.RESEND_API_KEY!);

    // Fetch business name for email context
    const { data: session } = await supabase
      .from("form_sessions")
      .select("form_data")
      .eq("token", token)
      .single();
    const businessName =
      (session?.form_data as Record<string, unknown>)?.business_name as string ||
      "Unknown Business";

    // Mark as building
    const { error: updateErr } = await supabase
      .from("build_jobs")
      .update({ status: "building", started_at: new Date().toISOString() })
      .eq("id", buildJobId);

    if (updateErr) throw new Error(`Failed to update build status: ${updateErr.message}`);

    // Move build task to in_progress
    if (taskId) {
      await supabase
        .from("tasks")
        .update({ status: "in_progress", updated_at: new Date().toISOString() })
        .eq("id", taskId);
      await supabase.from("task_status_history").insert({
        task_id: taskId,
        old_status: "backlog",
        new_status: "in_progress",
        notes: "Build started",
        changed_by: "system",
      });
    }

    // Notify: build started
    await resend.emails.send({
      from: FROM,
      to: getNotifyList(formType),
      subject: `Build Started — ${businessName}`,
      html: `<p>The automated website build for <strong>${businessName}</strong> has started.</p>
             <p>Form type: ${formType}<br>Build job ID: ${buildJobId}</p>`,
    });

    let workDir: string | null = null;

    try {
      // Create temp working directory
      workDir = await mkdtemp(join(tmpdir(), `build-${token}-`));

      // Write prompt to a file (avoids shell escaping issues with long prompts)
      const promptPath = join(workDir, "PROMPT.md");
      await writeFile(promptPath, prompt, "utf-8");

      // Run Claude Code CLI (returns parsed JSON result with text + usage)
      const result = await runClaudeCode(promptPath, workDir);
      const output = result.text;

      // Parse results from Claude Code output
      const repoUrl = extractResult(output, "BUILD_RESULT_REPO_URL");
      const siteUrl = extractResult(output, "BUILD_RESULT_SITE_URL");

      if (!siteUrl) {
        throw new Error(
          `Claude Code finished but did not emit BUILD_RESULT_SITE_URL.\nOutput tail:\n${output.slice(-2000)}`
        );
      }

      const missingRepo = !repoUrl;

      // Mark as deployed (site is live even if repo wasn't created).
      // Cost/token fields will be null if --output-format json wasn't honored.
      await supabase
        .from("build_jobs")
        .update({
          status: "deployed",
          repo_url: repoUrl,
          site_url: siteUrl,
          error: missingRepo ? "Warning: GitHub repo was not created" : null,
          completed_at: new Date().toISOString(),
          cost_usd: result.costUsd,
          input_tokens: result.inputTokens,
          output_tokens: result.outputTokens,
          cache_read_tokens: result.cacheReadTokens,
          cache_creation_tokens: result.cacheCreationTokens,
        })
        .eq("id", buildJobId);

      // Update client's website_url with the live site URL
      const { data: clientRecord } = await supabase
        .from("clients")
        .select("id")
        .eq("form_session_token", token)
        .single();
      if (clientRecord) {
        await supabase
          .from("clients")
          .update({ website_url: siteUrl, updated_at: new Date().toISOString() })
          .eq("id", clientRecord.id);
      }

      // Add comment with live URL — task stays in_progress for admin review
      if (taskId) {
        await supabase.from("task_status_history").insert({
          task_id: taskId,
          old_status: "in_progress",
          new_status: "in_progress",
          notes: `Build deployed — awaiting review: ${siteUrl}`,
          changed_by: "system",
        });
        const commentLines = [`Build deployed — ready for review.`, `Site: ${siteUrl}`];
        if (repoUrl) commentLines.push(`Repo: ${repoUrl}`);
        await supabase.from("task_comments").insert({
          task_id: taskId,
          author_type: "system",
          author_name: "Build System",
          content: commentLines.join("\n"),
          is_request: false,
        });
      }

      // Notify admin: build succeeded (wrapped so email failure doesn't mark build as failed)
      const repoLine = repoUrl
        ? `Repo: <a href="${repoUrl}">${repoUrl}</a>`
        : `<span style="color:#e65100">⚠ GitHub repo was NOT created — check VPS gh auth</span>`;
      try {
        await resend.emails.send({
          from: FROM,
          to: getNotifyList(formType),
          subject: `Build Complete — ${businessName}`,
          html: `<p>The website build for <strong>${businessName}</strong> has finished successfully and is ready for review.</p>
                 <p>Site: <a href="${siteUrl}">${siteUrl}</a><br>
                 ${repoLine}</p>
                 <p><em>Review the site, then mark the task as complete in the admin panel to notify the client.</em></p>`,
        });
      } catch (emailErr) {
        console.error("Failed to send build-complete email:", emailErr);
      }

      // Notify admin via Telegram with task context for approval
      try {
        const tgToken = process.env.TELEGRAM_BOT_TOKEN;
        const tgChatId = process.env.TELEGRAM_ADMIN_CHAT_ID;
        if (tgToken && tgChatId) {
          const tgLines = [
            `✅ Build Complete — ${businessName}`,
            ``,
            `Site: ${siteUrl}`,
          ];
          if (repoUrl) tgLines.push(`Repo: ${repoUrl}`);
          if (taskId) tgLines.push(`Task ID: ${taskId.slice(0, 8)}`);
          tgLines.push(``, `Review the site, then reply here to approve.`);

          await fetch(`https://api.telegram.org/bot${tgToken}/sendMessage`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ chat_id: tgChatId, text: tgLines.join("\n") }),
          });
        }
      } catch (tgErr) {
        console.error("Failed to send build-complete Telegram:", tgErr);
      }

      return { status: "deployed", repoUrl, siteUrl };
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);

      await supabase
        .from("build_jobs")
        .update({
          status: "failed",
          error: errorMsg.slice(0, 2000),
          completed_at: new Date().toISOString(),
        })
        .eq("id", buildJobId);

      // Move task to blocked with error notes
      if (taskId) {
        await supabase
          .from("tasks")
          .update({ status: "blocked", updated_at: new Date().toISOString() })
          .eq("id", taskId);
        await supabase.from("task_status_history").insert({
          task_id: taskId,
          old_status: "in_progress",
          new_status: "blocked",
          notes: `Build failed: ${errorMsg.slice(0, 500)}`,
          changed_by: "system",
        });
        await supabase.from("task_comments").insert({
          task_id: taskId,
          author_type: "system",
          author_name: "Build System",
          content: `Build failed.\n\n${errorMsg.slice(0, 1000)}`,
          is_request: false,
        });
      }

      // Notify: build failed
      await resend.emails.send({
        from: FROM,
        to: getNotifyList(formType),
        subject: `Build Failed — ${businessName}`,
        html: `<p>The website build for <strong>${businessName}</strong> has failed.</p>
               <p>Error: <code>${errorMsg.slice(0, 500)}</code></p>
               <p>Build job ID: ${buildJobId}</p>`,
      }).catch((emailErr) => {
        console.error("Failed to send build-failed email:", emailErr);
      });

      throw err;
    } finally {
      // Clean up temp directory (repo was pushed to GitHub, local copy not needed)
      if (workDir) {
        await rm(workDir, { recursive: true, force: true }).catch(() => {});
      }

      // Safety net: if the build_jobs row is still "building" at this point,
      // it means neither success nor failure path completed (e.g. maxDuration kill).
      // Mark it as failed so the watchdog can resubmit.
      try {
        const { data: job } = await supabase
          .from("build_jobs")
          .select("status")
          .eq("id", buildJobId)
          .single();
        if (job?.status === "building") {
          console.error(`Build ${buildJobId} still in "building" at finally — marking failed (likely maxDuration kill)`);
          await supabase
            .from("build_jobs")
            .update({
              status: "failed",
              error: "Build timed out (maxDuration exceeded) — will be resubmitted by watchdog",
              completed_at: new Date().toISOString(),
            })
            .eq("id", buildJobId);
          if (taskId) {
            await supabase
              .from("tasks")
              .update({ status: "blocked", updated_at: new Date().toISOString() })
              .eq("id", taskId);
          }
          await resend.emails.send({
            from: FROM,
            to: getNotifyList(formType),
            subject: `Build Timed Out — ${businessName}`,
            html: `<p>The website build for <strong>${businessName}</strong> timed out after ${Math.round(MAX_DURATION_SECONDS / 60)} minutes and will be automatically resubmitted.</p>
                   <p>Build job ID: ${buildJobId}</p>`,
          }).catch((emailErr) => {
            console.error("Failed to send build-timeout email:", emailErr);
          });
        }
      } catch (finallyErr) {
        console.error("Error in finally safety net:", finallyErr);
      }
    }
  },
});

interface ClaudeCodeResult {
  text: string;                       // Assistant's final text (parsed for BUILD_RESULT_* markers)
  costUsd: number | null;
  inputTokens: number | null;
  outputTokens: number | null;
  cacheReadTokens: number | null;
  cacheCreationTokens: number | null;
}

/**
 * Spawn Claude Code CLI in headless mode with structured JSON output.
 * Pipes the prompt file to stdin (avoids shell arg length limits).
 * Requires `claude` to be installed and authenticated on the VPS.
 *
 * Claude Code emits a single JSON object on stdout when --output-format=json:
 *   { type, subtype, total_cost_usd, duration_ms, result, usage: { input_tokens, output_tokens, cache_read_input_tokens, cache_creation_input_tokens, ... } }
 *
 * If parsing the JSON fails (e.g. Claude Code outputs plain text on a version
 * mismatch), we fall back to treating stdout as the assistant text and leave
 * cost/token fields null — the build still completes successfully.
 */
function runClaudeCode(promptPath: string, cwd: string): Promise<ClaudeCodeResult> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    const errChunks: Buffer[] = [];

    const child = spawn(
      "claude",
      [
        "-p",                            // Print mode (non-interactive)
        "--dangerously-skip-permissions", // No confirmation prompts
        "--output-format", "json",       // Structured JSON output (includes cost + usage)
        "--no-session-persistence",      // Don't load/save session history (prevents stale context)
      ],
      { cwd, stdio: ["pipe", "pipe", "pipe"] },
    );

    // Pipe prompt file to stdin
    const promptStream = createReadStream(promptPath);
    promptStream.pipe(child.stdin);

    child.stdout.on("data", (chunk: Buffer) => chunks.push(chunk));
    child.stderr.on("data", (chunk: Buffer) => errChunks.push(chunk));

    child.on("close", (code) => {
      const stdout = Buffer.concat(chunks).toString("utf-8");
      const stderr = Buffer.concat(errChunks).toString("utf-8");

      if (code !== 0) {
        reject(new Error(`Claude Code exited with code ${code}:\n${stderr}\n${stdout}`));
        return;
      }

      let parsed: Record<string, unknown> | null = null;
      try {
        parsed = JSON.parse(stdout.trim());
      } catch {
        // Output wasn't JSON — fall back to raw text, no cost capture.
        console.warn("[build-website] Claude Code output was not valid JSON; cost/token capture skipped.");
      }

      if (!parsed) {
        resolve({
          text: stdout,
          costUsd: null,
          inputTokens: null,
          outputTokens: null,
          cacheReadTokens: null,
          cacheCreationTokens: null,
        });
        return;
      }

      const usage = (parsed.usage as Record<string, unknown> | undefined) || {};
      resolve({
        text: String(parsed.result ?? ""),
        costUsd: typeof parsed.total_cost_usd === "number" ? parsed.total_cost_usd : null,
        inputTokens: typeof usage.input_tokens === "number" ? usage.input_tokens : null,
        outputTokens: typeof usage.output_tokens === "number" ? usage.output_tokens : null,
        cacheReadTokens: typeof usage.cache_read_input_tokens === "number" ? usage.cache_read_input_tokens : null,
        cacheCreationTokens: typeof usage.cache_creation_input_tokens === "number" ? usage.cache_creation_input_tokens : null,
      });
    });

    child.on("error", (err) => {
      reject(new Error(`Failed to spawn Claude Code: ${err.message}`));
    });
  });
}

/**
 * Extract a BUILD_RESULT_* value from Claude Code output.
 * Handles plain and markdown-formatted variants:
 *   BUILD_RESULT_SITE_URL: https://...
 *   **BUILD_RESULT_SITE_URL:** `https://...`
 *   BUILD_RESULT_SITE_URL: `https://...`
 */
function extractResult(output: string, key: string): string | null {
  // Strip optional leading ** and trailing ** from key, optional backticks around value
  const regex = new RegExp(`\\*{0,2}${key}\\*{0,2}:?\\*{0,2}\\s*\`?([^\\n\`]+)\`?`, "m");
  const match = output.match(regex);
  return match ? match[1].trim() : null;
}
