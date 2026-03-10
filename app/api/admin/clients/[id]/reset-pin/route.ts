import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { getClientById, resetClientPin } from "@/lib/clients";
import { sendPinResetEmail } from "@/lib/task-emails";

export async function POST(
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

    const pin = await resetClientPin(id);

    try {
      await sendPinResetEmail(client, pin);
    } catch (emailErr) {
      console.error("[admin/clients] PIN reset email failed:", emailErr);
    }

    return NextResponse.json({ ok: true, pin });
  } catch (err) {
    console.error("[admin/clients] PIN reset error:", err);
    return NextResponse.json(
      { error: "Failed to reset PIN" },
      { status: 500 }
    );
  }
}
