"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type DriverStatus = "active" | "inactive";
type PayNowType = "" | "mobile" | "nric" | "uen" | "other";
type DocumentKind =
  | "profile_photo_path"
  | "licence_front_path"
  | "licence_back_path"
  | "identity_document_path";

type Company = {
  id: number;
  name: string;
  company_type: string;
  status: string;
};

type DriverSummary = {
  completed_jobs: number;
  gross_fares: number;
  driver_earnings: number;
  total_paid: number;
  outstanding_payout: number;
};

type Driver = {
  id: number;
  driver_no: string;
  company_id: number;
  auth_user_id: string | null;
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
  paynow_type: PayNowType | null;
  paynow_no: string | null;
  profile_photo_path: string | null;
  licence_front_path: string | null;
  licence_back_path: string | null;
  identity_document_path: string | null;
  login_enabled: boolean;
  status: DriverStatus;
  notes: string | null;
  summary: DriverSummary;
};

type DriverForm = {
  company_id: number | "";
  full_name: string;
  phone: string;
  contact_email: string;
  login_email: string;
  address: string;
  nric_passport: string;
  nationality: string;
  date_of_birth: string;
  licence_no: string;
  licence_class: string;
  licence_expiry: string;
  emergency_contact_name: string;
  emergency_contact_phone: string;
  vehicle_make: string;
  vehicle_model: string;
  vehicle_plate: string;
  vehicle_type: string;
  bank_name: string;
  bank_account_name: string;
  bank_account_no: string;
  paynow_type: PayNowType;
  paynow_no: string;
  status: DriverStatus;
  notes: string;
};

type DocumentUrls = Record<DocumentKind, string | null>;

const supabase = createClient();
const documentBucket = "driver-documents";
const allowedDocumentTypes = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "application/pdf",
]);
const maxDocumentSize = 10 * 1024 * 1024;

const typeLabels: Record<string, string> = {
  general: "General Business",
  limousine: "Limousine",
  entertainment: "Nightclub",
  food: "F&B",
  other: "Other",
};

const documentLabels: Record<DocumentKind, string> = {
  profile_photo_path: "Driver Photo",
  licence_front_path: "Driving Licence Front",
  licence_back_path: "Driving Licence Back",
  identity_document_path: "Identity Document",
};

const emptyForm: DriverForm = {
  company_id: "",
  full_name: "",
  phone: "",
  contact_email: "",
  login_email: "",
  address: "",
  nric_passport: "",
  nationality: "",
  date_of_birth: "",
  licence_no: "",
  licence_class: "",
  licence_expiry: "",
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
  status: "active",
  notes: "",
};

const emptyUrls: DocumentUrls = {
  profile_photo_path: null,
  licence_front_path: null,
  licence_back_path: null,
  identity_document_path: null,
};

function toForm(driver: Driver): DriverForm {
  return {
    company_id: driver.company_id,
    full_name: driver.full_name,
    phone: driver.phone ?? "",
    contact_email: driver.contact_email ?? "",
    login_email: driver.login_email ?? "",
    address: driver.address ?? "",
    nric_passport: driver.nric_passport ?? "",
    nationality: driver.nationality ?? "",
    date_of_birth: driver.date_of_birth ?? "",
    licence_no: driver.licence_no ?? "",
    licence_class: driver.licence_class ?? "",
    licence_expiry: driver.licence_expiry ?? "",
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
    status: driver.status,
    notes: driver.notes ?? "",
  };
}

function extensionFor(file: File) {
  if (file.type === "image/png") return "png";
  if (file.type === "image/webp") return "webp";
  if (file.type === "application/pdf") return "pdf";
  return "jpg";
}

function formatMoney(value: number) {
  return new Intl.NumberFormat("en-SG", {
    style: "currency",
    currency: "SGD",
    minimumFractionDigits: 2,
  }).format(Number(value || 0));
}

