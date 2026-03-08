import { notFound, redirect } from "next/navigation";
import { createServerClient } from "@/lib/supabase/server";
import { FormShell } from "@/components/form/FormShell";

interface Props {
  params: Promise<{ token: string }>;
}

export default async function ResumePage({ params }: Props) {
  const { token } = await params;
  const supabase = createServerClient();

  const { data: session, error } = await supabase
    .from("form_sessions")
    .select("token, submitted_at, expires_at")
    .eq("token", token)
    .single();

  if (error || !session) {
    notFound();
  }

  if (session.submitted_at) {
    redirect("/success");
  }

  if (new Date(session.expires_at) < new Date()) {
    redirect(`/q/${token}/expired`);
  }

  return <FormShell initialToken={token} />;
}
