import { createServerClient } from "@/lib/supabase/server";
import { tplDb } from "@/lib/templates/db";
import { hashPin } from "@/lib/pin";

export interface RepTemplateLead {
  id: string;
  source_id: string;
  business_name: string | null;
  city: string | null;
  state: string | null;
  phone: string | null;
  stage: string;
  preview_url: string | null;
  lookup_count: number;
  last_looked_up_at: string | null;
  click_count: number;
  last_clicked_at: string | null;
  sold_at: string | null;
}

/**
 * Template-pipeline leads (tpl_prospects) assigned to a rep, for the rep portal.
 * Uses the service-role client (tpl_* is service-role RLS). Most-engaged first.
 */
export async function getTemplateLeadsForRep(repId: string): Promise<RepTemplateLead[]> {
  const { data, error } = await tplDb()
    .from("tpl_prospects")
    .select(
      "id, source_id, business_name, city, state, phone, stage, preview_url, lookup_count, last_looked_up_at, click_count, last_clicked_at, sold_at",
    )
    .eq("sales_rep_id", repId)
    .order("click_count", { ascending: false })
    .order("last_clicked_at", { ascending: false, nullsFirst: false });
  if (error) {
    console.error("[sales-reps] getTemplateLeadsForRep failed:", error.message);
    return [];
  }
  return (data || []) as RepTemplateLead[];
}

export interface SalesRep {
  id: string;
  email: string;
  first_name: string;
  last_name: string | null;
  pin: string | null;     // transient plaintext (cleared after admin views it)
  pin_hash: string;        // authoritative
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

export interface SalesRepClientSummary {
  id: string;
  first_name: string;
  last_name: string;
  company_name: string;
  email: string;
  website_url: string | null;
  created_at: string;
}

/**
 * Returns a map from sales_rep.id → list of clients currently assigned
 * to that rep. Used by the admin /admin/sales-reps page to show per-rep
 * client counts and an inline list on expand.
 */
export async function getClientsBySalesRep(): Promise<Record<string, SalesRepClientSummary[]>> {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("clients")
    .select("id, first_name, last_name, company_name, email, website_url, created_at, sales_rep_id")
    .not("sales_rep_id", "is", null)
    .order("created_at", { ascending: false });
  if (error) {
    console.error("[sales-reps] getClientsBySalesRep failed:", error.message);
    return {};
  }
  const map: Record<string, SalesRepClientSummary[]> = {};
  for (const c of data || []) {
    const repId = c.sales_rep_id as string;
    (map[repId] ||= []).push({
      id: c.id,
      first_name: c.first_name,
      last_name: c.last_name,
      company_name: c.company_name,
      email: c.email,
      website_url: c.website_url,
      created_at: c.created_at,
    });
  }
  return map;
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
  const pin_hash = hashPin(pin);
  const { data, error } = await supabase
    .from("sales_reps")
    .insert({
      email: input.email.trim(),
      first_name: input.first_name.trim(),
      last_name: (input.last_name || "").trim() || null,
      notes: (input.notes || "").trim() || null,
      pin,             // transient — admin sees once, can be cleared later
      pin_hash,
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
  const pin_hash = hashPin(pin);
  const { data, error } = await supabase
    .from("sales_reps")
    .update({ pin, pin_hash, updated_at: new Date().toISOString() })
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
      .is("archived_at", null)
      .order("created_at", { ascending: false });
    tasks = taskRows || [];
  }

  return { sessions, clients, tasks };
}
