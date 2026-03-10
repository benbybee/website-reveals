import { NextRequest, NextResponse } from "next/server";
import { tasks } from "@trigger.dev/sdk/v3";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    if (!body.message?.text) {
      return NextResponse.json({ ok: true });
    }

    const text: string = body.message.text;
    const chatId: string = String(body.message.chat.id);

    if (chatId !== process.env.TELEGRAM_ADMIN_CHAT_ID) {
      return NextResponse.json({ ok: true });
    }

    await tasks.trigger("ai-telegram-command", { message: text, chatId });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[telegram-webhook] Error:", err);
    return NextResponse.json({ ok: true });
  }
}
