"use client";

import { useEffect, useMemo, useState } from "react";
import { formatDate } from "@/lib/format-date";
import styles from "./limousine-rates.module.css";

type Tab = "vehicles" | "rates" | "extras" | "tester";
type Company = { id: number; name: string; status: string; company_type: string };
type VehicleType = {
  id: number;
  company_id: number;
  code: string;
  name: string;
  passenger_capacity: number;
  luggage_capacity: number;
  is_active: boolean;
  sort_order: number;
  notes: string | null;
};
type RateCard = {
  id: number;
  company_id: number;
  vehicle_type_id: number;
  name: string;
  service_type: string;
  pricing_method: "fixed" | "per_hour";
  base_amount: number;
  currency: string;
  minimum_hours: number;
  included_hours: number;
  additional_hour_amount: number;
  valid_from: string;
  valid_to: string | null;
  days_of_week: number[];
  start_time: string | null;
  end_time: string | null;
  pickup_pattern: string | null;
  dropoff_pattern: string | null;
  min_passengers: number;
  max_passengers: number | null;
  min_luggage: number;
  max_luggage: number | null;
  priority: number;
  is_active: boolean;
  notes: string | null;
};
type ExtraRule = {
  id: number;
  company_id: number;
  vehicle_type_id: number | null;
  service_type: string | null;
  name: string;
  rule_basis: string;
  match_text: string | null;
  threshold: number;
  charge_type: string;
  amount: number;
  valid_from: string;
  valid_to: string | null;
  days_of_week: number[];
  start_time: string | null;
  end_time: string | null;
  is_stackable: boolean;
  priority: number;
  is_active: boolean;
  notes: string | null;
};
type MatchCharge = {
  rule_id: number;
  name: string;
  charge_type: string;
  amount: number;
  stackable: boolean;
};
type MatchResult = {
  matched: boolean;
  message?: string;
  rate_card_id?: number;
  rate_name?: string;
  vehicle_type_id?: number;
  service_type?: string;
  pricing_method?: string;
  currency?: string;
  base_amount?: number;
  extra_amount?: number;
  total_amount?: number;
  charges?: MatchCharge[];
};

type VehicleForm = {
  id: number | null;
  company_id: number;
  code: string;
  name: string;
  passenger_capacity: string;
  luggage_capacity: string;
  is_active: boolean;
  sort_order: string;
  notes: string;
};
type RateForm = {
  id: number | null;
  company_id: number;
  vehicle_type_id: number;
  name: string;
  service_type: string;
  pricing_method: "fixed" | "per_hour";
  base_amount: string;
  currency: string;
  minimum_hours: string;
  included_hours: string;
  additional_hour_amount: string;
  valid_from: string;
  valid_to: string;
  days_of_week: number[];
  start_time: string;
  end_time: string;
  pickup_pattern: string;
  dropoff_pattern: string;
  min_passengers: string;
  max_passengers: string;
  min_luggage: string;
  max_luggage: string;
  priority: string;
  is_active: boolean;
  notes: string;
};
type RuleForm = {
  id: number | null;
  company_id: number;
  vehicle_type_id: number;
  service_type: string;
  name: string;
  rule_basis: string;
  match_text: string;
  threshold: string;
  charge_type: string;
  amount: string;
  valid_from: string;
  valid_to: string;
  days_of_week: number[];
  start_time: string;
  end_time: string;
  is_stackable: boolean;
  priority: string;
  is_active: boolean;
  notes: string;
};
type TesterForm = {
  company_id: number;
  vehicle_type_id: number;
  service_type: string;
  service_date: string;
  pickup_time: string;
  pickup_location: string;
  dropoff_location: string;
  passengers: string;
  luggage: string;
  hours: string;
  extra_stops: string;
};

const today = new Date().toISOString().slice(0, 10);
const serviceTypes = [
  "Airport Transfer",
  "Point-to-Point",
  "Hourly Disposal",
  "Charter",
  "SG-JB",
  "JB-SG",
  "Other",
];
const dayOptions = [
  [1, "Mon"],
  [2, "Tue"],
  [3, "Wed"],
  [4, "Thu"],
  [5, "Fri"],
  [6, "Sat"],
  [7, "Sun"],
] as const;
const ruleBasisLabels: Record<string, string> = {
  always: "Always",
  time_window: "Time window",
  pickup_contains: "Pickup contains text",
  dropoff_contains: "Drop-off contains text",
  extra_stop: "Extra stop count",
  additional_hour: "Additional hours",
  passenger_count: "Passenger count",
  luggage_count: "Luggage count",
};
const chargeTypeLabels: Record<string, string> = {
  fixed: "Fixed amount",
  percentage: "Percentage of base fare",
  per_unit: "Per unit above threshold",
};

