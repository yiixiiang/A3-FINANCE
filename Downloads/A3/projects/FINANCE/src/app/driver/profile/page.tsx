"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { formatDate } from "@/lib/format-date";

type DriverProfile = {
  id: number;
  driver_no: string;
  company_id: number;
  full_name: string;
  phone: string | null;
  contact_email: string | null;
  login_email: string | null;
  address: string | null;
  nric_passport: string | null;
  nationality: string | null;
  date_of_birth: string | null;
  licence_no: string | null;
  licence_class: string | null;
  licence_expiry: string | null;
  emergency_contact_name: string | null;
  emergency_contact_phone: string | null;
  vehicle_make: string | null;
  vehicle_model: string | null;
  vehicle_plate: string | null;
  vehicle_type: string | null;
  bank_name: string | null;
  bank_account_name: string | null;
  bank_account_no: string | null;
  paynow_type: string | null;
  paynow_no: string | null;
  status: string;
  notes: string | null;
  companies: { name: string; company_type: string } | null;
  document_urls: {
    profile_photo: string | null;
    licence_front: string | null;
    licence_back: string | null;
    identity_document: string | null;
  };
};


type DriverCompanyLink = {
  company_id: number;
  is_primary: boolean;
  membership_status: string;
  joined_at: string;
  companies: { name: string; company_type: string } | null;
};

type DriverCustomerLink = {
  company_id: number;
  customer_id: number;
  relationship_type: "client" | "customer";
  link_status: string;
  customers: {
    customer_name: string;
    customer_type: string;
    contact_person: string | null;
    phone: string | null;
    email: string | null;
  } | null;
};

type VehicleDocument = {
  id: string;
  application_id: number;
  company_id: number;
  document_type: string;
  original_filename: string;
  mime_type: string;
  size_bytes: number;
  upload_status: string;
  uploaded_at: string | null;
  signed_url: string | null;
};

type EditableProfile = {
  phone: string;
  contact_email: string;
  address: string;
  emergency_contact_name: string;
  emergency_contact_phone: string;
  vehicle_make: string;
  vehicle_model: string;
  vehicle_plate: string;
  vehicle_type: string;
  bank_name: string;
  bank_account_name: string;
  bank_account_no: string;
  paynow_type: string;
  paynow_no: string;
  notes: string;
};

type Job = {
  id: number;
  job_reference: string | null;
  job_date: string;
  service_type: string | null;
  gross_amount: number;
  driver_amount: number;
  status: string;
};

type Payout = {
  id: number;
  payout_no: string | null;
  period_start: string | null;
  period_end: string | null;
  gross_earnings: number;
  deductions: number;
  advances: number;
  net_payout: number;
  amount_paid: number;
  outstanding_amount: number;
  payment_date: string | null;
  status: string;
};

const emptyForm: EditableProfile = {
  phone: "",
  contact_email: "",
  address: "",
  emergency_contact_name: "",
  emergency_contact_phone: "",
  vehicle_make: "",
  vehicle_model: "",
  vehicle_plate: "",
  vehicle_type: "",
  bank_name: "",
  bank_account_name: "",
  bank_account_no: "",
  paynow_type: "",
  paynow_no: "",
  notes: "",
};

function toForm(driver: DriverProfile): EditableProfile {
  return {
    phone: driver.phone ?? "",
    contact_email: driver.contact_email ?? "",
    address: driver.address ?? "",
    emergency_contact_name: driver.emergency_contact_name ?? "",
    emergency_contact_phone: driver.emergency_contact_phone ?? "",
    vehicle_make: driver.vehicle_make ?? "",
    vehicle_model: driver.vehicle_model ?? "",
    vehicle_plate: driver.vehicle_plate ?? "",
    vehicle_type: driver.vehicle_type ?? "",
    bank_name: driver.bank_name ?? "",
    bank_account_name: driver.bank_account_name ?? "",
    bank_account_no: driver.bank_account_no ?? "",
    paynow_type: driver.paynow_type ?? "",
    paynow_no: driver.paynow_no ?? "",
    notes: driver.notes ?? "",
  };
}

function formatMoney(value: number) {
  return new Intl.NumberFormat("en-SG", {
    style: "currency",
    currency: "SGD",
    minimumFractionDigits: 2,
  }).format(Number(value || 0));
}

function formatDocumentSize(size: number) {
  if (size >= 1024 * 1024) return `${(size / 1024 / 1024).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(size / 1024))} KB`;
}

