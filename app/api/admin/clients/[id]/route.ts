import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { getClientById, updateClient, deleteClient } from "@/lib/clients";

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
    const client = await updateClient(id, body);
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
