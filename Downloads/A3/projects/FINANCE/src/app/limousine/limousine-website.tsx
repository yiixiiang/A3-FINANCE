"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import styles from "./limousine.module.css";

type PublicCompany = {
  id: number;
  name: string;
  address: string | null;
  phone: string | null;
  email: string | null;
  logo_url: string | null;
};

type VehicleType = {
  id: number;
  code: string;
  name: string;
  passenger_capacity: number;
  luggage_capacity: number;
};

type RateCard = {
  id: number;
  vehicle_type_id: number;
  name: string;
  service_type: string;
  pricing_method: "fixed" | "per_hour";
  base_amount: number;
  currency: string;
  minimum_hours: number;
  included_hours: number;
  additional_hour_amount: number;
  notes: string | null;
  vehicle: VehicleType | null;
};

type ContactConfig = {
  whatsapp: string;
  telegram: string;
  wechat: string;
};

type WebsitePayload = {
  company?: PublicCompany | null;
  vehicle_types?: VehicleType[];
  rate_cards?: RateCard[];
  contact?: ContactConfig;
  error?: string;
};

type QuoteForm = {
  customer_name: string;
  phone: string;
  email: string;
  preferred_contact: "whatsapp" | "telegram" | "wechat" | "phone";
  service_type: string;
  trip_date: string;
  pickup_time: string;
  pickup_location: string;
  dropoff_location: string;
  return_trip: boolean;
  passengers: string;
  luggage: string;
  vehicle_type_id: string;
  rate_card_id: string;
  special_requests: string;
  consent_accepted: boolean;
};

type QuoteResponse = {
  success?: boolean;
  reference_no?: string;
  error?: string;
};

type IconName =
  | "arrow"
  | "car"
  | "clock"
  | "globe"
  | "message"
  | "plane"
  | "shield"
  | "star"
  | "suitcase"
  | "users";

const serviceLabels: Record<string, string> = {
  airport_transfer: "Airport Transfer",
  point_to_point: "Point-to-Point",
  hourly_disposal: "Hourly Disposal",
  charter: "Private Charter",
  sg_jb: "Singapore to Johor Bahru",
  jb_sg: "Johor Bahru to Singapore",
};

const fallbackRates: RateCard[] = [
  {
    id: -1,
    vehicle_type_id: -1,
    name: "Sedan Airport Transfer",
    service_type: "airport_transfer",
    pricing_method: "fixed",
    base_amount: 50,
    currency: "SGD",
    minimum_hours: 1,
    included_hours: 0,
    additional_hour_amount: 0,
    notes: "Example launch rate. Final fare is confirmed in your quotation.",
    vehicle: {
      id: -1,
      code: "SEDAN",
      name: "Premium Sedan",
      passenger_capacity: 4,
      luggage_capacity: 2,
    },
  },
  {
    id: -2,
    vehicle_type_id: -2,
    name: "7-Seater Airport Transfer",
    service_type: "airport_transfer",
    pricing_method: "fixed",
    base_amount: 60,
    currency: "SGD",
    minimum_hours: 1,
    included_hours: 0,
    additional_hour_amount: 0,
    notes: "Example launch rate. Final fare is confirmed in your quotation.",
    vehicle: {
      id: -2,
      code: "MPV7",
      name: "7-Seater MPV",
      passenger_capacity: 6,
      luggage_capacity: 4,
    },
  },
  {
    id: -3,
    vehicle_type_id: -1,
    name: "Sedan Hourly Disposal",
    service_type: "hourly_disposal",
    pricing_method: "per_hour",
    base_amount: 40,
    currency: "SGD",
    minimum_hours: 3,
    included_hours: 1,
    additional_hour_amount: 40,
    notes: "Example launch rate with a 3-hour minimum.",
    vehicle: {
      id: -1,
      code: "SEDAN",
      name: "Premium Sedan",
      passenger_capacity: 4,
      luggage_capacity: 2,
    },
  },
  {
    id: -4,
    vehicle_type_id: -2,
    name: "7-Seater Hourly Disposal",
    service_type: "hourly_disposal",
    pricing_method: "per_hour",
    base_amount: 50,
    currency: "SGD",
    minimum_hours: 3,
    included_hours: 1,
    additional_hour_amount: 50,
    notes: "Example launch rate with a 3-hour minimum.",
    vehicle: {
      id: -2,
      code: "MPV7",
      name: "7-Seater MPV",
      passenger_capacity: 6,
      luggage_capacity: 4,
    },
  },
];

