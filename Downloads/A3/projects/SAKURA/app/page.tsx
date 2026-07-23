"use client";

import { FormEvent, MouseEvent, useEffect, useMemo, useState } from "react";
import {
  events,
  galleryItems,
  isConfiguredUrl,
  type Language,
  promotions,
  siteConfig,
  telegramBotUrl,
  telegramConfigured,
  whatsappConfigured,
  whatsappNumber,
} from "@/lib/site-config";

type BookingForm = {
  name: string;
  phone: string;
  date: string;
  time: string;
  guests: string;
  seating: string;
  request: string;
  website: string;
};

type SubmissionState = "idle" | "sending" | "success" | "error";

const copy = {
  en: {
    nav: ["Home", "Events", "Promotions", "Booking", "Gallery", "Contact"],
    heroEyebrow: "PREMIUM NIGHTLIFE · SINGAPORE",
    heroTitle: "Where Every Night Blooms",
    heroText:
      "Live music, premium tables and unforgettable celebrations in a bold Sakura-inspired atmosphere.",
    book: "Book a Table",
    explore: "View Promotions",
    open: "Open Daily",
    hours: "8:00 PM – 3:00 AM",
    extended: "Saturday & Public Holiday until 4:00 AM",
    eventsTitle: "Upcoming Experiences",
    eventsLead: "Signature nights designed for music, celebration and connection.",
    promoTitle: "Drink Promotions",
    promoLead: "Enjoy selected promotions during the stated hours.",
    bookingTitle: "Reserve Your Table",
    bookingLead:
      "Complete the form and send your booking request through WhatsApp or Telegram.",
    name: "Full name",
    phone: "Contact number",
    date: "Booking date",
    time: "Arrival time",
    guests: "Number of guests",
    seating: "Preferred seating",
    table: "Table",
    vip: "VIP Sofa",
    request: "Special request",
    send: "Send to Telegram",
    sendWhatsapp: "Continue on WhatsApp",
    sendingTelegram: "Sending to Telegram...",
    telegramSuccess:
      "Booking request sent to Sakura on Telegram. We will contact you to confirm.",
    telegramError:
      "We could not send the Telegram booking. Please try WhatsApp or contact us directly.",
    telegramUnavailable: "Telegram booking is not configured yet.",
    chooseChannel: "Choose your booking channel:",
    unavailable:
      "Online booking channels are being updated. Please contact Sakura through the social links for now.",
    galleryTitle: "Inside Sakura",
    galleryLead: "Music, lights and late-night moments.",
    contactTitle: "Find Us",
    contactLead: "For reservations and enquiries, contact us directly.",
    address: "Address",
    openingHours: "Opening Hours",
    social: "Social Media",
    socialSoon: "Link coming soon",
    termsTitle: "Promotion Terms",
    terms:
      "Promotional beer cannot be kept as balance. Non-promotional beer balance is valid for 14 days. Prices are subject to 10% service charge and prevailing GST where applicable.",
    finance: "Visit A3 Finance",
    footer: "All rights reserved.",
    menu: "Toggle navigation menu",
    language: "Switch to Chinese",
  },
  zh: {
    nav: ["首页", "活动", "优惠", "订桌", "相册", "联系"],
    heroEyebrow: "新加坡 · 高端夜生活",
    heroTitle: "让每一个夜晚盛放",
    heroText: "现场音乐、高级卡座与难忘派对，尽在樱花主题的璀璨空间。",
    book: "立即订桌",
    explore: "查看优惠",
    open: "每日营业",
    hours: "晚上 8:00 – 凌晨 3:00",
    extended: "星期六及公共假期营业至凌晨 4:00",
    eventsTitle: "精彩活动",
    eventsLead: "为音乐、庆祝与相聚而打造的主题之夜。",
    promoTitle: "酒水优惠",
    promoLead: "优惠仅限指定时段使用。",
    bookingTitle: "预订座位",
    bookingLead: "填写资料后，可通过 WhatsApp 或 Telegram 发送预订申请。",
    name: "姓名",
    phone: "联系电话",
    date: "预订日期",
    time: "到达时间",
    guests: "人数",
    seating: "座位选择",
    table: "普通桌",
    vip: "VIP 沙发",
    request: "特别要求",
    send: "发送至 Telegram",
    sendWhatsapp: "通过 WhatsApp 继续",
    sendingTelegram: "正在发送至 Telegram...",
    telegramSuccess: "预订申请已发送至 Sakura Telegram，我们会联系您确认。",
    telegramError: "Telegram 预订发送失败，请尝试 WhatsApp 或直接联系我们。",
    telegramUnavailable: "Telegram 订桌功能尚未设置。",
    chooseChannel: "请选择订桌方式：",
    unavailable: "线上订桌方式正在更新，请暂时通过社交平台联系 Sakura。",
    galleryTitle: "走进 Sakura",
    galleryLead: "音乐、灯光与精彩夜晚。",
    contactTitle: "联系我们",
    contactLead: "预订及查询，请直接联系我们。",
    address: "地址",
    openingHours: "营业时间",
    social: "社交媒体",
    socialSoon: "链接即将更新",
    termsTitle: "优惠条款",
    terms:
      "优惠酒水不可寄存。非优惠酒水可寄存 14 天。价格如适用，另加 10% 服务费及现行消费税。",
    finance: "前往 A3 Finance",
    footer: "版权所有。",
    menu: "打开或关闭导航菜单",
    language: "切换至英文",
  },
} satisfies Record<Language, Record<string, string | string[]>>;

