import { escapeHtml } from "@/lib/sanitize";

interface ProviderConfig {
  name: string;
  diySteps: string[];
  delegateSteps: string[];
}

const PROVIDERS: Record<string, ProviderConfig> = {
  godaddy: {
    name: "GoDaddy",
    diySteps: [
      "Log in to your GoDaddy account at godaddy.com",
      "Click your name in the top right &rarr; <strong>My Products</strong>",
      "Find your domain and click <strong>DNS</strong>",
      "Under &lsquo;A&rsquo; records, find the record pointing to your domain (usually <strong>@</strong> or blank host)",
      "Click the pencil/edit icon",
      "Change the &lsquo;Points to&rsquo; value to: <strong>{{IP}}</strong>",
      "Set TTL to <strong>1 Hour</strong>",
      "Click <strong>Save</strong>",
    ],
    delegateSteps: [
      "Log in to your GoDaddy account at godaddy.com",
      "Click your name in the top right &rarr; <strong>Account Settings</strong>",
      "Scroll down to <strong>Delegate Access</strong>",
      'Click <strong>Invite to Access</strong> (or follow <a href="https://www.godaddy.com/help/access-another-persons-account-as-a-delegate-12373" style="color:#ff3d00;font-weight:600;">these instructions</a>)',
      "Enter the email: <strong>{{DELEGATE_EMAIL}}</strong>",
      "Grant <strong>Products, Domains &amp; DNS</strong> permission",
      "Click <strong>Send Invite</strong>",
    ],
  },
  namecheap: {
    name: "Namecheap",
    diySteps: [
      "Log in at namecheap.com",
      "Click <strong>Domain List</strong> in the left sidebar",
      "Click <strong>Manage</strong> next to your domain",
      "Click the <strong>Advanced DNS</strong> tab",
      "Find the A Record with host <strong>@</strong>",
      "Click the edit icon (pencil)",
      "Change the &lsquo;Value&rsquo; to: <strong>{{IP}}</strong>",
      "Set TTL to <strong>Automatic</strong>",
      "Click the green checkmark to save",
    ],
    delegateSteps: [
      "Log in at namecheap.com",
      "Go to <strong>Profile</strong> &rarr; <strong>Sharing &amp; Transfer</strong>",
      "Click <strong>Share Account</strong>",
      "Enter: <strong>{{DELEGATE_EMAIL}}</strong>",
      "Grant <strong>Domain Management</strong> access",
    ],
  },
  cloudflare: {
    name: "Cloudflare",
    diySteps: [
      "Log in at dash.cloudflare.com",
      "Select your domain from the dashboard",
      "Click <strong>DNS</strong> in the left sidebar &rarr; <strong>Records</strong>",
      "Find the A record for your root domain (<strong>@</strong>)",
      "Click <strong>Edit</strong>",
      "Change the IPv4 address to: <strong>{{IP}}</strong>",
      "Set Proxy status to <strong>DNS only</strong> (grey cloud icon)",
      "Click <strong>Save</strong>",
    ],
    delegateSteps: [
      "Log in at dash.cloudflare.com",
      "Go to <strong>Manage Account</strong> &rarr; <strong>Members</strong>",
      "Click <strong>Invite</strong>",
      "Enter: <strong>{{DELEGATE_EMAIL}}</strong>",
      "Set role to <strong>Administrator</strong>",
      "Click <strong>Invite</strong>",
    ],
  },
  google: {
    name: "Google Domains / Squarespace DNS",
    diySteps: [
      "Log in at domains.squarespace.com (formerly Google Domains)",
      "Click your domain name",
      "Click <strong>DNS</strong> in the left panel",
      "Scroll to <strong>Custom records</strong>",
      "Find the A record with host <strong>@</strong>",
      "Click <strong>Edit</strong>",
      "Change the data/value to: <strong>{{IP}}</strong>",
      "Click <strong>Save</strong>",
    ],
    delegateSteps: [
      "Log in at domains.squarespace.com",
      "Click your domain &rarr; <strong>Domain permissions</strong>",
      "Click <strong>Add editor</strong>",
      "Enter: <strong>{{DELEGATE_EMAIL}}</strong>",
    ],
  },
  networksolutions: {
    name: "Network Solutions",
    diySteps: [
      "Log in at networksolutions.com",
      "Click <strong>My Domains</strong> &rarr; <strong>Manage</strong>",
      "Click <strong>Change Where Domain Points</strong>",
      "Select <strong>Advanced DNS</strong>",
      "Find the A record for your domain",
      "Edit the IP address to: <strong>{{IP}}</strong>",
      "Click <strong>Apply Changes</strong>",
    ],
    delegateSteps: [
      "Call Network Solutions support at <strong>1-866-391-4357</strong>",
      "Request to add <strong>{{DELEGATE_EMAIL}}</strong> as an authorized user on your account",
    ],
  },
  other: {
    name: "Your DNS Provider",
    diySteps: [
      "Log in to wherever you registered your domain",
      "Find the <strong>DNS management</strong> or <strong>DNS settings</strong> section",
      "Look for an <strong>A Record</strong> pointing to your root domain (<strong>@</strong>)",
      "Edit it and change the IP address / value to: <strong>{{IP}}</strong>",
      "Save the change",
    ],
    delegateSteps: [
      "Look for a &lsquo;Share access&rsquo; or &lsquo;Invite user&rsquo; option in your domain settings",
      "Add <strong>{{DELEGATE_EMAIL}}</strong> as an admin or manager",
      "If you can&rsquo;t find it, just reply to this email and we&rsquo;ll walk you through it",
    ],
  },
};

