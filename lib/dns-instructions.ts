import { escapeHtml } from "@/lib/sanitize";

const PROVIDERS: Record<string, { name: string; steps: string[] }> = {
  godaddy: {
    name: "GoDaddy",
    steps: [
      "Log in to your GoDaddy account at godaddy.com",
      "Click your name in the top right &rarr; My Products",
      "Find your domain and click <strong>DNS</strong>",
      "Under 'A' records, find the record pointing to your domain (usually @ or blank host)",
      "Click the pencil/edit icon",
      "Change the 'Points to' value to: <strong>{{IP}}</strong>",
      "Set TTL to 1 hour (600 seconds)",
      "Click Save",
      '<strong>Grant us delegate access:</strong> Follow <a href="https://www.godaddy.com/help/access-another-persons-account-as-a-delegate-12373" style="color:#3b82f6;">these instructions</a> to add <strong>creative@obsessionmarketing.com</strong> as a delegate with <strong>Domains</strong> permission',
    ],
  },
  namecheap: {
    name: "Namecheap",
    steps: [
      "Log in at namecheap.com",
      "Click Domain List in the left sidebar",
      "Click <strong>Manage</strong> next to your domain",
      "Click the <strong>Advanced DNS</strong> tab",
      "Find the A Record with host '@'",
      "Click the edit icon (pencil)",
      "Change the 'Value' to: <strong>{{IP}}</strong>",
      "Set TTL to Automatic",
      "Click the green checkmark to save",
      "To share access: Go to Profile &rarr; Sharing &amp; Transfer &rarr; Share this account with <strong>creative@obsessionmarketing.com</strong>",
    ],
  },
  cloudflare: {
    name: "Cloudflare",
    steps: [
      "Log in at dash.cloudflare.com",
      "Select your domain from the dashboard",
      "Click <strong>DNS</strong> in the left sidebar",
      "Click <strong>Records</strong>",
      "Find the A record for your root domain (@)",
      "Click <strong>Edit</strong>",
      "Change the IPv4 address to: <strong>{{IP}}</strong>",
      "Set Proxy status to <strong>DNS only</strong> (grey cloud icon)",
      "Click <strong>Save</strong>",
      "To grant access: Go to Manage Account &rarr; Members &rarr; Invite <strong>creative@obsessionmarketing.com</strong> as Administrator",
    ],
  },
  google: {
    name: "Google Domains / Squarespace DNS",
    steps: [
      "Log in at domains.squarespace.com (formerly Google Domains)",
      "Click your domain name",
      "Click <strong>DNS</strong> in the left panel",
      "Scroll to <strong>Custom records</strong>",
      "Find the A record with host '@'",
      "Click <strong>Edit</strong>",
      "Change the data/value to: <strong>{{IP}}</strong>",
      "Click <strong>Save</strong>",
      "To share access: Scroll to Domain permissions &rarr; Add <strong>creative@obsessionmarketing.com</strong> as an editor",
    ],
  },
  networksolutions: {
    name: "Network Solutions",
    steps: [
      "Log in at networksolutions.com",
      "Click <strong>My Domains</strong>",
      "Click <strong>Manage</strong> next to your domain",
      "Click <strong>Change Where Domain Points</strong>",
      "Select <strong>Advanced DNS</strong>",
      "Find the A record for your domain",
      "Edit the IP address to: <strong>{{IP}}</strong>",
      "Click <strong>Apply Changes</strong>",
      "For access delegation, call Network Solutions support or add <strong>creative@obsessionmarketing.com</strong> as an authorized user on your account",
    ],
  },
  other: {
    name: "Your DNS Provider",
    steps: [
      "Log in to wherever you registered your domain",
      "Find the DNS management or DNS settings section",
      "Look for an <strong>A Record</strong> pointing to your root domain (@)",
      "Edit it and change the IP address / value to: <strong>{{IP}}</strong>",
      "Save the change",
      "Grant us access by adding <strong>creative@obsessionmarketing.com</strong> as an admin or developer on your account, or email us at <strong>{{AGENCY_EMAIL}}</strong> with a screenshot of your DNS settings so we can assist",
    ],
  },
};

export function getDnsInstructions(
  provider: string,
  ipAddress: string,
  businessName: string
): string {
  const config = PROVIDERS[provider] || PROVIDERS.other;
  const agencyEmail = process.env.AGENCY_EMAIL || "creativemarketing@websitereveals.com";

  const stepsHtml = config.steps
    .map((step, i) => {
      const filled = step
        .replace(/{{IP}}/g, ipAddress)
        .replace(/{{AGENCY_EMAIL}}/g, agencyEmail);
      return `
        <li style="padding:12px 0;border-bottom:1px solid rgba(255,255,255,0.06);color:#e2e8f0;">
          <span style="color:#3b82f6;font-weight:700;margin-right:12px;">${i + 1}.</span>
          ${filled}
        </li>
      `;
    })
    .join("");

  return `
    <div style="font-family:sans-serif;max-width:600px;margin:0 auto;background:#0a0a0f;color:#f8fafc;padding:40px;border-radius:12px;">
      <div style="margin-bottom:32px;">
        <p style="color:#3b82f6;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:2px;margin-bottom:8px;">Obsession Marketing</p>
        <h1 style="font-size:28px;font-weight:800;margin-bottom:12px;">Point Your Domain</h1>
        <p style="color:#94a3b8;">Hi ${escapeHtml(businessName)} team &mdash; here are the steps to connect your domain to your new website on <strong>${config.name}</strong>.</p>
      </div>

      <div style="background:rgba(59,130,246,0.1);border:1px solid rgba(59,130,246,0.3);border-radius:8px;padding:16px;margin-bottom:32px;">
        <p style="color:#94a3b8;font-size:12px;margin-bottom:4px;">Your A Record IP Address</p>
        <p style="color:#3b82f6;font-size:24px;font-weight:700;letter-spacing:2px;">${ipAddress}</p>
      </div>

      <ol style="list-style:none;padding:0;margin:0;">
        ${stepsHtml}
      </ol>

      <div style="margin-top:32px;padding:20px;background:rgba(255,255,255,0.04);border-radius:8px;">
        <p style="color:#94a3b8;font-size:14px;">
          DNS changes typically take <strong style="color:#f8fafc">15 minutes to 2 hours</strong> to propagate worldwide.<br/><br/>
          Questions? Reply to this email or contact us at <a href="mailto:${agencyEmail}" style="color:#3b82f6;">${agencyEmail}</a>
        </p>
      </div>
    </div>
  `;
}
