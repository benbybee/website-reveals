import { task } from "@trigger.dev/sdk/v3";
import { createClient } from "@supabase/supabase-js";
import { spawn } from "child_process";
import { mkdtemp, writeFile, rm } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";

export const buildWebsite = task({
  id: "build-website",
  // Claude Code builds can take 10-30+ minutes
  maxDuration: 1800,
  run: async (payload: {
    buildJobId: string;
    token: string;
    formType: string;
    prompt: string;
  }) => {
    const { buildJobId, token, formType, prompt } = payload;

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );

    // Mark as building
    const { error: updateErr } = await supabase
      .from("build_jobs")
      .update({ status: "building", started_at: new Date().toISOString() })
      .eq("id", buildJobId);

    if (updateErr) throw new Error(`Failed to update build status: ${updateErr.message}`);

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

      if (!repoUrl || !siteUrl) {
        throw new Error(
          `Claude Code finished but did not emit required BUILD_RESULT lines.\nOutput tail:\n${output.slice(-2000)}`
        );
      }

      // Mark as deployed
      await supabase
        .from("build_jobs")
        .update({
          status: "deployed",
          repo_url: repoUrl,
          site_url: siteUrl,
          completed_at: new Date().toISOString(),
        })
        .eq("id", buildJobId);

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
        "--input-file", promptPath,      // Read prompt from file
        "--dangerously-skip-permissions", // No confirmation prompts
        "--output-format", "text",       // Plain text output
        "--max-turns", "100",            // Allow many agentic turns
        "--verbose",
      ],
      { cwd, stdio: ["ignore", "pipe", "pipe"] },
    );

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
