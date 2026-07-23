"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { formatDate } from "@/lib/format-date";

type Item = { description: string; quantity: number; unit_price: number };
type Company = {
  id: number;
  name: string;
  status: string;
  company_type: string;
  gst_registered: boolean;
  gst_no: string | null;
  gst_rate: number;
  company_payment_gateways: Array<{
    gateway_code: string;
    display_name: string;
    enabled: boolean;
    fee_type: string;
    fee_value: number;
    fee_borne_by: string;
    minimum_amount: number;
  }>;
};
type Customer = {
  id: number;
  company_id: number;
  customer_no: string | null;
  customer_name: string;
  phone: string | null;
  email: string | null;
  status: string;
  default_currency: string;
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
type MatchCharge = { rule_id: number; name: string; charge_type: string; amount: number };
type MatchResult = {
  matched: boolean;
  message?: string;
  rate_card_id?: number;
  rate_name?: string;
  customer_rate_id?: number | null;
  pricing_source?: string;
  currency?: string;
  base_amount?: number;
  extra_amount?: number;
  total_amount?: number;
  charges?: MatchCharge[];
};
type Quotation = {
  id: number;
  company_id: number;
  customer_id: number;
  quotation_no: string | null;
  quotation_date: string;
  valid_until: string | null;
  status: string;
  currency: string;
  service_charge_rate: number;
  gst_rate: number;
  payment_gateway_code: string | null;
  notes: string | null;
  terms: string | null;
  total_amount: number;
  limousine_vehicle_type_id: number | null;
  service_type: string | null;
  service_date: string | null;
  pickup_time: string | null;
  pickup_location: string | null;
  dropoff_location: string | null;
  passenger_count: number;
  luggage_count: number;
  duration_hours: number;
  extra_stops: number;
  matched_rate_card_id: number | null;
  matched_customer_rate_id: number | null;
  pricing_source: string;
  rate_match_details: MatchResult | null;
  customers: Customer | null;
  quotation_items: Array<Item & { id: number; sort_order: number }>;
};
type Form = {
  company_id: number;
  customer_id: number;
  quotation_no: string;
  quotation_date: string;
  valid_until: string;
  status: string;
  currency: string;
  service_charge_rate: number;
  gst_rate: number;
  payment_gateway_code: string;
  notes: string;
  terms: string;
  items: Item[];
  limousine_vehicle_type_id: number | null;
  service_type: string;
  service_date: string;
  pickup_time: string;
  pickup_location: string;
  dropoff_location: string;
  passenger_count: number;
  luggage_count: number;
  duration_hours: number;
  extra_stops: number;
  matched_rate_card_id: number | null;
  matched_customer_rate_id: number | null;
  pricing_source: string;
  rate_match_details: MatchResult | null;
};
type LoadPayload = {
  quotations?: Quotation[];
  customers?: Customer[];
  companies?: Company[];
  vehicle_types?: VehicleType[];
  error?: string;
};

const today = new Date().toISOString().slice(0, 10);
const later = new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10);
const serviceTypes = ["Airport Transfer", "Point-to-Point", "Hourly Disposal", "Charter", "SG-JB", "JB-SG", "Other"];
const money = (amount: number, currency = "SGD") =>
  new Intl.NumberFormat("en-SG", { style: "currency", currency: currency || "SGD" }).format(Number(amount || 0));

const emptyForm: Form = {
  company_id: 0,
  customer_id: 0,
  quotation_no: "",
  quotation_date: today,
  valid_until: later,
  status: "draft",
  currency: "SGD",
  service_charge_rate: 0,
  gst_rate: 9,
  payment_gateway_code: "",
  notes: "",
  terms: "Prices are valid until the stated validity date.",
  items: [{ description: "Airport Transfer", quantity: 1, unit_price: 0 }],
  limousine_vehicle_type_id: null,
  service_type: "Airport Transfer",
  service_date: today,
  pickup_time: "",
  pickup_location: "",
  dropoff_location: "",
  passenger_count: 1,
  luggage_count: 0,
  duration_hours: 1,
  extra_stops: 0,
  matched_rate_card_id: null,
  matched_customer_rate_id: null,
  pricing_source: "manual",
  rate_match_details: null,
};

