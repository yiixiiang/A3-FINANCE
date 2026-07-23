"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { formatDate } from "@/lib/format-date";

type Company = {
  id: number;
  name: string;
  status: string;
  company_type: string;
};

type Driver = {
  id: number;
  driver_no: string;
  full_name: string;
  company_id: number;
  company_ids?: number[];
  status: string;
  vehicle_plate: string | null;
};

type Customer = {
  id: number;
  company_id: number;
  customer_no: string | null;
  customer_name: string;
  phone: string | null;
  email: string | null;
  status: string;
};

type VehicleType = {
  id: number;
  company_id: number;
  code: string;
  name: string;
  passenger_capacity: number;
  luggage_capacity: number;
  is_active: boolean;
  sort_order: number;
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
  customer_rate_id?: number | null;
  customer_rate_name?: string;
  pricing_source?: string;
  vehicle_type_id?: number;
  service_type?: string;
  pricing_method?: string;
  currency?: string;
  base_amount?: number;
  extra_amount?: number;
  total_amount?: number;
  charges?: MatchCharge[];
};

type Job = {
  id: number;
  company_id: number;
  customer_id: number | null;
  driver_id: number;
  job_reference: string | null;
  job_date: string;
  pickup_time: string | null;
  service_type: string | null;
  customer_name: string | null;
  customer_phone: string | null;
  pickup_location: string | null;
  dropoff_location: string | null;
  vehicle_requirement: string | null;
  limousine_vehicle_type_id: number | null;
  passenger_count: number;
  luggage_count: number;
  duration_hours: number;
  extra_stops: number;
  gross_amount: number;
  supplier_amount: number;
  driver_amount: number;
  extra_charges: number;
  matched_rate_card_id: number | null;
  matched_customer_rate_id: number | null;
  pricing_source: string;
  matched_rate_name: string | null;
  matched_base_amount: number;
  matched_extra_amount: number;
  rate_match_details: MatchResult | null;
  status: string;
  payment_status: string;
  payment_method: string | null;
  notes: string | null;
  drivers: {
    driver_no: string;
    full_name: string;
    vehicle_plate: string | null;
  } | null;
  companies: { name: string } | null;
};

type Form = Omit<Job, "id" | "drivers" | "companies">;

