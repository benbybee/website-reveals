import { createServerClient } from "@/lib/supabase/server";
import { generatePin, hashPin } from "@/lib/pin";
import type { Client } from "@/lib/types/client-tasks";

export async function createClient(data: {
  first_name: string;
  last_name: string;
  company_name: string;
  phone?: string;
  email: string;
  website_url?: string;
  github_repo_url?: string;
  form_session_token?: string;
}): Promise<{ client: Client; pin: string }> {
  const supabase = createServerClient();
  const pin = generatePin();
  const pin_hash = hashPin(pin);

  const { data: client, error } = await supabase
    .from("clients")
    .insert({
      first_name: data.first_name,
      last_name: data.last_name,
      company_name: data.company_name,
      pin_hash,
      pin,
      email: data.email.toLowerCase(),
      phone: data.phone || null,
      website_url: data.website_url || null,
      github_repo_url: data.github_repo_url || null,
      form_session_token: data.form_session_token || null,
    })
    .select()
    .single();

  if (error) throw new Error(`Failed to create client: ${error.message}`);
  return { client: client as Client, pin };
}

export async function getClients(): Promise<Client[]> {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("clients")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) throw new Error(`Failed to fetch clients: ${error.message}`);
  return (data || []) as Client[];
}

export async function getClientById(id: string): Promise<Client | null> {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("clients")
    .select("*")
    .eq("id", id)
    .single();

  if (error) return null;
  return data as Client;
}

export async function getClientByEmail(
  email: string
): Promise<Client | null> {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("clients")
    .select("*")
    .eq("email", email.toLowerCase())
    .single();

  if (error) return null;
  return data as Client;
}

export async function updateClient(
  id: string,
  data: Partial<Omit<Client, "id" | "created_at" | "pin_hash">>
): Promise<Client> {
  const supabase = createServerClient();
  const { data: client, error } = await supabase
    .from("clients")
    .update({ ...data, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select()
    .single();

  if (error) throw new Error(`Failed to update client: ${error.message}`);
  return client as Client;
}

export async function resetClientPin(id: string): Promise<string> {
  const supabase = createServerClient();
  const pin = generatePin();
  const pin_hash = hashPin(pin);

  const { error } = await supabase
    .from("clients")
    .update({ pin_hash, pin, updated_at: new Date().toISOString() })
    .eq("id", id);

  if (error) throw new Error(`Failed to reset PIN: ${error.message}`);
  return pin;
}

export async function deleteClient(id: string): Promise<void> {
  const supabase = createServerClient();
  const { error } = await supabase.from("clients").delete().eq("id", id);

  if (error) throw new Error(`Failed to delete client: ${error.message}`);
}