export default function DriverManagementPage() {
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [form, setForm] = useState<DriverForm>(emptyForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [createLogin, setCreateLogin] = useState(false);
  const [loginPassword, setLoginPassword] = useState("");
  const [resetPassword, setResetPassword] = useState("");
  const [uploading, setUploading] = useState<DocumentKind | null>(null);
  const [documentUrls, setDocumentUrls] = useState<DocumentUrls>(emptyUrls);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  const selected = useMemo(
    () => drivers.find((driver) => driver.id === selectedId) ?? null,
    [drivers, selectedId],
  );

  async function loadDrivers(preferredId?: number | null) {
    setLoading(true);
    setError("");

    const response = await fetch("/api/admin/drivers", { cache: "no-store" });
    const payload = await response.json();

    if (!response.ok) {
      setError(payload.error ?? "Unable to load drivers.");
      setLoading(false);
      return;
    }

    const nextDrivers = (payload.drivers ?? []) as Driver[];
    const nextCompanies = (payload.companies ?? []) as Company[];
    setDrivers(nextDrivers);
    setCompanies(nextCompanies);

    const nextSelected =
      nextDrivers.find((driver) => driver.id === preferredId) ??
      nextDrivers.find((driver) => driver.id === selectedId) ??
      nextDrivers[0] ??
      null;

    if (nextSelected) await selectDriver(nextSelected, false);
    else newDriver(false, nextCompanies);
    setLoading(false);
  }

  async function signedDocumentUrls(driver: Driver): Promise<DocumentUrls> {
    const entries = await Promise.all(
      (Object.keys(documentLabels) as DocumentKind[]).map(async (kind) => {
        const path = driver[kind];
        if (!path) return [kind, null] as const;
        const { data, error: signedError } = await supabase.storage
          .from(documentBucket)
          .createSignedUrl(path, 60 * 60);
        return [kind, signedError ? null : data.signedUrl] as const;
      }),
    );
    return Object.fromEntries(entries) as DocumentUrls;
  }

  async function selectDriver(driver: Driver, clearMessages = true) {
    setSelectedId(driver.id);
    setForm(toForm(driver));
    setCreateLogin(false);
    setLoginPassword("");
    setResetPassword("");
    setDocumentUrls(await signedDocumentUrls(driver));
    if (clearMessages) {
      setNotice("");
      setError("");
    }
  }

  function newDriver(clearMessages = true, availableCompanies = companies) {
    const firstCompany = availableCompanies.find((company) => company.status === "active");
    setSelectedId(null);
    setForm({ ...emptyForm, company_id: firstCompany?.id ?? "" });
    setCreateLogin(false);
    setLoginPassword("");
    setResetPassword("");
    setDocumentUrls(emptyUrls);
    if (clearMessages) {
      setNotice("Enter the driver details. Login access can be created now or later.");
      setError("");
    }
  }

  function update<K extends keyof DriverForm>(key: K, value: DriverForm[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function postDriver(body: Record<string, unknown>) {
    const response = await fetch("/api/admin/drivers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error ?? "Driver operation failed.");
    return payload;
  }

  async function saveDriver() {
    setSaving(true);
    setNotice("");
    setError("");

    try {
      const payload = await postDriver({
        action: selectedId ? "update" : "create",
        driver_id: selectedId,
        ...form,
        create_login: !selectedId && createLogin,
        password: !selectedId && createLogin ? loginPassword : undefined,
      });

      const savedId = selectedId ?? Number(payload.driver_id);
      await loadDrivers(savedId);
      setNotice(selectedId ? "Driver updated successfully." : "Driver created successfully.");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Unable to save driver.");
    } finally {
      setSaving(false);
    }
  }

  async function createDriverLogin() {
    if (!selectedId) return;
    setSaving(true);
    setNotice("");
    setError("");
    try {
      await postDriver({
        action: "create_login",
        driver_id: selectedId,
        login_email: form.login_email,
        password: loginPassword,
      });
      await loadDrivers(selectedId);
      setLoginPassword("");
      setNotice("Driver login account created successfully.");
    } catch (loginError) {
      setError(loginError instanceof Error ? loginError.message : "Unable to create login.");
    } finally {
      setSaving(false);
    }
  }

  async function changePassword() {
    if (!selectedId) return;
    setSaving(true);
    setNotice("");
    setError("");
    try {
      await postDriver({
        action: "reset_password",
        driver_id: selectedId,
        password: resetPassword,
      });
      setResetPassword("");
      setNotice("Driver password changed successfully.");
    } catch (passwordError) {
      setError(passwordError instanceof Error ? passwordError.message : "Unable to reset password.");
    } finally {
      setSaving(false);
    }
  }

  async function deleteDriver() {
    if (!selected) return;
    const entered = window.prompt(
      `Type the exact driver name to permanently delete this driver and linked login:\n\n${selected.full_name}`,
    );
    if (entered !== selected.full_name) {
      if (entered !== null) setError("Driver name did not match. Nothing was deleted.");
      return;
    }

    setSaving(true);
    setNotice("");
    setError("");
    try {
      await postDriver({ action: "delete", driver_id: selected.id });
      await loadDrivers(null);
      setNotice("Driver and linked login account deleted successfully.");
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Unable to delete driver.");
    } finally {
      setSaving(false);
    }
  }

  async function uploadDocument(kind: DocumentKind, file: File) {
    if (!selectedId || !selected) {
      setError("Save the driver before uploading documents.");
      return;
    }
    if (!allowedDocumentTypes.has(file.type)) {
      setError("Use PNG, JPG/JPEG, WEBP or PDF files only.");
      return;
    }
    if (file.size > maxDocumentSize) {
      setError("The document must be 10 MB or smaller.");
      return;
    }

    setUploading(kind);
    setNotice("");
    setError("");
    const oldPath = selected[kind];
    const path = `drivers/${selectedId}/${kind}.${extensionFor(file)}`;

    try {
      const { error: uploadError } = await supabase.storage
        .from(documentBucket)
        .upload(path, file, { upsert: true, contentType: file.type });
      if (uploadError) throw new Error(uploadError.message);

      await postDriver({
        action: "update_document",
        driver_id: selectedId,
        document_kind: kind,
        document_path: path,
      });

      if (oldPath && oldPath !== path) {
        await supabase.storage.from(documentBucket).remove([oldPath]);
      }

      await loadDrivers(selectedId);
      setNotice(`${documentLabels[kind]} uploaded successfully.`);
    } catch (uploadError) {
      await supabase.storage.from(documentBucket).remove([path]);
      setError(uploadError instanceof Error ? uploadError.message : "Unable to upload document.");
    } finally {
      setUploading(null);
    }
  }

  async function removeDocument(kind: DocumentKind) {
    if (!selectedId || !selected?.[kind]) return;
    setUploading(kind);
    setNotice("");
    setError("");
    try {
      await postDriver({
        action: "update_document",
        driver_id: selectedId,
        document_kind: kind,
        document_path: null,
      });
      await supabase.storage.from(documentBucket).remove([selected[kind] as string]);
      await loadDrivers(selectedId);
      setNotice(`${documentLabels[kind]} removed.`);
    } catch (removeError) {
      setError(removeError instanceof Error ? removeError.message : "Unable to remove document.");
    } finally {
      setUploading(null);
    }
  }

  useEffect(() => {
     
    void loadDrivers();
    // The initial loader is intentionally run once after mount.
     
  }, []);

  return (
    <div className="shell">
      

      <main className="container">
        <div className="actions page-heading-row">
          <div>
            <h1 className="page-title">Driver Management</h1>
            <p className="subtitle">
              Driver profile, company, licence, vehicle, payout details, documents and login access.
            </p>
          </div>
          <button className="button primary" onClick={() => newDriver()}>
            + Add Driver
          </button>
        </div>

        {notice ? <div className="notice success">{notice}</div> : null}
        {error ? <div className="notice error">{error}</div> : null}

        {loading ? (
          <section className="card">Loading drivers...</section>
        ) : (
          <div className="driver-management-grid">
            <aside className="card driver-list-card">
              <strong>Drivers ({drivers.length})</strong>
              <div className="driver-list">
                {drivers.length === 0 ? <p className="subtitle">No drivers yet.</p> : null}
                {drivers.map((driver) => (
                  <button
                    key={driver.id}
                    className={`driver-list-item ${driver.id === selectedId ? "active" : ""}`}
                    onClick={() => void selectDriver(driver)}
                  >
                    <span>
                      <b>{driver.full_name}</b>
                      <small>
                        {driver.driver_no} · {driver.vehicle_plate || "No vehicle"}
                      </small>
                    </span>
                    <span className={`status-dot ${driver.status}`} title={driver.status} />
                  </button>
                ))}
              </div>
            </aside>

            <section className="grid">
              <article className="card">
                <div className="actions user-form-title">
                  <div>
                    <h2>{selected ? selected.full_name : "New Driver"}</h2>
                    {selected ? <span className="badge">{selected.driver_no}</span> : null}
                  </div>
                  {selected ? (
                    <span className={`badge ${selected.status === "inactive" ? "badge-muted" : ""}`}>
                      {selected.status}
                    </span>
                  ) : null}
                </div>

                <div className="form-grid">
                  <label className="field">
                    <span>Assigned company *</span>
                    <select
                      value={form.company_id}
                      onChange={(event) => update("company_id", Number(event.target.value))}
                    >
                      <option value="">Select company</option>
                      {companies.map((company) => (
                        <option key={company.id} value={company.id}>
                          {company.name} — {typeLabels[company.company_type] ?? company.company_type}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="field">
                    <span>Status</span>
                    <select
                      value={form.status}
                      onChange={(event) => update("status", event.target.value as DriverStatus)}
                    >
                      <option value="active">Active</option>
                      <option value="inactive">Inactive</option>
                    </select>
                  </label>
                  <label className="field full">
                    <span>Driver name *</span>
                    <input value={form.full_name} onChange={(event) => update("full_name", event.target.value)} />
                  </label>
                  <label className="field">
                    <span>Contact number</span>
                    <input value={form.phone} onChange={(event) => update("phone", event.target.value)} />
                  </label>
                  <label className="field">
                    <span>Contact email</span>
                    <input
                      type="email"
                      value={form.contact_email}
                      onChange={(event) => update("contact_email", event.target.value)}
                    />
                  </label>
                  <label className="field">
                    <span>NRIC / Passport</span>
                    <input value={form.nric_passport} onChange={(event) => update("nric_passport", event.target.value)} />
                  </label>
                  <label className="field">
                    <span>Nationality</span>
                    <input value={form.nationality} onChange={(event) => update("nationality", event.target.value)} />
                  </label>
                  <label className="field">
                    <span>Date of birth</span>
                    <input type="date" value={form.date_of_birth} onChange={(event) => update("date_of_birth", event.target.value)} />
                  </label>
                  <label className="field full">
                    <span>Address</span>
                    <textarea rows={3} value={form.address} onChange={(event) => update("address", event.target.value)} />
                  </label>
                </div>
              </article>

              <article className="card">
                <h2 style={{ marginTop: 0 }}>Licence & Emergency Contact</h2>
                <div className="form-grid">
                  <label className="field">
                    <span>Driving licence number</span>
                    <input value={form.licence_no} onChange={(event) => update("licence_no", event.target.value)} />
                  </label>
                  <label className="field">
                    <span>Licence class</span>
                    <input value={form.licence_class} onChange={(event) => update("licence_class", event.target.value)} />
                  </label>
                  <label className="field">
                    <span>Licence expiry</span>
                    <input type="date" value={form.licence_expiry} onChange={(event) => update("licence_expiry", event.target.value)} />
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
                    <input placeholder="5-seater, 7-seater, limousine..." value={form.vehicle_type} onChange={(event) => update("vehicle_type", event.target.value)} />
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
                    <select value={form.paynow_type} onChange={(event) => update("paynow_type", event.target.value as PayNowType)}>
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
                <h2 style={{ marginTop: 0 }}>Driver Login Access</h2>
                {!selectedId ? (
                  <>
                    <label className="login-toggle">
                      <input
                        type="checkbox"
                        checked={createLogin}
                        onChange={(event) => setCreateLogin(event.target.checked)}
                      />
                      <span>Create a driver login account now</span>
                    </label>
                    {createLogin ? (
                      <div className="form-grid" style={{ marginTop: 14 }}>
                        <label className="field">
                          <span>Driver login email *</span>
                          <input type="email" value={form.login_email} onChange={(event) => update("login_email", event.target.value)} />
                        </label>
                        <label className="field">
                          <span>Temporary password *</span>
                          <input type="password" minLength={8} value={loginPassword} onChange={(event) => setLoginPassword(event.target.value)} />
                        </label>
                      </div>
                    ) : null}
                  </>
                ) : selected?.auth_user_id ? (
                  <div className="form-grid">
                    <label className="field full">
                      <span>Driver login email</span>
                      <input value={form.login_email} disabled />
                    </label>
                    <label className="field">
                      <span>New password</span>
                      <input type="password" minLength={8} value={resetPassword} onChange={(event) => setResetPassword(event.target.value)} />
                    </label>
                    <div className="field driver-login-action">
                      <span>Password control</span>
                      <button
                        className="button secondary"
                        disabled={saving || resetPassword.length < 8}
                        onClick={() => void changePassword()}
                      >
                        Reset Driver Password
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="form-grid">
                    <label className="field">
                      <span>Driver login email *</span>
                      <input type="email" value={form.login_email} onChange={(event) => update("login_email", event.target.value)} />
                    </label>
                    <label className="field">
                      <span>Temporary password *</span>
                      <input type="password" minLength={8} value={loginPassword} onChange={(event) => setLoginPassword(event.target.value)} />
                    </label>
                    <div className="actions full">
                      <button
                        className="button secondary"
                        disabled={saving || !form.login_email || loginPassword.length < 8}
                        onClick={() => void createDriverLogin()}
                      >
                        Create Driver Login
                      </button>
                    </div>
                  </div>
                )}
              </article>

              <article className="card">
                <h2 style={{ marginTop: 0 }}>Driver Documents</h2>
                <p className="subtitle">Private storage. PNG, JPG/JPEG, WEBP or PDF. Maximum 10 MB.</p>
                <div className="driver-document-grid">
                  {(Object.keys(documentLabels) as DocumentKind[]).map((kind) => (
                    <div className="driver-document-card" key={kind}>
                      <strong>{documentLabels[kind]}</strong>
                      <div className="document-preview">
                        {documentUrls[kind] ? (
                          <a href={documentUrls[kind] as string} target="_blank" rel="noreferrer">
                            Open uploaded document
                          </a>
                        ) : (
                          <span>No document uploaded</span>
                        )}
                      </div>
                      <div className="actions">
                        <label className="button secondary upload-label">
                          {uploading === kind ? "Uploading..." : "Upload"}
                          <input
                            hidden
                            type="file"
                            accept="image/png,image/jpeg,image/webp,application/pdf"
                            disabled={!selectedId || Boolean(uploading)}
                            onChange={(event) => {
                              const file = event.target.files?.[0];
                              if (file) void uploadDocument(kind, file);
                              event.currentTarget.value = "";
                            }}
                          />
                        </label>
                        {selected?.[kind] ? (
                          <button
                            className="button secondary"
                            disabled={Boolean(uploading)}
                            onClick={() => void removeDocument(kind)}
                          >
                            Remove
                          </button>
                        ) : null}
                      </div>
                    </div>
                  ))}
                </div>
              </article>

              {selected ? (
                <article className="card">
                  <h2 style={{ marginTop: 0 }}>Jobs & Payout Summary</h2>
                  <div className="driver-summary-grid">
                    <div><span>Completed jobs</span><strong>{selected.summary.completed_jobs}</strong></div>
                    <div><span>Gross fares</span><strong>{formatMoney(selected.summary.gross_fares)}</strong></div>
                    <div><span>Driver earnings</span><strong>{formatMoney(selected.summary.driver_earnings)}</strong></div>
                    <div><span>Total paid</span><strong>{formatMoney(selected.summary.total_paid)}</strong></div>
                    <div><span>Outstanding payout</span><strong>{formatMoney(selected.summary.outstanding_payout)}</strong></div>
                  </div>
                </article>
              ) : null}

              <article className="card">
                <label className="field">
                  <span>Internal notes</span>
                  <textarea rows={4} value={form.notes} onChange={(event) => update("notes", event.target.value)} />
                </label>
              </article>

              <div className="driver-footer-actions">
                <button className="button primary" disabled={saving} onClick={() => void saveDriver()}>
                  {saving ? "Saving..." : selectedId ? "Save Driver" : "Create Driver"}
                </button>
                {selectedId ? (
                  <button className="button danger-button" disabled={saving} onClick={() => void deleteDriver()}>
                    Delete Driver
                  </button>
                ) : null}
              </div>
            </section>
          </div>
        )}
      </main>
    </div>
  );
}
