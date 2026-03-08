export interface FormSession {
  id: string;
  token: string;
  email: string | null;
  current_step: number;
  form_data: Record<string, unknown>;
  file_urls: string[];
  dns_provider: string | null;
  submitted_at: string | null;
  exported_at: string | null;
  expires_at: string;
  created_at: string;
}
