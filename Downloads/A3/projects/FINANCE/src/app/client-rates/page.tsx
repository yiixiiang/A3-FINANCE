"use client";

import { useEffect, useMemo, useState } from "react";
import styles from "./client-rates.module.css";
import { formatDate } from "@/lib/format-date";

type Company = { id: number; name: string; status: string; company_type: string };
type Customer = {
  id: number;
  company_id: number;
  customer_no: string | null;
  customer_name: string;
  phone: string | null;
  email: string | null;
  status: string;
  default_currency: string;
  contract_reference: string | null;
};
type VehicleType = {
  id: number;
  company_id: number;
  code: string;
  name: string;
  passenger_capacity: number;
  luggage_capacity: number;
  is_active: boolean;
};
type RateCard = {
  id: number;
  company_id: number;
  vehicle_type_id: number;
  name: string;
  service_type: string;
  pricing_method: string;
  base_amount: number;
  currency: string;
  minimum_hours: number;
  included_hours: number;
  additional_hour_amount: number;
  valid_from: string;
  valid_to: string | null;
  is_active: boolean;
};
type CustomerRate = {
  id: number;
  company_id: number;
  customer_id: number;
  rate_card_id: number;
  contract_name: string;
  override_base_amount: number;
  currency: string;
  pricing_method: string | null;
  minimum_hours: number | null;
  included_hours: number | null;
  additional_hour_amount: number | null;
  valid_from: string;
  valid_to: string | null;
  priority: number;
  is_active: boolean;
  notes: string | null;
};
type MatchCharge = { name: string; amount: number; charge_type: string };
type MatchResult = {
  matched: boolean;
  message?: string;
  rate_card_id?: number;
  rate_name?: string;
  customer_rate_id?: number | null;
  customer_rate_name?: string;
  pricing_source?: string;
  currency?: string;
  base_amount?: number;
  extra_amount?: number;
  total_amount?: number;
  charges?: MatchCharge[];
};
type LoadPayload = {
  companies?: Company[];
  customers?: Customer[];
  vehicle_types?: VehicleType[];
  rate_cards?: RateCard[];
  customer_rates?: CustomerRate[];
  error?: string;
};

type Form = {
  id: number | null;
  company_id: number;
  customer_id: number;
  rate_card_id: number;
  contract_name: string;
  override_base_amount: number;
  currency: string;
  pricing_method: string;
  minimum_hours: string;
  included_hours: string;
  additional_hour_amount: string;
  valid_from: string;
  valid_to: string;
  priority: number;
  is_active: boolean;
  notes: string;
};

const today = new Date().toISOString().slice(0, 10);
const services = ["Airport Transfer", "Point-to-Point", "Hourly Disposal", "Charter", "SG-JB", "JB-SG", "Other"];
const money = (amount: number, currency = "SGD") =>
  new Intl.NumberFormat("en-SG", { style: "currency", currency: currency || "SGD" }).format(Number(amount || 0));

function blankForm(companyId = 0, customerId = 0, rateCard?: RateCard): Form {
  return {
    id: null,
    company_id: companyId,
    customer_id: customerId,
    rate_card_id: rateCard?.id ?? 0,
    contract_name: rateCard ? `Contract — ${rateCard.name}` : "",
    override_base_amount: Number(rateCard?.base_amount || 0),
    currency: rateCard?.currency || "SGD",
    pricing_method: "inherit",
    minimum_hours: "",
    included_hours: "",
    additional_hour_amount: "",
    valid_from: today,
    valid_to: "",
    priority: 100,
    is_active: true,
    notes: "",
  };
}

