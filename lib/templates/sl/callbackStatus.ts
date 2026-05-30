export type TplProspectStage =
  | "scraped"
  | "enriching"
  | "qualified"
  | "incomplete"
  | "building"
  | "live"
  | "build_failed";

/**
 * Map an SL per-record build status to a tpl_prospects.stage. Returns null for
 * an unrecognized status so the caller can ignore it rather than corrupt state.
 */
export function slStatusToStage(status: string): TplProspectStage | null {
  switch (status) {
    case "queued":
    case "running":
    case "building":
      return "building";
    case "succeeded":
    case "live":
      return "live";
    case "failed":
    case "canceled":
    case "build_failed":
      return "build_failed";
    default:
      return null;
  }
}
