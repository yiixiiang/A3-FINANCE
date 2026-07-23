"use client";

import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { createClient } from "@/lib/supabase/client";
import styles from "@/app/driver-signup/[token]/driver-signup.module.css";

const maxFiles = 6;
const maxFileSize = 10 * 1024 * 1024;
const allowedDocumentTypes = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "application/pdf",
]);

type Company = {
  id: number;
  name: string;
  address: string | null;
  phone: string | null;
  email: string | null;
  primary_colour: string | null;
  secondary_colour: string | null;
  accent_colour: string | null;
  logo_url: string | null;
};
type Signup = {
  link_name: string;
  expires_at: string | null;
  company: Company;
  upload_rules?: {
    required: boolean;
    max_files: number;
    max_file_size_mb: number;
    accepted: string[];
  };
};
type SignupPayload = {
  signup?: Signup;
  error?: string;
};
type Form = {
  full_name: string;
  phone: string;
  contact_email: string;
  address: string;
  nationality: string;
  date_of_birth: string;
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
  consent_confirmed: boolean;
};
type UploadAuthorisation = {
  document_id: string;
  path: string;
  token: string;
  original_filename: string;
};
type ApplicationSession = {
  application_id: number;
  application_no: string | null;
  submission_token: string;
  uploads: UploadAuthorisation[];
};

const emptyForm: Form = {
  full_name: "",
  phone: "",
  contact_email: "",
  address: "",
  nationality: "",
  date_of_birth: "",
  emergency_contact_name: "",
  emergency_contact_phone: "",
  vehicle_make: "",
  vehicle_model: "",
  vehicle_plate: "",
  vehicle_type: "",
  bank_name: "",
  bank_account_name: "",
  bank_account_no: "",
  paynow_type: "mobile",
  paynow_no: "",
  notes: "",
  consent_confirmed: false,
};

function fileSize(size: number) {
  if (size >= 1024 * 1024) return `${(size / 1024 / 1024).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(size / 1024))} KB`;
}

