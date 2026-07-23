import { NextResponse } from "next/server";
import { promotions, siteConfig } from "@/lib/site-config";
import { sendTelegramMessage, telegramWebhookSecret } from "@/lib/telegram";

export const runtime = "nodejs";

type TelegramChat = { id: number };
type TelegramMessage = {
  chat?: TelegramChat;
  text?: string;
  from?: { first_name?: string };
};
type TelegramUpdate = {
  message?: TelegramMessage;
};

const keyboard = {
  keyboard: [
    ["🌸 Book a table", "🍺 Promotions"],
    ["🕒 Opening hours", "📍 Contact"],
  ],
  resize_keyboard: true,
};

function promotionsText() {
  return [
    "🍺 SAKURA PROMOTIONS",
    "",
    ...promotions.flatMap((promotion) => [
      `${promotion.title.en}: ${promotion.price.en}`,
      `${promotion.time.en}`,
      "",
    ]),
    "Promotional beer cannot be kept as balance. Terms apply.",
  ].join("\n");
}

function responseFor(messageText: string, firstName?: string) {
  const command = messageText.trim().toLowerCase().split(/\s+/)[0].split("@")[0];

  if (command === "/chatid") {
    return null;
  }

  if (command === "/start") {
    return [
      `Welcome${firstName ? `, ${firstName}` : ""} to Sakura Entertainment 🌸`,
      "欢迎来到 Sakura Entertainment。",
      "",
      "Use the menu below to book a table, check promotions and view our opening hours.",
      "请使用下方菜单订桌、查看优惠及营业时间。",
    ].join("\n");
  }

  if (command === "/book" || messageText.includes("Book a table")) {
    return [
      "🌸 TABLE BOOKING / 订桌",
      "",
      `Complete the booking form here: ${siteConfig.siteUrl}/#booking`,
      "Our team will contact you to confirm availability.",
      "请填写订桌表格，我们会联系您确认座位。",
    ].join("\n");
  }

  if (command === "/promotions" || messageText.includes("Promotions")) {
    return promotionsText();
  }

  if (command === "/hours" || messageText.includes("Opening hours")) {
    return [
      "🕒 OPENING HOURS / 营业时间",
      "",
      "Daily: 8:00 PM – 3:00 AM",
      "Saturday & Public Holiday: until 4:00 AM",
      "",
      "每日：晚上 8:00 – 凌晨 3:00",
      "星期六及公共假期：营业至凌晨 4:00",
    ].join("\n");
  }

  if (command === "/contact" || messageText.includes("Contact")) {
    return [
      "📍 CONTACT SAKURA / 联系我们",
      "",
      siteConfig.address,
      `Website: ${siteConfig.siteUrl}`,
      "For booking, use /book.",
    ].join("\n");
  }

  return [
    "Choose an option from the menu below.",
    "请选择下方菜单。",
    "",
    "Commands: /book /promotions /hours /contact /chatid",
  ].join("\n");
}

export async function GET() {
  return NextResponse.json({ ok: true, service: "Sakura Telegram webhook" });
}

export async function POST(request: Request) {
  if (!telegramWebhookSecret) {
    return NextResponse.json(
      { ok: false, error: "Webhook is not configured." },
      { status: 503 }
    );
  }

  const suppliedSecret = request.headers.get(
    "x-telegram-bot-api-secret-token"
  );
  if (suppliedSecret !== telegramWebhookSecret) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  const update = (await request.json().catch(() => null)) as TelegramUpdate | null;
  const message = update?.message;
  const chatId = message?.chat?.id;
  const messageText = message?.text?.trim();

  if (!chatId || !messageText) {
    return NextResponse.json({ ok: true });
  }

  try {
    if (messageText.toLowerCase().split(/\s+/)[0].split("@")[0] === "/chatid") {
      await sendTelegramMessage(chatId, `This chat ID is: ${chatId}`);
      return NextResponse.json({ ok: true });
    }

    const reply = responseFor(messageText, message.from?.first_name);
    if (reply) {
      await sendTelegramMessage(chatId, reply, {
        disable_web_page_preview: true,
        reply_markup: keyboard,
      });
    }
  } catch (error) {
    console.error(
      "Telegram webhook reply failed:",
      error instanceof Error ? error.message : "Unknown error"
    );
  }

  // Return 200 so Telegram does not repeatedly redeliver a processed update.
  return NextResponse.json({ ok: true });
}
