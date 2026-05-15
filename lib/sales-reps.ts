import { createServerClient } from "@/lib/supabase/server";

export interface SalesRep {
  id: string;
  email: string;
  first_name: string;
  last_name: string | null;
  pin: string;
  active: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Generate a 6-digit PIN. Plaintext storage — these are internal accounts,
 * the admin rotates via the dashboard if compromised.
 */
export function generateRepPin(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

export async function listSalesReps(): Promise<SalesRep[]> {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("sales_reps")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) {
    console.error("[sales-reps] list failed:", error.message);
    return [];
  }
  return (data || []) as SalesRep[];
}

export async function getSalesRepById(id: string): Promise<SalesRep | null> {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("sales_reps")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) {
    console.error("[sales-reps] getById failed:", error.message);
    return null;
  }
  return (data as SalesRep) || null;
}

export async function createSalesRep(input: {
  email: string;
  first_name: string;
  last_name?: string;
  notes?: string;
}): Promise<{ rep: SalesRep; pin: string }> {
  const supabase = createServerClient();
  const pin = generateRepPin();
  const { data, error } = await supabase
    .from("sales_reps")
    .insert({
      email: input.email.trim(),
      first_name: input.first_name.trim(),
      last_name: (input.last_name || "").trim() || null,
      notes: (input.notes || "").trim() || null,
      pin,
      active: true,
    })
    .select("*")
    .single();
  if (error || !data) {
    throw new Error(`Failed to create sales rep: ${error?.message || "unknown"}`);
  }
  return { rep: data as SalesRep, pin };
}

export async function updateSalesRep(
  id: string,
  patch: Partial<Pick<SalesRep, "email" | "first_name" | "last_name" | "active" | "notes">>,
): Promise<SalesRep | null> {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("sales_reps")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select("*")
    .single();
  if (error) {
    console.error("[sales-reps] update failed:", error.message);
    return null;
  }
  return data as SalesRep;
}

export async function resetSalesRepPin(id: string): Promise<{ rep: SalesRep; pin: string } | null> {
  const supabase = createServerClient();
  const pin = generateRepPin();
  const { data, error } = await supabase
    .from("sales_reps")
    .update({ pin, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select("*")
    .single();
  if (error || !data) {
    console.error("[sales-reps] reset pin failed:", error?.message);
    return null;
  }
  return { rep: data as SalesRep, pin };
}

export async function deleteSalesRep(id: string): Promise<boolean> {
  const supabase = createServerClient();
  const { error } = await supabase.from("sales_reps").delete().eq("id", id);
  if (error) {
    console.error("[sales-reps] delete failed:", error.message);
    return false;
  }
  return true;
}

/**
 * Scoped dashboard fetch for a sales rep:
 *   - clients explicitly assigned to this rep (clients.sales_rep_id = repId)
 *   - tasks for those clients
 *   - submissions (form_sessions) tied to those clients via form_session_token,
 *     plus any form_sessions historically tagged with sales_rep_id = repId
 *     (so old submissions appear even if a client record was never created)
 *
 * Authority of truth is `clients.sales_rep_id` — admin can reassign via the
 * client detail drawer and the rep dashboard updates accordingly.
 */
export async function getDashboardDataForRep(repId: string) {
  const supabase = createServerClient();

  const { data: clientRows } = await supabase
    .from("clients")
    .select(
      "id, first_name, last_name, company_name, email, form_session_token, website_url, created_at",
    )
    .eq("sales_rep_id", repId)
    .order("created_at", { ascending: false });
  const clients = clientRows || [];
  const clientIds = clients.map((c) => c.id as string);
  const clientTokens = clients
    .map((c) => c.form_session_token as string | null)
    .filter((t): t is string => Boolean(t));

  // Sessions either linked via client.form_session_token OR tagged historically with sales_rep_id
  let sessions: Array<Record<string, unknown>> = [];
  {
    const tokensInQuotes = clientTokens.length > 0;
    const orParts: string[] = [`sales_rep_id.eq.${repId}`];
    if (tokensInQuotes) {
      orParts.push(`token.in.(${clientTokens.join(",")})`);
    }
    const { data: sessionRows } = await supabase
      .from("form_sessions")
      .select("token, email, form_data, dns_provider, submitted_at, created_at")
      .or(orParts.join(","))
      .not("submitted_at", "is", null)
      .order("submitted_at", { ascending: false });
    sessions = sessionRows || [];
  }

  let tasks: Array<Record<string, unknown>> = [];
  if (clientIds.length > 0) {
    const { data: taskRows } = await supabase
      .from("tasks")
      .select(
        "*, client:clients(id, first_name, last_name, company_name, email)",
      )
      .in("client_id", clientIds)
      .is("parent_task_id", null)
      .order("created_at", { ascending: false });
    tasks = taskRows || [];
  }

  return { sessions, clients, tasks };
}