const sectionIds = ["home", "events", "promotions", "booking", "gallery", "contact"];

export default function HomePage() {
  const [language, setLanguage] = useState<Language>("en");
  const [menuOpen, setMenuOpen] = useState(false);
  const [minimumDate, setMinimumDate] = useState("");
  const [submissionState, setSubmissionState] =
    useState<SubmissionState>("idle");
  const [form, setForm] = useState<BookingForm>({
    name: "",
    phone: "",
    date: "",
    time: "22:00",
    guests: "2",
    seating: "Table",
    request: "",
    website: "",
  });

  const t = copy[language];

  const socialLinks = useMemo(
    () => [
      { label: "TikTok", url: siteConfig.tiktok },
      { label: "Facebook", url: siteConfig.facebook },
      { label: "Instagram", url: siteConfig.instagram },
      { label: "Telegram", url: telegramBotUrl },
    ],
    []
  );

  useEffect(() => {
    document.documentElement.lang = language === "zh" ? "zh-CN" : "en";
  }, [language]);

  useEffect(() => {
    const now = new Date();
    const localDate = new Date(now.getTime() - now.getTimezoneOffset() * 60_000)
      .toISOString()
      .slice(0, 10);
    setMinimumDate(localDate);
  }, []);

  function updateField(field: keyof BookingForm, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
    if (submissionState !== "idle") setSubmissionState("idle");
  }

  function buildBookingMessage() {
    return [
      "SAKURA ENTERTAINMENT TABLE BOOKING",
      "",
      `Name: ${form.name}`,
      `Contact: ${form.phone}`,
      `Date: ${form.date}`,
      `Arrival: ${form.time}`,
      `Guests: ${form.guests}`,
      `Seating: ${form.seating}`,
      `Special request: ${form.request || "None"}`,
    ].join("\n");
  }

  function sendWhatsAppBooking(event: MouseEvent<HTMLButtonElement>) {
    if (!whatsappConfigured || !event.currentTarget.form?.reportValidity()) return;

    window.open(
      `https://wa.me/${whatsappNumber}?text=${encodeURIComponent(
        buildBookingMessage()
      )}`,
      "_blank",
      "noopener,noreferrer"
    );
  }

  async function submitTelegramBooking(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!telegramConfigured || submissionState === "sending") return;

    setSubmissionState("sending");

    try {
      const response = await fetch("/api/telegram/booking", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, language }),
      });

      if (!response.ok) throw new Error("Telegram booking failed.");
      setSubmissionState("success");
    } catch {
      setSubmissionState("error");
    }
  }

  return (
    <main>
      <header className="site-header">
        <a className="brand" href="#home" aria-label="Sakura Entertainment home">
          <img className="brand-mark" src="/sakura-mark.svg" alt="" />
          <span>
            <strong>SAKURA</strong>
            <small>ENTERTAINMENT</small>
          </span>
        </a>

        <button
          className="menu-button"
          type="button"
          onClick={() => setMenuOpen((current) => !current)}
          aria-label={t.menu as string}
          aria-expanded={menuOpen}
          aria-controls="main-navigation"
        >
          <span />
          <span />
        </button>

        <nav
          id="main-navigation"
          className={menuOpen ? "nav-open" : ""}
          aria-label="Main navigation"
        >
          {(t.nav as string[]).map((item, index) => (
            <a
              key={sectionIds[index]}
              href={`#${sectionIds[index]}`}
              onClick={() => setMenuOpen(false)}
            >
              {item}
            </a>
          ))}
        </nav>

        <button
          className="language-button"
          type="button"
          aria-label={t.language as string}
          onClick={() => setLanguage(language === "en" ? "zh" : "en")}
        >
          {language === "en" ? "中文" : "EN"}
        </button>
      </header>

      <section className="hero" id="home">
        <div className="petals" aria-hidden="true">
          <span>✦</span><span>✿</span><span>✦</span><span>✿</span><span>✦</span>
        </div>
        <div className="hero-orb orb-one" aria-hidden="true" />
        <div className="hero-orb orb-two" aria-hidden="true" />
        <div className="hero-content">
          <p className="eyebrow">{t.heroEyebrow}</p>
          <h1>{t.heroTitle}</h1>
          <p className="hero-copy">{t.heroText}</p>
          <div className="hero-actions">
            <a className="button button-primary" href="#booking">{t.book}</a>
            <a className="button button-secondary" href="#promotions">{t.explore}</a>
          </div>
        </div>
        <aside className="hours-card">
          <span>{t.open}</span>
          <strong>{t.hours}</strong>
          <small>{t.extended}</small>
        </aside>
      </section>

      <section className="section" id="events">
        <div className="section-heading">
          <span>01</span>
          <div>
            <h2>{t.eventsTitle}</h2>
            <p>{t.eventsLead}</p>
          </div>
        </div>
        <div className="event-grid">
          {events.map((event) => (
            <article className="event-card" key={event.title.en}>
              <span className="event-date">{event.date}</span>
              <div>
                <h3>{event.title[language]}</h3>
                <p>{event.description[language]}</p>
              </div>
              <span className="event-arrow" aria-hidden="true">↗</span>
            </article>
          ))}
        </div>
      </section>

      <section className="section section-dark" id="promotions">
        <div className="section-heading">
          <span>02</span>
          <div>
            <h2>{t.promoTitle}</h2>
            <p>{t.promoLead}</p>
          </div>
        </div>
        <div className="promo-grid">
          {promotions.map((promotion, index) => (
            <article className="promo-card" key={`${promotion.title.en}-${promotion.time.en}`}>
              <span className="promo-number">0{index + 1}</span>
              <h3>{promotion.title[language]}</h3>
              <strong>{promotion.price[language]}</strong>
              <p>{promotion.time[language]}</p>
              <small>{promotion.note[language]}</small>
            </article>
          ))}
        </div>
        <div className="terms-box">
          <strong>{t.termsTitle}</strong>
          <p>{t.terms}</p>
        </div>
      </section>

      <section className="section booking-section" id="booking">
        <div className="booking-copy">
          <span className="booking-flower" aria-hidden="true">✿</span>
          <p className="eyebrow">PRIVATE TABLE EXPERIENCE</p>
          <h2>{t.bookingTitle}</h2>
          <p>{t.bookingLead}</p>
          <div className="booking-note">
            <strong>Sakura Entertainment</strong>
            <span>{t.hours}</span>
            <span>{t.extended}</span>
          </div>
        </div>

        <form className="booking-form" onSubmit={submitTelegramBooking}>
          <label>
            <span>{t.name}</span>
            <input
              required
              maxLength={80}
              autoComplete="name"
              value={form.name}
              onChange={(event) => updateField("name", event.target.value)}
            />
          </label>
          <label>
            <span>{t.phone}</span>
            <input
              required
              maxLength={32}
              inputMode="tel"
              autoComplete="tel"
              value={form.phone}
              onChange={(event) => updateField("phone", event.target.value)}
            />
          </label>
          <div className="field-row">
            <label>
              <span>{t.date}</span>
              <input
                required
                type="date"
                min={minimumDate || undefined}
                value={form.date}
                onChange={(event) => updateField("date", event.target.value)}
              />
            </label>
            <label>
              <span>{t.time}</span>
              <input
                required
                type="time"
                value={form.time}
                onChange={(event) => updateField("time", event.target.value)}
              />
            </label>
          </div>
          <div className="field-row">
            <label>
              <span>{t.guests}</span>
              <input
                required
                min="1"
                max="100"
                type="number"
                value={form.guests}
                onChange={(event) => updateField("guests", event.target.value)}
              />
            </label>
            <label>
              <span>{t.seating}</span>
              <select
                value={form.seating}
                onChange={(event) => updateField("seating", event.target.value)}
              >
                <option value="Table">{t.table}</option>
                <option value="VIP Sofa">{t.vip}</option>
              </select>
            </label>
          </div>
          <label>
            <span>{t.request}</span>
            <textarea
              rows={4}
              maxLength={500}
              value={form.request}
              onChange={(event) => updateField("request", event.target.value)}
            />
          </label>
          <label className="honeypot" aria-hidden="true">
            <span>Website</span>
            <input
              tabIndex={-1}
              autoComplete="off"
              value={form.website}
              onChange={(event) => updateField("website", event.target.value)}
            />
          </label>
          <p className="booking-channel-label">{t.chooseChannel}</p>
          {!whatsappConfigured && !telegramConfigured && (
            <p className="status-message" role="status">{t.unavailable}</p>
          )}
          {!telegramConfigured && whatsappConfigured && (
            <p className="status-message" role="status">
              {t.telegramUnavailable}
            </p>
          )}
          {submissionState === "success" && (
            <p className="status-message status-success" role="status">
              {t.telegramSuccess}
            </p>
          )}
          {submissionState === "error" && (
            <p className="status-message status-error" role="alert">
              {t.telegramError}
            </p>
          )}
          <div className="booking-actions">
            <button
              className="button button-telegram submit-button"
              type="submit"
              disabled={!telegramConfigured || submissionState === "sending"}
            >
              {submissionState === "sending" ? t.sendingTelegram : t.send}
            </button>
            <button
              className="button button-whatsapp submit-button"
              type="button"
              disabled={!whatsappConfigured}
              onClick={sendWhatsAppBooking}
            >
              {t.sendWhatsapp}
            </button>
          </div>
        </form>
      </section>

      <section className="section" id="gallery">
        <div className="section-heading">
          <span>03</span>
          <div>
            <h2>{t.galleryTitle}</h2>
            <p>{t.galleryLead}</p>
          </div>
        </div>
        <div className="gallery-grid">
          {galleryItems.map((item) => (
            <article className={`gallery-card ${item.className}`} key={item.label.en}>
              <div className="gallery-glow" aria-hidden="true" />
              <span>{item.label[language]}</span>
            </article>
          ))}
        </div>
      </section>

      <section className="section contact-section" id="contact">
        <div className="contact-intro">
          <p className="eyebrow">SAKURA ENTERTAINMENT</p>
          <h2>{t.contactTitle}</h2>
          <p>{t.contactLead}</p>
          <div className="contact-actions">
            {whatsappConfigured ? (
              <a
                className="button button-whatsapp"
                href={`https://wa.me/${whatsappNumber}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                WhatsApp
              </a>
            ) : (
              <span className="button button-disabled" aria-disabled="true">
                WhatsApp
              </span>
            )}
            {telegramConfigured ? (
              <a
                className="button button-telegram"
                href={telegramBotUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                Telegram Bot
              </a>
            ) : (
              <span className="button button-disabled" aria-disabled="true">
                Telegram
              </span>
            )}
          </div>
        </div>
        <div className="contact-grid">
          <div>
            <span>{t.address}</span>
            <strong>{siteConfig.address}</strong>
          </div>
          <div>
            <span>{t.openingHours}</span>
            <strong>{t.hours}</strong>
            <small>{t.extended}</small>
          </div>
          <div>
            <span>{t.social}</span>
            <div className="social-links">
              {socialLinks.map((link) =>
                isConfiguredUrl(link.url) ? (
                  <a
                    href={link.url}
                    key={link.label}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {link.label}
                  </a>
                ) : (
                  <span className="social-disabled" key={link.label}>
                    {link.label} · {t.socialSoon}
                  </span>
                )
              )}
            </div>
          </div>
        </div>
      </section>

      <footer>
        <div className="brand footer-brand">
          <img className="brand-mark" src="/sakura-mark.svg" alt="" />
          <span>
            <strong>SAKURA</strong>
            <small>ENTERTAINMENT</small>
          </span>
        </div>
        <p>© {new Date().getFullYear()} Sakura Entertainment. {t.footer}</p>
        {isConfiguredUrl(siteConfig.financeUrl) && (
          <a
            className="finance-link"
            href={siteConfig.financeUrl}
            target="_blank"
            rel="noopener noreferrer"
          >
            {t.finance} ↗
          </a>
        )}
      </footer>

      {(whatsappConfigured || telegramConfigured) && (
        <div className="floating-contact" aria-label="Booking channels">
          {telegramConfigured && (
            <a
              className="floating-button floating-telegram"
              href={telegramBotUrl}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Open Sakura Entertainment Telegram bot"
            >
              TG
            </a>
          )}
          {whatsappConfigured && (
            <a
              className="floating-button floating-whatsapp"
              href={`https://wa.me/${whatsappNumber}`}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Book Sakura Entertainment through WhatsApp"
            >
              WA
            </a>
          )}
        </div>
      )}
    </main>
  );
}