type LoadPayload = {
  jobs?: Job[];
  drivers?: Driver[];
  companies?: Company[];
  vehicle_types?: VehicleType[];
  customers?: Customer[];
  error?: string;
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

const rateSensitiveFields = new Set<keyof Form>([
  "company_id",
  "customer_id",
  "limousine_vehicle_type_id",
  "service_type",
  "job_date",
  "pickup_time",
  "pickup_location",
  "dropoff_location",
  "passenger_count",
  "luggage_count",
  "duration_hours",
  "extra_stops",
]);

const emptyForm: Form = {
  company_id: 0,
  customer_id: null,
  driver_id: 0,
  job_reference: "",
  job_date: today,
  pickup_time: "",
  service_type: "Airport Transfer",
  customer_name: "",
  customer_phone: "",
  pickup_location: "",
  dropoff_location: "",
  vehicle_requirement: "",
  limousine_vehicle_type_id: null,
  passenger_count: 1,
  luggage_count: 0,
  duration_hours: 1,
  extra_stops: 0,
  gross_amount: 0,
  supplier_amount: 0,
  driver_amount: 0,
  extra_charges: 0,
  matched_rate_card_id: null,
  matched_customer_rate_id: null,
  pricing_source: "standard",
  matched_rate_name: null,
  matched_base_amount: 0,
  matched_extra_amount: 0,
  rate_match_details: null,
  status: "scheduled",
  payment_status: "unpaid",
  payment_method: "",
  notes: "",
};

const money = (amount: number, currency = "SGD") =>
  new Intl.NumberFormat("en-SG", {
    style: "currency",
    currency: currency || "SGD",
  }).format(Number(amount || 0));

function normaliseJob(job: Job): Form {
  const { id: _id, drivers: _drivers, companies: _companies, ...rest } = job;
  return {
    ...emptyForm,
    ...rest,
    pickup_time: job.pickup_time?.slice(0, 5) ?? "",
    limousine_vehicle_type_id: job.limousine_vehicle_type_id ?? null,
    passenger_count: Number(job.passenger_count || 0),
    luggage_count: Number(job.luggage_count || 0),
    duration_hours: Number(job.duration_hours || 1),
    extra_stops: Number(job.extra_stops || 0),
    customer_id: job.customer_id ?? null,
    matched_rate_card_id: job.matched_rate_card_id ?? null,
    matched_customer_rate_id: job.matched_customer_rate_id ?? null,
    pricing_source: job.pricing_source || "standard",
    matched_rate_name: job.matched_rate_name ?? null,
    matched_base_amount: Number(job.matched_base_amount || 0),
    matched_extra_amount: Number(job.matched_extra_amount || 0),
    rate_match_details:
      job.rate_match_details && typeof job.rate_match_details.matched === "boolean"
        ? job.rate_match_details
        : null,
  };
}

export default function JobsPage() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [vehicleTypes, setVehicleTypes] = useState<VehicleType[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [form, setForm] = useState<Form>(emptyForm);
  const [matchResult, setMatchResult] = useState<MatchResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [matching, setMatching] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const availableCustomers = useMemo(
    () =>
      customers.filter(
        (customer) =>
          customer.company_id === Number(form.company_id) &&
          customer.status === "active",
      ),
    [customers, form.company_id],
  );

  const availableDrivers = useMemo(
    () =>
      drivers.filter(
        (driver) =>
          (driver.company_ids?.includes(Number(form.company_id)) ??
            driver.company_id === Number(form.company_id)) &&
          driver.status === "active",
      ),
    [drivers, form.company_id],
  );

  const availableVehicleTypes = useMemo(
    () =>
      vehicleTypes.filter(
        (vehicle) =>
          vehicle.company_id === Number(form.company_id) &&
          (vehicle.is_active || vehicle.id === form.limousine_vehicle_type_id),
      ),
    [form.company_id, form.limousine_vehicle_type_id, vehicleTypes],
  );

  const summary = useMemo(
    () => ({
      total: jobs.length,
      scheduled: jobs.filter((job) => job.status === "scheduled").length,
      completed: jobs.filter((job) => job.status === "completed").length,
      revenue: jobs
        .filter((job) => job.status !== "cancelled")
        .reduce(
          (total, job) =>
            total + Number(job.gross_amount || 0) + Number(job.extra_charges || 0),
          0,
        ),
    }),
    [jobs],
  );

  useEffect(() => {
    void load();
  }, []);

  async function load(preferredId?: number | null) {
    setLoading(true);
    setError("");

    try {
      const response = await fetch("/api/admin/jobs", { cache: "no-store" });
      const payload = (await response.json()) as LoadPayload;
      if (!response.ok) throw new Error(payload.error || "Unable to load jobs.");

      const nextJobs = payload.jobs ?? [];
      const nextDrivers = payload.drivers ?? [];
      const nextCompanies = payload.companies ?? [];
      const nextVehicleTypes = payload.vehicle_types ?? [];
      const nextCustomers = payload.customers ?? [];

      setJobs(nextJobs);
      setDrivers(nextDrivers);
      setCompanies(nextCompanies);
      setVehicleTypes(nextVehicleTypes);
      setCustomers(nextCustomers);

      const selected = nextJobs.find((job) => job.id === preferredId);
      if (selected) {
        selectJob(selected);
      } else {
        startNewJob(nextCompanies, nextDrivers, nextVehicleTypes, nextCustomers);
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to load jobs.");
    } finally {
      setLoading(false);
    }
  }

  function selectJob(job: Job) {
    setSelectedId(job.id);
    const nextForm = normaliseJob(job);
    setForm(nextForm);
    setMatchResult(nextForm.rate_match_details);
    setError("");
    setNotice("");
  }

  function startNewJob(
    companyRows = companies,
    driverRows = drivers,
    vehicleRows = vehicleTypes,
    customerRows = customers,
  ) {
    const company = companyRows.find((item) => item.status === "active");
    const driver = driverRows.find(
      (item) => item.company_id === company?.id && item.status === "active",
    );
    const vehicle = vehicleRows.find(
      (item) => item.company_id === company?.id && item.is_active,
    );
    const customer = customerRows.find(
      (item) => item.company_id === company?.id && item.status === "active",
    );

    setSelectedId(null);
    setForm({
      ...emptyForm,
      job_date: today,
      company_id: company?.id ?? 0,
      customer_id: customer?.id ?? null,
      customer_name: customer?.customer_name ?? "",
      customer_phone: customer?.phone ?? "",
      driver_id: driver?.id ?? 0,
      limousine_vehicle_type_id: vehicle?.id ?? null,
      passenger_count: vehicle ? Math.min(1, vehicle.passenger_capacity) : 1,
    });
    setMatchResult(null);
    setNotice("Enter the new booking details.");
    setError("");
  }

  function update<K extends keyof Form>(key: K, value: Form[K]) {
    if (rateSensitiveFields.has(key)) setMatchResult(null);

    setForm((current) => {
      const next = { ...current, [key]: value };

      if (key === "company_id") {
        const companyId = Number(value);
        next.driver_id =
          drivers.find(
            (driver) =>
              driver.company_id === companyId && driver.status === "active",
          )?.id ?? 0;
        next.limousine_vehicle_type_id =
          vehicleTypes.find(
            (vehicle) =>
              vehicle.company_id === companyId && vehicle.is_active,
          )?.id ?? null;
        const customer = customers.find(
          (item) => item.company_id === companyId && item.status === "active",
        );
        next.customer_id = customer?.id ?? null;
        next.customer_name = customer?.customer_name ?? "";
        next.customer_phone = customer?.phone ?? "";
      }

      if (key === "customer_id") {
        const customer = customers.find((item) => item.id === Number(value));
        next.customer_name = customer?.customer_name ?? next.customer_name;
        next.customer_phone = customer?.phone ?? next.customer_phone;
      }

      if (rateSensitiveFields.has(key)) {
        next.matched_rate_card_id = null;
        next.matched_customer_rate_id = null;
        next.pricing_source = "standard";
        next.matched_rate_name = null;
        next.matched_base_amount = 0;
        next.matched_extra_amount = 0;
        next.rate_match_details = null;
      }

      return next;
    });
  }

  async function findBestRate() {
    if (!form.company_id) {
      setError("Select a company before matching a rate.");
      return;
    }
    if (!form.limousine_vehicle_type_id) {
      setError("Select a limousine vehicle type before matching a rate.");
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
          service_date: form.job_date,
          pickup_time: form.pickup_time,
          pickup_location: form.pickup_location,
          dropoff_location: form.dropoff_location,
          passengers: form.passenger_count,
          luggage: form.luggage_count,
          hours: form.duration_hours,
          extra_stops: form.extra_stops,
        }),
      });
      const payload = (await response.json()) as {
        match?: MatchResult;
        error?: string;
      };
      if (!response.ok) throw new Error(payload.error || "Unable to match a rate.");

      const match = payload.match ?? null;
      setMatchResult(match);

      if (!match?.matched) {
        setNotice(match?.message || "No active rate card matched this trip.");
        return;
      }

      const vehicle = vehicleTypes.find(
        (item) => item.id === form.limousine_vehicle_type_id,
      );
      setForm((current) => ({
        ...current,
        vehicle_requirement:
          current.vehicle_requirement ||
          (vehicle ? `${vehicle.code} — ${vehicle.name}` : ""),
        gross_amount: Number(match.base_amount || 0),
        extra_charges: Number(match.extra_amount || 0),
        matched_rate_card_id: match.rate_card_id ?? null,
        matched_customer_rate_id: match.customer_rate_id ?? null,
        pricing_source: match.pricing_source || "standard",
        matched_rate_name: match.rate_name ?? null,
        matched_base_amount: Number(match.base_amount || 0),
        matched_extra_amount: Number(match.extra_amount || 0),
        rate_match_details: match,
      }));
      setNotice(
        match.pricing_source === "customer_contract"
          ? "Customer contract rate matched. Review the fare breakdown, then save the job."
          : "Standard company rate matched. Review the fare breakdown, then save the job.",
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

    try {
      const response = await fetch("/api/admin/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: selectedId ? "update" : "create",
          job_id: selectedId,
          ...form,
        }),
      });
      const payload = (await response.json()) as {
        job_id?: number;
        error?: string;
      };
      if (!response.ok) throw new Error(payload.error || "Unable to save job.");

      const wasEditing = Boolean(selectedId);
      await load(payload.job_id);
      setNotice(wasEditing ? "Job updated successfully." : "Job created successfully.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to save job.");
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!selectedId || !confirm("Delete this job permanently?")) return;

    setError("");
    try {
      const response = await fetch("/api/admin/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "delete", job_id: selectedId }),
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(payload.error || "Unable to delete job.");
      await load();
      setNotice("Job deleted.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to delete job.");
    }
  }

  return (
    <div className="shell">
      <main className="container">
        <div className="page-heading-row">
          <div>
            <h1 className="page-title">Jobs &amp; Booking Management</h1>
            <p className="subtitle">
              Create bookings, match limousine rates, assign drivers and track trip payments.
            </p>
          </div>
          <button className="button primary" type="button" onClick={() => startNewJob()}>
            + New Job
          </button>
        </div>

        {notice ? <div className="notice success">{notice}</div> : null}
        {error ? <div className="notice error">{error}</div> : null}

        <section className="driver-summary-grid">
          <article className="card metric">
            <span>Total Jobs</span>
            <strong>{summary.total}</strong>
          </article>
          <article className="card metric">
            <span>Scheduled</span>
            <strong>{summary.scheduled}</strong>
          </article>
          <article className="card metric">
            <span>Completed</span>
            <strong>{summary.completed}</strong>
          </article>
          <article className="card metric">
            <span>Booked Revenue</span>
            <strong>{money(summary.revenue)}</strong>
          </article>
        </section>

        <section className="job-management-grid">
          <article className="card job-list-card">
            <div className="section-title-row">
              <h2>Bookings</h2>
              <span className="badge">{jobs.length}</span>
            </div>

            {loading ? (
              <p className="muted">Loading jobs...</p>
            ) : jobs.length === 0 ? (
              <p className="muted">No jobs have been created.</p>
            ) : (
              <div className="job-list">
                {jobs.map((job) => (
                  <button
                    key={job.id}
                    type="button"
                    className={`job-list-item ${selectedId === job.id ? "active" : ""}`}
                    onClick={() => selectJob(job)}
                  >
                    <strong>{job.job_reference || `Job #${job.id}`}</strong>
                    <span>
                      {formatDate(job.job_date)}
                      {job.pickup_time ? ` · ${job.pickup_time.slice(0, 5)}` : ""}
                    </span>
                    <span>{job.customer_name || "No customer name"}</span>
                    <span className="job-list-bottom">
                      <em>{job.status.replace("_", " ")}</em>
                      <b>{money(Number(job.gross_amount) + Number(job.extra_charges))}</b>
                    </span>
                  </button>
                ))}
              </div>
            )}
          </article>

          <article className="card">
            <div className="section-title-row">
              <h2>{selectedId ? "Edit Job" : "New Job"}</h2>
              {selectedId ? <span className="badge">#{selectedId}</span> : null}
            </div>

            <div className="form-grid">
              <label>
                Company
                <select
                  value={form.company_id}
                  onChange={(event) => update("company_id", Number(event.target.value))}
                >
                  <option value={0}>Select company</option>
                  {companies
                    .filter((company) => company.status === "active")
                    .map((company) => (
                      <option key={company.id} value={company.id}>
                        {company.name}
                      </option>
                    ))}
                </select>
              </label>

              <label>
                Assigned driver
                <select
                  value={form.driver_id}
                  onChange={(event) => update("driver_id", Number(event.target.value))}
                >
                  <option value={0}>Select driver</option>
                  {availableDrivers.map((driver) => (
                    <option key={driver.id} value={driver.id}>
                      {driver.driver_no} — {driver.full_name}
                      {driver.vehicle_plate ? ` (${driver.vehicle_plate})` : ""}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                Job reference
                <input
                  value={form.job_reference ?? ""}
                  onChange={(event) => update("job_reference", event.target.value)}
                  placeholder="Auto-generated when blank"
                />
              </label>

              <label>
                Service type
                <select
                  value={form.service_type ?? ""}
                  onChange={(event) => update("service_type", event.target.value)}
                >
                  {serviceTypes.map((service) => (
                    <option key={service}>{service}</option>
                  ))}
                </select>
              </label>

              <label>
                Job date (DD/MM/YYYY)
                <input
                  type="date"
                  value={form.job_date}
                  onChange={(event) => update("job_date", event.target.value)}
                />
              </label>

              <label>
                Pickup time
                <input
                  type="time"
                  value={form.pickup_time ?? ""}
                  onChange={(event) => update("pickup_time", event.target.value)}
                />
              </label>

              <label>
                Customer profile
                <select
                  value={form.customer_id ?? 0}
                  onChange={(event) =>
                    update("customer_id", Number(event.target.value) || null)
                  }
                >
                  <option value={0}>Manual customer details</option>
                  {availableCustomers.map((customer) => (
                    <option key={customer.id} value={customer.id}>
                      {customer.customer_no ? `${customer.customer_no} — ` : ""}
                      {customer.customer_name}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                Customer name
                <input
                  value={form.customer_name ?? ""}
                  onChange={(event) => update("customer_name", event.target.value)}
                />
              </label>

              <label>
                Customer phone
                <input
                  value={form.customer_phone ?? ""}
                  onChange={(event) => update("customer_phone", event.target.value)}
                />
              </label>

              <label className="span-2">
                Pickup location
                <input
                  value={form.pickup_location ?? ""}
                  onChange={(event) => update("pickup_location", event.target.value)}
                />
              </label>

              <label className="span-2">
                Drop-off location
                <input
                  value={form.dropoff_location ?? ""}
                  onChange={(event) => update("dropoff_location", event.target.value)}
                />
              </label>

              <label>
                Limousine vehicle type
                <select
                  value={form.limousine_vehicle_type_id ?? 0}
                  onChange={(event) =>
                    update(
                      "limousine_vehicle_type_id",
                      Number(event.target.value) || null,
                    )
                  }
                >
                  <option value={0}>Select rate vehicle type</option>
                  {availableVehicleTypes.map((vehicle) => (
                    <option key={vehicle.id} value={vehicle.id}>
                      {vehicle.code} — {vehicle.name} ({vehicle.passenger_capacity} pax / {vehicle.luggage_capacity} luggage)
                    </option>
                  ))}
                </select>
              </label>

              <label>
                Vehicle requirement
                <input
                  value={form.vehicle_requirement ?? ""}
                  onChange={(event) => update("vehicle_requirement", event.target.value)}
                  placeholder="Special vehicle request"
                />
              </label>

              <label>
                Passengers
                <input
                  type="number"
                  min="0"
                  value={form.passenger_count}
                  onChange={(event) => update("passenger_count", Number(event.target.value))}
                />
              </label>

              <label>
                Luggage
                <input
                  type="number"
                  min="0"
                  value={form.luggage_count}
                  onChange={(event) => update("luggage_count", Number(event.target.value))}
                />
              </label>

              <label>
                Duration hours
                <input
                  type="number"
                  min="0"
                  step="0.5"
                  value={form.duration_hours}
                  onChange={(event) => update("duration_hours", Number(event.target.value))}
                />
              </label>

              <label>
                Extra stops
                <input
                  type="number"
                  min="0"
                  value={form.extra_stops}
                  onChange={(event) => update("extra_stops", Number(event.target.value))}
                />
              </label>

              <div className="span-2 actions">
                <button
                  className="button secondary"
                  type="button"
                  disabled={matching || !form.limousine_vehicle_type_id}
                  onClick={() => void findBestRate()}
                >
                  {matching ? "Matching..." : "Find Best Rate"}
                </button>
                <Link className="button secondary" href="/limousine-rates">
                  Manage Rate Cards
                </Link>
                <Link className="button secondary" href="/client-rates">
                  Manage Client Rates
                </Link>
              </div>

              {matchResult ? (
                <div className={`span-2 notice ${matchResult.matched ? "success" : "error"}`}>
                  {matchResult.matched ? (
                    <>
                      <strong>{matchResult.rate_name || "Matched rate"}</strong>
                      <div>
                        Pricing source: {(matchResult.pricing_source || "standard").replace("_", " ")}
                      </div>
                      <div>
                        Base fare {money(Number(matchResult.base_amount || 0), matchResult.currency)} · Extra charges {money(Number(matchResult.extra_amount || 0), matchResult.currency)} · Total {money(Number(matchResult.total_amount || 0), matchResult.currency)}
                      </div>
                      {(matchResult.charges ?? []).length > 0 ? (
                        <small>
                          {(matchResult.charges ?? [])
                            .map(
                              (charge) =>
                                `${charge.name}: ${money(charge.amount, matchResult.currency)}`,
                            )
                            .join(" · ")}
                        </small>
                      ) : null}
                    </>
                  ) : (
                    matchResult.message || "No matching rate was found."
                  )}
                </div>
              ) : null}

              <label>
                Customer fare
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.gross_amount}
                  onChange={(event) => update("gross_amount", Number(event.target.value))}
                />
              </label>

              <label>
                Extra charges
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.extra_charges}
                  onChange={(event) => update("extra_charges", Number(event.target.value))}
                />
              </label>

              <label>
                Supplier amount
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.supplier_amount}
                  onChange={(event) => update("supplier_amount", Number(event.target.value))}
                />
              </label>

              <label>
                Driver payout
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.driver_amount}
                  onChange={(event) => update("driver_amount", Number(event.target.value))}
                />
              </label>

              <label>
                Job status
                <select
                  value={form.status}
                  onChange={(event) => update("status", event.target.value)}
                >
                  <option value="scheduled">Scheduled</option>
                  <option value="in_progress">In Progress</option>
                  <option value="completed">Completed</option>
                  <option value="cancelled">Cancelled</option>
                </select>
              </label>

              <label>
                Payment status
                <select
                  value={form.payment_status}
                  onChange={(event) => update("payment_status", event.target.value)}
                >
                  <option value="unpaid">Unpaid</option>
                  <option value="partial">Partial</option>
                  <option value="paid">Paid</option>
                  <option value="waived">Waived</option>
                </select>
              </label>

              <label>
                Payment method
                <input
                  value={form.payment_method ?? ""}
                  onChange={(event) => update("payment_method", event.target.value)}
                  placeholder="Cash, PayNow, card..."
                />
              </label>

              <label className="span-2">
                Notes
                <textarea
                  rows={3}
                  value={form.notes ?? ""}
                  onChange={(event) => update("notes", event.target.value)}
                />
              </label>
            </div>

            <div className="actions">
              <button
                className="button primary"
                type="button"
                disabled={saving}
                onClick={() => void save()}
              >
                {saving ? "Saving..." : "Save Job"}
              </button>

              {selectedId ? (
                <>
                  <Link
                    className="button secondary"
                    href={`/jobs/print?id=${selectedId}`}
                    target="_blank"
                  >
                    Booking Confirmation
                  </Link>
                  <Link
                    className="button secondary"
                    href={`/jobs/print?id=${selectedId}&mode=sheet`}
                    target="_blank"
                  >
                    Driver Job Sheet
                  </Link>
                  <button
                    className="button danger"
                    type="button"
                    onClick={() => void remove()}
                  >
                    Delete Job
                  </button>
                </>
              ) : null}
            </div>
          </article>
        </section>
      </main>
    </div>
  );
}
