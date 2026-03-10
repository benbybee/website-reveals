import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { getClients, createClient, getClientByEmail } from "@/lib/clients";
import { sendWelcomeEmail } from "@/lib/task-emails";

export async function GET() {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  try {
    const clients = await getClients();
    return NextResponse.json({ clients });
  } catch (err) {
    console.error("[admin/clients] GET error:", err);
    return NextResponse.json(
      { error: "Failed to fetch clients" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  try {
    const body = await req.json();
    const {
      first_name,
      last_name,
      company_name,
      email,
      phone,
      website_url,
      github_repo_url,
    } = body;

    if (!first_name || !last_name || !company_name || !email) {
      return NextResponse.json(
        {
          error:
            "first_name, last_name, company_name, and email are required",
        },
        { status: 400 }
      );
    }

    const existing = await getClientByEmail(email);
    if (existing) {
      return NextResponse.json(
        { error: "A client with this email already exists" },
        { status: 409 }
      );
    }

    const { client, pin } = await createClient({
      first_name,
      last_name,
      company_name,
      email: email.toLowerCase(),
      phone,
      website_url,
      github_repo_url,
    });

    try {
      await sendWelcomeEmail(client, pin);
    } catch (emailErr) {
      console.error("[admin/clients] Welcome email failed:", emailErr);
    }

    return NextResponse.json({ client, pin }, { status: 201 });
  } catch (err) {
    console.error("[admin/clients] POST error:", err);
    return NextResponse.json(
      { error: "Failed to create client" },
      { status: 500 }
    );
  }
}
