import { createServerClient } from "@/lib/supabase/server";

export type ActorType = "admin" | "sales_rep" | "client" | "system" | "sl";

export interface AuditEntry {
  actor_type: ActorType;
  actor_id?: string | null;
  action: string;
  target_type?: string | null;
  target_id?: string | null;
  details?: Record<string, unknown> | null;
}

/**
 * Write an audit log row. Fire-and-forget — errors are logged but never
 * thrown, so a failure here can't break the user action that triggered it.
 */
export async function logAudit(entry: AuditEntry): Promise<void> {
  try {
    const supabase = createServerClient();
    const { error } = await supabase.from("audit_log").insert({
      actor_type: entry.actor_type,
      actor_id: entry.actor_id ?? null,
      action: entry.action,
      target_type: entry.target_type ?? null,
      target_id: entry.target_id ?? null,
      details: entry.details ?? null,
    });
    if (error) {
      console.error("[audit] insert failed:", error.message, entry);
    }
  } catch (err) {
    console.error("[audit] unexpected error:", err);
  }
}

export interface AuditQuery {
  action?: string;
  target_type?: string;
  target_id?: string;
  actor_type?: ActorType;
  limit?: number;
}

export async function listAuditEntries(q: AuditQuery = {}) {
  const supabase = createServerClient();
  let query = supabase
    .from("audit_log")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(q.limit ?? 200);
  if (q.action) query = query.eq("action", q.action);
  if (q.target_type) query = query.eq("target_type", q.target_type);
  if (q.target_id) query = query.eq("target_id", q.target_id);
  if (q.actor_type) query = query.eq("actor_type", q.actor_type);
  const { data, error } = await query;
  if (error) {
    console.error("[audit] list failed:", error.message);
    return [];
  }
  return data || [];
}
