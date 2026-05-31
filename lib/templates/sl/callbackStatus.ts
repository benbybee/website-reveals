export type TplProspectStage =
  | "scraped"
  | "enriching"
  | "qualified"
  | "incomplete"
  | "building"
  | "live"
  | "build_failed";

/**
 * Map an SL per-build callback status to a tpl_prospects.stage. SL emits exactly
 * one of: queued | running | succeeded | failed | canceled (succeeded is terminal).
 * Returns null for anything else so the caller can ack-and-ignore rather than
 * corrupt state.
 */
export function slStatusToStage(status: string): TplProspectStage | null {
  switch (status) {
    case "queued":
    case "running":
      return "building";
    case "succeeded":
      return "live";
    case "failed":
    case "canceled":
      return "build_failed";
    default:
      return null;
  }
}
