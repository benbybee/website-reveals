import { Resend } from "resend";

// Rep escalation for the instant-preview loop (ADR 0007): email the submitting
// rep when their speculative preview goes live (with the URL) or fails. Pure
// builders are unit-tested; the send is best-effort and must never break the SL
// callback.

const FROM = "Website Reveals <creativemarketing@websitereveals.com>";

export interface RepBuildEmailContent {
  subject: string;
  html: string;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function wrapper(content: string): string {
  return `
    <div style="font-family: 'DM Sans','Helvetica Neue',Arial,sans-serif; max-width: 600px; margin: 0 auto; background: #faf9f5; color: #111110; padding: 40px;">
      <div style="border-bottom: 1.5px solid #e8e6df; padding-bottom: 20px; margin-bottom: 30px;">
        <h1 style="font-family: Georgia,'Playfair Display',serif; font-size: 20px; font-weight: 700; margin: 0;">Website Reveals</h1>
      </div>
      ${content}
      <div style="border-top: 1.5px solid #e8e6df; padding-top: 20px; margin-top: 30px; font-size: 12px; color: #888886;">
        <p>You're receiving this because you started this preview build in the Website Reveals rep portal.</p>
      </div>
    </div>`;
}

export function buildLiveEmail(args: {
  businessName: string;
  previewUrl: string;
  repName?: string;
}): RepBuildEmailContent {
  const name = escapeHtml(args.businessName || "the business");
  const url = args.previewUrl;
  const hi = args.repName ? `Hi ${escapeHtml(args.repName)}, ` : "";
  return {
    subject: `Your preview site is ready — ${args.businessName}`,
    html: wrapper(`
      <h2 style="font-family: Georgia,'Playfair Display',serif; font-size: 24px; font-weight: 700; margin: 0 0 8px;">Preview ready for ${name}</h2>
      <p style="color: #555; font-size: 15px; line-height: 1.6;">${hi}the speculative site you kicked off just went live. Share it on your next call.</p>
      <a href="${escapeHtml(url)}" style="display: inline-block; background: #ff3d00; color: #fff; padding: 13px 32px; text-decoration: none; font-size: 15px; font-weight: 600; border-radius: 3px; margin-top: 16px;">View the preview</a>
      <p style="color: #888886; font-size: 13px; margin-top: 16px; word-break: break-all;">${escapeHtml(url)}</p>
    `),
  };
}

export function buildFailedEmail(args: {
  businessName: string;
  error?: string;
  repName?: string;
}): RepBuildEmailContent {
  const name = escapeHtml(args.businessName || "the business");
  const hi = args.repName ? `Hi ${escapeHtml(args.repName)}, ` : "";
  const detail = args.error
    ? `<p style="color:#888886;font-size:13px;margin-top:12px;">Detail: ${escapeHtml(args.error)}</p>`
    : "";
  return {
    subject: `Preview build issue — ${args.businessName}`,
    html: wrapper(`
      <h2 style="font-family: Georgia,'Playfair Display',serif; font-size: 24px; font-weight: 700; margin: 0 0 8px;">We could not finish the preview for ${name}</h2>
      <p style="color: #555; font-size: 15px; line-height: 1.6;">${hi}the build failed. You can try again from the rep portal, or ask an admin to look into it.</p>
      ${detail}
    `),
  };
}

/** Best-effort send — never throw into the SL callback. */
export async function sendRepBuildEmail(to: string, content: RepBuildEmailContent): Promise<void> {
  const resend = new Resend(process.env.RESEND_API_KEY);
  await resend.emails.send({ from: FROM, to, subject: content.subject, html: content.html });
}
