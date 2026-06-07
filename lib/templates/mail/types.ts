// Template Site GTM (postcards + CSV) — TS shapes for the mailing subsystem.
// Mirrors the tpl_postcard_designs / tpl_return_addresses / tpl_mailings tables.

import type { Address } from "@/lib/templates/types";

export type PostcardSize = "4x6" | "6x9" | "6x11";

export interface PostcardDesign {
  id: string;
  name: string;
  size: PostcardSize;
  front_url: string | null;
  back_url: string | null;
  merge_fields: string[];
  archived: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface ReturnAddress {
  id: string;
  label: string;
  name: string;
  address_line1: string;
  address_line2: string | null;
  city: string;
  state: string;
  zip: string;
  country: string;
  is_default: boolean;
  archived: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export type MailingStatus =
  | "queued"
  | "verified"
  | "undeliverable"
  | "sent"
  | "failed"
  | "suppressed";

export interface Mailing {
  id: string;
  prospect_id: string;
  campaign_id: string | null;
  design_id: string | null;
  return_address_id: string | null;
  status: MailingStatus;
  provider: string | null;
  provider_job_id: string | null;
  lob_id: string | null;
  tracking_url: string | null;
  address_snapshot: Address | null;
  preview_url_snapshot: string | null;
  cost_usd: number | null;
  error: string | null;
  qr_token: string | null;
  scan_count: number;
  first_scanned_at: string | null;
  last_scanned_at: string | null;
  created_at: string;
  sent_at: string | null;
}

// Lob `to`/`from` address shape (US). Maps from our CanonicalRecord Address.
export interface LobAddress {
  name: string;
  address_line1: string;
  address_line2?: string;
  address_city: string;
  address_state: string;
  address_zip: string;
  address_country: string;
}

export function toLobAddress(name: string, a: Address): LobAddress {
  return {
    name,
    address_line1: a.street,
    address_city: a.city,
    address_state: a.state,
    address_zip: a.zip,
    address_country: a.country || "US",
  };
}

export function returnToLobAddress(r: ReturnAddress): LobAddress {
  return {
    name: r.name,
    address_line1: r.address_line1,
    ...(r.address_line2 ? { address_line2: r.address_line2 } : {}),
    address_city: r.city,
    address_state: r.state,
    address_zip: r.zip,
    address_country: r.country || "US",
  };
}
