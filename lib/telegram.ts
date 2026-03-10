const TELEGRAM_API = "https://api.telegram.org/bot";

export async function sendTelegramMessage(
  text: string,
  chatId?: string
): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error("TELEGRAM_BOT_TOKEN is not set");

  const targetChatId = chatId || process.env.TELEGRAM_ADMIN_CHAT_ID;
  if (!targetChatId)
    throw new Error("No chat ID provided and TELEGRAM_ADMIN_CHAT_ID is not set");

  const response = await fetch(`${TELEGRAM_API}${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: targetChatId,
      text,
      parse_mode: "Markdown",
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Telegram API error: ${error}`);
  }
}

export function validateTelegramUpdate(
  body: unknown
): body is { message: { chat: { id: number }; text: string } } {
  if (!body || typeof body !== "object") return false;
  const obj = body as Record<string, unknown>;
  if (!obj.message || typeof obj.message !== "object") return false;
  const msg = obj.message as Record<string, unknown>;
  if (!msg.chat || typeof msg.chat !== "object") return false;
  if (typeof msg.text !== "string") return false;
  return true;
}