function money(value: number | undefined, currency = "SGD") {
  return new Intl.NumberFormat("en-SG", {
    style: "currency",
    currency,
  }).format(Number(value ?? 0));
}

function vehicleForm(companyId: number, row?: VehicleType): VehicleForm {
  return {
    id: row?.id ?? null,
    company_id: companyId,
    code: row?.code ?? "",
    name: row?.name ?? "",
    passenger_capacity: String(row?.passenger_capacity ?? 4),
    luggage_capacity: String(row?.luggage_capacity ?? 2),
    is_active: row?.is_active ?? true,
    sort_order: String(row?.sort_order ?? 100),
    notes: row?.notes ?? "",
  };
}

function rateForm(companyId: number, vehicleTypeId: number, row?: RateCard): RateForm {
  return {
    id: row?.id ?? null,
    company_id: companyId,
    vehicle_type_id: row?.vehicle_type_id ?? vehicleTypeId,
    name: row?.name ?? "",
    service_type: row?.service_type ?? "Airport Transfer",
    pricing_method: row?.pricing_method ?? "fixed",
    base_amount: String(row?.base_amount ?? 0),
    currency: row?.currency ?? "SGD",
    minimum_hours: String(row?.minimum_hours ?? 1),
    included_hours: String(row?.included_hours ?? 0),
    additional_hour_amount: String(row?.additional_hour_amount ?? 0),
    valid_from: row?.valid_from ?? today,
    valid_to: row?.valid_to ?? "",
    days_of_week: row?.days_of_week ?? [],
    start_time: row?.start_time?.slice(0, 5) ?? "",
    end_time: row?.end_time?.slice(0, 5) ?? "",
    pickup_pattern: row?.pickup_pattern ?? "",
    dropoff_pattern: row?.dropoff_pattern ?? "",
    min_passengers: String(row?.min_passengers ?? 0),
    max_passengers: row?.max_passengers == null ? "" : String(row.max_passengers),
    min_luggage: String(row?.min_luggage ?? 0),
    max_luggage: row?.max_luggage == null ? "" : String(row.max_luggage),
    priority: String(row?.priority ?? 100),
    is_active: row?.is_active ?? true,
    notes: row?.notes ?? "",
  };
}

function ruleForm(companyId: number, row?: ExtraRule): RuleForm {
  return {
    id: row?.id ?? null,
    company_id: companyId,
    vehicle_type_id: row?.vehicle_type_id ?? 0,
    service_type: row?.service_type ?? "",
    name: row?.name ?? "",
    rule_basis: row?.rule_basis ?? "always",
    match_text: row?.match_text ?? "",
    threshold: String(row?.threshold ?? 0),
    charge_type: row?.charge_type ?? "fixed",
    amount: String(row?.amount ?? 0),
    valid_from: row?.valid_from ?? today,
    valid_to: row?.valid_to ?? "",
    days_of_week: row?.days_of_week ?? [],
    start_time: row?.start_time?.slice(0, 5) ?? "",
    end_time: row?.end_time?.slice(0, 5) ?? "",
    is_stackable: row?.is_stackable ?? true,
    priority: String(row?.priority ?? 100),
    is_active: row?.is_active ?? true,
    notes: row?.notes ?? "",
  };
}

function testerForm(companyId: number, vehicleTypeId: number): TesterForm {
  return {
    company_id: companyId,
    vehicle_type_id: vehicleTypeId,
    service_type: "Airport Transfer",
    service_date: today,
    pickup_time: "",
    pickup_location: "",
    dropoff_location: "",
    passengers: "1",
    luggage: "0",
    hours: "1",
    extra_stops: "0",
  };
}

