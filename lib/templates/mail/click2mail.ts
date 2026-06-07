// Click2Mail MOL Pro REST client (no SDK — HTTP Basic auth via fetch). Unlike
// Lob's per-card create, Click2Mail is a BATCH/job model: upload a document, push
// an address list (with variable-data mapping incl. a native QR field), create a
// job, then submit it. CASS/NCOA cleansing and IMb tracking are applied by C2M on
// submission. A stage-rest.click2mail.com base URL is the sandbox (no real mail).
//
// Responses are XML. We extract only the few scalar fields we need with a small
// tag reader rather than pulling in an XML parser dependency.
//
// NOTE: the documented endpoints (/documents, /addressLists, /jobs) and request
// fields are implemented below. The exact enum VALUES marked "CONFIRM IN SANDBOX"
// (postcard documentClass strings, mailClass, layout, the addressList mapping
// payload) are Click2Mail account/catalog specifics that must be validated with a
// sandbox dry run before the first live send. They are centralized here so that
// validation is a one-file change.

import { C2M_BASE_URL, C2M_USERNAME, C2M_PASSWORD } from "@/lib/templates/config";

function authHeader(): string {
  return "Basic " + Buffer.from(`${C2M_USERNAME()}:${C2M_PASSWORD()}`).toString("base64");
}

async function c2mFetch(path: string, init: RequestInit): Promise<Response> {
  if (!C2M_USERNAME() || !C2M_PASSWORD()) throw new Error("click2mail_not_configured");
  return fetch(`${C2M_BASE_URL()}${path}`, {
    ...init,
    headers: {
      Authorization: authHeader(),
      Accept: "application/xml",
      ...(init.headers ?? {}),
    },
  });
}

// Minimal XML scalar extractor for the flat <field>value</field> responses C2M
// returns. Returns the first match's inner text, or null.
export function xmlField(body: string, tag: string): string | null {
  const m = body.match(new RegExp(`<${tag}>\\s*([\\s\\S]*?)\\s*</${tag}>`, "i"));
  return m ? m[1].trim() : null;
}

// Our postcard sizes -> Click2Mail documentClass. CONFIRM IN SANDBOX: the exact
// catalog strings; these mirror C2M's "<Type> <W> x <H>" documentClass convention
// (e.g. the documented "Letter 8.5 x 11").
const DOCUMENT_CLASS_BY_SIZE: Record<string, string> = {
  "4x6": "Postcard 4.25 x 6",
  "6x9": "Postcard 6 x 9",
  "6x11": "Postcard 6 x 11",
};

export function documentClassForSize(size: string): string {
  return DOCUMENT_CLASS_BY_SIZE[size] ?? DOCUMENT_CLASS_BY_SIZE["4x6"];
}

// CONFIRM IN SANDBOX. First-class mail gives fastest delivery for cold outreach;
// productionTime "1" = next-day print tier.
export const C2M_MAIL_CLASS = "First Class";
export const C2M_PRODUCTION_TIME = "1";

export interface C2mDocument {
  id: string;
  pages: number | null;
}

// Upload artwork to C2M as a document. We stream the bytes of an already-hosted
// asset (our design's public URL) into the multipart body.
export async function uploadDocument(opts: {
  name: string;
  size: string;
  assetUrl: string;
}): Promise<C2mDocument> {
  const assetRes = await fetch(opts.assetUrl);
  if (!assetRes.ok) throw new Error(`c2m_asset_fetch_failed: HTTP ${assetRes.status}`);
  const contentType = assetRes.headers.get("content-type") ?? "application/pdf";
  const bytes = await assetRes.arrayBuffer();
  const format = formatFromContentType(contentType);

  const form = new FormData();
  form.append("documentName", opts.name);
  form.append("documentFormat", format);
  form.append("documentClass", documentClassForSize(opts.size));
  form.append("file", new Blob([bytes], { type: contentType }), `${sanitize(opts.name)}.${format}`);

  const res = await c2mFetch("/documents", { method: "POST", body: form });
  const body = await res.text();
  if (!res.ok) throw new Error(`c2m_document_failed: HTTP ${res.status} ${xmlField(body, "message") ?? ""}`.trim());
  const id = xmlField(body, "id") ?? xmlField(body, "document_id");
  if (!id) throw new Error("c2m_document_no_id");
  const pages = xmlField(body, "pages");
  return { id, pages: pages ? Number(pages) : null };
}

