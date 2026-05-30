import type { CanonicalRecord } from "../types";

export interface PrepBrief {
  source_id: string;
  brief: {
    business: {
      name: string;
      industry?: string;
      industry_slug: string;
      description?: string;
      services?: { name: string; description?: string }[];
    };
    contact: {
      address: CanonicalRecord["address"];
      phone: string;
      email?: string;
      hours?: CanonicalRecord["hours"];
    };
    brand: { colors?: CanonicalRecord["brand_colors"] };
  };
  current_site_brand: { logo_url: string | null };
  stock_photos: { slot: string; src_url: string; alt: string }[];
}

/**
 * Map a canonical record into SL's `prep.brief.*` delivery shape (design §6).
 * kura_input is intentionally OMITTED — speculative Stage-1 records have no
 * owner contact yet; SL only needs it at Stage-2 conversion.
 */
export function toPrepBrief(r: CanonicalRecord): PrepBrief {
  return {
    source_id: r.source_id,
    brief: {
      business: {
        name: r.business_name,
        industry: r.industry_raw,
        industry_slug: r.industry_slug,
        description: r.description,
        services: r.services,
      },
      contact: {
        address: r.address,
        phone: r.phone,
        email: r.email,
        hours: r.hours,
      },
      brand: { colors: r.brand_colors },
    },
    current_site_brand: { logo_url: r.logo?.src_url ?? null },
    stock_photos: (r.photos ?? []).map((p) => ({
      slot: p.slot,
      src_url: p.src_url,
      alt: p.alt ?? "",
    })),
  };
}