function DaySelector({
  value,
  onChange,
}: {
  value: number[];
  onChange: (days: number[]) => void;
}) {
  function toggle(day: number) {
    onChange(
      value.includes(day)
        ? value.filter((item) => item !== day)
        : [...value, day].sort((a, b) => a - b),
    );
  }

  return (
    <div className={styles.days}>
      {dayOptions.map(([day, label]) => (
        <button
          key={day}
          type="button"
          className={`${styles.dayButton} ${value.includes(day) ? styles.dayActive : ""}`}
          onClick={() => toggle(day)}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

export default function LimousineRatesPage() {
  const [tab, setTab] = useState<Tab>("vehicles");
  const [companies, setCompanies] = useState<Company[]>([]);
  const [vehicleTypes, setVehicleTypes] = useState<VehicleType[]>([]);
  const [rateCards, setRateCards] = useState<RateCard[]>([]);
  const [extraRules, setExtraRules] = useState<ExtraRule[]>([]);
  const [companyId, setCompanyId] = useState(0);
  const [vehicle, setVehicle] = useState<VehicleForm>(() => vehicleForm(0));
  const [rate, setRate] = useState<RateForm>(() => rateForm(0, 0));
  const [rule, setRule] = useState<RuleForm>(() => ruleForm(0));
  const [tester, setTester] = useState<TesterForm>(() => testerForm(0, 0));
  const [match, setMatch] = useState<MatchResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [matching, setMatching] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  const companyVehicles = useMemo(
    () => vehicleTypes.filter((item) => item.company_id === companyId),
    [companyId, vehicleTypes],
  );
  const companyRates = useMemo(
    () => rateCards.filter((item) => item.company_id === companyId),
    [companyId, rateCards],
  );
  const companyRules = useMemo(
    () => extraRules.filter((item) => item.company_id === companyId),
    [companyId, extraRules],
  );
  const vehicleNames = useMemo(
    () => new Map(vehicleTypes.map((item) => [item.id, item.name])),
    [vehicleTypes],
  );

  useEffect(() => {
    void load();
  }, []);

  async function load(preferredCompanyId?: number) {
    setLoading(true);
    setError("");
    const response = await fetch("/api/admin/limousine-rates", { cache: "no-store" });
    const payload = await response.json();
    if (!response.ok) {
      setError(payload.error || "Unable to load limousine rates.");
      setLoading(false);
      return;
    }

    const nextCompanies = (payload.companies ?? []) as Company[];
    const nextVehicles = (payload.vehicle_types ?? []) as VehicleType[];
    const nextRates = (payload.rate_cards ?? []) as RateCard[];
    const nextRules = (payload.extra_rules ?? []) as ExtraRule[];
    const nextCompanyId =
      preferredCompanyId && nextCompanies.some((item) => item.id === preferredCompanyId)
        ? preferredCompanyId
        : companyId && nextCompanies.some((item) => item.id === companyId)
          ? companyId
          : nextCompanies.find((item) => item.status === "active")?.id ?? nextCompanies[0]?.id ?? 0;
    const firstVehicleId =
      nextVehicles.find((item) => item.company_id === nextCompanyId && item.is_active)?.id ??
      nextVehicles.find((item) => item.company_id === nextCompanyId)?.id ??
      0;

    setCompanies(nextCompanies);
    setVehicleTypes(nextVehicles);
    setRateCards(nextRates);
    setExtraRules(nextRules);
    setCompanyId(nextCompanyId);
    setVehicle(vehicleForm(nextCompanyId));
    setRate(rateForm(nextCompanyId, firstVehicleId));
    setRule(ruleForm(nextCompanyId));
    setTester(testerForm(nextCompanyId, firstVehicleId));
    setMatch(null);
    setLoading(false);
  }

  function chooseCompany(nextCompanyId: number) {
    const firstVehicleId =
      vehicleTypes.find((item) => item.company_id === nextCompanyId && item.is_active)?.id ??
      vehicleTypes.find((item) => item.company_id === nextCompanyId)?.id ??
      0;
    setCompanyId(nextCompanyId);
    setVehicle(vehicleForm(nextCompanyId));
    setRate(rateForm(nextCompanyId, firstVehicleId));
    setRule(ruleForm(nextCompanyId));
    setTester(testerForm(nextCompanyId, firstVehicleId));
    setMatch(null);
    setNotice("");
    setError("");
  }

  async function post(body: Record<string, unknown>) {
    const response = await fetch("/api/admin/limousine-rates", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || "Request failed.");
    return payload as Record<string, unknown>;
  }

  async function saveVehicle() {
    setSaving(true);
    setError("");
    setNotice("");
    try {
      await post({ action: "save_vehicle_type", ...vehicle });
      await load(companyId);
      setNotice(vehicle.id ? "Vehicle type updated." : "Vehicle type created.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to save vehicle type.");
    } finally {
      setSaving(false);
    }
  }

  async function deleteVehicle() {
    if (!vehicle.id || !confirm("Delete this vehicle type and its rate cards?")) return;
    setSaving(true);
    setError("");
    try {
      await post({ action: "delete_vehicle_type", id: vehicle.id });
      await load(companyId);
      setNotice("Vehicle type deleted.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to delete vehicle type.");
    } finally {
      setSaving(false);
    }
  }

  async function saveRate() {
    setSaving(true);
    setError("");
    setNotice("");
    try {
      await post({ action: "save_rate_card", ...rate });
      await load(companyId);
      setNotice(rate.id ? "Rate card updated." : "Rate card created.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to save rate card.");
    } finally {
      setSaving(false);
    }
  }

  async function deleteRate() {
    if (!rate.id || !confirm("Delete this rate card?")) return;
    setSaving(true);
    setError("");
    try {
      await post({ action: "delete_rate_card", id: rate.id });
      await load(companyId);
      setNotice("Rate card deleted.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to delete rate card.");
    } finally {
      setSaving(false);
    }
  }

  async function saveRule() {
    setSaving(true);
    setError("");
    setNotice("");
    try {
      await post({ action: "save_extra_rule", ...rule });
      await load(companyId);
      setNotice(rule.id ? "Extra-charge rule updated." : "Extra-charge rule created.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to save extra-charge rule.");
    } finally {
      setSaving(false);
    }
  }

  async function deleteRule() {
    if (!rule.id || !confirm("Delete this extra-charge rule?")) return;
    setSaving(true);
    setError("");
    try {
      await post({ action: "delete_extra_rule", id: rule.id });
      await load(companyId);
      setNotice("Extra-charge rule deleted.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to delete extra-charge rule.");
    } finally {
      setSaving(false);
    }
  }

  async function testRate() {
    setMatching(true);
    setError("");
    setMatch(null);
    try {
      const payload = await post({ action: "match", ...tester });
      setMatch(payload.match as MatchResult);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to match a rate.");
    } finally {
      setMatching(false);
    }
  }

  const selectedCompany = companies.find((item) => item.id === companyId);

  return (
    <main className={styles.page}>
      <header className={styles.heading}>
        <div>
          <p className={styles.eyebrow}>Limousine Operations</p>
          <h1>Limousine Rate Management</h1>
          <p>
            Maintain vehicle types, rate cards and surcharges, then test the exact fare before assigning it to a job.
          </p>
        </div>
        <label className={styles.companyControl}>
          <span>Limousine company</span>
          <select value={companyId} onChange={(event) => chooseCompany(Number(event.target.value))} disabled={loading || companies.length === 0}>
            {companies.length === 0 ? <option value={0}>No limousine company</option> : null}
            {companies.map((company) => (
              <option key={company.id} value={company.id}>
                {company.name}{company.status !== "active" ? " — Inactive" : ""}
              </option>
            ))}
          </select>
        </label>
      </header>

      {notice ? <div className={styles.notice}>{notice}</div> : null}
      {error ? <div className={styles.error}>{error}</div> : null}

      {loading ? (
        <section className={styles.editorCard}><div className={styles.empty}>Loading limousine rate management...</div></section>
      ) : companies.length === 0 ? (
        <section className={styles.editorCard}>
          <div className={styles.empty}>
            No company is marked as a Limousine company. Open Companies, set the company type to Limousine, then return here.
          </div>
        </section>
      ) : (
        <>
          <section className={styles.summary}>
            <article><span>Company</span><strong>{selectedCompany?.name ?? "-"}</strong></article>
            <article><span>Vehicle types</span><strong>{companyVehicles.length}</strong></article>
            <article><span>Active rate cards</span><strong>{companyRates.filter((item) => item.is_active).length}</strong></article>
            <article><span>Active extra rules</span><strong>{companyRules.filter((item) => item.is_active).length}</strong></article>
          </section>

          <nav className={styles.tabs} aria-label="Rate management sections">
            <button type="button" className={tab === "vehicles" ? styles.active : ""} onClick={() => setTab("vehicles")}>Vehicle Types</button>
            <button type="button" className={tab === "rates" ? styles.active : ""} onClick={() => setTab("rates")}>Rate Cards</button>
            <button type="button" className={tab === "extras" ? styles.active : ""} onClick={() => setTab("extras")}>Extra Charges</button>
            <button type="button" className={tab === "tester" ? styles.active : ""} onClick={() => setTab("tester")}>Best-Rate Tester</button>
          </nav>

          {tab === "vehicles" ? (
            <section className={styles.workspace}>
              <aside className={styles.listCard}>
                <div className={styles.cardHeader}><h2>Vehicle Types</h2><button type="button" className={styles.secondaryButton} onClick={() => setVehicle(vehicleForm(companyId))}>+ New</button></div>
                <div className={styles.list}>
                  {companyVehicles.length === 0 ? <div className={styles.empty}>Create the first vehicle type for this company.</div> : companyVehicles.map((item) => (
                    <button key={item.id} type="button" className={`${styles.listItem} ${vehicle.id === item.id ? styles.selected : ""}`} onClick={() => setVehicle(vehicleForm(companyId, item))}>
                      <strong>{item.code} — {item.name}</strong>
                      <span>{item.passenger_capacity} passengers · {item.luggage_capacity} luggage</span>
                      <span className={item.is_active ? styles.status : styles.inactive}>{item.is_active ? "Active" : "Inactive"}</span>
                    </button>
                  ))}
                </div>
              </aside>
              <article className={styles.editorCard}>
                <div className={styles.cardHeader}><h2>{vehicle.id ? "Edit Vehicle Type" : "New Vehicle Type"}</h2>{vehicle.id ? <small>#{vehicle.id}</small> : null}</div>
                <div className={styles.form}>
                  <label className={styles.field}><span>Vehicle code</span><input value={vehicle.code} onChange={(event) => setVehicle({ ...vehicle, code: event.target.value.toUpperCase() })} placeholder="SEDAN" /></label>
                  <label className={styles.field}><span>Vehicle name</span><input value={vehicle.name} onChange={(event) => setVehicle({ ...vehicle, name: event.target.value })} placeholder="Executive Sedan" /></label>
                  <label className={styles.field}><span>Passenger capacity</span><input type="number" min="1" value={vehicle.passenger_capacity} onChange={(event) => setVehicle({ ...vehicle, passenger_capacity: event.target.value })} /></label>
                  <label className={styles.field}><span>Luggage capacity</span><input type="number" min="0" value={vehicle.luggage_capacity} onChange={(event) => setVehicle({ ...vehicle, luggage_capacity: event.target.value })} /></label>
                  <label className={styles.field}><span>Display order</span><input type="number" value={vehicle.sort_order} onChange={(event) => setVehicle({ ...vehicle, sort_order: event.target.value })} /></label>
                  <label className={styles.checkboxField}><input type="checkbox" checked={vehicle.is_active} onChange={(event) => setVehicle({ ...vehicle, is_active: event.target.checked })} /> Active and available for booking</label>
                  <label className={`${styles.field} ${styles.full}`}><span>Notes</span><textarea value={vehicle.notes} onChange={(event) => setVehicle({ ...vehicle, notes: event.target.value })} /></label>
                </div>
                <div className={styles.actions}>
                  {vehicle.id ? <button type="button" className={styles.dangerButton} onClick={() => void deleteVehicle()} disabled={saving}>Delete</button> : null}
                  <button type="button" className={styles.secondaryButton} onClick={() => setVehicle(vehicleForm(companyId))} disabled={saving}>Clear</button>
                  <button type="button" className={styles.primaryButton} onClick={() => void saveVehicle()} disabled={saving}>{saving ? "Saving..." : "Save Vehicle Type"}</button>
                </div>
              </article>
            </section>
          ) : null}

          {tab === "rates" ? (
            <section className={styles.workspace}>
              <aside className={styles.listCard}>
                <div className={styles.cardHeader}><h2>Rate Cards</h2><button type="button" className={styles.secondaryButton} onClick={() => setRate(rateForm(companyId, companyVehicles[0]?.id ?? 0))}>+ New</button></div>
                <div className={styles.list}>
                  {companyRates.length === 0 ? <div className={styles.empty}>Create a vehicle type first, then add a rate card.</div> : companyRates.map((item) => (
                    <button key={item.id} type="button" className={`${styles.listItem} ${rate.id === item.id ? styles.selected : ""}`} onClick={() => setRate(rateForm(companyId, item.vehicle_type_id, item))}>
                      <strong>{item.name}</strong>
                      <span>{vehicleNames.get(item.vehicle_type_id) ?? "Vehicle"} · {item.service_type}</span>
                      <span>{formatDate(item.valid_from)}{item.valid_to ? ` to ${formatDate(item.valid_to)}` : " onwards"}</span>
                      <span className={styles.itemBottom}><em className={item.is_active ? styles.status : styles.inactive}>{item.is_active ? "Active" : "Inactive"}</em><b>{money(item.base_amount, item.currency)}</b></span>
                    </button>
                  ))}
                </div>
              </aside>
              <article className={styles.editorCard}>
                <div className={styles.cardHeader}><h2>{rate.id ? "Edit Rate Card" : "New Rate Card"}</h2>{rate.id ? <small>#{rate.id}</small> : null}</div>
                <div className={styles.form}>
                  <label className={styles.field}><span>Vehicle type</span><select value={rate.vehicle_type_id} onChange={(event) => setRate({ ...rate, vehicle_type_id: Number(event.target.value) })}><option value={0}>Select vehicle type</option>{companyVehicles.map((item) => <option key={item.id} value={item.id}>{item.code} — {item.name}</option>)}</select></label>
                  <label className={styles.field}><span>Rate name</span><input value={rate.name} onChange={(event) => setRate({ ...rate, name: event.target.value })} placeholder="Airport arrival standard" /></label>
                  <label className={styles.field}><span>Service type</span><select value={rate.service_type} onChange={(event) => setRate({ ...rate, service_type: event.target.value })}>{serviceTypes.map((item) => <option key={item}>{item}</option>)}</select></label>
                  <label className={styles.field}><span>Pricing method</span><select value={rate.pricing_method} onChange={(event) => setRate({ ...rate, pricing_method: event.target.value as "fixed" | "per_hour" })}><option value="fixed">Fixed fare</option><option value="per_hour">Per hour</option></select></label>
                  <label className={styles.field}><span>Base amount</span><input type="number" min="0" step="0.01" value={rate.base_amount} onChange={(event) => setRate({ ...rate, base_amount: event.target.value })} /></label>
                  <label className={styles.field}><span>Currency</span><input value={rate.currency} maxLength={3} onChange={(event) => setRate({ ...rate, currency: event.target.value.toUpperCase() })} /></label>
                  <label className={styles.field}><span>Minimum hours</span><input type="number" min="0" step="0.5" value={rate.minimum_hours} onChange={(event) => setRate({ ...rate, minimum_hours: event.target.value })} /></label>
                  <label className={styles.field}><span>Included hours for fixed fare</span><input type="number" min="0" step="0.5" value={rate.included_hours} onChange={(event) => setRate({ ...rate, included_hours: event.target.value })} /></label>
                  <label className={styles.field}><span>Additional hour amount</span><input type="number" min="0" step="0.01" value={rate.additional_hour_amount} onChange={(event) => setRate({ ...rate, additional_hour_amount: event.target.value })} /></label>
                  <label className={styles.field}><span>Priority</span><input type="number" value={rate.priority} onChange={(event) => setRate({ ...rate, priority: event.target.value })} /></label>
                  <label className={styles.field}><span>Valid from (DD/MM/YYYY)</span><input type="date" value={rate.valid_from} onChange={(event) => setRate({ ...rate, valid_from: event.target.value })} /></label>
                  <label className={styles.field}><span>Valid to (DD/MM/YYYY)</span><input type="date" value={rate.valid_to} onChange={(event) => setRate({ ...rate, valid_to: event.target.value })} /></label>
                  <label className={`${styles.field} ${styles.full}`}><span>Operating days</span><DaySelector value={rate.days_of_week} onChange={(days) => setRate({ ...rate, days_of_week: days })} /><p className={styles.help}>Leave all days unselected to apply every day.</p></label>
                  <label className={styles.field}><span>Start time</span><input type="time" value={rate.start_time} onChange={(event) => setRate({ ...rate, start_time: event.target.value })} /></label>
                  <label className={styles.field}><span>End time</span><input type="time" value={rate.end_time} onChange={(event) => setRate({ ...rate, end_time: event.target.value })} /><p className={styles.help}>An end time earlier than the start time creates an overnight window.</p></label>
                  <label className={styles.field}><span>Pickup must contain</span><input value={rate.pickup_pattern} onChange={(event) => setRate({ ...rate, pickup_pattern: event.target.value })} placeholder="Changi Airport" /></label>
                  <label className={styles.field}><span>Drop-off must contain</span><input value={rate.dropoff_pattern} onChange={(event) => setRate({ ...rate, dropoff_pattern: event.target.value })} placeholder="Johor Bahru" /></label>
                  <label className={styles.field}><span>Minimum passengers</span><input type="number" min="0" value={rate.min_passengers} onChange={(event) => setRate({ ...rate, min_passengers: event.target.value })} /></label>
                  <label className={styles.field}><span>Maximum passengers</span><input type="number" min="0" value={rate.max_passengers} onChange={(event) => setRate({ ...rate, max_passengers: event.target.value })} placeholder="No maximum" /></label>
                  <label className={styles.field}><span>Minimum luggage</span><input type="number" min="0" value={rate.min_luggage} onChange={(event) => setRate({ ...rate, min_luggage: event.target.value })} /></label>
                  <label className={styles.field}><span>Maximum luggage</span><input type="number" min="0" value={rate.max_luggage} onChange={(event) => setRate({ ...rate, max_luggage: event.target.value })} placeholder="No maximum" /></label>
                  <label className={styles.checkboxField}><input type="checkbox" checked={rate.is_active} onChange={(event) => setRate({ ...rate, is_active: event.target.checked })} /> Active and available for matching</label>
                  <label className={`${styles.field} ${styles.full}`}><span>Notes</span><textarea value={rate.notes} onChange={(event) => setRate({ ...rate, notes: event.target.value })} /></label>
                </div>
                <div className={styles.actions}>
                  {rate.id ? <button type="button" className={styles.dangerButton} onClick={() => void deleteRate()} disabled={saving}>Delete</button> : null}
                  <button type="button" className={styles.secondaryButton} onClick={() => setRate(rateForm(companyId, companyVehicles[0]?.id ?? 0))} disabled={saving}>Clear</button>
                  <button type="button" className={styles.primaryButton} onClick={() => void saveRate()} disabled={saving || companyVehicles.length === 0}>{saving ? "Saving..." : "Save Rate Card"}</button>
                </div>
              </article>
            </section>
          ) : null}

          {tab === "extras" ? (
            <section className={styles.workspace}>
              <aside className={styles.listCard}>
                <div className={styles.cardHeader}><h2>Extra Charges</h2><button type="button" className={styles.secondaryButton} onClick={() => setRule(ruleForm(companyId))}>+ New</button></div>
                <div className={styles.list}>
                  {companyRules.length === 0 ? <div className={styles.empty}>Add midnight, airport, extra-stop or other surcharge rules.</div> : companyRules.map((item) => (
                    <button key={item.id} type="button" className={`${styles.listItem} ${rule.id === item.id ? styles.selected : ""}`} onClick={() => setRule(ruleForm(companyId, item))}>
                      <strong>{item.name}</strong>
                      <span>{item.vehicle_type_id ? vehicleNames.get(item.vehicle_type_id) : "All vehicles"} · {item.service_type || "All services"}</span>
                      <span>{ruleBasisLabels[item.rule_basis] ?? item.rule_basis} · {chargeTypeLabels[item.charge_type] ?? item.charge_type}</span>
                      <span className={styles.itemBottom}><em className={item.is_active ? styles.status : styles.inactive}>{item.is_active ? "Active" : "Inactive"}</em><b>{item.charge_type === "percentage" ? `${item.amount}%` : money(item.amount)}</b></span>
                    </button>
                  ))}
                </div>
              </aside>
              <article className={styles.editorCard}>
                <div className={styles.cardHeader}><h2>{rule.id ? "Edit Extra-Charge Rule" : "New Extra-Charge Rule"}</h2>{rule.id ? <small>#{rule.id}</small> : null}</div>
                <div className={styles.form}>
                  <label className={styles.field}><span>Rule name</span><input value={rule.name} onChange={(event) => setRule({ ...rule, name: event.target.value })} placeholder="Midnight surcharge" /></label>
                  <label className={styles.field}><span>Vehicle type</span><select value={rule.vehicle_type_id} onChange={(event) => setRule({ ...rule, vehicle_type_id: Number(event.target.value) })}><option value={0}>All vehicle types</option>{companyVehicles.map((item) => <option key={item.id} value={item.id}>{item.code} — {item.name}</option>)}</select></label>
                  <label className={styles.field}><span>Service type</span><select value={rule.service_type} onChange={(event) => setRule({ ...rule, service_type: event.target.value })}><option value="">All service types</option>{serviceTypes.map((item) => <option key={item}>{item}</option>)}</select></label>
                  <label className={styles.field}><span>Rule basis</span><select value={rule.rule_basis} onChange={(event) => setRule({ ...rule, rule_basis: event.target.value })}>{Object.entries(ruleBasisLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
                  <label className={styles.field}><span>Match text</span><input value={rule.match_text} onChange={(event) => setRule({ ...rule, match_text: event.target.value })} placeholder="Airport or location text" /><p className={styles.help}>Used for pickup or drop-off text rules.</p></label>
                  <label className={styles.field}><span>Threshold</span><input type="number" min="0" step="0.5" value={rule.threshold} onChange={(event) => setRule({ ...rule, threshold: event.target.value })} /><p className={styles.help}>Example: 1 for the first extra stop, or 3 for hours above three.</p></label>
                  <label className={styles.field}><span>Charge type</span><select value={rule.charge_type} onChange={(event) => setRule({ ...rule, charge_type: event.target.value })}>{Object.entries(chargeTypeLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
                  <label className={styles.field}><span>Amount</span><input type="number" min="0" step="0.01" value={rule.amount} onChange={(event) => setRule({ ...rule, amount: event.target.value })} /></label>
                  <label className={styles.field}><span>Valid from (DD/MM/YYYY)</span><input type="date" value={rule.valid_from} onChange={(event) => setRule({ ...rule, valid_from: event.target.value })} /></label>
                  <label className={styles.field}><span>Valid to (DD/MM/YYYY)</span><input type="date" value={rule.valid_to} onChange={(event) => setRule({ ...rule, valid_to: event.target.value })} /></label>
                  <label className={`${styles.field} ${styles.full}`}><span>Operating days</span><DaySelector value={rule.days_of_week} onChange={(days) => setRule({ ...rule, days_of_week: days })} /><p className={styles.help}>Leave all days unselected to apply every day.</p></label>
                  <label className={styles.field}><span>Start time</span><input type="time" value={rule.start_time} onChange={(event) => setRule({ ...rule, start_time: event.target.value })} /></label>
                  <label className={styles.field}><span>End time</span><input type="time" value={rule.end_time} onChange={(event) => setRule({ ...rule, end_time: event.target.value })} /></label>
                  <label className={styles.field}><span>Priority</span><input type="number" value={rule.priority} onChange={(event) => setRule({ ...rule, priority: event.target.value })} /></label>
                  <label className={styles.checkboxField}><input type="checkbox" checked={rule.is_stackable} onChange={(event) => setRule({ ...rule, is_stackable: event.target.checked })} /> Stack with other matching rules</label>
                  <label className={styles.checkboxField}><input type="checkbox" checked={rule.is_active} onChange={(event) => setRule({ ...rule, is_active: event.target.checked })} /> Active and available for matching</label>
                  <label className={`${styles.field} ${styles.full}`}><span>Notes</span><textarea value={rule.notes} onChange={(event) => setRule({ ...rule, notes: event.target.value })} /></label>
                </div>
                <div className={styles.actions}>
                  {rule.id ? <button type="button" className={styles.dangerButton} onClick={() => void deleteRule()} disabled={saving}>Delete</button> : null}
                  <button type="button" className={styles.secondaryButton} onClick={() => setRule(ruleForm(companyId))} disabled={saving}>Clear</button>
                  <button type="button" className={styles.primaryButton} onClick={() => void saveRule()} disabled={saving}>{saving ? "Saving..." : "Save Extra-Charge Rule"}</button>
                </div>
              </article>
            </section>
          ) : null}

          {tab === "tester" ? (
            <section className={styles.testerGrid}>
              <article className={styles.testerCard}>
                <div className={styles.cardHeader}><h2>Trip Details</h2><small>Test without saving a job</small></div>
                <div className={styles.form}>
                  <label className={styles.field}><span>Vehicle type</span><select value={tester.vehicle_type_id} onChange={(event) => setTester({ ...tester, vehicle_type_id: Number(event.target.value) })}><option value={0}>Select vehicle type</option>{companyVehicles.filter((item) => item.is_active).map((item) => <option key={item.id} value={item.id}>{item.code} — {item.name}</option>)}</select></label>
                  <label className={styles.field}><span>Service type</span><select value={tester.service_type} onChange={(event) => setTester({ ...tester, service_type: event.target.value })}>{serviceTypes.map((item) => <option key={item}>{item}</option>)}</select></label>
                  <label className={styles.field}><span>Service date (DD/MM/YYYY)</span><input type="date" value={tester.service_date} onChange={(event) => setTester({ ...tester, service_date: event.target.value })} /></label>
                  <label className={styles.field}><span>Pickup time</span><input type="time" value={tester.pickup_time} onChange={(event) => setTester({ ...tester, pickup_time: event.target.value })} /></label>
                  <label className={`${styles.field} ${styles.full}`}><span>Pickup location</span><input value={tester.pickup_location} onChange={(event) => setTester({ ...tester, pickup_location: event.target.value })} /></label>
                  <label className={`${styles.field} ${styles.full}`}><span>Drop-off location</span><input value={tester.dropoff_location} onChange={(event) => setTester({ ...tester, dropoff_location: event.target.value })} /></label>
                  <label className={styles.field}><span>Passengers</span><input type="number" min="0" value={tester.passengers} onChange={(event) => setTester({ ...tester, passengers: event.target.value })} /></label>
                  <label className={styles.field}><span>Luggage</span><input type="number" min="0" value={tester.luggage} onChange={(event) => setTester({ ...tester, luggage: event.target.value })} /></label>
                  <label className={styles.field}><span>Hours</span><input type="number" min="0" step="0.5" value={tester.hours} onChange={(event) => setTester({ ...tester, hours: event.target.value })} /></label>
                  <label className={styles.field}><span>Extra stops</span><input type="number" min="0" value={tester.extra_stops} onChange={(event) => setTester({ ...tester, extra_stops: event.target.value })} /></label>
                </div>
                <div className={styles.actions}><button type="button" className={styles.primaryButton} onClick={() => void testRate()} disabled={matching || !tester.vehicle_type_id}>{matching ? "Matching..." : "Find Best Rate"}</button></div>
              </article>

              <article className={styles.resultCard}>
                <div className={styles.cardHeader}><h2>Matched Fare</h2><small>Highest priority, then lowest base fare</small></div>
                <div className={styles.resultBody}>
                  {!match ? <div className={styles.empty}>Enter trip details and select Find Best Rate.</div> : !match.matched ? <div className={styles.noMatch}>{match.message || "No matching rate was found."}</div> : (
                    <>
                      <div className={styles.resultHero}><span>Total matched fare</span><strong>{money(match.total_amount, match.currency)}</strong></div>
                      <div className={styles.resultName}>{match.rate_name}</div>
                      <div className={styles.breakdown}>
                        <div><span>Base fare</span><strong>{money(match.base_amount, match.currency)}</strong></div>
                        {(match.charges ?? []).map((charge) => <div key={charge.rule_id}><span>{charge.name}</span><strong>{money(charge.amount, match.currency)}</strong></div>)}
                        <div><span>Total extra charges</span><strong>{money(match.extra_amount, match.currency)}</strong></div>
                      </div>
                    </>
                  )}
                </div>
              </article>
            </section>
          ) : null}
        </>
      )}
    </main>
  );
}
