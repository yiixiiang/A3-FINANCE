"use client";

import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { useParams } from "next/navigation";
import { formatDate } from "@/lib/format-date";
import styles from "./quotation-print.module.css";

type Gateway = {
  gateway_code: string;
  display_name?: string | null;
  payment_instructions?: string | null;
};

type Branding = {
  logo_url?: string | null;
  chop_url?: string | null;
};

type QuotationItem = {
  id?: number;
  description?: string | null;
  quantity?: number | string | null;
  unit_price?: number | string | null;
  line_total?: number | string | null;
  sort_order?: number | null;
};

type QuotationPayload = {
  quotation?: Record<string, any>;
  branding?: Branding;
  error?: string;
};

function money(value: unknown, currency = "SGD"): string {
  return new Intl.NumberFormat("en-SG", {
    style: "currency",
    currency: currency || "SGD",
    minimumFractionDigits: 2,
  }).format(Number(value || 0));
}

function text(value: unknown, fallback = "—"): string {
  const result = String(value ?? "").trim();
  return result || fallback;
}

function statusLabel(value: unknown): string {
  return text(value, "draft")
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function timeLabel(value: unknown): string {
  const raw = String(value ?? "").trim();
  return raw ? raw.slice(0, 5) : "—";
}

export default function QuotationPrintPage() {
  const params = useParams<{ id: string }>();
  const quotationId = params?.id;
  const [quotation, setQuotation] = useState<Record<string, any> | null>(null);
  const [branding, setBranding] = useState<Branding>({});
  const [error, setError] = useState("");

  useEffect(() => {
    if (!quotationId) {
      setError("A quotation ID is required.");
      return;
    }

    const controller = new AbortController();

    async function loadQuotation() {
      try {
        setError("");
        const response = await fetch(`/api/admin/quotations/${quotationId}`, {
          cache: "no-store",
          signal: controller.signal,
        });
        const payload = (await response.json()) as QuotationPayload;
        if (!response.ok) {
          throw new Error(payload.error || "Unable to load the quotation.");
        }
        setQuotation(payload.quotation ?? null);
        setBranding(payload.branding ?? {});
      } catch (loadError) {
        if (loadError instanceof DOMException && loadError.name === "AbortError") {
          return;
        }
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Unable to load the quotation.",
        );
      }
    }

    void loadQuotation();
    return () => controller.abort();
  }, [quotationId]);

  const company = quotation?.companies ?? {};
  const customer = quotation?.customers ?? {};
  const currency = quotation?.currency || company.base_currency || "SGD";

  const gateway = useMemo<Gateway | undefined>(() => {
    const gateways = (quotation?.company_payment_gateways ?? []) as Gateway[];
    return gateways.find(
      (item) => item.gateway_code === quotation?.payment_gateway_code,
    );
  }, [quotation]);

  const items = useMemo(() => {
    const rows = [
      ...((quotation?.quotation_items ?? []) as QuotationItem[]),
    ].sort((first, second) =>
      Number(first.sort_order ?? 0) - Number(second.sort_order ?? 0),
    );

    return rows.map((item, index) => {
      const quantity = Number(item.quantity || 0);
      const unitPrice = Number(item.unit_price || 0);
      const calculatedAmount = quantity * unitPrice;
      return {
        ...item,
        rowNo: index + 1,
        quantity,
        unitPrice,
        amount: calculatedAmount,
      };
    });
  }, [quotation]);

  const itemSubtotal = useMemo(
    () => items.reduce((sum, item) => sum + item.amount, 0),
    [items],
  );

  if (error) {
    return (
      <main className={styles.statePage}>
        <section className={styles.stateCard}>
          <h1>Unable to open quotation</h1>
          <p>{error}</p>
          <button type="button" onClick={() => window.history.back()}>
            Return
          </button>
        </section>
      </main>
    );
  }

  if (!quotation) {
    return (
      <main className={styles.statePage}>
        <section className={styles.stateCard}>
          <div className={styles.loader} />
          <p>Preparing premium quotation…</p>
        </section>
      </main>
    );
  }

  const quotationNo =
    quotation.quotation_no ||
    `QT-${String(quotation.id || quotationId).padStart(6, "0")}`;
  const primary =
    company.primary_colour || company.primary_color || "#17365d";
  const accent = company.accent_colour || company.accent_color || "#d6a64f";
  const showGst =
    Boolean(
      quotation.gst_registered_snapshot ||
        company.gst_registered ||
        company.gst_enabled,
    ) && Number(quotation.gst_amount || 0) > 0;
  const showServiceCharge = Number(quotation.service_charge || 0) > 0;
  const showAdminFee =
    Number(quotation.payment_admin_fee || 0) > 0 &&
    quotation.payment_fee_borne_by === "customer";
  const subtotal = itemSubtotal || Number(quotation.subtotal || 0);
  const totalAmount = Number(quotation.total_amount || 0);
  const validUntilLabel = formatDate(quotation.valid_until);
  const contactLine = [company.phone || company.company_phone, company.email || company.company_email]
    .filter(Boolean)
    .join("  •  ");
  const customerContact = [customer.phone, customer.email]
    .filter(Boolean)
    .join("  •  ");
  const bankLine = [
    company.bank_name,
    company.bank_account_name,
    company.bank_account_no,
    company.paynow_details,
  ]
    .filter(Boolean)
    .join("  •  ");

  function emailCustomer() {
    const subject = encodeURIComponent(`Quotation ${quotationNo}`);
    const body = encodeURIComponent(
      `Dear ${customer.customer_name || "Customer"},\n\n` +
        `Please find quotation ${quotationNo}.\n` +
        `Total: ${money(totalAmount, currency)}\n` +
        `Valid until: ${validUntilLabel}\n\n` +
        `Regards,\n${company.name || ""}`,
    );
    window.location.href = `mailto:${customer.email || ""}?subject=${subject}&body=${body}`;
  }

  function shareWhatsApp() {
    const message = encodeURIComponent(
      `Quotation ${quotationNo}\n` +
        `Total: ${money(totalAmount, currency)}\n` +
        `Valid until: ${validUntilLabel}\n` +
        `${company.name || ""}`,
    );
    const phone = String(customer.phone || "").replace(/\D/g, "");
    window.open(`https://wa.me/${phone}?text=${message}`, "_blank", "noopener,noreferrer");
  }

  return (
    <main
      className={styles.page}
      style={
        {
          "--quotation-primary": primary,
          "--quotation-accent": accent,
        } as CSSProperties
      }
    >
      <nav className={`${styles.toolbar} ${styles.noPrint}`}>
        <button
          type="button"
          className={styles.secondaryButton}
          onClick={() => window.history.back()}
        >
          ← Back
        </button>
        <div className={styles.toolbarTitle}>
          <strong>{quotationNo}</strong>
          <span>Premium quotation preview</span>
        </div>
        <div className={styles.toolbarActions}>
          <button
            type="button"
            className={styles.primaryButton}
            onClick={() => window.print()}
          >
            Download / Print PDF
          </button>
          <button
            type="button"
            className={styles.secondaryButton}
            onClick={emailCustomer}
          >
            Email Customer
          </button>
          <button
            type="button"
            className={styles.secondaryButton}
            onClick={shareWhatsApp}
          >
            WhatsApp
          </button>
        </div>
      </nav>

      <article className={styles.document}>
        <div className={styles.topBand} />

        <header className={styles.header}>
          <div className={styles.brandBlock}>
            {branding.logo_url ? (
              <img
                className={styles.logo}
                src={branding.logo_url}
                alt={`${company.name || "Company"} logo`}
              />
            ) : (
              <div className={styles.logoFallback}>
                {String(company.name || "A3").slice(0, 2).toUpperCase()}
              </div>
            )}
            <div className={styles.companyDetails}>
              <p className={styles.companyKicker}>OFFICIAL QUOTATION</p>
              <h1>{company.name || "Company"}</h1>
              <p>{company.address || company.company_address || ""}</p>
              {contactLine ? <p>{contactLine}</p> : null}
              <div className={styles.registrationLine}>
                {company.uen ? <span>UEN {company.uen}</span> : null}
                {company.gst_no ? <span>GST {company.gst_no}</span> : null}
              </div>
            </div>
          </div>

          <div className={styles.titleBlock}>
            <span>QUOTATION</span>
            <strong>{quotationNo}</strong>
            <em className={styles.statusBadge}>
              {statusLabel(quotation.status)}
            </em>
          </div>
        </header>

        <section className={styles.summaryStrip}>
          <div>
            <span>Quotation date</span>
            <strong>{formatDate(quotation.quotation_date)}</strong>
          </div>
          <div>
            <span>Valid until</span>
            <strong>{formatDate(quotation.valid_until)}</strong>
          </div>
          <div>
            <span>Currency</span>
            <strong>{currency}</strong>
          </div>
          <div className={styles.totalSummary}>
            <span>Quotation total</span>
            <strong>{money(totalAmount, currency)}</strong>
          </div>
        </section>

        <section className={styles.partyGrid}>
          <div className={styles.partyCard}>
            <div className={styles.sectionHeading}>
              <span>01</span>
              <div>
                <small>Prepared for</small>
                <h2>Customer Details</h2>
              </div>
            </div>
            <strong className={styles.customerName}>
              {text(customer.customer_name, "Customer")}
            </strong>
            {customer.contact_person ? <p>{customer.contact_person}</p> : null}
            {customer.billing_address ? (
              <p className={styles.multiline}>{customer.billing_address}</p>
            ) : null}
            {customerContact ? <p>{customerContact}</p> : null}
            {customer.uen ? <p>UEN: {customer.uen}</p> : null}
          </div>

          <div className={styles.partyCard}>
            <div className={styles.sectionHeading}>
              <span>02</span>
              <div>
                <small>Commercial details</small>
                <h2>Quotation Information</h2>
              </div>
            </div>
            <dl className={styles.detailList}>
              <div>
                <dt>Reference</dt>
                <dd>{quotationNo}</dd>
              </div>
              <div>
                <dt>Pricing basis</dt>
                <dd>{statusLabel(quotation.pricing_source || "manual")}</dd>
              </div>
              <div>
                <dt>Rate plan</dt>
                <dd>{text(quotation.rate_match_details?.rate_name)}</dd>
              </div>
              <div>
                <dt>Payment method</dt>
                <dd>
                  {text(
                    gateway?.display_name || quotation.payment_gateway_code,
                    "To be confirmed",
                  )}
                </dd>
              </div>
            </dl>
          </div>
        </section>

        {quotation.service_type ? (
          <section className={styles.serviceSection}>
            <div className={styles.sectionHeading}>
              <span>03</span>
              <div>
                <small>Service arrangement</small>
                <h2>{quotation.service_type}</h2>
              </div>
            </div>

            <div className={styles.serviceMeta}>
              <div>
                <span>Service date</span>
                <strong>{formatDate(quotation.service_date)}</strong>
              </div>
              <div>
                <span>Pickup time</span>
                <strong>{timeLabel(quotation.pickup_time)}</strong>
              </div>
              <div>
                <span>Passengers</span>
                <strong>{Number(quotation.passenger_count || 0)}</strong>
              </div>
              <div>
                <span>Luggage</span>
                <strong>{Number(quotation.luggage_count || 0)}</strong>
              </div>
              <div>
                <span>Duration</span>
                <strong>
                  {Number(quotation.duration_hours || 0) > 0
                    ? `${Number(quotation.duration_hours)} hour(s)`
                    : "—"}
                </strong>
              </div>
              <div>
                <span>Extra stops</span>
                <strong>{Number(quotation.extra_stops || 0)}</strong>
              </div>
            </div>

            {quotation.pickup_location || quotation.dropoff_location ? (
              <div className={styles.routeCard}>
                <div>
                  <span>Pickup</span>
                  <strong>{text(quotation.pickup_location)}</strong>
                </div>
                <div className={styles.routeLine}>
                  <i />
                  <b>→</b>
                  <i />
                </div>
                <div>
                  <span>Drop-off</span>
                  <strong>{text(quotation.dropoff_location)}</strong>
                </div>
              </div>
            ) : null}
          </section>
        ) : null}

        <section className={styles.itemsSection}>
          <div className={styles.sectionHeading}>
            <span>04</span>
            <div>
              <small>Price schedule</small>
              <h2>Services & Charges</h2>
            </div>
          </div>

          <div className={styles.tableFrame}>
            <table className={styles.itemsTable}>
              <thead>
                <tr>
                  <th>#</th>
                  <th>Description</th>
                  <th>Qty</th>
                  <th>Unit Price</th>
                  <th>Amount</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id || item.rowNo}>
                    <td>{String(item.rowNo).padStart(2, "0")}</td>
                    <td>
                      <strong>{text(item.description, "Service")}</strong>
                    </td>
                    <td>{item.quantity.toLocaleString("en-SG")}</td>
                    <td>{money(item.unitPrice, currency)}</td>
                    <td>{money(item.amount, currency)}</td>
                  </tr>
                ))}
                {items.length === 0 ? (
                  <tr>
                    <td colSpan={5} className={styles.emptyRow}>
                      No quotation items were recorded.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </section>

        <section className={styles.financialGrid}>
          <div className={styles.paymentPanel}>
            <div className={styles.sectionHeadingCompact}>
              <small>Payment & settlement</small>
              <h2>Payment Details</h2>
            </div>
            <p>
              <strong>
                {text(
                  gateway?.display_name || quotation.payment_gateway_code,
                  "Bank transfer / PayNow",
                )}
              </strong>
            </p>
            {gateway?.payment_instructions ? (
              <p className={styles.multiline}>{gateway.payment_instructions}</p>
            ) : null}
            {bankLine ? <p className={styles.bankLine}>{bankLine}</p> : null}
            <p className={styles.paymentNote}>
              Please quote <strong>{quotationNo}</strong> as the payment
              reference.
            </p>
          </div>

          <div className={styles.totalsPanel}>
            <div>
              <span>Subtotal</span>
              <strong>{money(subtotal, currency)}</strong>
            </div>
            {showServiceCharge ? (
              <div>
                <span>
                  Service charge ({Number(quotation.service_charge_rate || 0)}%)
                </span>
                <strong>{money(quotation.service_charge, currency)}</strong>
              </div>
            ) : null}
            {showGst ? (
              <div>
                <span>GST ({Number(quotation.gst_rate || 0)}%)</span>
                <strong>{money(quotation.gst_amount, currency)}</strong>
              </div>
            ) : null}
            {showAdminFee ? (
              <div>
                <span>
                  {gateway?.display_name || "Payment"} administration fee
                </span>
                <strong>{money(quotation.payment_admin_fee, currency)}</strong>
              </div>
            ) : null}
            <div className={styles.grandTotal}>
              <span>Grand total</span>
              <strong>{money(totalAmount, currency)}</strong>
            </div>
          </div>
        </section>

        <section className={styles.notesGrid}>
          <div className={styles.notesPanel}>
            <h2>Terms & Conditions</h2>
            <p className={styles.multiline}>
              {text(
                quotation.terms,
                "Prices are valid until the stated validity date. Services are subject to availability and confirmation.",
              )}
            </p>
          </div>
          <div className={styles.notesPanel}>
            <h2>Notes</h2>
            <p className={styles.multiline}>
              {text(
                quotation.notes,
                "Thank you for the opportunity to provide this quotation.",
              )}
            </p>
          </div>
        </section>

        <section className={styles.acceptanceSection}>
          <div>
            <span>Prepared by</span>
            <strong>{company.name || "Authorised Representative"}</strong>
            <div className={styles.signatureSpace}>
              {branding.chop_url ? (
                <img src={branding.chop_url} alt="Company chop" />
              ) : null}
            </div>
            <p>Authorised signature / company stamp</p>
          </div>
          <div>
            <span>Customer acceptance</span>
            <strong>{customer.customer_name || "Customer"}</strong>
            <div className={styles.signatureSpace} />
            <p>Name, signature and date</p>
          </div>
        </section>

        <footer className={styles.footer}>
          <div>
            <strong>{company.name || "Company"}</strong>
            <span>{company.address || company.company_address || ""}</span>
          </div>
          <div>
            <span>Quotation {quotationNo}</span>
            <strong>Thank you for your business.</strong>
          </div>
        </footer>
      </article>
    </main>
  );
}