export default function MyDriverProfilePage() {
  const [driver, setDriver] = useState<DriverProfile | null>(null);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [payouts, setPayouts] = useState<Payout[]>([]);
  const [companyLinks, setCompanyLinks] = useState<DriverCompanyLink[]>([]);
  const [customerLinks, setCustomerLinks] = useState<DriverCustomerLink[]>([]);
  const [vehicleDocuments, setVehicleDocuments] = useState<VehicleDocument[]>([]);
  const [form, setForm] = useState<EditableProfile>(emptyForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const initialLoadStarted = useRef(false);

  useEffect(() => {
    // React Strict Mode runs effects twice in development. Avoid duplicate profile
    // requests, which can surface as repeated network errors during route compilation.
    if (initialLoadStarted.current) return;
    initialLoadStarted.current = true;
    void loadProfile();
  }, []);

  async function readJson(response: Response): Promise<Record<string, unknown>> {
    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.includes("application/json")) return {};

    try {
      return (await response.json()) as Record<string, unknown>;
    } catch {
      return {};
    }
  }

  async function loadProfile() {
    setLoading(true);
    setError("");

    try {
      const response = await fetch("/api/driver/profile", {
        cache: "no-store",
        credentials: "same-origin",
        headers: { Accept: "application/json" },
      });
      const payload = await readJson(response);

      if (!response.ok) {
        setError(
          typeof payload.error === "string"
            ? payload.error
            : `Unable to load driver profile (HTTP ${response.status}).`,
        );
        return;
      }

      if (!payload.driver || typeof payload.driver !== "object") {
        setError("The driver profile response was incomplete. Please refresh the page.");
        return;
      }

      const nextDriver = payload.driver as DriverProfile;
      setDriver(nextDriver);
      setJobs((Array.isArray(payload.jobs) ? payload.jobs : []) as Job[]);
      setPayouts((Array.isArray(payload.payouts) ? payload.payouts : []) as Payout[]);
      setCompanyLinks(
        (Array.isArray(payload.company_links) ? payload.company_links : []) as DriverCompanyLink[],
      );
      setCustomerLinks(
        (Array.isArray(payload.customer_links) ? payload.customer_links : []) as DriverCustomerLink[],
      );
      setVehicleDocuments(
        (Array.isArray(payload.vehicle_documents) ? payload.vehicle_documents : []) as VehicleDocument[],
      );
      setForm(toForm(nextDriver));
    } catch (requestError) {
      console.error("Driver profile request failed:", requestError);
      setError(
        "The development server connection was interrupted. Refresh this page after the server shows Ready.",
      );
    } finally {
      setLoading(false);
    }
  }

  function update<K extends keyof EditableProfile>(key: K, value: EditableProfile[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function saveProfile() {
    setSaving(true);
    setNotice("");
    setError("");

    try {
      const response = await fetch("/api/driver/profile", {
        method: "POST",
        credentials: "same-origin",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(form),
      });
      const payload = await readJson(response);

      if (!response.ok) {
        setError(
          typeof payload.error === "string"
            ? payload.error
            : `Unable to update profile (HTTP ${response.status}).`,
        );
        return;
      }

      await loadProfile();
      setNotice("Driver profile updated successfully.");
    } catch (requestError) {
      console.error("Driver profile update failed:", requestError);
      setError(
        "The server connection was interrupted before the profile could be saved. Please try again.",
      );
    } finally {
      setSaving(false);
    }
  }

  const summary = useMemo(() => {
    const completedJobs = jobs.filter((job) => job.status === "completed").length;
    const earnings = jobs.reduce((total, job) => total + Number(job.driver_amount || 0), 0);
    const paid = payouts.reduce((total, payout) => total + Number(payout.amount_paid || 0), 0);
    const outstanding = payouts
      .filter((payout) => payout.status !== "cancelled")
      .reduce((total, payout) => total + Number(payout.outstanding_amount || 0), 0);
    return { completedJobs, earnings, paid, outstanding };
  }, [jobs, payouts]);

  return (
    <div className="shell">
      

      <main className="container">
        <h1 className="page-title">My Driver Profile</h1>
        <p className="subtitle">
          Update your contact, vehicle and payout details. Name, company, login and licence details are controlled by the administrator.
        </p>

        {notice ? <div className="notice success">{notice}</div> : null}
        {error ? <div className="notice error">{error}</div> : null}

        {loading ? (
          <section className="card">Loading driver profile...</section>
        ) : driver ? (
          <section className="grid">
            <article className="card driver-profile-header">
              <div className="driver-profile-photo">
                {driver.document_urls.profile_photo ? (
                  <img src={driver.document_urls.profile_photo} alt="Driver" />
                ) : (
                  <span>{driver.full_name.charAt(0).toUpperCase()}</span>
                )}
              </div>
              <div>
                <span className="badge">{driver.driver_no}</span>
                <h2>{driver.full_name}</h2>
                <p>{driver.companies?.name ?? "No company assigned"}</p>
                <p>Login: {driver.login_email ?? "Not available"}</p>
              </div>
              <span className={`badge ${driver.status === "inactive" ? "badge-muted" : ""}`}>
                {driver.status}
              </span>
            </article>

            <article className="card">
              <h2 style={{ marginTop: 0 }}>My Limousine Network</h2>
              <p className="subtitle" style={{ marginTop: 0 }}>
                These company, client and customer assignments are controlled by the administrator.
              </p>
              <div className="driver-summary-grid">
                <div><span>Linked companies</span><strong>{companyLinks.length}</strong></div>
                <div><span>Linked clients</span><strong>{customerLinks.filter((link) => link.relationship_type === "client").length}</strong></div>
                <div><span>Linked customers</span><strong>{customerLinks.filter((link) => link.relationship_type === "customer").length}</strong></div>
                <div><span>Primary company</span><strong>{companyLinks.find((link) => link.is_primary)?.companies?.name || driver.companies?.name || "—"}</strong></div>
              </div>
              <div className="readonly-grid" style={{ marginTop: 16 }}>
                {companyLinks.map((link) => (
                  <div key={`company-${link.company_id}`}>
                    <span>{link.is_primary ? "Primary limousine company" : "Linked limousine company"}</span>
                    <strong>{link.companies?.name || "Company"}</strong>
                  </div>
                ))}
                {customerLinks.map((link) => (
                  <div key={`customer-${link.customer_id}`}>
                    <span>{link.relationship_type === "client" ? "Client" : "Customer"}</span>
                    <strong>{link.customers?.customer_name || "Assigned record"}</strong>
                  </div>
                ))}
              </div>
            </article>

            <article className="card">
              <h2 style={{ marginTop: 0 }}>Administrator-Controlled Details</h2>
              <div className="readonly-grid">
                <div><span>NRIC / Passport</span><strong>{driver.nric_passport || "—"}</strong></div>
                <div><span>Nationality</span><strong>{driver.nationality || "—"}</strong></div>
                <div><span>Date of birth</span><strong>{formatDate(driver.date_of_birth)}</strong></div>
                <div><span>Licence number</span><strong>{driver.licence_no || "—"}</strong></div>
                <div><span>Licence class</span><strong>{driver.licence_class || "—"}</strong></div>
                <div><span>Licence expiry</span><strong>{formatDate(driver.licence_expiry)}</strong></div>
              </div>
            </article>

            <article className="card">
              <h2 style={{ marginTop: 0 }}>Contact & Emergency</h2>
              <div className="form-grid">
                <label className="field">
                  <span>Contact number</span>
                  <input value={form.phone} onChange={(event) => update("phone", event.target.value)} />
                </label>
                <label className="field">
                  <span>Contact email</span>
                  <input type="email" value={form.contact_email} onChange={(event) => update("contact_email", event.target.value)} />
                </label>
                <label className="field full">
                  <span>Address</span>
                  <textarea rows={3} value={form.address} onChange={(event) => update("address", event.target.value)} />
                </label>
                <label className="field">
                  <span>Emergency contact name</span>
                  <input value={form.emergency_contact_name} onChange={(event) => update("emergency_contact_name", event.target.value)} />
                </label>
                <label className="field">
                  <span>Emergency contact number</span>
                  <input value={form.emergency_contact_phone} onChange={(event) => update("emergency_contact_phone", event.target.value)} />
                </label>
              </div>
            </article>

            <article className="card">
              <h2 style={{ marginTop: 0 }}>Vehicle Information</h2>
              <div className="form-grid">
                <label className="field">
                  <span>Vehicle make</span>
                  <input value={form.vehicle_make} onChange={(event) => update("vehicle_make", event.target.value)} />
                </label>
                <label className="field">
                  <span>Vehicle model</span>
                  <input value={form.vehicle_model} onChange={(event) => update("vehicle_model", event.target.value)} />
                </label>
                <label className="field">
                  <span>Vehicle plate</span>
                  <input value={form.vehicle_plate} onChange={(event) => update("vehicle_plate", event.target.value.toUpperCase())} />
                </label>
                <label className="field">
                  <span>Vehicle type</span>
                  <input value={form.vehicle_type} onChange={(event) => update("vehicle_type", event.target.value)} />
                </label>
              </div>
            </article>

            <article className="card">
              <h2 style={{ marginTop: 0 }}>Bank & PayNow</h2>
              <div className="form-grid">
                <label className="field">
                  <span>Bank name</span>
                  <input value={form.bank_name} onChange={(event) => update("bank_name", event.target.value)} />
                </label>
                <label className="field">
                  <span>Account name</span>
                  <input value={form.bank_account_name} onChange={(event) => update("bank_account_name", event.target.value)} />
                </label>
                <label className="field full">
                  <span>Account number</span>
                  <input value={form.bank_account_no} onChange={(event) => update("bank_account_no", event.target.value)} />
                </label>
                <label className="field">
                  <span>PayNow type</span>
                  <select value={form.paynow_type} onChange={(event) => update("paynow_type", event.target.value)}>
                    <option value="">None</option>
                    <option value="mobile">Mobile</option>
                    <option value="nric">NRIC / FIN</option>
                    <option value="uen">UEN</option>
                    <option value="other">Other</option>
                  </select>
                </label>
                <label className="field">
                  <span>PayNow number</span>
                  <input value={form.paynow_no} onChange={(event) => update("paynow_no", event.target.value)} />
                </label>
              </div>
            </article>

            <article className="card">
              <h2 style={{ marginTop: 0 }}>My Documents</h2>
              <div className="driver-document-grid">
                {[
                  ["Driving Licence Front", driver.document_urls.licence_front],
                  ["Driving Licence Back", driver.document_urls.licence_back],
                  ["Identity Document", driver.document_urls.identity_document],
                ].map(([label, url]) => (
                  <div className="driver-document-card" key={label}>
                    <strong>{label}</strong>
                    <div className="document-preview">
                      {url ? (
                        <a href={url} target="_blank" rel="noreferrer">Open document</a>
                      ) : (
                        <span>Not uploaded</span>
                      )}
                    </div>
                  </div>
                ))}
                {vehicleDocuments.map((document) => (
                  <div className="driver-document-card" key={document.id}>
                    <strong>{document.original_filename}</strong>
                    <small>{formatDocumentSize(document.size_bytes)} · Vehicle file</small>
                    <div className="document-preview">
                      {document.signed_url ? (
                        <a href={document.signed_url} target="_blank" rel="noreferrer">Open vehicle file</a>
                      ) : (
                        <span>Secure link unavailable</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </article>

            <article className="card">
              <h2 style={{ marginTop: 0 }}>Jobs & Payout Summary</h2>
              <div className="driver-summary-grid">
                <div><span>Completed jobs</span><strong>{summary.completedJobs}</strong></div>
                <div><span>Driver earnings</span><strong>{formatMoney(summary.earnings)}</strong></div>
                <div><span>Total paid</span><strong>{formatMoney(summary.paid)}</strong></div>
                <div><span>Outstanding payout</span><strong>{formatMoney(summary.outstanding)}</strong></div>
              </div>
            </article>

            <article className="card">
              <h2 style={{ marginTop: 0 }}>Recent Jobs</h2>
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr><th>Date</th><th>Reference</th><th>Service</th><th>Status</th><th>Driver amount</th></tr>
                  </thead>
                  <tbody>
                    {jobs.length === 0 ? (
                      <tr><td colSpan={5}>No jobs recorded yet.</td></tr>
                    ) : jobs.map((job) => (
                      <tr key={job.id}>
                        <td>{formatDate(job.job_date)}</td>
                        <td>{job.job_reference || "—"}</td>
                        <td>{job.service_type || "—"}</td>
                        <td><span className="badge">{job.status}</span></td>
                        <td>{formatMoney(job.driver_amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </article>

            <article className="card">
              <h2 style={{ marginTop: 0 }}>Recent Payouts</h2>
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr><th>Period</th><th>Payout no.</th><th>Net payout</th><th>Paid</th><th>Outstanding</th><th>Status</th></tr>
                  </thead>
                  <tbody>
                    {payouts.length === 0 ? (
                      <tr><td colSpan={6}>No payouts recorded yet.</td></tr>
                    ) : payouts.map((payout) => (
                      <tr key={payout.id}>
                        <td>{formatDate(payout.period_start)} – {formatDate(payout.period_end)}</td>
                        <td>{payout.payout_no || "—"}</td>
                        <td>{formatMoney(payout.net_payout)}</td>
                        <td>{formatMoney(payout.amount_paid)}</td>
                        <td>{formatMoney(payout.outstanding_amount)}</td>
                        <td><span className="badge">{payout.status}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </article>

            <article className="card">
              <label className="field">
                <span>Notes</span>
                <textarea rows={4} value={form.notes} onChange={(event) => update("notes", event.target.value)} />
              </label>
            </article>

            <div className="actions">
              <button className="button primary" disabled={saving} onClick={() => void saveProfile()}>
                {saving ? "Saving..." : "Save My Profile"}
              </button>
            </div>
          </section>
        ) : null}
      </main>
    </div>
  );
}
