import { createServerClient } from "@/lib/supabase/server";

export type NotificationAudience = "client" | "sales_rep" | "admin";

export const AUDIENCE_LABELS: Record<NotificationAudience, string> = {
  client: "Clients",
  sales_rep: "Sales Reps",
  admin: "Admin",
};

export const AUDIENCE_DESCRIPTIONS: Record<NotificationAudience, string> = {
  client:
    "Emails to the end client: welcome PIN, DNS instructions, task-complete (site ready), task comments, status changes.",
  sales_rep:
    "Emails to the sales agent who submitted on behalf of a client via /sales: same set as Clients, just routed to the agent's address.",
  admin:
    "Internal notifications: agency questionnaire summary, creative@ alerts, Telegram messages, build-status emails to the notify list.",
};

const ALL_AUDIENCES: NotificationAudience[] = ["client", "sales_rep", "admin"];

/**
 * Returns true if the given audience's notifications are enabled.
 * Defaults to true on any error / missing row so a misconfigured DB
 * never silently swallows notifications.
 */
export async function isNotificationEnabled(audience: NotificationAudience): Promise<boolean> {
  try {
    const supabase = createServerClient();
    const { data, error } = await supabase
      .from("notification_settings")
      .select("enabled")
      .eq("audience", audience)
      .maybeSingle();
    if (error) {
      console.error(`[notify] lookup error for ${audience}:`, error.message);
      return true;
    }
    return data?.enabled !== false;
  } catch (err) {
    console.error(`[notify] unexpected error for ${audience}:`, err);
    return true;
  }
}

/**
 * Determine which "client-facing" audience to gate by for a given submission
 * source. /sales submissions are routed to "sales_rep"; everything else to
 * "client".
 */
export function audienceForSubmission(source: string | null | undefined): "client" | "sales_rep" {
  return source === "sales" ? "sales_rep" : "client";
}

/**
 * For task-based emails (sendStatusChangeEmail etc.) we don't always know the
 * source at call time. Look up the client's form_session to derive it.
 * Falls back to "client" if no session/source is found.
 */
export async function audienceForClientId(clientId: string): Promise<"client" | "sales_rep"> {
  try {
    const supabase = createServerClient();
    const { data: client } = await supabase
      .from("clients")
      .select("form_session_token")
      .eq("id", clientId)
      .maybeSingle();
    if (!client?.form_session_token) return "client";

    const { data: session } = await supabase
      .from("form_sessions")
      .select("form_data")
      .eq("token", client.form_session_token)
      .maybeSingle();
    const source = (session?.form_data as Record<string, unknown> | null)?._source as string | undefined;
    return audienceForSubmission(source);
  } catch (err) {
    console.error(`[notify] audienceForClientId failed for ${clientId}:`, err);
    return "client";
  }
}

export async function getAllNotificationSettings() {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("notification_settings")
    .select("*")
    .order("audience");
  if (error) {
    console.error("[notify] getAllNotificationSettings failed:", error.message);
    return ALL_AUDIENCES.map((a) => ({ audience: a, enabled: true, updated_at: null as string | null }));
  }
  return data || [];
}

export async function setNotificationEnabled(audience: NotificationAudience, enabled: boolean) {
  const supabase = createServerClient();
  return supabase
    .from("notification_settings")
    .update({ enabled, updated_at: new Date().toISOString() })
    .eq("audience", audience);
}