const initialForm: QuoteForm = {
  customer_name: "",
  phone: "",
  email: "",
  preferred_contact: "whatsapp",
  service_type: "airport_transfer",
  trip_date: "",
  pickup_time: "",
  pickup_location: "",
  dropoff_location: "",
  return_trip: false,
  passengers: "1",
  luggage: "0",
  vehicle_type_id: "",
  rate_card_id: "",
  special_requests: "",
  consent_accepted: false,
};

function Icon({ name }: { name: IconName }) {
  const paths: Record<IconName, React.ReactNode> = {
    arrow: <path d="M5 12h14M13 6l6 6-6 6" />,
    car: (
      <>
        <path d="M5 17h14l1-5-2-5H6l-2 5 1 5Z" />
        <path d="M7 17v2M17 17v2M6 12h12M8 9h8" />
      </>
    ),
    clock: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3 2" />
      </>
    ),
    globe: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18" />
      </>
    ),
    message: (
      <>
        <path d="M4 5h16v11H8l-4 3V5Z" />
        <path d="M8 9h8M8 12h5" />
      </>
    ),
    plane: <path d="m3 11 18-7-7 18-3-8-8-3Zm8 3 3-3" />,
    shield: (
      <>
        <path d="M12 3 5 6v5c0 5 3 8 7 10 4-2 7-5 7-10V6l-7-3Z" />
        <path d="m9 12 2 2 4-5" />
      </>
    ),
    star: <path d="m12 3 2.7 5.5 6.1.9-4.4 4.3 1 6.1-5.4-2.9-5.4 2.9 1-6.1-4.4-4.3 6.1-.9L12 3Z" />,
    suitcase: (
      <>
        <rect x="4" y="7" width="16" height="12" rx="2" />
        <path d="M9 7V5h6v2M8 12h8" />
      </>
    ),
    users: (
      <>
        <circle cx="9" cy="9" r="3" />
        <circle cx="17" cy="10" r="2" />
        <path d="M3 19c0-4 2-6 6-6s6 2 6 6M15 15c3 0 5 1 6 4" />
      </>
    ),
  };

  return (
    <svg className={styles.icon} viewBox="0 0 24 24" aria-hidden="true">
      {paths[name]}
    </svg>
  );
}

function money(amount: number, currency = "SGD") {
  return new Intl.NumberFormat("en-SG", {
    style: "currency",
    currency,
    maximumFractionDigits: amount % 1 === 0 ? 0 : 2,
  }).format(amount);
}

function safeNumber(value: string, fallback = 0) {
  const result = Number(value);
  return Number.isFinite(result) ? result : fallback;
}

function generateFallbackReference() {
  const stamp = new Date().toISOString().replace(/\D/g, "").slice(2, 12);
  return `AEJ-${stamp}-${Math.floor(1000 + Math.random() * 9000)}`;
}

