import type { ServiceItem } from "../types";

// Per-industry default services (gap 2) — used when a prospect's scraped services
// come up thin (<3) so a template never renders a sparse services section. Pure
// map keyed by the industry's sl_slug (= record.industry_slug). Covers the 6
// slugs SL is building templates for; add rows as SL ships more industries.
const SERVICES: Record<string, string[]> = {
  hvac: [
    "AC Repair",
    "AC Installation",
    "Heating Repair",
    "Furnace Installation",
    "Duct Cleaning",
    "HVAC Maintenance",
  ],
  "garage-door": [
    "Garage Door Repair",
    "Spring Replacement",
    "Opener Installation",
    "New Door Installation",
    "Off-Track Repair",
    "Maintenance Tune-Up",
  ],
  roofing: [
    "Roof Repair",
    "Roof Replacement",
    "New Roof Installation",
    "Storm Damage Repair",
    "Gutter Installation",
    "Roof Inspection",
  ],
  landscaping: [
    "Lawn Care",
    "Landscape Design",
    "Irrigation Installation",
    "Tree & Shrub Care",
    "Hardscaping",
    "Yard Cleanup",
  ],
  "pool-service": [
    "Pool Cleaning",
    "Pool Maintenance",
    "Equipment Repair",
    "Green Pool Recovery",
    "Filter Service",
    "Pool Inspection",
  ],
  fencing: [
    "Fence Installation",
    "Fence Repair",
    "Wood Fencing",
    "Vinyl Fencing",
    "Chain-Link Fencing",
    "Gate Installation",
  ],
};

/** Curated default services for an industry slug; [] when unknown. */
export function defaultServices(slug: string): ServiceItem[] {
  return (SERVICES[slug] ?? []).map((name) => ({ name }));
}