export default function DriverSignupForm({ accessKey }: { accessKey: string }) {
  const token = accessKey;
  const [signup, setSignup] = useState<Signup | null>(null);
  const [form, setForm] = useState<Form>(emptyForm);
  const [vehicleFiles, setVehicleFiles] = useState<File[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [uploadProgress, setUploadProgress] = useState("");
  const [error, setError] = useState("");
  const [applicationNo, setApplicationNo] = useState("");

  useEffect(() => {
    if (!token) {
      setError("A driver signup token is required.");
      setLoading(false);
      return;
    }

    const controller = new AbortController();
    async function loadSignup() {
      try {
        const response = await fetch(`/api/public/driver-signup/${token}`, {
          cache: "no-store",
          signal: controller.signal,
        });
        const payload = (await response.json()) as SignupPayload;
        if (!response.ok) throw new Error(payload.error || "Unable to open driver signup.");
        setSignup(payload.signup ?? null);
      } catch (loadError) {
        if (loadError instanceof DOMException && loadError.name === "AbortError") return;
        setError(loadError instanceof Error ? loadError.message : "Unable to open driver signup.");
      } finally {
        setLoading(false);
      }
    }

    void loadSignup();
    return () => controller.abort();
  }, [token]);

  const theme = useMemo(
    () =>
      ({
        "--signup-primary": signup?.company.primary_colour || "#075985",
        "--signup-secondary": signup?.company.secondary_colour || "#0f172a",
        "--signup-accent": signup?.company.accent_colour || "#38bdf8",
      }) as CSSProperties,
    [signup],
  );

  function update<K extends keyof Form>(key: K, value: Form[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function selectVehicleFiles(fileList: FileList | null) {
    if (!fileList) return;
    setError("");

    const nextFiles = Array.from(fileList);
    if (nextFiles.length === 0) return;
    if (vehicleFiles.length + nextFiles.length > maxFiles) {
      setError(`Upload no more than ${maxFiles} vehicle files.`);
      return;
    }

    const invalidType = nextFiles.find((file) => !allowedDocumentTypes.has(file.type));
    if (invalidType) {
      setError(`${invalidType.name} is not supported. Use PNG, JPG, WEBP or PDF.`);
      return;
    }
    const oversized = nextFiles.find((file) => file.size > maxFileSize);
    if (oversized) {
      setError(`${oversized.name} is larger than 10 MB.`);
      return;
    }

    setVehicleFiles((current) => [...current, ...nextFiles]);
  }

  function removeVehicleFile(index: number) {
    setVehicleFiles((current) => current.filter((_, fileIndex) => fileIndex !== index));
  }

  async function cancelSession(session: ApplicationSession) {
    if (!token) return;
    try {
      await fetch(`/api/public/driver-signup/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "cancel_application",
          application_id: session.application_id,
          submission_token: session.submission_token,
        }),
      });
    } catch {
      // Best-effort immediate cleanup. Expired sessions are also cleared when the applicant retries.
    }
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token) return;
    if (vehicleFiles.length === 0) {
      setError("Upload at least one vehicle document or vehicle photo.");
      return;
    }

    setSubmitting(true);
    setUploadProgress("Preparing secure vehicle upload...");
    setError("");
    let session: ApplicationSession | null = null;

    try {
      const startResponse = await fetch(`/api/public/driver-signup/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "start_application",
          ...form,
          files: vehicleFiles.map((file) => ({
            name: file.name,
            type: file.type,
            size: file.size,
          })),
        }),
      });
      const startPayload = (await startResponse.json()) as Partial<ApplicationSession> & {
        error?: string;
      };
      if (!startResponse.ok) {
        throw new Error(startPayload.error || "Unable to prepare driver application.");
      }
      if (
        !startPayload.application_id ||
        !startPayload.submission_token ||
        !Array.isArray(startPayload.uploads) ||
        startPayload.uploads.length !== vehicleFiles.length
      ) {
        throw new Error("The secure vehicle upload response was incomplete.");
      }

      session = startPayload as ApplicationSession;
      const supabase = createClient();
      for (let index = 0; index < vehicleFiles.length; index += 1) {
        const file = vehicleFiles[index];
        const upload = session.uploads[index];
        setUploadProgress(`Uploading vehicle file ${index + 1} of ${vehicleFiles.length}: ${file.name}`);
        const { error: uploadError } = await supabase.storage
          .from("driver-documents")
          .uploadToSignedUrl(upload.path, upload.token, file, {
            contentType: file.type,
            cacheControl: "3600",
          });
        if (uploadError) throw new Error(`Unable to upload ${file.name}: ${uploadError.message}`);
      }

      setUploadProgress("Confirming vehicle documents...");
      const finalizeResponse = await fetch(`/api/public/driver-signup/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "finalize_application",
          application_id: session.application_id,
          submission_token: session.submission_token,
        }),
      });
      const finalizePayload = (await finalizeResponse.json()) as {
        application_no?: string;
        error?: string;
      };
      if (!finalizeResponse.ok) {
        throw new Error(finalizePayload.error || "Unable to finalize driver application.");
      }

      setApplicationNo(finalizePayload.application_no || session.application_no || "Submitted");
      setUploadProgress("");
      session = null;
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (submitError) {
      if (session) await cancelSession(session);
      setError(submitError instanceof Error ? submitError.message : "Unable to submit application.");
      setUploadProgress("");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return <main className={styles.statePage}><section className={styles.stateCard}><div className={styles.spinner} /><p>Opening secure driver application...</p></section></main>;
  }

  if (error && !signup) {
    return <main className={styles.statePage}><section className={styles.stateCard}><div className={styles.errorIcon}>!</div><h1>Application unavailable</h1><p>{error}</p></section></main>;
  }

  if (!signup) return null;

  if (applicationNo) {
    return (
      <main className={styles.successPage} style={theme}>
        <section className={styles.successCard}>
          <div className={styles.successIcon}>✓</div>
          <p className={styles.kicker}>APPLICATION & VEHICLE FILES RECEIVED</p>
          <h1>Thank you, {form.full_name}.</h1>
          <p>Your driver application and {vehicleFiles.length} vehicle file{vehicleFiles.length === 1 ? "" : "s"} were submitted directly to <strong>{signup.company.name}</strong>.</p>
          <div className={styles.referenceBox}><span>Application reference</span><strong>{applicationNo}</strong></div>
          <p className={styles.smallText}>The company will review your contact, vehicle, emergency, bank, PayNow and uploaded document information. Once approved, your driver login account is created automatically.</p>
        </section>
      </main>
    );
  }

  return (
    <main className={styles.page} style={theme}>
      <section className={styles.banner}>
        <div className={styles.brandBlock}>
          {signup.company.logo_url ? <img src={signup.company.logo_url} alt={`${signup.company.name} logo`} /> : <div className={styles.logoFallback}>{signup.company.name.slice(0, 2).toUpperCase()}</div>}
          <div><p>DRIVER RECRUITMENT</p><h1>{signup.company.name}</h1><span>{signup.link_name}</span></div>
        </div>
        <div className={styles.lockedCompany}><span>Company assignment</span><strong>{signup.company.name}</strong><small>Locked by this signup link</small></div>
      </section>

      <div className={styles.content}>
        <aside className={styles.sidebar}>
          <section>
            <span className={styles.stepNo}>01</span>
            <h2>Join the Driver Network</h2>
            <p>Provide your name, contact, car, emergency contact, bank, PayNow and vehicle documents. NRIC and driving licence numbers are not collected. Your application goes only to the selected company.</p>
          </section>
          <section className={styles.companyCard}>
            <h3>Selected Company</h3>
            <strong>{signup.company.name}</strong>
            {signup.company.address ? <p>{signup.company.address}</p> : null}
            <div>{signup.company.phone ? <span>{signup.company.phone}</span> : null}{signup.company.email ? <span>{signup.company.email}</span> : null}</div>
          </section>
          <section className={styles.securityCard}><strong>Private vehicle files</strong><p>Files are uploaded to private storage and are available only for company review and the linked driver record after approval.</p></section>
        </aside>

        <form className={styles.formCard} onSubmit={submit}>
          {error ? <div className={styles.formError}>{error}</div> : null}

          <section className={styles.formSection}>
            <div className={styles.sectionTitle}><span>01</span><div><h2>Name & Contact</h2><p>Your main contact information for the company.</p></div></div>
            <div className={styles.formGrid}>
              <label><span>Full Name *</span><input required value={form.full_name} onChange={(event) => update("full_name", event.target.value)} /></label>
              <label><span>Contact Number *</span><input required inputMode="tel" value={form.phone} onChange={(event) => update("phone", event.target.value)} /></label>
              <label><span>Email Address *</span><input required type="email" placeholder="Used for your driver login" value={form.contact_email} onChange={(event) => update("contact_email", event.target.value)} /></label>
              <label><span>Nationality</span><input value={form.nationality} onChange={(event) => update("nationality", event.target.value)} /></label>
              <label><span>Date of Birth</span><input type="date" value={form.date_of_birth} onChange={(event) => update("date_of_birth", event.target.value)} /></label>
              <label className={styles.full}><span>Residential Address</span><textarea rows={3} value={form.address} onChange={(event) => update("address", event.target.value)} /></label>
            </div>
          </section>

          <section className={styles.formSection}>
            <div className={styles.sectionTitle}><span>02</span><div><h2>Car Information</h2><p>Car model and car plate are compulsory.</p></div></div>
            <div className={styles.formGrid}>
              <label><span>Car Make</span><input placeholder="Example: Toyota" value={form.vehicle_make} onChange={(event) => update("vehicle_make", event.target.value)} /></label>
              <label><span>Car Model *</span><input required placeholder="Example: Alphard" value={form.vehicle_model} onChange={(event) => update("vehicle_model", event.target.value)} /></label>
              <label><span>Car Plate *</span><input required value={form.vehicle_plate} onChange={(event) => update("vehicle_plate", event.target.value.toUpperCase())} /></label>
              <label><span>Car Type</span><input placeholder="Example: 7-Seater MPV" value={form.vehicle_type} onChange={(event) => update("vehicle_type", event.target.value)} /></label>
            </div>
          </section>


          <section className={styles.formSection}>
            <div className={styles.sectionTitle}><span>03</span><div><h2>Upload Vehicle Files *</h2><p>Upload log card, insurance, inspection report or clear vehicle photos.</p></div></div>
            <label className={styles.uploadDrop}>
              <input
                type="file"
                multiple
                accept="image/png,image/jpeg,image/webp,application/pdf"
                onChange={(event) => {
                  selectVehicleFiles(event.target.files);
                  event.target.value = "";
                }}
              />
              <span className={styles.uploadIcon}>↑</span>
              <strong>Choose Vehicle Files</strong>
              <small>PNG, JPG, WEBP or PDF · Maximum 10 MB each · Up to {maxFiles} files</small>
            </label>
            {vehicleFiles.length > 0 ? (
              <div className={styles.fileList}>
                {vehicleFiles.map((file, index) => (
                  <div key={`${file.name}-${file.lastModified}-${index}`}>
                    <span>{file.type === "application/pdf" ? "PDF" : "IMG"}</span>
                    <div><strong>{file.name}</strong><small>{fileSize(file.size)}</small></div>
                    <button type="button" onClick={() => removeVehicleFile(index)} disabled={submitting}>Remove</button>
                  </div>
                ))}
              </div>
            ) : <p className={styles.uploadRequired}>At least one vehicle document or photo is required.</p>}
          </section>

          <section className={styles.formSection}>
            <div className={styles.sectionTitle}><span>04</span><div><h2>Emergency Contact, Bank & PayNow</h2><p>Required emergency and payout information for approved drivers.</p></div></div>
            <div className={styles.formGrid}>
              <label><span>Emergency Contact Name *</span><input required value={form.emergency_contact_name} onChange={(event) => update("emergency_contact_name", event.target.value)} /></label>
              <label><span>Emergency Contact Number *</span><input required inputMode="tel" value={form.emergency_contact_phone} onChange={(event) => update("emergency_contact_phone", event.target.value)} /></label>
              <label><span>Bank Name *</span><input required value={form.bank_name} onChange={(event) => update("bank_name", event.target.value)} /></label>
              <label><span>Bank Account Name *</span><input required value={form.bank_account_name} onChange={(event) => update("bank_account_name", event.target.value)} /></label>
              <label className={styles.full}><span>Bank Account Number *</span><input required value={form.bank_account_no} onChange={(event) => update("bank_account_no", event.target.value)} /></label>
              <label><span>PayNow Type *</span><select required value={form.paynow_type} onChange={(event) => update("paynow_type", event.target.value)}><option value="mobile">Mobile</option><option value="uen">UEN</option><option value="other">Other</option></select></label>
              <label><span>PayNow Number *</span><input required value={form.paynow_no} onChange={(event) => update("paynow_no", event.target.value)} /></label>
              <label className={styles.full}><span>Additional Information</span><textarea rows={4} placeholder="Availability, experience or other information" value={form.notes} onChange={(event) => update("notes", event.target.value)} /></label>
            </div>
          </section>

          <section className={styles.consentSection}>
            <label><input required type="checkbox" checked={form.consent_confirmed} onChange={(event) => update("consent_confirmed", event.target.checked)} /><span>I confirm that the information and vehicle files are accurate and consent to {signup.company.name} reviewing them for driver recruitment and operations.</span></label>
            {uploadProgress ? <div className={styles.uploadProgress}><div className={styles.miniSpinner} /><span>{uploadProgress}</span></div> : null}
            <button type="submit" disabled={submitting}>{submitting ? "Uploading & Submitting..." : `Submit Application to ${signup.company.name}`}</button>
            <p>Your application and vehicle files are assigned only to the selected company shown on this page.</p>
          </section>
        </form>
      </div>
    </main>
  );
}
