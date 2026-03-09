import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/admin-auth";
import { FORM_STEPS } from "@/lib/form-steps";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  const { token } = await params;
  const supabase = createServerClient();

  const { data: session, error } = await supabase
    .from("form_sessions")
    .select("*")
    .eq("token", token)
    .single();

  if (error || !session) {
    return new NextResponse("Session not found", { status: 404 });
  }

  const formData = (session.form_data as Record<string, unknown>) || {};
  const submittedAt = session.submitted_at
    ? new Date(session.submitted_at as string).toLocaleString("en-US", { dateStyle: "long", timeStyle: "short" })
    : "Not yet submitted";

  const lines: string[] = [];

  lines.push(`# Client Brief`);
  lines.push(`Submitted: ${submittedAt}`);
  if (session.email) lines.push(`Client email: ${session.email}`);
  lines.push("");

  for (const step of FORM_STEPS) {
    const stepAnswers = step.questions
      .map((q) => {
        const val = formData[q.id];
        if (val === undefined || val === null || val === "") return null;
        const display = Array.isArray(val) ? (val as string[]).join(", ") : String(val);
        return `${q.label}\n${display}`;
      })
      .filter(Boolean);

    if (stepAnswers.length === 0) continue;

    lines.push(`## ${step.title}`);
    lines.push("");
    stepAnswers.forEach((a) => {
      lines.push(a as string);
      lines.push("");
    });
  }

  const markdown = lines.join("\n");

  return new NextResponse(markdown, {
    status: 200,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Content-Disposition": `attachment; filename="client-brief-${token.slice(0, 8)}.txt"`,
    },
  });
}
