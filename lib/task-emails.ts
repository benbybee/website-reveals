import { Resend } from "resend";
import type { Client, Task, TaskStatus } from "@/lib/types/client-tasks";

const FROM = "Website Reveals <creativemarketing@websitereveals.com>";
const BASE_URL = () =>
  process.env.NEXT_PUBLIC_BASE_URL || "https://websitereveals.com";

function getResend() {
  return new Resend(process.env.RESEND_API_KEY);
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function emailWrapper(content: string): string {
  return `
    <div style="font-family: 'DM Sans', 'Helvetica Neue', Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #faf9f5; color: #111110; padding: 40px;">
      <div style="border-bottom: 1.5px solid #e8e6df; padding-bottom: 20px; margin-bottom: 30px;">
        <h1 style="font-family: Georgia, 'Playfair Display', serif; font-size: 20px; font-weight: 700; color: #111110; margin: 0; letter-spacing: -0.01em;">Website Reveals</h1>
      </div>
      ${content}
      <div style="border-top: 1.5px solid #e8e6df; padding-top: 20px; margin-top: 30px; font-size: 12px; color: #888886;">
        <p>You're receiving this because you have an active project with Website Reveals.</p>
      </div>
    </div>
  `;
}

function portalButton(text: string): string {
  return `
    <a href="${BASE_URL()}/portal" style="display: inline-block; background: #ff3d00; color: #fff; padding: 13px 32px; text-decoration: none; font-size: 15px; font-weight: 600; border-radius: 3px; margin-top: 16px;">
      ${text}
    </a>
  `;
}

function pinSection(client: Client): string {
  if (!client.pin) return "";
  return `
    <div style="background: #ffffff; border: 1.5px solid #e8e6df; border-radius: 4px; padding: 16px 20px; margin: 24px 0 0;">
      <p style="font-size: 11px; color: #888886; text-transform: uppercase; letter-spacing: 0.08em; margin: 0 0 6px; font-weight: 600;">Your Portal PIN</p>
      <p style="font-size: 22px; font-weight: 700; color: #ff3d00; letter-spacing: 0.2em; font-family: 'JetBrains Mono', monospace; margin: 0;">${client.pin}</p>
      <p style="font-size: 12px; color: #888886; margin: 6px 0 0;">Log in at <a href="${BASE_URL()}/portal" style="color: #ff3d00;">${BASE_URL()}/portal</a> with your email &amp; PIN.</p>
    </div>
  `;
}

export async function sendWelcomeEmail(
  client: Client,
  pin: string
): Promise<void> {
  const resend = getResend();
  await resend.emails.send({
    from: FROM,
    to: client.email,
    subject: `Welcome to Website Reveals — ${escapeHtml(client.company_name)}`,
    html: emailWrapper(`
      <h2 style="font-family: Georgia, 'Playfair Display', serif; font-size: 24px; font-weight: 700; color: #111110; margin-bottom: 8px;">Welcome, ${escapeHtml(client.first_name)}.</h2>
      <p style="color: #888886; font-size: 15px; line-height: 1.6;">
        Your project portal is ready. You can track task progress, leave comments, and submit requests.
      </p>
      <div style="background: #ffffff; border: 1.5px solid #e8e6df; border-radius: 4px; padding: 20px; margin: 24px 0;">
        <p style="font-size: 11px; color: #888886; text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 8px; font-weight: 600;">Your Login PIN</p>
        <p style="font-size: 28px; font-weight: 700; color: #ff3d00; letter-spacing: 0.2em; font-family: 'JetBrains Mono', monospace; margin: 0;">${pin}</p>
        <p style="font-size: 13px; color: #888886; margin-top: 8px;">Use this with your email (${escapeHtml(client.email)}) to log in.</p>
      </div>
      ${portalButton("Go to Portal")}
    `),
  });
}

export async function sendPinResetEmail(
  client: Client,
  pin: string
): Promise<void> {
  const resend = getResend();
  await resend.emails.send({
    from: FROM,
    to: client.email,
    subject: "[Website Reveals] Your PIN has been reset",
    html: emailWrapper(`
      <h2 style="font-family: Georgia, 'Playfair Display', serif; font-size: 24px; font-weight: 700; color: #111110; margin-bottom: 8px;">PIN Reset</h2>
      <p style="color: #888886; font-size: 15px;">Your portal PIN has been reset. Use your new PIN to log in.</p>
      <div style="background: #ffffff; border: 1.5px solid #e8e6df; border-radius: 4px; padding: 20px; margin: 24px 0;">
        <p style="font-size: 11px; color: #888886; text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 8px; font-weight: 600;">New PIN</p>
        <p style="font-size: 28px; font-weight: 700; color: #ff3d00; letter-spacing: 0.2em; font-family: 'JetBrains Mono', monospace; margin: 0;">${pin}</p>
      </div>
      ${portalButton("Go to Portal")}
    `),
  });
}

export async function sendTaskCreatedEmail(
  client: Client,
  task: Task
): Promise<void> {
  const resend = getResend();
  await resend.emails.send({
    from: FROM,
    to: client.email,
    subject: `[Website Reveals] New Task: ${escapeHtml(task.title)}`,
    html: emailWrapper(`
      <h2 style="font-family: Georgia, 'Playfair Display', serif; font-size: 24px; font-weight: 700; color: #111110; margin-bottom: 8px;">New Task Added</h2>
      <p style="color: #888886; font-size: 15px;">A new task has been added to your project.</p>
      <div style="background: #ffffff; border: 1.5px solid #e8e6df; border-radius: 4px; padding: 20px; margin: 24px 0;">
        <h3 style="font-size: 16px; color: #111110; margin: 0 0 8px;">${escapeHtml(task.title)}</h3>
        ${task.description ? `<p style="color: #888886; font-size: 14px; margin: 0 0 12px;">${escapeHtml(task.description)}</p>` : ""}
        <div style="font-size: 12px; color: #888886;">
          <span style="text-transform: uppercase; letter-spacing: 0.05em;">Priority:</span> <span style="color: #111110; font-weight: 600;">${task.priority}</span>
          ${task.due_date ? ` &nbsp;|&nbsp; <span style="text-transform: uppercase; letter-spacing: 0.05em;">Due:</span> <span style="color: #111110; font-weight: 600;">${task.due_date}</span>` : ""}
        </div>
      </div>
      ${portalButton("View in Portal")}
      ${pinSection(client)}
    `),
  });
}

const STATUS_MESSAGES: Record<
  TaskStatus,
  { heading: string; message: string }
> = {
  backlog: {
    heading: "Task Queued",
    message: "This task has been added to the backlog.",
  },
  in_progress: {
    heading: "Work Started",
    message: "Work has begun on this task.",
  },
  review: {
    heading: "In Review",
    message: "The build is complete and awaiting final review.",
  },
  blocked: {
    heading: "Action Needed",
    message: "This task is blocked and we need something from you.",
  },
  complete: {
    heading: "Task Complete",
    message: "This task has been completed.",
  },
};

/**
 * Notify the system admin when a task moves into the "review" stage —
 * typically after a SiteLaunchr build goes live and the sl-callback handler
 * auto-transitions the task. Goes to AGENCY_EMAIL (no audience gating;
 * this is for the operator, not the client/sales-rep).
 */
export async function sendReviewNotificationEmail(args: {
  taskTitle: string;
  businessName: string;
  siteUrl: string | null;
  wpAdminUrl: string | null;
  kuraPortalUrl: string | null;
  taskId: string;
}): Promise<void> {
  const adminEmail = process.env.AGENCY_EMAIL;
  if (!adminEmail) return;

  const resend = getResend();
  const baseUrl = BASE_URL();
  const lines: string[] = [];
  if (args.siteUrl) lines.push(`<strong>Site:</strong> <a href="${args.siteUrl}">${args.siteUrl}</a>`);
  if (args.wpAdminUrl) lines.push(`<strong>WordPress admin:</strong> <a href="${args.wpAdminUrl}">${args.wpAdminUrl}</a>`);
  if (args.kuraPortalUrl) lines.push(`<strong>Kura portal:</strong> <a href="${args.kuraPortalUrl}">${args.kuraPortalUrl}</a>`);

  await resend.emails.send({
    from: FROM,
    to: adminEmail,
    subject: `[Website Reveals] Ready for Review: ${escapeHtml(args.businessName)}`,
    html: emailWrapper(`
      <h2 style="font-family: Georgia, 'Playfair Display', serif; font-size: 24px; font-weight: 700; color: #111110; margin-bottom: 8px;">Ready for Review</h2>
      <p style="color: #888886; font-size: 15px;">
        The build for <strong>${escapeHtml(args.businessName)}</strong> finished and was moved into the Review stage.
      </p>
      <div style="background: #ffffff; border: 1.5px solid #e8e6df; border-radius: 4px; padding: 20px; margin: 24px 0;">
        <h3 style="font-size: 16px; color: #111110; margin: 0 0 12px;">${escapeHtml(args.taskTitle)}</h3>
        <p style="font-size: 13px; color: #444442; line-height: 1.6; margin: 0;">
          ${lines.join("<br>")}
        </p>
      </div>
      <a href="${baseUrl}/admin/tasks?task=${args.taskId}" style="display: inline-block; background: #ff3d00; color: #fff; padding: 13px 32px; text-decoration: none; font-size: 15px; font-weight: 600; border-radius: 3px; margin-top: 16px;">
        Review in Admin
      </a>
    `),
  });
}

/**
 * Sent to a sales rep immediately after they submit a /sales form, as a
 * receipt + "what's next" so they have written confirmation the submission
 * made it through. Fire-and-forget like the other rep emails.
 */
export async function sendSalesRepSubmissionReceivedEmail(args: {
  to: string;
  repFirstName: string;
  businessName: string;
  industry: string | null;
}): Promise<void> {
  const resend = getResend();
  const baseUrl = BASE_URL();
  const safeRepName = escapeHtml(args.repFirstName || "there");
  const safeBusiness = escapeHtml(args.businessName);
  const safeIndustry = args.industry ? escapeHtml(args.industry) : null;

  await resend.emails.send({
    from: FROM,
    to: args.to,
    subject: `Submission received — ${safeBusiness}`,
    html: emailWrapper(`
      <h2 style="font-family: Georgia, 'Playfair Display', serif; font-size: 24px; font-weight: 700; color: #111110; margin-bottom: 8px;">
        Got it, ${safeRepName}.
      </h2>
      <p style="color: #555553; font-size: 15px; line-height: 1.6;">
        We received your submission for <strong>${safeBusiness}</strong>${
          safeIndustry ? ` (${safeIndustry})` : ""
        }. The build is queued.
      </p>
      <div style="background: #ffffff; border: 1.5px solid #e8e6df; border-radius: 4px; padding: 18px 20px; margin: 24px 0;">
        <p style="font-size: 11px; color: #888886; text-transform: uppercase; letter-spacing: 0.08em; margin: 0 0 12px; font-weight: 600;">What happens next</p>
        <ol style="margin: 0; padding-left: 20px; color: #444442; font-size: 13px; line-height: 1.6;">
          <li>The site builds in the background (usually 15–30 minutes).</li>
          <li>You'll get a second email once it's ready for review.</li>
          <li>From your dashboard, you can preview the site and share it with the client — or flag any changes the client wants before going live.</li>
        </ol>
      </div>
      <div style="margin-top: 24px;">
        <a href="${baseUrl}/sales-rep" style="display: inline-block; background: #ff3d00; color: #fff; padding: 13px 32px; text-decoration: none; font-size: 15px; font-weight: 600; border-radius: 3px;">
          Open Your Dashboard
        </a>
      </div>
      <p style="margin-top: 24px; font-size: 12px; color: #888886; line-height: 1.6;">
        Sit tight — we'll be in touch soon.
      </p>
    `),
  });
}

/**
 * Sent to a sales rep when the admin marks one of their client's build
 * tasks as `complete`. Frames the message as "your client's site is ready
 * for review" with the deployed URL + WP admin URL + a CTA back to the
 * sales-rep dashboard. Replaces the generic sendStatusChangeEmail in this
 * specific case (status=complete + audience=sales_rep).
 */
export async function sendSalesRepCompletionEmail(args: {
  to: string;
  repFirstName: string;
  businessName: string;
  siteUrl: string | null;
  wpAdminUrl: string | null;
  notes?: string | null;
}): Promise<void> {
  const resend = getResend();
  const baseUrl = BASE_URL();
  const safeRepName = escapeHtml(args.repFirstName || "there");
  const safeBusiness = escapeHtml(args.businessName);

  const siteBlock = args.siteUrl
    ? `
      <div style="background: #ffffff; border: 1.5px solid #e8e6df; border-radius: 4px; padding: 20px; margin: 24px 0;">
        <p style="font-size: 11px; color: #888886; text-transform: uppercase; letter-spacing: 0.08em; margin: 0 0 8px; font-weight: 600;">Live site</p>
        <a href="${args.siteUrl}" style="color: #ff3d00; font-weight: 600; font-size: 16px; word-break: break-all;">${escapeHtml(args.siteUrl)}</a>
        ${
          args.wpAdminUrl
            ? `<p style="font-size: 12px; color: #888886; margin: 12px 0 4px; text-transform: uppercase; letter-spacing: 0.05em; font-weight: 600;">WordPress admin</p>
               <a href="${args.wpAdminUrl}" style="color: #555553; font-size: 13px; word-break: break-all; text-decoration: none;">${escapeHtml(args.wpAdminUrl)}</a>`
            : ""
        }
      </div>
    `
    : `
      <div style="background: #fff5f2; border: 1.5px solid #ffcdc0; border-radius: 4px; padding: 14px 18px; margin: 24px 0; font-size: 13px; color: #b3300a;">
        <strong>No site URL on file for this build.</strong> Check the admin tasks board for build details.
      </div>
    `;

  const notesBlock = args.notes
    ? `
      <div style="margin: 16px 0; padding: 12px 16px; background: #faf9f5; border-left: 3px solid #ff3d00; font-size: 13px; color: #555553;">
        <p style="font-size: 11px; color: #888886; text-transform: uppercase; letter-spacing: 0.05em; margin: 0 0 4px; font-weight: 600;">Notes from admin</p>
        <p style="margin: 0; line-height: 1.5; white-space: pre-wrap;">${escapeHtml(args.notes)}</p>
      </div>
    `
    : "";

  await resend.emails.send({
    from: FROM,
    to: args.to,
    subject: `Your client's site is ready — ${safeBusiness}`,
    html: emailWrapper(`
      <h2 style="font-family: Georgia, 'Playfair Display', serif; font-size: 24px; font-weight: 700; color: #111110; margin-bottom: 8px;">
        Site ready for client review
      </h2>
      <p style="color: #555553; font-size: 15px; line-height: 1.6;">
        Hi ${safeRepName}, the website for <strong>${safeBusiness}</strong> is built and live.
        Take a look, then share it with the client when you're ready.
      </p>
      ${siteBlock}
      ${notesBlock}
      <div style="margin-top: 24px;">
        <a href="${baseUrl}/sales-rep" style="display: inline-block; background: #ff3d00; color: #fff; padding: 13px 32px; text-decoration: none; font-size: 15px; font-weight: 600; border-radius: 3px;">
          View in Your Dashboard
        </a>
      </div>
      <p style="margin-top: 24px; font-size: 12px; color: #888886; line-height: 1.6;">
        From your dashboard you can post a comment or flag a change request
        if the client wants edits before going live on their domain.
      </p>
    `),
  });
}

export async function sendStatusChangeEmail(
  client: Client,
  task: Task,
  newStatus: TaskStatus,
  notes?: string,
  toOverride?: string,
): Promise<void> {
  const resend = getResend();
  const statusInfo = STATUS_MESSAGES[newStatus];
  const statusColor =
    newStatus === "blocked"
      ? "#ff6b35"
      : newStatus === "complete"
        ? "#4caf50"
        : newStatus === "review"
          ? "#7c4dff"
          : "#ff3d00";

  await resend.emails.send({
    from: FROM,
    to: toOverride || client.email,
    subject: `[Website Reveals] ${statusInfo.heading}: ${escapeHtml(task.title)}`,
    html: emailWrapper(`
      <h2 style="font-family: Georgia, 'Playfair Display', serif; font-size: 24px; font-weight: 700; color: #111110; margin-bottom: 8px;">${statusInfo.heading}</h2>
      <p style="color: #888886; font-size: 15px;">${statusInfo.message}</p>
      <div style="background: #ffffff; border: 1.5px solid #e8e6df; border-radius: 4px; padding: 20px; margin: 24px 0;">
        <h3 style="font-size: 16px; color: #111110; margin: 0 0 8px;">${escapeHtml(task.title)}</h3>
        <span style="display: inline-block; background: ${statusColor}; color: #fff; padding: 2px 10px; border-radius: 3px; font-size: 11px; text-transform: uppercase; letter-spacing: 0.06em; font-weight: 700;">
          ${newStatus.replace("_", " ")}
        </span>
        ${notes ? `<div style="margin-top: 16px; padding-top: 16px; border-top: 1.5px solid #e8e6df;"><p style="font-size: 11px; color: #888886; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 4px; font-weight: 600;">Notes</p><p style="font-size: 14px; color: #111110; line-height: 1.5;">${escapeHtml(notes)}</p></div>` : ""}
      </div>
      ${portalButton("View in Portal")}
      ${pinSection(client)}
    `),
  });
}

export async function sendCommentNotificationEmail(
  client: Client,
  task: Task,
  commentContent: string
): Promise<void> {
  const resend = getResend();
  await resend.emails.send({
    from: FROM,
    to: client.email,
    subject: `[Website Reveals] New update on: ${escapeHtml(task.title)}`,
    html: emailWrapper(`
      <h2 style="font-family: Georgia, 'Playfair Display', serif; font-size: 24px; font-weight: 700; color: #111110; margin-bottom: 8px;">New Update</h2>
      <p style="color: #888886; font-size: 15px;">There's a new comment on your task.</p>
      <div style="background: #ffffff; border: 1.5px solid #e8e6df; border-radius: 4px; padding: 20px; margin: 24px 0;">
        <h3 style="font-size: 16px; color: #111110; margin: 0 0 12px;">${escapeHtml(task.title)}</h3>
        <p style="font-size: 14px; color: #111110; line-height: 1.5; border-left: 3px solid #ff3d00; padding-left: 12px;">
          ${escapeHtml(commentContent)}
        </p>
      </div>
      ${portalButton("View & Reply")}
      ${pinSection(client)}
    `),
  });
}

export async function sendClientRequestNotification(
  client: Client,
  task: Task,
  commentContent: string
): Promise<void> {
  const resend = getResend();
  const adminEmail = process.env.AGENCY_EMAIL;
  if (!adminEmail) return;

  await resend.emails.send({
    from: FROM,
    to: adminEmail,
    subject: `[Client Request] ${escapeHtml(client.company_name)}: ${escapeHtml(task.title)}`,
    html: emailWrapper(`
      <h2 style="font-family: Georgia, 'Playfair Display', serif; font-size: 24px; font-weight: 700; color: #111110; margin-bottom: 8px;">Client Comment</h2>
      <p style="color: #888886; font-size: 15px;">
        <strong>${escapeHtml(client.first_name)} ${escapeHtml(client.last_name)}</strong> (${escapeHtml(client.company_name)}) commented on a task.
      </p>
      <div style="background: #ffffff; border: 1.5px solid #e8e6df; border-radius: 4px; padding: 20px; margin: 24px 0;">
        <h3 style="font-size: 16px; color: #111110; margin: 0 0 12px;">${escapeHtml(task.title)}</h3>
        <p style="font-size: 14px; color: #111110; line-height: 1.5; border-left: 3px solid #ff3d00; padding-left: 12px;">
          ${escapeHtml(commentContent)}
        </p>
      </div>
      <a href="${BASE_URL()}/admin/tasks?task=${task.id}" style="display: inline-block; background: #ff3d00; color: #fff; padding: 13px 32px; text-decoration: none; font-size: 15px; font-weight: 600; border-radius: 3px; margin-top: 16px;">
        View in Admin
      </a>
    `),
  });
}
