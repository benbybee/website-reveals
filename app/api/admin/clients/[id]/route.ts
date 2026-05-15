import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { getClientById, updateClient, deleteClient } from "@/lib/clients";
import { logAudit } from "@/lib/audit-log";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  const { id } = await params;

  try {
    const client = await getClientById(id);
    if (!client)
      return NextResponse.json(
        { error: "Client not found" },
        { status: 404 }
      );
    return NextResponse.json({ client });
  } catch (err) {
    console.error("[admin/clients] GET error:", err);
    return NextResponse.json(
      { error: "Failed to fetch client" },
      { status: 500 }
    );
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  const { id } = await params;

  try {
    const body = await req.json();
    const prior = await getClientById(id);
    const client = await updateClient(id, body);

    // Audit any sales-rep reassignment specifically; otherwise log a generic update
    if (Object.prototype.hasOwnProperty.call(body, "sales_rep_id")) {
      void logAudit({
        actor_type: "admin",
        actor_id: auth.user?.email || null,
        action: "client.sales_rep_changed",
        target_type: "client",
        target_id: id,
        details: {
          from: prior?.sales_rep_id || null,
          to: body.sales_rep_id || null,
        },
      });
    } else {
      void logAudit({
        actor_type: "admin",
        actor_id: auth.user?.email || null,
        action: "client.updated",
        target_type: "client",
        target_id: id,
        details: { fields: Object.keys(body) },
      });
    }

    return NextResponse.json({ client });
  } catch (err) {
    console.error("[admin/clients] PUT error:", err);
    return NextResponse.json(
      { error: "Failed to update client" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  const { id } = await params;

  try {
    await deleteClient(id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[admin/clients] DELETE error:", err);
    return NextResponse.json(
      { error: "Failed to delete client" },
      { status: 500 }
    );
  }
}