function normaliseQuotation(quotation: Quotation): Form {
  return {
    ...emptyForm,
    ...quotation,
    quotation_no: quotation.quotation_no || "",
    valid_until: quotation.valid_until || "",
    payment_gateway_code: quotation.payment_gateway_code || "",
    notes: quotation.notes || "",
    terms: quotation.terms || "",
    limousine_vehicle_type_id: quotation.limousine_vehicle_type_id || null,
    service_type: quotation.service_type || "Airport Transfer",
    service_date: quotation.service_date || quotation.quotation_date || today,
    pickup_time: quotation.pickup_time?.slice(0, 5) || "",
    pickup_location: quotation.pickup_location || "",
    dropoff_location: quotation.dropoff_location || "",
    passenger_count: Number(quotation.passenger_count || 1),
    luggage_count: Number(quotation.luggage_count || 0),
    duration_hours: Number(quotation.duration_hours || 1),
    extra_stops: Number(quotation.extra_stops || 0),
    matched_rate_card_id: quotation.matched_rate_card_id || null,
    matched_customer_rate_id: quotation.matched_customer_rate_id || null,
    pricing_source: quotation.pricing_source || "manual",
    rate_match_details: quotation.rate_match_details || null,
    items: [...(quotation.quotation_items || [])]
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((item) => ({
        description: item.description,
        quantity: Number(item.quantity),
        unit_price: Number(item.unit_price),
      })),
  };
}

