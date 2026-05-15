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
 * Scoped dashboard fetch: form_sessions submitted by this rep, plus
 * the linked clients and tasks. Used by the sales-rep dashboard page.
 */
export async function getDashboardDataForRep(repId: string) {
  const supabase = createServerClient();

  const { data: sessions } = await supabase
    .from("form_sessions")
    .select("token, email, form_data, dns_provider, submitted_at, created_at")
    .eq("sales_rep_id", repId)
    .not("submitted_at", "is", null)
    .order("submitted_at", { ascending: false });

  const tokens = (sessions || []).map((s) => s.token);

  // Tasks linked to clients whose form_session_token matches our tokens
  let tasks: Array<Record<string, unknown>> = [];
  let clients: Array<Record<string, unknown>> = [];
  if (tokens.length > 0) {
    const { data: clientRows } = await supabase
      .from("clients")
      .select("id, first_name, last_name, company_name, email, form_session_token, website_url, created_at")
      .in("form_session_token", tokens);
    clients = clientRows || [];

    const clientIds = clients.map((c) => c.id as string);
    if (clientIds.length > 0) {
      const { data: taskRows } = await supabase
        .from("tasks")
        .select(
          "*, client:clients(id, first_name, last_name, company_name, email)"
        )
        .in("client_id", clientIds)
        .is("parent_task_id", null)
        .order("created_at", { ascending: false });
      tasks = taskRows || [];
    }
  }

  return {
    sessions: sessions || [],
    clients,
    tasks,
  };
}
