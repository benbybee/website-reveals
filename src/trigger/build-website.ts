import { task } from "@trigger.dev/sdk/v3";
import { createClient } from "@supabase/supabase-js";
import { Resend } from "resend";
import { spawn } from "child_process";
import { createReadStream } from "fs";
import { mkdtemp, writeFile, rm } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";

const FROM = "Website Reveals <creativemarketing@websitereveals.com>";

function getNotifyList(formType: string): string[] {
  if (formType === "new-client") {
    return ["justin@obsessionmarketing.com", "creative@obsessionmarketing.com"];
  }
  return ["creative@obsessionmarketing.com"];
}

export const buildWebsite = task({
  id: "build-website",
  // Claude Code builds can take 10-30+ minutes
  maxDuration: 1800,
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

      // Run Claude Code CLI
      const output = await runClaudeCode(promptPath, workDir);

      // Parse results from Claude Code output
      const repoUrl = extractResult(output, "BUILD_RESULT_REPO_URL");
      const siteUrl = extractResult(output, "BUILD_RESULT_SITE_URL");

      if (!siteUrl) {
        throw new Error(
          `Claude Code finished but did not emit BUILD_RESULT_SITE_URL.\nOutput tail:\n${output.slice(-2000)}`
        );
      }

      const missingRepo = !repoUrl;

      // Mark as deployed (site is live even if repo wasn't created)
      await supabase
        .from("build_jobs")
        .update({
          status: "deployed",
          repo_url: repoUrl,
          site_url: siteUrl,
          error: missingRepo ? "Warning: GitHub repo was not created" : null,
          completed_at: new Date().toISOString(),
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

      // Add system comment to task with the live URL (task stays in_progress for review)
      if (taskId) {
        const commentLines = [`Build complete. Site is live and ready for review.`, `Site: ${siteUrl}`];
        if (repoUrl) commentLines.push(`Repo: ${repoUrl}`);
        await supabase.from("task_comments").insert({
          task_id: taskId,
          author_type: "system",
          author_name: "Build System",
          content: commentLines.join("\n"),
          is_request: false,
        });
      }

      // Notify: build succeeded
      const repoLine = repoUrl
        ? `Repo: <a href="${repoUrl}">${repoUrl}</a>`
        : `<span style="color:#e65100">⚠ GitHub repo was NOT created — check VPS gh auth</span>`;
      await resend.emails.send({
        from: FROM,
        to: getNotifyList(formType),
        subject: `Build Complete — ${businessName}`,
        html: `<p>The website build for <strong>${businessName}</strong> has finished successfully.</p>
               <p>Site: <a href="${siteUrl}">${siteUrl}</a><br>
               ${repoLine}</p>`,
      });

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
      }).catch(() => {}); // Don't let email failure mask the build error

      throw err;
    } finally {
      // Clean up temp directory (repo was pushed to GitHub, local copy not needed)
      if (workDir) {
        await rm(workDir, { recursive: true, force: true }).catch(() => {});
      }
    }
  },
});

/**
 * Spawn Claude Code CLI in headless mode.
 * Pipes the prompt file to stdin (avoids shell arg length limits).
 * Requires `claude` to be installed and authenticated on the VPS.
 */
function runClaudeCode(promptPath: string, cwd: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    const errChunks: Buffer[] = [];

    const child = spawn(
      "claude",
      [
        "-p",                            // Print mode (non-interactive)
        "--dangerously-skip-permissions", // No confirmation prompts
        "--output-format", "text",       // Plain text output
        "--verbose",
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
      } else {
        resolve(stdout);
      }
    });

    child.on("error", (err) => {
      reject(new Error(`Failed to spawn Claude Code: ${err.message}`));
    });
  });
}

/**
 * Extract a BUILD_RESULT_* value from Claude Code output.
 */
function extractResult(output: string, key: string): string | null {
  const regex = new RegExp(`^${key}:\\s*(.+)$`, "m");
  const match = output.match(regex);
  return match ? match[1].trim() : null;
}
