// QR scan tracking helpers. Each postcard carries a tracked QR pointing at our
// own redirect (/r/<token>) rather than the bare preview URL, so we can attribute
// a scan to a specific mailed card before forwarding the recipient to their
// preview. The token is opaque and random (not a guessable prospect id) so the
// printed link can't be enumerated.

import { randomBytes } from "node:crypto";

// 9 random bytes -> 12 URL-safe chars. Plenty of entropy for the volumes here,
// short enough to keep the QR low-density and easy to scan off paper.
export function generateQrToken(): string {
  return randomBytes(9).toString("base64url");
}

export function qrBaseUrl(): string {
  return (process.env.NEXT_PUBLIC_BASE_URL || "https://www.websitereveals.com").replace(/\/+$/, "");
}

export function qrTrackingUrl(token: string): string {
  return `${qrBaseUrl()}/r/${token}`;
}