function renderSteps(steps: string[]): string {
  return steps
    .map(
      (step, i) => `
        <tr>
          <td style="padding: 10px 12px 10px 0; vertical-align: top; color: #ff3d00; font-weight: 700; font-size: 14px; width: 28px;">${i + 1}.</td>
          <td style="padding: 10px 0; color: #111110; font-size: 14px; line-height: 1.5; border-bottom: 1px solid #e8e6df;">${step}</td>
        </tr>
      `
    )
    .join("");
}

export function getDnsInstructions(
  provider: string,
  ipAddress: string,
  businessName: string
): string {
  const config = PROVIDERS[provider] || PROVIDERS.other;
  const delegateEmail = "creative@obsessionmarketing.com";

  const fillTemplate = (steps: string[]) =>
    steps.map((s) =>
      s.replace(/{{IP}}/g, ipAddress).replace(/{{DELEGATE_EMAIL}}/g, delegateEmail)
    );

  const diyHtml = renderSteps(fillTemplate(config.diySteps));
  const delegateHtml = renderSteps(fillTemplate(config.delegateSteps));

  return `
    <div style="font-family: 'DM Sans', 'Helvetica Neue', Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #faf9f5; color: #111110; padding: 40px;">

      <!-- Header -->
      <div style="border-bottom: 1.5px solid #e8e6df; padding-bottom: 20px; margin-bottom: 30px;">
        <h1 style="font-family: Georgia, 'Playfair Display', serif; font-size: 20px; font-weight: 700; color: #111110; margin: 0; letter-spacing: -0.01em;">Website Reveals</h1>
      </div>

      <!-- Intro -->
      <h2 style="font-family: Georgia, 'Playfair Display', serif; font-size: 24px; font-weight: 700; color: #111110; margin-bottom: 8px;">Point Your Domain</h2>
      <p style="color: #888886; font-size: 15px; line-height: 1.6; margin-bottom: 24px;">
        Hi ${escapeHtml(businessName)} team &mdash; to connect your domain to your new website, you have two options. Pick whichever is easier for you.
      </p>

      <!-- Option A: Delegate Access -->
      <div style="background: #ffffff; border: 1.5px solid #e8e6df; border-radius: 4px; padding: 24px; margin-bottom: 20px;">
        <div style="margin-bottom: 16px;">
          <span style="display: inline-block; background: #ff3d00; color: #fff; padding: 2px 10px; border-radius: 3px; font-size: 11px; text-transform: uppercase; letter-spacing: 0.06em; font-weight: 700;">Recommended</span>
        </div>
        <h3 style="font-family: Georgia, 'Playfair Display', serif; font-size: 18px; font-weight: 700; color: #111110; margin: 0 0 6px;">Option A: We do it for you</h3>
        <p style="color: #888886; font-size: 14px; line-height: 1.5; margin-bottom: 16px;">
          Give us delegate access to your ${config.name} account and we&rsquo;ll handle the DNS setup. You keep full ownership &mdash; we just get the permissions needed to make the change.
        </p>
        <table style="width: 100%; border-collapse: collapse;">
          ${delegateHtml}
        </table>
      </div>

      <!-- Option B: DIY -->
      <div style="background: #ffffff; border: 1.5px solid #e8e6df; border-radius: 4px; padding: 24px; margin-bottom: 24px;">
        <h3 style="font-family: Georgia, 'Playfair Display', serif; font-size: 18px; font-weight: 700; color: #111110; margin: 0 0 6px;">Option B: Do it yourself</h3>
        <p style="color: #888886; font-size: 14px; line-height: 1.5; margin-bottom: 16px;">
          If you&rsquo;re comfortable editing DNS records, here are the steps for ${config.name}.
        </p>

        <!-- IP Address Box -->
        <div style="background: #f4f3ee; border: 1.5px solid #e8e6df; border-radius: 4px; padding: 16px; margin-bottom: 16px;">
          <p style="font-size: 11px; color: #888886; text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 4px; font-weight: 600;">Your A Record IP Address</p>
          <p style="font-size: 24px; font-weight: 700; color: #ff3d00; letter-spacing: 0.1em; font-family: 'JetBrains Mono', monospace; margin: 0;">${ipAddress}</p>
        </div>

        <table style="width: 100%; border-collapse: collapse;">
          ${diyHtml}
        </table>
      </div>

      <!-- Propagation Note -->
      <div style="background: #f4f3ee; border-radius: 4px; padding: 16px; margin-bottom: 24px;">
        <p style="color: #888886; font-size: 13px; line-height: 1.5; margin: 0;">
          DNS changes typically take <strong style="color: #111110;">15 minutes to 2 hours</strong> to propagate worldwide. Questions? Just reply to this email.
        </p>
      </div>

      <!-- Footer -->
      <div style="border-top: 1.5px solid #e8e6df; padding-top: 20px; margin-top: 10px; font-size: 12px; color: #888886;">
        <p>You're receiving this because you submitted a website questionnaire with Website Reveals.</p>
      </div>
    </div>
  `;
}
