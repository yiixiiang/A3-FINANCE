import { NextResponse } from "next/server";
import { siteConfig } from "@/lib/site-config";
import {
  sendTelegramMessage,
  telegramAdminChatId,
  telegramServerConfigured,
} from "@/lib/telegram";

export const runtime = "nodejs";

type BookingRequest = {
  name?: unknown;
  phone?: unknown;
  date?: unknown;
  time?: unknown;
  guests?: unknown;
  seating?: unknown;
  request?: unknown;
  language?: unknown;
  website?: unknown;
};

const text = (value: unknown, maxLength: number) =>
  typeof value === "string" ? value.trim().slice(0, maxLength) : "";

export async function POST(request: Request) {
  const contentLength = Number(request.headers.get("content-length") || 0);
  if (contentLength > 12_000) {
    return NextResponse.json(
      { ok: false, error: "Request is too large." },
      { status: 413 }
    );
  }

  const body = (await request.json().catch(() => null)) as BookingRequest | null;
  if (!body) {
    return NextResponse.json(
      { ok: false, error: "Invalid request." },
      { status: 400 }
    );
  }

  // Quietly accept automated spam caught by the hidden field.
  if (text(body.website, 100)) {
    return NextResponse.json({ ok: true });
  }

  if (!telegramServerConfigured) {
    return NextResponse.json(
      { ok: false, error: "Telegram booking is not configured." },
      { status: 503 }
    );
  }

  const booking = {
    name: text(body.name, 80),
    phone: text(body.phone, 32),
    date: text(body.date, 10),
    time: text(body.time, 5),
    guests: text(body.guests, 3),
    seating: text(body.seating, 30),
    specialRequest: text(body.request, 500),
    language: text(body.language, 2) === "zh" ? "Chinese" : "English",
  };

  const guestCount = Number(booking.guests);
  const todayInSingapore = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Singapore",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  const valid =
    booking.name.length >= 2 &&
    booking.phone.length >= 5 &&
    /^\d{4}-\d{2}-\d{2}$/.test(booking.date) &&
    booking.date >= todayInSingapore &&
    /^\d{2}:\d{2}$/.test(booking.time) &&
    Number.isInteger(guestCount) &&
    guestCount >= 1 &&
    guestCount <= 100 &&
    ["Table", "VIP Sofa"].includes(booking.seating);

  if (!valid) {
    return NextResponse.json(
      { ok: false, error: "Please check the booking details." },
      { status: 400 }
    );
  }

  const receivedAt = new Intl.DateTimeFormat("en-SG", {
    timeZone: "Asia/Singapore",
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date());

  const message = [
    "🌸 NEW SAKURA TABLE BOOKING",
    "",
    `Name: ${booking.name}`,
    `Contact: ${booking.phone}`,
    `Booking date: ${booking.date}`,
    `Arrival time: ${booking.time}`,
    `Guests: ${booking.guests}`,
    `Seating: ${booking.seating}`,
    `Special request: ${booking.specialRequest || "None"}`,
    `Website language: ${booking.language}`,
    "",
    `Received: ${receivedAt}`,
  ].join("\n");

  try {
    await sendTelegramMessage(telegramAdminChatId, message, {
      disable_web_page_preview: true,
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: "Open Sakura website",
              url: `${siteConfig.siteUrl}/#booking`,
            },
          ],
        ],
      },
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error(
      "Telegram booking delivery failed:",
      error instanceof Error ? error.message : "Unknown error"
    );
    return NextResponse.json(
      { ok: false, error: "Unable to send booking." },
      { status: 502 }
    );
  }
}
