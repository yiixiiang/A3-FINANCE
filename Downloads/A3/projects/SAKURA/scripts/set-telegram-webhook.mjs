import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

function loadEnvFile(filename) {
  const path = resolve(process.cwd(), filename);
  if (!existsSync(path)) return;

  for (const rawLine of readFileSync(path, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const separator = line.indexOf("=");
    if (separator < 1) continue;

    const key = line.slice(0, separator).trim();
    let value = line.slice(separator + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
}

loadEnvFile(".env.local");
loadEnvFile(".env");

const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
const secret = process.env.TELEGRAM_WEBHOOK_SECRET?.trim();
const siteUrl = process.env.NEXT_PUBLIC_SITE_URL?.trim()?.replace(/\/$/, "");

if (!token || !secret || !siteUrl) {
  console.error(
    "Missing TELEGRAM_BOT_TOKEN, TELEGRAM_WEBHOOK_SECRET or NEXT_PUBLIC_SITE_URL."
  );
  process.exit(1);
}

if (!/^https:\/\//i.test(siteUrl)) {
  console.error("NEXT_PUBLIC_SITE_URL must start with https://");
  process.exit(1);
}

if (!/^[A-Za-z0-9_-]{16,256}$/.test(secret)) {
  console.error(
    "TELEGRAM_WEBHOOK_SECRET must be 16-256 letters, numbers, underscores or hyphens."
  );
  process.exit(1);
}

async function telegram(method, payload) {
  const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await response.json();
  if (!response.ok || !data.ok) {
    throw new Error(data.description || `Telegram API error (${response.status})`);
  }
  return data.result;
}

try {
  const bot = await telegram("getMe", {});

  await telegram("setMyCommands", {
    commands: [
      { command: "start", description: "Open Sakura menu" },
      { command: "book", description: "Book a table" },
      { command: "promotions", description: "View drink promotions" },
      { command: "hours", description: "View opening hours" },
      { command: "contact", description: "Contact Sakura" },
      { command: "chatid", description: "Show this chat ID" },
    ],
  });

  const webhookUrl = `${siteUrl}/api/telegram/webhook`;
  await telegram("setWebhook", {
    url: webhookUrl,
    secret_token: secret,
    allowed_updates: ["message"],
    drop_pending_updates: true,
  });

  console.log(`Telegram bot @${bot.username} is connected.`);
  console.log(`Webhook: ${webhookUrl}`);
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