export default function LimousineWebsite() {
  const [company, setCompany] = useState<PublicCompany | null>(null);
  const [vehicleTypes, setVehicleTypes] = useState<VehicleType[]>([]);
  const [rateCards, setRateCards] = useState<RateCard[]>([]);
  const [contact, setContact] = useState<ContactConfig>({
    whatsapp: "6584849004",
    telegram: "",
    wechat: "",
  });
  const [form, setForm] = useState<QuoteForm>(initialForm);
  const [loadingRates, setLoadingRates] = useState(true);
  const [menuOpen, setMenuOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [referenceNo, setReferenceNo] = useState("");
  const [copied, setCopied] = useState("");

  useEffect(() => {
    const controller = new AbortController();

    async function loadWebsite() {
      try {
        const response = await fetch("/api/public/limousine", {
          cache: "no-store",
          signal: controller.signal,
        });
        const payload = (await response.json()) as WebsitePayload;
        if (!response.ok) throw new Error(payload.error || "Unable to load live rates.");
        setCompany(payload.company ?? null);
        setVehicleTypes(payload.vehicle_types ?? []);
        setRateCards(payload.rate_cards ?? []);
        setContact(payload.contact ?? { whatsapp: "6584849004", telegram: "", wechat: "" });
      } catch (loadError) {
        if (loadError instanceof DOMException && loadError.name === "AbortError") return;
        setRateCards([]);
      } finally {
        setLoadingRates(false);
      }
    }

    void loadWebsite();
    return () => controller.abort();
  }, []);

  const displayedRates = useMemo(
    () => (rateCards.length > 0 ? rateCards.slice(0, 8) : fallbackRates),
    [rateCards],
  );

  const selectableVehicles = useMemo(() => {
    if (vehicleTypes.length > 0) return vehicleTypes;
    const unique = new Map<number, VehicleType>();
    fallbackRates.forEach((rate) => {
      if (rate.vehicle) unique.set(rate.vehicle.id, rate.vehicle);
    });
    return Array.from(unique.values());
  }, [vehicleTypes]);

  const selectedRate = useMemo(
    () => rateCards.find((rate) => String(rate.id) === form.rate_card_id) ?? null,
    [form.rate_card_id, rateCards],
  );

  function update<K extends keyof QuoteForm>(key: K, value: QuoteForm[K]) {
    setForm((current) => ({ ...current, [key]: value }));
    setError("");
  }

  function scrollToQuote() {
    document.getElementById("quotation")?.scrollIntoView({ behavior: "smooth" });
    setMenuOpen(false);
  }

  function buildMessage(reference = referenceNo || "Pending") {
    const service = serviceLabels[form.service_type] || form.service_type;
    const selectedVehicle = selectableVehicles.find(
      (vehicle) => String(vehicle.id) === form.vehicle_type_id,
    );
    return [
      "AEJKY Limousine quotation request",
      `Reference: ${reference}`,
      `Name: ${form.customer_name || "Not provided"}`,
      `Contact: ${form.phone || form.email || "Not provided"}`,
      `Service: ${service}`,
      `Date / time: ${form.trip_date || "Flexible"} ${form.pickup_time || ""}`.trim(),
      `Pickup: ${form.pickup_location || "Not provided"}`,
      `Drop-off: ${form.dropoff_location || "Not provided"}`,
      `Passengers / luggage: ${form.passengers || "0"} / ${form.luggage || "0"}`,
      `Vehicle: ${selectedVehicle?.name || "Please recommend"}`,
      form.return_trip ? "Return trip: Yes" : "Return trip: No",
      form.special_requests ? `Notes: ${form.special_requests}` : "",
    ]
      .filter(Boolean)
      .join("\n");
  }

  async function copyText(value: string, label: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(label);
      window.setTimeout(() => setCopied(""), 2200);
    } catch {
      setCopied("Copy unavailable");
    }
  }

  async function openWhatsApp() {
    const message = buildMessage();
    const digits = contact.whatsapp.replace(/\D/g, "");
    const url = digits
      ? `https://wa.me/${digits}?text=${encodeURIComponent(message)}`
      : `https://wa.me/?text=${encodeURIComponent(message)}`;
    window.open(url, "_blank", "noopener,noreferrer");
  }

  async function openTelegram() {
    const message = buildMessage();
    if (contact.telegram.trim()) {
      await copyText(message, "Message copied");
      const username = contact.telegram.replace(/^@/, "").trim();
      window.open(`https://t.me/${encodeURIComponent(username)}`, "_blank", "noopener,noreferrer");
      return;
    }
    const url = `${window.location.origin}/limousine`;
    window.open(
      `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(message)}`,
      "_blank",
      "noopener,noreferrer",
    );
  }

  async function openWeChat() {
    const message = contact.wechat
      ? `WeChat ID: ${contact.wechat}\n\n${buildMessage()}`
      : buildMessage();
    await copyText(message, contact.wechat ? "WeChat details copied" : "Request copied");
    window.location.href = "weixin://";
  }

  async function submitQuote(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setReferenceNo("");

    if (!form.customer_name.trim() || !form.phone.trim()) {
      setError("Your name and contact number are required.");
      return;
    }
    if (!form.trip_date || !form.pickup_location.trim() || !form.dropoff_location.trim()) {
      setError("Trip date, pickup location and drop-off location are required.");
      return;
    }
    if (!form.consent_accepted) {
      setError("Please accept the privacy notice before submitting.");
      return;
    }

    setSubmitting(true);
    try {
      const response = await fetch("/api/public/limousine", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          passengers: Math.max(1, safeNumber(form.passengers, 1)),
          luggage: Math.max(0, safeNumber(form.luggage, 0)),
          vehicle_type_id: safeNumber(form.vehicle_type_id) || null,
          rate_card_id: safeNumber(form.rate_card_id) || null,
          estimated_amount: selectedRate?.base_amount ?? null,
          currency: selectedRate?.currency ?? "SGD",
        }),
      });
      const payload = (await response.json()) as QuoteResponse;
      if (!response.ok) throw new Error(payload.error || "Unable to save the quotation request.");
      setReferenceNo(payload.reference_no || generateFallbackReference());
    } catch (submitError) {
      const fallbackReference = generateFallbackReference();
      setReferenceNo(fallbackReference);
      setError(
        submitError instanceof Error
          ? `${submitError.message} Your request details are still ready to send through a contact channel below.`
          : "Your request could not be saved, but it is ready to send through a contact channel below.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className={styles.site}>
      <header className={styles.header}>
        <Link className={styles.brand} href="/" aria-label="AEJKY Limousine home">
          <span className={styles.brandLogo}>
            <Image src="/aejky-limousine-logo.jpeg" alt="AEJKY Limousine logo" width={1024} height={1024} priority />
          </span>
          <span>
            <strong>AEJKY</strong>
            <small>LIMOUSINE</small>
          </span>
        </Link>

        <button
          type="button"
          className={styles.menuButton}
          aria-label="Toggle navigation"
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((current) => !current)}
        >
          <span />
          <span />
          <span />
        </button>

        <nav className={`${styles.navigation} ${menuOpen ? styles.navigationOpen : ""}`}>
          <a href="#services" onClick={() => setMenuOpen(false)}>Services</a>
          <a href="#rates" onClick={() => setMenuOpen(false)}>Rates</a>
          <a href="#about" onClick={() => setMenuOpen(false)}>Why AEJKY</a>
          <a href="#terms" onClick={() => setMenuOpen(false)}>Terms</a>
          <button type="button" onClick={scrollToQuote}>Get a Quote</button>
        </nav>
      </header>

      <section className={styles.hero}>
        <div className={styles.heroGlow} />
        <div className={styles.heroContent}>
          <div className={styles.eyebrow}><Icon name="star" /> Singapore Premium Chauffeur Service</div>
          <h1>Arrive with confidence.<br /><span>Travel in distinction.</span></h1>
          <p>
            Airport transfers, corporate journeys, private charters and cross-border rides,
            coordinated with professional care from booking to arrival.
          </p>
          <div className={styles.heroActions}>
            <button type="button" className={styles.goldButton} onClick={scrollToQuote}>
              Request Quotation <Icon name="arrow" />
            </button>
            <button type="button" className={styles.ghostButton} onClick={openWhatsApp}>
              <Icon name="message" /> WhatsApp Us
            </button>
          </div>
          <div className={styles.trustRow}>
            <span><Icon name="shield" /> Professional service</span>
            <span><Icon name="clock" /> On-time coordination</span>
            <span><Icon name="globe" /> Singapore & Malaysia</span>
          </div>
        </div>

        <div className={styles.heroVisual}>
          <div className={styles.goldRing} aria-hidden="true" />
          <div className={styles.heroLogoCard}>
            <div className={styles.heroLogoTop}><span>OFFICIAL BRAND</span><strong>AEJKY LIMOUSINE</strong></div>
            <Image
              className={styles.heroLogoImage}
              src="/aejky-limousine-logo.jpeg"
              alt="AEJKY Limousine official logo with executive vehicles"
              width={1024}
              height={1024}
              priority
            />
            <div className={styles.heroLogoBottom}>
              <span><small>UEN</small><strong>53488486E</strong></span>
              <button type="button" onClick={openWhatsApp}><Icon name="message" /> +65 8484 9004</button>
            </div>
          </div>
          <div className={styles.heroCard}>
            <span>AEJKY STANDARD</span>
            <strong>Premium. Punctual. Personal.</strong>
          </div>
        </div>
      </section>

      <section className={styles.statBar} aria-label="Service highlights">
        <div><strong>24/7</strong><span>Advance booking</span></div>
        <div><strong>SG</strong><span>Islandwide pickup</span></div>
        <div><strong>MY</strong><span>Cross-border service</span></div>
        <div><strong>UEN</strong><span>53488486E</span></div>
      </section>

      <section className={styles.section} id="services">
        <div className={styles.sectionHeading}>
          <span>Our Services</span>
          <h2>One trusted ride for every important journey.</h2>
          <p>Choose the service that fits your schedule, group size and destination.</p>
        </div>
        <div className={styles.serviceGrid}>
          <article className={styles.serviceCard}>
            <span className={styles.serviceIcon}><Icon name="plane" /></span>
            <h3>Airport Transfer</h3>
            <p>Reliable pickup or drop-off with flight-aware coordination and luggage planning.</p>
          </article>
          <article className={styles.serviceCard}>
            <span className={styles.serviceIcon}><Icon name="car" /></span>
            <h3>Point-to-Point</h3>
            <p>Private direct transport for meetings, hotels, events, dining and daily travel.</p>
          </article>
          <article className={styles.serviceCard}>
            <span className={styles.serviceIcon}><Icon name="clock" /></span>
            <h3>Hourly Disposal</h3>
            <p>A chauffeur and vehicle reserved for your itinerary with flexible stops.</p>
          </article>
          <article className={styles.serviceCard}>
            <span className={styles.serviceIcon}><Icon name="globe" /></span>
            <h3>SG–JB / JB–SG</h3>
            <p>Comfortable cross-border travel with one coordinated booking from door to door.</p>
          </article>
        </div>
      </section>

      <section className={`${styles.section} ${styles.ratesSection}`} id="rates">
        <div className={styles.sectionHeading}>
          <span>Transparent Pricing</span>
          <h2>Rate cards managed directly in A3 Finance.</h2>
          <p>
            Live active rates appear automatically. Tolls, waiting time, midnight service,
            additional stops and special-event demand may affect the final quotation.
          </p>
        </div>

        {loadingRates ? (
          <div className={styles.loadingRates}>
            <span />
            <span />
            <span />
          </div>
        ) : (
          <div className={styles.priceGrid}>
            {displayedRates.map((rate, index) => (
              <article className={`${styles.priceCard} ${index === 1 ? styles.featuredPrice : ""}`} key={rate.id}>
                {index === 1 && <div className={styles.popularBadge}>POPULAR</div>}
                <div className={styles.priceTop}>
                  <span>{serviceLabels[rate.service_type] || rate.service_type}</span>
                  <strong>{rate.vehicle?.name || "Premium Vehicle"}</strong>
                  <small>
                    Up to {rate.vehicle?.passenger_capacity ?? "—"} passengers · {rate.vehicle?.luggage_capacity ?? "—"} luggage
                  </small>
                </div>
                <div className={styles.priceAmount}>
                  <small>FROM</small>
                  <strong>{money(rate.base_amount, rate.currency)}</strong>
                  <span>{rate.pricing_method === "per_hour" ? "/ hour" : "/ trip"}</span>
                </div>
                {rate.pricing_method === "per_hour" && (
                  <p>Minimum {rate.minimum_hours || 1} hours</p>
                )}
                <p>{rate.notes || "Final fare is confirmed after trip details are reviewed."}</p>
                <button
                  type="button"
                  onClick={() => {
                    setForm((current) => ({
                      ...current,
                      service_type: rate.service_type,
                      vehicle_type_id: rate.vehicle_type_id > 0 ? String(rate.vehicle_type_id) : "",
                      rate_card_id: rate.id > 0 ? String(rate.id) : "",
                    }));
                    scrollToQuote();
                  }}
                >
                  Select Rate <Icon name="arrow" />
                </button>
              </article>
            ))}
          </div>
        )}
        {rateCards.length === 0 && !loadingRates && (
          <p className={styles.rateNotice}>
            Example launch rates are displayed until active AEJKY rate cards are published in A3 Finance.
          </p>
        )}
      </section>

      <section className={`${styles.section} ${styles.aboutSection}`} id="about">
        <div className={styles.aboutVisual}>
          <div className={styles.aboutLogoWrap}>
            <Image src="/aejky-limousine-logo.jpeg" alt="AEJKY Limousine official brand" width={1024} height={1024} />
          </div>
          <div className={styles.aboutBadge}><Icon name="shield" /> Registered business · UEN 53488486E</div>
        </div>
        <div className={styles.aboutCopy}>
          <span className={styles.kicker}>Why AEJKY</span>
          <h2>Professional transport, backed by disciplined operations.</h2>
          <p>
            Every request is recorded through A3 Finance, helping our team manage trip details,
            rates and follow-up with clarity. You receive a reference number and a direct path to
            contact us through your preferred channel.
          </p>
          <div className={styles.benefitList}>
            <div><Icon name="shield" /><span><strong>Clear confirmation</strong><small>Trip details and fare are confirmed before service.</small></span></div>
            <div><Icon name="users" /><span><strong>Right vehicle planning</strong><small>Passenger and luggage capacity are checked.</small></span></div>
            <div><Icon name="suitcase" /><span><strong>Journey-ready support</strong><small>Airport, corporate and cross-border requirements covered.</small></span></div>
          </div>
        </div>
      </section>

      <section className={`${styles.section} ${styles.quoteSection}`} id="quotation">
        <div className={styles.quoteIntro}>
          <div className={styles.quoteBrandCard}>
            <Image src="/aejky-limousine-logo.jpeg" alt="AEJKY Limousine" width={1024} height={1024} />
            <div><strong>AEJKY LIMOUSINE</strong><small>UEN 53488486E · WhatsApp +65 8484 9004</small></div>
          </div>
          <span>Fast Quotation</span>
          <h2>Tell us about your journey.</h2>
          <p>Complete the form and receive a request reference. Our team will confirm availability and the final fare.</p>
          <div className={styles.contactPanel}>
            <button type="button" onClick={openWhatsApp}><strong>WhatsApp</strong><small>Fast mobile enquiry</small></button>
            <button type="button" onClick={openTelegram}><strong>Telegram</strong><small>Direct or share message</small></button>
            <button type="button" onClick={openWeChat}><strong>WeChat</strong><small>{contact.wechat ? `ID: ${contact.wechat}` : "Copy request and open app"}</small></button>
          </div>
          {company && (
            <address className={styles.companyContact}>
              {company.address && <span>{company.address}</span>}
              {company.phone && <a href={`tel:${company.phone}`}>{company.phone}</a>}
              {company.email && <a href={`mailto:${company.email}`}>{company.email}</a>}
            </address>
          )}
        </div>

        <form className={styles.quoteForm} onSubmit={submitQuote}>
          <div className={styles.formHeading}>
            <span>QUOTATION REQUEST</span>
            <strong>AEJKY Limousine</strong>
          </div>

          {error && <div className={styles.formError}>{error}</div>}
          {referenceNo && (
            <div className={styles.formSuccess}>
              <Icon name="shield" />
              <div>
                <strong>Request received</strong>
                <span>Reference: {referenceNo}</span>
              </div>
            </div>
          )}

          <div className={styles.formGrid}>
            <label>
              <span>Full Name *</span>
              <input value={form.customer_name} onChange={(event) => update("customer_name", event.target.value)} autoComplete="name" required />
            </label>
            <label>
              <span>Contact Number *</span>
              <input value={form.phone} onChange={(event) => update("phone", event.target.value)} autoComplete="tel" inputMode="tel" required />
            </label>
            <label>
              <span>Email</span>
              <input type="email" value={form.email} onChange={(event) => update("email", event.target.value)} autoComplete="email" />
            </label>
            <label>
              <span>Preferred Contact</span>
              <select value={form.preferred_contact} onChange={(event) => update("preferred_contact", event.target.value as QuoteForm["preferred_contact"])}>
                <option value="whatsapp">WhatsApp</option>
                <option value="telegram">Telegram</option>
                <option value="wechat">WeChat</option>
                <option value="phone">Phone Call</option>
              </select>
            </label>
            <label>
              <span>Service *</span>
              <select value={form.service_type} onChange={(event) => update("service_type", event.target.value)} required>
                {Object.entries(serviceLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}
              </select>
            </label>
            <label>
              <span>Preferred Vehicle</span>
              <select value={form.vehicle_type_id} onChange={(event) => update("vehicle_type_id", event.target.value)}>
                <option value="">Please recommend</option>
                {selectableVehicles.map((vehicle) => (
                  <option value={vehicle.id > 0 ? String(vehicle.id) : ""} key={vehicle.code}>
                    {vehicle.name} — {vehicle.passenger_capacity} passengers
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>Trip Date *</span>
              <input type="date" value={form.trip_date} onChange={(event) => update("trip_date", event.target.value)} required />
            </label>
            <label>
              <span>Pickup Time</span>
              <input type="time" value={form.pickup_time} onChange={(event) => update("pickup_time", event.target.value)} />
            </label>
            <label className={styles.fullField}>
              <span>Pickup Location *</span>
              <input value={form.pickup_location} onChange={(event) => update("pickup_location", event.target.value)} placeholder="Airport terminal, hotel, address or landmark" required />
            </label>
            <label className={styles.fullField}>
              <span>Drop-off Location *</span>
              <input value={form.dropoff_location} onChange={(event) => update("dropoff_location", event.target.value)} placeholder="Destination address or landmark" required />
            </label>
            <label>
              <span>Passengers</span>
              <input type="number" min="1" max="100" value={form.passengers} onChange={(event) => update("passengers", event.target.value)} />
            </label>
            <label>
              <span>Luggage</span>
              <input type="number" min="0" max="100" value={form.luggage} onChange={(event) => update("luggage", event.target.value)} />
            </label>
            <label className={styles.fullField}>
              <span>Special Requests</span>
              <textarea value={form.special_requests} onChange={(event) => update("special_requests", event.target.value)} rows={4} placeholder="Flight number, child seat, extra stop, waiting time, return details or other requests" />
            </label>
          </div>

          <div className={styles.checkRow}>
            <label><input type="checkbox" checked={form.return_trip} onChange={(event) => update("return_trip", event.target.checked)} /> Return trip required</label>
            <label><input type="checkbox" checked={form.consent_accepted} onChange={(event) => update("consent_accepted", event.target.checked)} required /> I agree to the privacy notice and consent to being contacted about this request. *</label>
          </div>

          <button className={styles.submitButton} type="submit" disabled={submitting}>
            {submitting ? "Submitting…" : "Submit Quotation Request"} <Icon name="arrow" />
          </button>

          {referenceNo && (
            <div className={styles.afterSubmit}>
              <p>Send your request directly using your preferred channel:</p>
              <div>
                <button type="button" onClick={openWhatsApp}>WhatsApp</button>
                <button type="button" onClick={openTelegram}>Telegram</button>
                <button type="button" onClick={openWeChat}>WeChat</button>
                <button type="button" onClick={() => copyText(buildMessage(), "Request copied")}>Copy Request</button>
              </div>
            </div>
          )}
          {copied && <div className={styles.copyToast}>{copied}</div>}
        </form>
      </section>

      <section className={`${styles.section} ${styles.legalSection}`} id="terms">
        <article>
          <span>Terms & Conditions</span>
          <h2>Booking terms</h2>
          <ol>
            <li>A quotation request is not a confirmed booking. Service is confirmed only after AEJKY Limousine accepts the request and issues written confirmation.</li>
            <li>Displayed prices are starting rates. The final fare may include ERP, tolls, parking, waiting time, midnight surcharge, additional stops, peak-period pricing and other agreed charges.</li>
            <li>Customers must provide accurate pickup, drop-off, passenger, luggage and contact details. Changes may affect vehicle suitability, availability and price.</li>
            <li>Waiting time starts from the agreed pickup time or the applicable airport-arrival arrangement stated in the confirmation.</li>
            <li>Cancellation, amendment and no-show charges depend on the confirmed quotation and the notice provided.</li>
            <li>Cross-border trips are subject to immigration requirements, traffic conditions, checkpoint delays and passenger travel-document validity.</li>
            <li>Illegal, unsafe or abusive conduct is not permitted. The driver may stop or refuse service where safety or law requires.</li>
            <li>Liability is limited to the extent permitted by Singapore law. Personal belongings remain the passenger’s responsibility.</li>
          </ol>
        </article>
        <article id="privacy">
          <span>Privacy Notice</span>
          <h2>How we use your information</h2>
          <p>
            AEJKY Limousine collects the information in this form to prepare a quotation,
            coordinate transport, communicate with you, maintain service records and comply with
            legal or operational requirements. Information may be shared only with authorised staff,
            assigned drivers and service providers where necessary to fulfil the request.
          </p>
          <p>
            We do not ask for payment-card details through this form. Please avoid submitting NRIC,
            passport or other highly sensitive information in the special-request field. You may contact
            AEJKY Limousine to request access, correction or deletion, subject to applicable retention duties.
          </p>
        </article>
      </section>

      <footer className={styles.footer}>
        <div className={styles.footerBrand}>
          <span className={styles.footerLogo}>
            <Image src="/aejky-limousine-logo.jpeg" alt="AEJKY Limousine" width={1024} height={1024} />
          </span>
          <div><strong>AEJKY LIMOUSINE</strong><small>Premium Chauffeur Services · UEN 53488486E</small></div>
        </div>
        <div className={styles.footerLinks}>
          <a href="#services">Services</a>
          <a href="#rates">Rates</a>
          <a href="#terms">Terms</a>
          <a href="#privacy">Privacy</a>
          <Link href="https://finance.a3group.sg/login">Staff Login</Link>
        </div>
        <p>© {new Date().getFullYear()} AEJKY Limousine. All rights reserved.</p>
      </footer>

      <div className={styles.mobileCta}>
        <button type="button" onClick={openWhatsApp}><Icon name="message" /> WhatsApp</button>
        <button type="button" onClick={scrollToQuote}>Get Quote <Icon name="arrow" /></button>
      </div>
    </main>
  );
}
