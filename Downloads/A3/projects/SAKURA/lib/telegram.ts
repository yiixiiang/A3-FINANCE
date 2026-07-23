const botToken = process.env.TELEGRAM_BOT_TOKEN?.trim() || "";

export const telegramAdminChatId =
  process.env.TELEGRAM_ADMIN_CHAT_ID?.trim() || "";
export const telegramWebhookSecret =
  process.env.TELEGRAM_WEBHOOK_SECRET?.trim() || "";

export const telegramServerConfigured = Boolean(
  botToken && telegramAdminChatId
);

export type TelegramMessageOptions = {
  parse_mode?: "HTML" | "MarkdownV2";
  disable_web_page_preview?: boolean;
  reply_markup?: Record<string, unknown>;
};

type TelegramApiResponse<T> = {
  ok: boolean;
  result?: T;
  description?: string;
};

async function callTelegramApi<T>(
  method: string,
  payload: Record<string, unknown>
): Promise<T> {
  if (!botToken) {
    throw new Error("Telegram bot token is not configured.");
  }

  const response = await fetch(
    `https://api.telegram.org/bot${botToken}/${method}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      cache: "no-store",
    }
  );

  const data = (await response.json().catch(() => null)) as
    | TelegramApiResponse<T>
    | null;

  if (!response.ok || !data?.ok || data.result === undefined) {
    throw new Error(data?.description || `Telegram API error (${response.status}).`);
  }

  return data.result;
}

export function sendTelegramMessage(
  chatId: string | number,
  text: string,
  options: TelegramMessageOptions = {}
) {
  return callTelegramApi("sendMessage", {
    chat_id: chatId,
    text,
    ...options,
  });
}