export default function QuotationsPage() {
  const [quotations, setQuotations] = useState<Quotation[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [vehicleTypes, setVehicleTypes] = useState<VehicleType[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [form, setForm] = useState<Form>(emptyForm);
  const [match, setMatch] = useState<MatchResult | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [saving, setSaving] = useState(false);
  const [matching, setMatching] = useState(false);

  useEffect(() => { void load(); }, []);

  const company = companies.find((item) => item.id === Number(form.company_id));
  const availableCustomers = customers.filter((item) => item.company_id === Number(form.company_id));
  const availableVehicles = vehicleTypes.filter(
    (item) => item.company_id === Number(form.company_id) && (item.is_active || item.id === form.limousine_vehicle_type_id),
  );
  const gstEnabled = Boolean(company?.gst_registered);
  const gateways = (company?.company_payment_gateways || []).filter((item) => item.enabled);
  const selectedGateway = gateways.find((item) => item.gateway_code === form.payment_gateway_code);

  const totals = useMemo(() => {
    const subtotal = form.items.reduce((sum, item) => sum + Number(item.quantity || 0) * Number(item.unit_price || 0), 0);
    const serviceCharge = subtotal * Number(form.service_charge_rate || 0) / 100;
    const gst = gstEnabled ? (subtotal + serviceCharge) * Number(form.gst_rate || company?.gst_rate || 0) / 100 : 0;
    const feeBase = subtotal + serviceCharge + gst;
    const adminFee =
      selectedGateway && selectedGateway.fee_borne_by === "customer" && feeBase >= Number(selectedGateway.minimum_amount || 0)
        ? selectedGateway.fee_type === "fixed"
          ? Number(selectedGateway.fee_value || 0)
          : feeBase * Number(selectedGateway.fee_value || 0) / 100
        : 0;
    return { subtotal, serviceCharge, gst, adminFee, total: subtotal + serviceCharge + gst + adminFee };
  }, [company?.gst_rate, form.gst_rate, form.items, form.service_charge_rate, gstEnabled, selectedGateway]);

  async function load(preferredId?: number) {
    setError("");
    const response = await fetch("/api/admin/quotations", { cache: "no-store" });
    const payload = (await response.json()) as LoadPayload;
    if (!response.ok) {
      setError(payload.error || "Unable to load quotations.");
      return;
    }
    const nextQuotations = payload.quotations || [];
    const nextCustomers = payload.customers || [];
    const nextCompanies = payload.companies || [];
    const nextVehicles = payload.vehicle_types || [];
    setQuotations(nextQuotations);
    setCustomers(nextCustomers);
    setCompanies(nextCompanies);
    setVehicleTypes(nextVehicles);
    const selected = nextQuotations.find((item) => item.id === preferredId);
    if (selected) pick(selected);
    else if (!selectedId) newQuotation(nextCompanies, nextCustomers, nextVehicles);
  }

  function newQuotation(
    companyRows = companies,
    customerRows = customers,
    vehicleRows = vehicleTypes,
  ) {
    const nextCompany = companyRows.find((item) => item.status === "active");
    const nextCustomer = customerRows.find((item) => item.company_id === nextCompany?.id && item.status === "active");
    const nextVehicle = vehicleRows.find((item) => item.company_id === nextCompany?.id && item.is_active);
    setSelectedId(null);
    setForm({
      ...emptyForm,
      company_id: nextCompany?.id || 0,
      customer_id: nextCustomer?.id || 0,
      currency: nextCustomer?.default_currency || "SGD",
      gst_rate: Number(nextCompany?.gst_rate || 9),
      limousine_vehicle_type_id: nextVehicle?.id || null,
      quotation_date: today,
      service_date: today,
      valid_until: later,
      items: [...emptyForm.items],
    });
    setMatch(null);
    setNotice("Enter the quotation details.");
  }

  function pick(quotation: Quotation) {
    setSelectedId(quotation.id);
    const next = normaliseQuotation(quotation);
    setForm(next);
    setMatch(next.rate_match_details);
    setNotice("");
    setError("");
  }

  function update<K extends keyof Form>(key: K, value: Form[K]) {
    const rateSensitive = ["company_id", "customer_id", "limousine_vehicle_type_id", "service_type", "service_date", "pickup_time", "pickup_location", "dropoff_location", "passenger_count", "luggage_count", "duration_hours", "extra_stops"].includes(String(key));
    if (rateSensitive) setMatch(null);

    setForm((current) => {
      const next = { ...current, [key]: value };
      if (key === "company_id") {
        const companyId = Number(value);
        const nextCustomer = customers.find((item) => item.company_id === companyId && item.status === "active");
        const nextVehicle = vehicleTypes.find((item) => item.company_id === companyId && item.is_active);
        const nextCompany = companies.find((item) => item.id === companyId);
        next.customer_id = nextCustomer?.id || 0;
        next.currency = nextCustomer?.default_currency || "SGD";
        next.limousine_vehicle_type_id = nextVehicle?.id || null;
        next.gst_rate = Number(nextCompany?.gst_rate || 9);
        next.payment_gateway_code = "";
      }
      if (key === "customer_id") {
        const customer = customers.find((item) => item.id === Number(value));
        if (customer?.default_currency) next.currency = customer.default_currency;
      }
      if (rateSensitive) {
        next.matched_rate_card_id = null;
        next.matched_customer_rate_id = null;
        next.pricing_source = "manual";
        next.rate_match_details = null;
      }
      return next;
    });
  }

  function updateItem(index: number, key: keyof Item, value: string | number) {
    setForm((current) => ({
      ...current,
      items: current.items.map((item, itemIndex) => itemIndex === index ? { ...item, [key]: value } : item),
    }));
  }

  function addItem() {
    setForm((current) => ({ ...current, items: [...current.items, { description: "", quantity: 1, unit_price: 0 }] }));
  }

  function removeItem(index: number) {
    setForm((current) => ({ ...current, items: current.items.length === 1 ? current.items : current.items.filter((_, itemIndex) => itemIndex !== index) }));
  }

  async function findCustomerRate() {
    if (!form.company_id || !form.customer_id || !form.limousine_vehicle_type_id) {
      setError("Select a company, customer and limousine vehicle type first.");
      return;
    }
    setMatching(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/admin/client-rates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "match",
          company_id: form.company_id,
          customer_id: form.customer_id,
          vehicle_type_id: form.limousine_vehicle_type_id,
          service_type: form.service_type,
          service_date: form.service_date,
          pickup_time: form.pickup_time,
          pickup_location: form.pickup_location,
          dropoff_location: form.dropoff_location,
          passengers: form.passenger_count,
          luggage: form.luggage_count,
          hours: form.duration_hours,
          extra_stops: form.extra_stops,
        }),
      });
      const payload = (await response.json()) as { match?: MatchResult; error?: string };
      if (!response.ok) throw new Error(payload.error || "Unable to match a rate.");
      const result = payload.match || null;
      setMatch(result);
      if (!result?.matched) {
        setNotice(result?.message || "No rate matched this quotation.");
        return;
      }
      const items: Item[] = [
        {
          description: `${result.rate_name || form.service_type} — Base fare`,
          quantity: 1,
          unit_price: Number(result.base_amount || 0),
        },
        ...(result.charges || []).map((charge) => ({
          description: charge.name,
          quantity: 1,
          unit_price: Number(charge.amount || 0),
        })),
      ];
      setForm((current) => ({
        ...current,
        items,
        currency: result.currency || current.currency,
        matched_rate_card_id: result.rate_card_id || null,
        matched_customer_rate_id: result.customer_rate_id || null,
        pricing_source: result.pricing_source || "standard",
        rate_match_details: result,
      }));
      setNotice(
        result.pricing_source === "customer_contract"
          ? "Customer contract rate inserted into the quotation."
          : "Standard company rate inserted into the quotation.",
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to match a rate.");
    } finally {
      setMatching(false);
    }
  }

  async function save() {
    setSaving(true);
    setError("");
    setNotice("");
    const response = await fetch("/api/admin/quotations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: selectedId ? "update" : "create", quotation_id: selectedId, ...form }),
    });
    const payload = (await response.json()) as { quotation_id?: number; error?: string };
    setSaving(false);
    if (!response.ok) {
      setError(payload.error || "Unable to save quotation.");
      return;
    }
    await load(payload.quotation_id);
    setNotice(selectedId ? "Quotation updated." : "Quotation created.");
  }

  async function remove() {
    if (!selectedId || !window.confirm("Delete this quotation?")) return;
    const response = await fetch("/api/admin/quotations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "delete", quotation_id: selectedId }),
    });
    const payload = (await response.json()) as { error?: string };
    if (!response.ok) {
      setError(payload.error || "Unable to delete quotation.");
      return;
    }
    await load();
  }

  return (
    <main className="container">
      <div className="page-heading-row">
        <div><h1 className="page-title">Quotations</h1><p className="subtitle">Prepare branded quotations with standard or customer contract rates.</p></div>
        <button className="button primary" onClick={() => newQuotation()}>+ New Quotation</button>
      </div>

      {notice ? <div className="notice success">{notice}</div> : null}
      {error ? <div className="notice error">{error}</div> : null}

      <section className="driver-summary-grid">
        <article className="card metric"><span>Total</span><strong>{quotations.length}</strong></article>
        <article className="card metric"><span>Accepted</span><strong>{quotations.filter((item) => item.status === "accepted").length}</strong></article>
        <article className="card metric"><span>Contract Rated</span><strong>{quotations.filter((item) => item.pricing_source === "customer_contract").length}</strong></article>
        <article className="card metric"><span>Quoted Value</span><strong>{money(quotations.reduce((sum, item) => sum + Number(item.total_amount || 0), 0))}</strong></article>
      </section>

      <section className="job-management-grid">
        <article className="card job-list-card">
          <h2>Quotation List</h2>
          <div className="job-list">
            {quotations.map((quotation) => (
              <button key={quotation.id} className={`job-list-item ${selectedId === quotation.id ? "active" : ""}`} onClick={() => pick(quotation)}>
                <strong>{quotation.quotation_no || `QT-${quotation.id}`}</strong>
                <span>{quotation.customers?.customer_name || "Customer"}</span>
                <span>{formatDate(quotation.quotation_date)} · Valid to {formatDate(quotation.valid_until)}</span>
                <span className="job-list-bottom"><em>{quotation.status}</em><b>{money(Number(quotation.total_amount), quotation.currency)}</b></span>
              </button>
            ))}
          </div>
        </article>

        <article className="card">
          <div className="section-title-row"><h2>{selectedId ? "Edit Quotation" : "New Quotation"}</h2>{selectedId ? <span className="badge">#{selectedId}</span> : null}</div>

          <div className="form-grid">
            <label>Company<select value={form.company_id} onChange={(event) => update("company_id", Number(event.target.value))}><option value={0}>Select company</option>{companies.filter((item) => item.status === "active").map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
            <label>Customer<select value={form.customer_id} onChange={(event) => update("customer_id", Number(event.target.value))}><option value={0}>Select customer</option>{availableCustomers.map((item) => <option key={item.id} value={item.id}>{item.customer_no ? `${item.customer_no} — ` : ""}{item.customer_name}</option>)}</select></label>
            <label>Quotation number<input value={form.quotation_no} onChange={(event) => update("quotation_no", event.target.value)} placeholder="Auto-generated when blank" /></label>
            <label>Quotation date (DD/MM/YYYY)<input type="date" value={form.quotation_date} onChange={(event) => update("quotation_date", event.target.value)} /></label>
            <label>Valid until (DD/MM/YYYY)<input type="date" value={form.valid_until} onChange={(event) => update("valid_until", event.target.value)} /></label>
            <label>Status<select value={form.status} onChange={(event) => update("status", event.target.value)}><option value="draft">Draft</option><option value="sent">Sent</option><option value="accepted">Accepted</option><option value="rejected">Rejected</option><option value="expired">Expired</option><option value="converted">Converted</option><option value="cancelled">Cancelled</option></select></label>
          </div>

          <div className="section-title-row"><div><h2>Rate Finder</h2><p className="subtitle">Use the selected customer’s negotiated rate when available.</p></div><Link className="button secondary" href="/client-rates">Manage Client Rates</Link></div>
          <div className="form-grid">
            <label>Vehicle type<select value={form.limousine_vehicle_type_id || 0} onChange={(event) => update("limousine_vehicle_type_id", Number(event.target.value) || null)}><option value={0}>Select vehicle</option>{availableVehicles.map((item) => <option key={item.id} value={item.id}>{item.code} — {item.name}</option>)}</select></label>
            <label>Service type<select value={form.service_type} onChange={(event) => update("service_type", event.target.value)}>{serviceTypes.map((item) => <option key={item}>{item}</option>)}</select></label>
            <label>Service date (DD/MM/YYYY)<input type="date" value={form.service_date} onChange={(event) => update("service_date", event.target.value)} /></label>
            <label>Pickup time<input type="time" value={form.pickup_time} onChange={(event) => update("pickup_time", event.target.value)} /></label>
            <label className="span-2">Pickup location<input value={form.pickup_location} onChange={(event) => update("pickup_location", event.target.value)} /></label>
            <label className="span-2">Drop-off location<input value={form.dropoff_location} onChange={(event) => update("dropoff_location", event.target.value)} /></label>
            <label>Passengers<input type="number" min="0" value={form.passenger_count} onChange={(event) => update("passenger_count", Number(event.target.value))} /></label>
            <label>Luggage<input type="number" min="0" value={form.luggage_count} onChange={(event) => update("luggage_count", Number(event.target.value))} /></label>
            <label>Hours<input type="number" min="0" step="0.5" value={form.duration_hours} onChange={(event) => update("duration_hours", Number(event.target.value))} /></label>
            <label>Extra stops<input type="number" min="0" value={form.extra_stops} onChange={(event) => update("extra_stops", Number(event.target.value))} /></label>
          </div>
          <div className="actions"><button className="button secondary" disabled={matching} onClick={() => void findCustomerRate()}>{matching ? "Matching..." : "Find Customer Rate"}</button></div>
          {match ? <div className={`notice ${match.matched ? "success" : "error"}`}><strong>{match.matched ? match.rate_name : "No rate matched"}</strong>{match.matched ? <div>Pricing source: {(match.pricing_source || "standard").replace("_", " ")} · Base {money(Number(match.base_amount || 0), match.currency)} · Extra {money(Number(match.extra_amount || 0), match.currency)} · Total {money(Number(match.total_amount || 0), match.currency)}</div> : <div>{match.message}</div>}</div> : null}

          <div className="section-title-row"><h2>Quotation Items</h2><button className="button secondary" onClick={addItem}>+ Add Item</button></div>
          <div className="table-wrap">
            <table className="data-table"><thead><tr><th>Description</th><th>Qty</th><th>Unit Price</th><th>Amount</th><th /></tr></thead><tbody>{form.items.map((item, index) => <tr key={index}><td><input value={item.description} onChange={(event) => updateItem(index, "description", event.target.value)} /></td><td><input type="number" min="0.001" step="0.001" value={item.quantity} onChange={(event) => updateItem(index, "quantity", Number(event.target.value))} /></td><td><input type="number" min="0" step="0.01" value={item.unit_price} onChange={(event) => updateItem(index, "unit_price", Number(event.target.value))} /></td><td>{money(item.quantity * item.unit_price, form.currency)}</td><td><button className="button danger" onClick={() => removeItem(index)}>×</button></td></tr>)}</tbody></table>
          </div>

          <div className="form-grid">
            <label>Currency<input maxLength={3} value={form.currency} onChange={(event) => update("currency", event.target.value.toUpperCase())} /></label>
            <label>Service charge %<input type="number" min="0" step="0.01" value={form.service_charge_rate} onChange={(event) => update("service_charge_rate", Number(event.target.value))} /></label>
            <label>GST %<input type="number" min="0" step="0.01" disabled={!gstEnabled} value={gstEnabled ? form.gst_rate : 0} onChange={(event) => update("gst_rate", Number(event.target.value))} /></label>
            <label>Payment gateway<select value={form.payment_gateway_code} onChange={(event) => update("payment_gateway_code", event.target.value)}><option value="">No gateway fee</option>{gateways.map((item) => <option key={item.gateway_code} value={item.gateway_code}>{item.display_name}</option>)}</select></label>
            <label className="span-2">Notes<textarea rows={3} value={form.notes} onChange={(event) => update("notes", event.target.value)} /></label>
            <label className="span-2">Terms<textarea rows={3} value={form.terms} onChange={(event) => update("terms", event.target.value)} /></label>
          </div>

          <section className="card"><p>Subtotal: <strong>{money(totals.subtotal, form.currency)}</strong></p><p>Service charge: <strong>{money(totals.serviceCharge, form.currency)}</strong></p><p>GST: <strong>{money(totals.gst, form.currency)}</strong></p><p>Admin fee: <strong>{money(totals.adminFee, form.currency)}</strong></p><p>Total: <strong>{money(totals.total, form.currency)}</strong></p></section>

          <div className="actions">
            <button className="button primary" disabled={saving} onClick={() => void save()}>{saving ? "Saving..." : "Save Quotation"}</button>
            {selectedId ? <><Link className="button secondary" href={`/quotations/${selectedId}/print`} target="_blank">Open PDF View</Link><button className="button danger" onClick={() => void remove()}>Delete</button></> : null}
          </div>
        </article>
      </section>
    </main>
  );
}