export default function ClientRatesPage() {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [vehicleTypes, setVehicleTypes] = useState<VehicleType[]>([]);
  const [rateCards, setRateCards] = useState<RateCard[]>([]);
  const [customerRates, setCustomerRates] = useState<CustomerRate[]>([]);
  const [companyId, setCompanyId] = useState(0);
  const [customerId, setCustomerId] = useState(0);
  const [form, setForm] = useState<Form>(blankForm());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [matching, setMatching] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [match, setMatch] = useState<MatchResult | null>(null);
  const [tester, setTester] = useState({
    vehicle_type_id: 0,
    service_type: "Airport Transfer",
    service_date: today,
    pickup_time: "",
    pickup_location: "",
    dropoff_location: "",
    passengers: 1,
    luggage: 0,
    hours: 1,
    extra_stops: 0,
  });

  const companyCustomers = useMemo(
    () => customers.filter((item) => item.company_id === companyId && item.status === "active"),
    [companyId, customers],
  );
  const companyVehicles = useMemo(
    () => vehicleTypes.filter((item) => item.company_id === companyId && item.is_active),
    [companyId, vehicleTypes],
  );
  const companyRateCards = useMemo(
    () => rateCards.filter((item) => item.company_id === companyId && item.is_active),
    [companyId, rateCards],
  );
  const selectedCustomerRates = useMemo(
    () => customerRates.filter((item) => item.company_id === companyId && item.customer_id === customerId),
    [companyId, customerId, customerRates],
  );
  const selectedStandardRate = rateCards.find((item) => item.id === Number(form.rate_card_id));

  useEffect(() => {
    void load();
  }, []);

  async function load(preferredRateId?: number) {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/admin/client-rates", { cache: "no-store" });
      const payload = (await response.json()) as LoadPayload;
      if (!response.ok) throw new Error(payload.error || "Unable to load client rates.");
      const nextCompanies = payload.companies ?? [];
      const nextCustomers = payload.customers ?? [];
      const nextVehicles = payload.vehicle_types ?? [];
      const nextRateCards = payload.rate_cards ?? [];
      const nextCustomerRates = payload.customer_rates ?? [];
      setCompanies(nextCompanies);
      setCustomers(nextCustomers);
      setVehicleTypes(nextVehicles);
      setRateCards(nextRateCards);
      setCustomerRates(nextCustomerRates);

      const nextCompanyId = companyId || nextCompanies.find((item) => item.status === "active")?.id || 0;
      const nextCustomerId =
        (customerId && nextCustomers.some((item) => item.id === customerId && item.company_id === nextCompanyId)
          ? customerId
          : nextCustomers.find((item) => item.company_id === nextCompanyId && item.status === "active")?.id) || 0;
      setCompanyId(nextCompanyId);
      setCustomerId(nextCustomerId);

      const selected = nextCustomerRates.find((item) => item.id === preferredRateId);
      if (selected) selectRate(selected);
      else startNew(nextCompanyId, nextCustomerId, nextRateCards);

      const vehicle = nextVehicles.find((item) => item.company_id === nextCompanyId && item.is_active);
      setTester((current) => ({ ...current, vehicle_type_id: current.vehicle_type_id || vehicle?.id || 0 }));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to load client rates.");
    } finally {
      setLoading(false);
    }
  }

  function startNew(nextCompanyId = companyId, nextCustomerId = customerId, cards = rateCards) {
    const standard = cards.find((item) => item.company_id === nextCompanyId && item.is_active);
    setForm(blankForm(nextCompanyId, nextCustomerId, standard));
    setNotice("Enter the negotiated rate details.");
    setError("");
  }

  function selectRate(rate: CustomerRate) {
    setCompanyId(rate.company_id);
    setCustomerId(rate.customer_id);
    setForm({
      id: rate.id,
      company_id: rate.company_id,
      customer_id: rate.customer_id,
      rate_card_id: rate.rate_card_id,
      contract_name: rate.contract_name,
      override_base_amount: Number(rate.override_base_amount || 0),
      currency: rate.currency || "SGD",
      pricing_method: rate.pricing_method || "inherit",
      minimum_hours: rate.minimum_hours == null ? "" : String(rate.minimum_hours),
      included_hours: rate.included_hours == null ? "" : String(rate.included_hours),
      additional_hour_amount: rate.additional_hour_amount == null ? "" : String(rate.additional_hour_amount),
      valid_from: rate.valid_from,
      valid_to: rate.valid_to || "",
      priority: Number(rate.priority || 100),
      is_active: Boolean(rate.is_active),
      notes: rate.notes || "",
    });
    setNotice("");
    setError("");
  }

  function changeCompany(next: number) {
    const customer = customers.find((item) => item.company_id === next && item.status === "active");
    const vehicle = vehicleTypes.find((item) => item.company_id === next && item.is_active);
    setCompanyId(next);
    setCustomerId(customer?.id || 0);
    setTester((current) => ({ ...current, vehicle_type_id: vehicle?.id || 0 }));
    setMatch(null);
    startNew(next, customer?.id || 0);
  }

  function changeCustomer(next: number) {
    setCustomerId(next);
    setMatch(null);
    startNew(companyId, next);
  }

  function update<K extends keyof Form>(key: K, value: Form[K]) {
    setForm((current) => {
      const next = { ...current, [key]: value };
      if (key === "rate_card_id") {
        const rate = rateCards.find((item) => item.id === Number(value));
        if (rate) {
          next.override_base_amount = Number(rate.base_amount || 0);
          next.currency = rate.currency || "SGD";
          if (!current.contract_name || current.contract_name.startsWith("Contract —")) {
            next.contract_name = `Contract — ${rate.name}`;
          }
        }
      }
      return next;
    });
  }

  async function save() {
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/admin/client-rates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "save",
          ...form,
          company_id: companyId,
          customer_id: customerId,
          pricing_method: form.pricing_method === "inherit" ? null : form.pricing_method,
        }),
      });
      const payload = (await response.json()) as { id?: number; error?: string };
      if (!response.ok) throw new Error(payload.error || "Unable to save customer rate.");
      await load(payload.id);
      setNotice(form.id ? "Customer contract rate updated." : "Customer contract rate created.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to save customer rate.");
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!form.id || !window.confirm("Delete this customer contract rate?")) return;
    setError("");
    const response = await fetch("/api/admin/client-rates", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "delete", id: form.id }),
    });
    const payload = (await response.json()) as { error?: string };
    if (!response.ok) {
      setError(payload.error || "Unable to delete customer rate.");
      return;
    }
    await load();
    setNotice("Customer contract rate deleted.");
  }

  async function testRate() {
    setMatching(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/admin/client-rates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "match", company_id: companyId, customer_id: customerId, ...tester }),
      });
      const payload = (await response.json()) as { match?: MatchResult; error?: string };
      if (!response.ok) throw new Error(payload.error || "Unable to test the rate.");
      setMatch(payload.match || null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to test the rate.");
    } finally {
      setMatching(false);
    }
  }

  if (loading) return <main className={styles.loading}>Loading client contract rates...</main>;

  const selectedCustomer = customers.find((item) => item.id === customerId);
  return (
    <main className={styles.page}>
      <div className={styles.wrap}>
        <header className={styles.heading}>
          <div>
            <h1>Client Contract Rates</h1>
            <p>Store negotiated limousine prices and automatically apply them in Jobs and Quotations.</p>
          </div>
          <button className={`${styles.button} ${styles.primary}`} onClick={() => startNew()}>
            + New Contract Rate
          </button>
        </header>

        {notice ? <div className={`${styles.notice} ${styles.success}`}>{notice}</div> : null}
        {error ? <div className={`${styles.notice} ${styles.error}`}>{error}</div> : null}

        <section className={styles.toolbar}>
          <label>
            Limousine company
            <select value={companyId} onChange={(event) => changeCompany(Number(event.target.value))}>
              {companies.map((company) => <option key={company.id} value={company.id}>{company.name}</option>)}
            </select>
          </label>
          <label>
            Customer
            <select value={customerId} onChange={(event) => changeCustomer(Number(event.target.value))}>
              <option value={0}>Select customer</option>
              {companyCustomers.map((customer) => (
                <option key={customer.id} value={customer.id}>
                  {customer.customer_no ? `${customer.customer_no} · ` : ""}{customer.customer_name}
                </option>
              ))}
            </select>
          </label>
        </section>

        <section className={styles.summary}>
          <article className={styles.metric}><span>Customer rates</span><strong>{selectedCustomerRates.length}</strong></article>
          <article className={styles.metric}><span>Active rates</span><strong>{selectedCustomerRates.filter((item) => item.is_active).length}</strong></article>
          <article className={styles.metric}><span>Standard cards</span><strong>{companyRateCards.length}</strong></article>
          <article className={styles.metric}><span>Selected customer</span><strong>{selectedCustomer?.customer_name || "—"}</strong></article>
        </section>

        <section className={styles.workspace}>
          <aside className={styles.panel}>
            <div className={styles.panelHeader}><div><h2>Negotiated Rates</h2><p>Rates for the selected customer.</p></div></div>
            <div className={styles.list}>
              {selectedCustomerRates.length === 0 ? <div className={styles.empty}>No contract rates yet.</div> : selectedCustomerRates.map((rate) => {
                const standard = rateCards.find((item) => item.id === rate.rate_card_id);
                return (
                  <button key={rate.id} className={form.id === rate.id ? styles.active : ""} onClick={() => selectRate(rate)}>
                    <strong>{rate.contract_name}</strong>
                    <span>{standard?.service_type || "Service"} · {standard?.name || "Rate card"}</span>
                    <small>{money(rate.override_base_amount, rate.currency)} · From {formatDate(rate.valid_from)} · {rate.is_active ? "Active" : "Inactive"}</small>
                  </button>
                );
              })}
            </div>
          </aside>

          <div>
            <article className={styles.panel}>
              <div className={styles.panelHeader}>
                <div><h2>{form.id ? "Edit Contract Rate" : "New Contract Rate"}</h2><p>Override the base price while keeping the standard route, time and surcharge rules.</p></div>
              </div>

              {selectedStandardRate ? (
                <div className={styles.standardBox}>
                  <strong>Standard: {selectedStandardRate.name}</strong>
                  <span>{selectedStandardRate.service_type} · {money(selectedStandardRate.base_amount, selectedStandardRate.currency)} · {selectedStandardRate.pricing_method.replace("_", " ")}</span>
                </div>
              ) : null}

              <div className={styles.formGrid}>
                <label className={styles.span2}>Standard rate card
                  <select value={form.rate_card_id} onChange={(event) => update("rate_card_id", Number(event.target.value))}>
                    <option value={0}>Select standard rate card</option>
                    {companyRateCards.map((rate) => {
                      const vehicle = vehicleTypes.find((item) => item.id === rate.vehicle_type_id);
                      return <option key={rate.id} value={rate.id}>{rate.service_type} · {vehicle?.code} {vehicle?.name} · {rate.name}</option>;
                    })}
                  </select>
                </label>
                <label>Contract name<input value={form.contract_name} onChange={(event) => update("contract_name", event.target.value)} /></label>
                <label>Negotiated base amount<input type="number" min="0" step="0.01" value={form.override_base_amount} onChange={(event) => update("override_base_amount", Number(event.target.value))} /></label>
                <label>Currency<input maxLength={3} value={form.currency} readOnly title="Contract rates use the standard rate card currency." /></label>
                <label>Pricing method<select value={form.pricing_method} onChange={(event) => update("pricing_method", event.target.value)}><option value="inherit">Inherit standard</option><option value="fixed">Fixed</option><option value="per_hour">Per hour</option></select></label>
                <label>Minimum hours<input type="number" min="0" step="0.5" value={form.minimum_hours} onChange={(event) => update("minimum_hours", event.target.value)} placeholder="Inherit" /></label>
                <label>Included hours<input type="number" min="0" step="0.5" value={form.included_hours} onChange={(event) => update("included_hours", event.target.value)} placeholder="Inherit" /></label>
                <label>Additional hour amount<input type="number" min="0" step="0.01" value={form.additional_hour_amount} onChange={(event) => update("additional_hour_amount", event.target.value)} placeholder="Inherit" /></label>
                <label>Valid from<input type="date" value={form.valid_from} onChange={(event) => update("valid_from", event.target.value)} /></label>
                <label>Valid to<input type="date" value={form.valid_to} onChange={(event) => update("valid_to", event.target.value)} /></label>
                <label>Priority<input type="number" value={form.priority} onChange={(event) => update("priority", Number(event.target.value))} /></label>
                <label className={styles.checkbox}><input type="checkbox" checked={form.is_active} onChange={(event) => update("is_active", event.target.checked)} /> Active contract rate</label>
                <label className={styles.span3}>Notes<textarea rows={3} value={form.notes} onChange={(event) => update("notes", event.target.value)} /></label>
              </div>
              <div className={styles.actions}>
                <button className={`${styles.button} ${styles.primary}`} disabled={saving || !customerId} onClick={() => void save()}>{saving ? "Saving..." : "Save Contract Rate"}</button>
                {form.id ? <button className={`${styles.button} ${styles.danger}`} onClick={() => void remove()}>Delete</button> : null}
              </div>
            </article>

            <article className={`${styles.panel} ${styles.tester}`}>
              <div className={styles.panelHeader}><div><h2>Customer Rate Tester</h2><p>Confirm whether this customer receives a contract rate or the standard company rate.</p></div></div>
              <div className={styles.testerGrid}>
                <label>Vehicle type<select value={tester.vehicle_type_id} onChange={(event) => setTester((current) => ({ ...current, vehicle_type_id: Number(event.target.value) }))}><option value={0}>Select vehicle</option>{companyVehicles.map((vehicle) => <option key={vehicle.id} value={vehicle.id}>{vehicle.code} — {vehicle.name}</option>)}</select></label>
                <label>Service<select value={tester.service_type} onChange={(event) => setTester((current) => ({ ...current, service_type: event.target.value }))}>{services.map((service) => <option key={service}>{service}</option>)}</select></label>
                <label>Service date<input type="date" value={tester.service_date} onChange={(event) => setTester((current) => ({ ...current, service_date: event.target.value }))} /></label>
                <label>Pickup time<input type="time" value={tester.pickup_time} onChange={(event) => setTester((current) => ({ ...current, pickup_time: event.target.value }))} /></label>
                <label>Pickup location<input value={tester.pickup_location} onChange={(event) => setTester((current) => ({ ...current, pickup_location: event.target.value }))} /></label>
                <label>Drop-off location<input value={tester.dropoff_location} onChange={(event) => setTester((current) => ({ ...current, dropoff_location: event.target.value }))} /></label>
                <label>Passengers<input type="number" min="0" value={tester.passengers} onChange={(event) => setTester((current) => ({ ...current, passengers: Number(event.target.value) }))} /></label>
                <label>Luggage<input type="number" min="0" value={tester.luggage} onChange={(event) => setTester((current) => ({ ...current, luggage: Number(event.target.value) }))} /></label>
                <label>Hours<input type="number" min="0" step="0.5" value={tester.hours} onChange={(event) => setTester((current) => ({ ...current, hours: Number(event.target.value) }))} /></label>
                <label>Extra stops<input type="number" min="0" value={tester.extra_stops} onChange={(event) => setTester((current) => ({ ...current, extra_stops: Number(event.target.value) }))} /></label>
              </div>
              <div className={styles.actions}><button className={`${styles.button} ${styles.secondary}`} disabled={matching || !customerId || !tester.vehicle_type_id} onClick={() => void testRate()}>{matching ? "Matching..." : "Test Customer Rate"}</button></div>
              {match ? (
                <div className={styles.result}>
                  <strong>{match.matched ? match.rate_name || "Matched rate" : "No rate matched"}</strong>
                  <span className={styles.source}>{(match.pricing_source || "standard").replace("_", " ")}</span>
                  {match.matched ? <p>Base {money(Number(match.base_amount || 0), match.currency)} · Extra {money(Number(match.extra_amount || 0), match.currency)} · Total {money(Number(match.total_amount || 0), match.currency)}</p> : <p>{match.message}</p>}
                  {(match.charges || []).length ? <small>{(match.charges || []).map((charge) => `${charge.name}: ${money(charge.amount, match.currency)}`).join(" · ")}</small> : null}
                </div>
              ) : null}
            </article>
          </div>
        </section>
      </div>
    </main>
  );
}
