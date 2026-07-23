export type Language = "en" | "zh";

export type LocalizedText = Record<Language, string>;

const env = (value: string | undefined, fallback: string) =>
  value?.trim() || fallback;

const safeHttpUrl = (value: string | undefined, fallback: string) => {
  const candidate = env(value, fallback);

  try {
    const parsed = new URL(candidate);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return fallback;
    return parsed.toString().replace(/\/$/, "");
  } catch {
    return fallback;
  }
};

export const siteConfig = {
  name: "Sakura Entertainment",
  shortName: "Sakura",
  tagline: "Singapore Nightlife, Reimagined",
  description:
    "A premium nightlife destination with live DJs, special performances, table experiences and late-night celebrations.",
  siteUrl: safeHttpUrl(
    process.env.NEXT_PUBLIC_SITE_URL,
    "https://sakura.a3group.sg"
  ),
  address: env(
    process.env.NEXT_PUBLIC_VENUE_ADDRESS,
    "Singapore · Venue details coming soon"
  ),
  whatsapp: env(process.env.NEXT_PUBLIC_BOOKING_WHATSAPP, "6590000000"),
  instagram: safeHttpUrl(process.env.NEXT_PUBLIC_INSTAGRAM_URL, "#"),
  tiktok: safeHttpUrl(process.env.NEXT_PUBLIC_TIKTOK_URL, "#"),
  facebook: safeHttpUrl(process.env.NEXT_PUBLIC_FACEBOOK_URL, "#"),
  financeUrl: safeHttpUrl(
    process.env.NEXT_PUBLIC_A3_FINANCE_URL,
    "https://finance.a3group.sg"
  ),
  telegramBotUsername:
    process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME?.trim().replace(/^@/, "") || "",
};

export const whatsappNumber = siteConfig.whatsapp.replace(/\D/g, "");
export const whatsappConfigured =
  /^\d{8,15}$/.test(whatsappNumber) && whatsappNumber !== "6590000000";

export const telegramConfigured =
  /^[A-Za-z][A-Za-z0-9_]{4,31}$/.test(siteConfig.telegramBotUsername) &&
  /bot$/i.test(siteConfig.telegramBotUsername);

export const telegramBotUrl = telegramConfigured
  ? `https://t.me/${siteConfig.telegramBotUsername}?start=website`
  : "#";

export function isConfiguredUrl(value: string) {
  return /^https?:\/\//i.test(value);
}

export const promotions: Array<{
  title: LocalizedText;
  price: LocalizedText;
  time: LocalizedText;
  note: LocalizedText;
}> = [
  {
    title: { en: "Tiger Tower Promotion", zh: "虎牌啤酒塔优惠" },
    price: { en: "3 Towers · S$208", zh: "3 塔 · S$208" },
    time: { en: "8:00 PM – 11:00 PM", zh: "晚上 8:00 – 11:00" },
    note: {
      en: "Promotional beer cannot be stored.",
      zh: "优惠酒水不可寄存。",
    },
  },
  {
    title: { en: "Tiger Tower", zh: "虎牌啤酒塔" },
    price: { en: "3 Towers · S$248", zh: "3 塔 · S$248" },
    time: { en: "11:00 PM – 3:00 AM", zh: "晚上 11:00 – 凌晨 3:00" },
    note: {
      en: "Available during regular late-night hours.",
      zh: "适用于深夜营业时段。",
    },
  },
  {
    title: { en: "Heineken", zh: "喜力啤酒" },
    price: { en: "10 Bottles · S$88", zh: "10 小瓶 · S$88" },
    time: { en: "8:00 PM – 3:00 AM", zh: "晚上 8:00 – 凌晨 3:00" },
    note: {
      en: "Small bottles. Promotional beer cannot be stored.",
      zh: "小瓶装。优惠酒水不可寄存。",
    },
  },
  {
    title: { en: "Carlsberg", zh: "嘉士伯啤酒" },
    price: { en: "10 Bottles · S$88", zh: "10 小瓶 · S$88" },
    time: { en: "8:00 PM – 3:00 AM", zh: "晚上 8:00 – 凌晨 3:00" },
    note: {
      en: "Small bottles. Promotional beer cannot be stored.",
      zh: "小瓶装。优惠酒水不可寄存。",
    },
  },
];

export const events: Array<{
  date: string;
  title: LocalizedText;
  description: LocalizedText;
}> = [
  {
    date: "FRI",
    title: { en: "Sakura Friday", zh: "樱花星期五" },
    description: {
      en: "Guest DJs, live energy and premium table experiences.",
      zh: "客席 DJ、现场气氛与高级卡座体验。",
    },
  },
  {
    date: "SAT",
    title: { en: "Saturday After Dark", zh: "星期六狂欢夜" },
    description: {
      en: "A late-night celebration with music, lights and performers.",
      zh: "音乐、灯光与现场表演交织的深夜派对。",
    },
  },
  {
    date: "PH",
    title: { en: "Public Holiday Special", zh: "公共假期特别场" },
    description: {
      en: "Extended opening until 4:00 AM on selected public holidays.",
      zh: "指定公共假期延长营业至凌晨 4:00。",
    },
  },
];

export const galleryItems: Array<{
  label: LocalizedText;
  className: string;
}> = [
  { label: { en: "DJ Nights", zh: "DJ 之夜" }, className: "gallery-one" },
  {
    label: { en: "Live Performances", zh: "现场表演" },
    className: "gallery-two",
  },
  {
    label: { en: "Premium Tables", zh: "高级卡座" },
    className: "gallery-three",
  },
  {
    label: { en: "Weekend Energy", zh: "周末狂欢" },
    className: "gallery-four",
  },
];