export interface C2mAddressList {
  id: string;
  status: string | null;
}

// Create an address list from a CSV. The first row is the header; `mapping`
// declares which columns are the postal fields vs. variable-data merge fields.
// CONFIRM IN SANDBOX: the exact mapping field name/shape C2M expects.
export async function createAddressList(opts: {
  name: string;
  csv: string;
  mapping: Record<string, string>;
}): Promise<C2mAddressList> {
  const form = new FormData();
  form.append("addressListName", opts.name);
  form.append("addressMappingId", "custom");
  form.append("mapping", JSON.stringify(opts.mapping));
  form.append("file", new Blob([opts.csv], { type: "text/csv" }), `${sanitize(opts.name)}.csv`);

  const res = await c2mFetch("/addressLists", { method: "POST", body: form });
  const body = await res.text();
  if (!res.ok) throw new Error(`c2m_addresslist_failed: HTTP ${res.status} ${xmlField(body, "message") ?? ""}`.trim());
  const id = xmlField(body, "id") ?? xmlField(body, "address_id");
  if (!id) throw new Error("c2m_addresslist_no_id");
  return { id, status: xmlField(body, "status") };
}

export interface C2mJob {
  id: string;
  status: string | null;
  cost: number | null;
}

// Create a job pairing a document with an address list. Starts in EDITING.
export async function createJob(opts: {
  name: string;
  documentId: string;
  addressListId: string;
  size: string;
}): Promise<C2mJob> {
  const form = new FormData();
  form.append("jobName", opts.name);
  form.append("documentClass", documentClassForSize(opts.size));
  form.append("layout", "Postcard");
  form.append("productionTime", C2M_PRODUCTION_TIME);
  form.append("mailClass", C2M_MAIL_CLASS);
  form.append("documentId", opts.documentId);
  form.append("addressId", opts.addressListId);

  const res = await c2mFetch("/jobs", { method: "POST", body: form });
  const body = await res.text();
  if (!res.ok) throw new Error(`c2m_job_failed: HTTP ${res.status} ${xmlField(body, "message") ?? ""}`.trim());
  const id = xmlField(body, "id") ?? xmlField(body, "job_id");
  if (!id) throw new Error("c2m_job_no_id");
  return { id, status: xmlField(body, "status"), cost: parseCost(body) };
}

// Submit a created job for production. Returns the post-submit status.
export async function submitJob(jobId: string): Promise<C2mJob> {
  const res = await c2mFetch(`/jobs/${encodeURIComponent(jobId)}/submit`, { method: "POST" });
  const body = await res.text();
  if (!res.ok) throw new Error(`c2m_submit_failed: HTTP ${res.status} ${xmlField(body, "message") ?? ""}`.trim());
  return { id: jobId, status: xmlField(body, "status"), cost: parseCost(body) };
}

function parseCost(body: string): number | null {
  const c = xmlField(body, "cost") ?? xmlField(body, "totalCost");
  if (!c) return null;
  const n = Number(c.replace(/[^0-9.]/g, ""));
  return Number.isFinite(n) ? n : null;
}

function formatFromContentType(ct: string): string {
  if (ct.includes("pdf")) return "pdf";
  if (ct.includes("png")) return "png";
  if (ct.includes("jpeg") || ct.includes("jpg")) return "jpeg";
  return "pdf";
}

function sanitize(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "c2m";
}
