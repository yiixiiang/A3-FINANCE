"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type CompanyType = "general" | "limousine" | "entertainment" | "food" | "other";
type LanguageCode = "en" | "zh-CN" | "zh-TW" | "ms";
type Appearance = "system" | "light" | "dark";
type AssetKind = "logo" | "chop";

type Company = {
  id: number;
  name: string;
  company_type: CompanyType;
  address: string | null;
  uen: string | null;
  gst_no: string | null;
  gst_enabled: boolean;
  gst_rate: number;
  phone: string | null;
  email: string | null;
  bank_name: string | null;
  bank_account_name: string | null;
  bank_account_no: string | null;
  paynow_details: string | null;
  base_currency: string;
  default_language: LanguageCode;
  appearance_mode: Appearance;
  primary_colour: string;
  secondary_colour: string;
  accent_colour: string;
  system_font_size: number;
  table_font_size: number;
  table_row_height: number;
  document_font_size: number;
  logo_width: number;
  screen_zoom: number;
  logo_path: string | null;
  company_chop_path: string | null;
  status: "active" | "inactive";
};

type FormState = Omit<Company, "id">;

const supabase = createClient();
const assetBucket = "company-assets";
const allowedImageTypes = new Set(["image/png", "image/jpeg", "image/webp"]);
const maxAssetSize = 5 * 1024 * 1024;

const emptyForm: FormState = {
  name: "",
  company_type: "general",
  address: "",
  uen: "",
  gst_no: "",
  gst_enabled: false,
  gst_rate: 9,
  phone: "",
  email: "",
  bank_name: "",
  bank_account_name: "",
  bank_account_no: "",
  paynow_details: "",
  base_currency: "SGD",
  default_language: "en",
  appearance_mode: "system",
  primary_colour: "#1d4ed8",
  secondary_colour: "#0f172a",
  accent_colour: "#f59e0b",
  system_font_size: 16,
  table_font_size: 13,
  table_row_height: 42,
  document_font_size: 12,
  logo_width: 180,
  screen_zoom: 100,
  logo_path: null,
  company_chop_path: null,
  status: "active",
};

const labels: Record<CompanyType, string> = {
  general: "General Business",
  limousine: "Limousine",
  entertainment: "Nightclub",
  food: "F&B",
  other: "Other",
};

function toForm(company: Company): FormState {
  const { id: _id, ...form } = company;
  return { ...form, default_language: "en" };
}

function extensionFor(file: File): string {
  if (file.type === "image/png") return "png";
  if (file.type === "image/webp") return "webp";
  return "jpg";
}

export default function CompaniesPage() {
  const router = useRouter();
  const [companies, setCompanies] = useState<Company[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [uploading, setUploading] = useState<AssetKind | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [chopPreview, setChopPreview] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  const selected = useMemo(
    () => companies.find((company) => company.id === selectedId) ?? null,
    [companies, selectedId],
  );

  useEffect(() => {
    void initialise();
  }, []);

  async function initialise() {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      router.replace("/login?error=Please%20sign%20in%20to%20continue.");
      return;
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();

    setIsAdmin(profile?.role === "administrator");
    await loadCompanies();
  }

  async function signedPreview(path: string | null): Promise<string | null> {
    if (!path) return null;

    const { data, error: signedError } = await supabase.storage
      .from(assetBucket)
      .createSignedUrl(path, 60 * 60);

    if (signedError) return null;
    return data.signedUrl;
  }

  async function loadPreviews(company: Company | null) {
    if (!company) {
      setLogoPreview(null);
      setChopPreview(null);
      return;
    }

    const [nextLogo, nextChop] = await Promise.all([
      signedPreview(company.logo_path),
      signedPreview(company.company_chop_path),
    ]);

    setLogoPreview(nextLogo);
    setChopPreview(nextChop);
  }

  async function loadCompanies(preferredId?: number) {
    setLoading(true);
    setError("");

    const { data, error: loadError } = await supabase
      .from("companies")
      .select("*")
      .order("name");

    if (loadError) {
      setError(loadError.message);
      setLoading(false);
      return;
    }

    const rows = (data ?? []) as Company[];
    setCompanies(rows);

    const next =
      rows.find((row) => row.id === preferredId) ?? rows[0] ?? null;
    setSelectedId(next?.id ?? null);
    setForm(next ? toForm(next) : emptyForm);
    await loadPreviews(next);
    setLoading(false);
  }

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function selectCompany(company: Company) {
    setSelectedId(company.id);
    setForm(toForm(company));
    setNotice("");
    setError("");
    await loadPreviews(company);
  }

  function newCompany() {
    if (!isAdmin) return;
    setSelectedId(null);
    setForm(emptyForm);
    setLogoPreview(null);
    setChopPreview(null);
    setNotice("Enter the new company details and save it before uploading its logo or chop.");
    setError("");
  }

  async function saveCompany() {
    if (!isAdmin) {
      setError("Only an administrator can save company records.");
      return;
    }
    if (!form.name.trim()) {
      setError("Company name is required.");
      return;
    }

    setSaving(true);
    setError("");
    setNotice("");

    const payload = {
      ...form,
      name: form.name.trim(),
      address: form.address?.trim() || null,
      uen: form.uen?.trim() || null,
      gst_no: form.gst_no?.trim() || null,
      phone: form.phone?.trim() || null,
      email: form.email?.trim() || null,
      bank_name: form.bank_name?.trim() || null,
      bank_account_name: form.bank_account_name?.trim() || null,
      bank_account_no: form.bank_account_no?.trim() || null,
      paynow_details: form.paynow_details?.trim() || null,
      updated_at: new Date().toISOString(),
    };

    const query = selectedId
      ? supabase
          .from("companies")
          .update(payload)
          .eq("id", selectedId)
          .select("id")
          .single()
      : supabase.from("companies").insert(payload).select("id").single();

    const { data, error: saveError } = await query;

    if (saveError) {
      setError(saveError.message);
      setSaving(false);
      return;
    }

    const savedId = Number(data.id);
    await loadCompanies(savedId);
    setNotice(
      selectedId
        ? "Company saved successfully."
        : "Company created. You can now upload its logo and company chop.",
    );
    window.dispatchEvent(new Event("companies:changed"));
    router.refresh();
    setSaving(false);
  }

  async function uploadAsset(kind: AssetKind, file: File | null) {
    if (!isAdmin) {
      setError("Only an administrator can upload company images.");
      return;
    }
    if (!selectedId) {
      setError("Save the company before uploading its logo or chop.");
      return;
    }
    if (!file) return;
    if (!allowedImageTypes.has(file.type)) {
      setError("Use a PNG, JPG/JPEG or WEBP image.");
      return;
    }
    if (file.size > maxAssetSize) {
      setError("The image must be 5 MB or smaller.");
      return;
    }

    setUploading(kind);
    setError("");
    setNotice("");

    const column = kind === "logo" ? "logo_path" : "company_chop_path";
    const oldPath = kind === "logo" ? form.logo_path : form.company_chop_path;
    const objectPath = `${selectedId}/${kind}-${crypto.randomUUID()}.${extensionFor(file)}`;

    const { error: uploadError } = await supabase.storage
      .from(assetBucket)
      .upload(objectPath, file, {
        cacheControl: "3600",
        contentType: file.type,
        upsert: false,
      });

    if (uploadError) {
      setError(uploadError.message);
      setUploading(null);
      return;
    }

    const { error: updateError } = await supabase
      .from("companies")
      .update({
        [column]: objectPath,
        updated_at: new Date().toISOString(),
      })
      .eq("id", selectedId);

    if (updateError) {
      await supabase.storage.from(assetBucket).remove([objectPath]);
      setError(updateError.message);
      setUploading(null);
      return;
    }

    if (oldPath && oldPath !== objectPath) {
      await supabase.storage.from(assetBucket).remove([oldPath]);
    }

    await loadCompanies(selectedId);
    setNotice(kind === "logo" ? "Company logo uploaded." : "Company chop uploaded.");
    setUploading(null);
  }

  async function removeAsset(kind: AssetKind) {
    if (!isAdmin || !selectedId) return;

    const column = kind === "logo" ? "logo_path" : "company_chop_path";
    const currentPath = kind === "logo" ? form.logo_path : form.company_chop_path;
    if (!currentPath) return;

    const confirmed = window.confirm(
      kind === "logo"
        ? "Remove this company logo?"
        : "Remove this company chop / stamp?",
    );
    if (!confirmed) return;

    setUploading(kind);
    setError("");
    setNotice("");

    const { error: updateError } = await supabase
      .from("companies")
      .update({
        [column]: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", selectedId);

    if (updateError) {
      setError(updateError.message);
      setUploading(null);
      return;
    }

    const { error: storageError } = await supabase.storage
      .from(assetBucket)
      .remove([currentPath]);

    await loadCompanies(selectedId);
    setNotice(
      storageError
        ? "The database image reference was removed, but storage cleanup returned a warning."
        : kind === "logo"
          ? "Company logo removed."
          : "Company chop removed.",
    );
    setUploading(null);
  }

  async function deleteCompany() {
    if (!isAdmin || !selectedId || !selected) return;

    const typedName = window.prompt(
      `Permanent deletion cannot be undone.\n\nType the company name exactly to delete it:\n${selected.name}`,
    );

    if (typedName === null) return;
    if (typedName.trim() !== selected.name) {
      setError("Company name did not match. The company was not deleted.");
      return;
    }

    setDeleting(true);
    setError("");
    setNotice("");

    const assetPaths = [selected.logo_path, selected.company_chop_path].filter(
      (path): path is string => Boolean(path),
    );

    const { error: deleteError } = await supabase
      .from("companies")
      .delete()
      .eq("id", selectedId);

    if (deleteError) {
      setError(
        `${deleteError.message} The company may still be linked to financial records. Deactivate it instead if deletion is blocked.`,
      );
      setDeleting(false);
      return;
    }

    let cleanupWarning = false;
    if (assetPaths.length > 0) {
      const { error: cleanupError } = await supabase.storage
        .from(assetBucket)
        .remove(assetPaths);
      cleanupWarning = Boolean(cleanupError);
    }

    await loadCompanies();
    setNotice(
      cleanupWarning
        ? "Company deleted. One or more old image files may require storage cleanup."
        : "Company deleted permanently.",
    );
    window.dispatchEvent(new Event("companies:changed"));
    router.refresh();
    setDeleting(false);
  }

  return (
    <div
      className="shell"
      style={{
        fontSize: `${form.system_font_size}px`,
        zoom: `${form.screen_zoom}%`,
      }}
    >
      

      <main className="container">
        <div
          className="actions"
          style={{ justifyContent: "space-between", alignItems: "center" }}
        >
          <div>
            <h1 className="page-title">Company Management</h1>
            <p className="subtitle">
              Sakura Entertainment is Nightclub. F&amp;B is a separate company.
            </p>
          </div>
          {isAdmin ? (
            <button
              className="button primary"
              style={{ background: form.primary_colour }}
              onClick={newCompany}
              disabled={saving || deleting || uploading !== null}
            >
              + Add Company
            </button>
          ) : null}
        </div>

        {notice ? <div className="notice success">{notice}</div> : null}
        {error ? <div className="notice error">{error}</div> : null}

        {loading ? (
          <section className="card">Loading companies...</section>
        ) : (
          <div
            className="grid company-layout"
            style={{ alignItems: "start" }}
          >
            <aside className="card">
              <strong>Companies ({companies.length})</strong>
              <div className="grid" style={{ marginTop: 12 }}>
                {companies.map((company) => (
                  <button
                    key={company.id}
                    className="button secondary company-list-button"
                    style={{
                      borderColor:
                        company.id === selectedId
                          ? form.primary_colour
                          : undefined,
                    }}
                    onClick={() => void selectCompany(company)}
                  >
                    <span className="company-list-name">{company.name}</span>
                    <span className="badge">{labels[company.company_type]}</span>
                  </button>
                ))}
                {companies.length === 0 ? (
                  <p className="subtitle">No company created yet.</p>
                ) : null}
              </div>
            </aside>

            <section className="grid">
              <article className="card">
                <h2 style={{ marginTop: 0 }}>{selected?.name ?? "New Company"}</h2>
                <div className="form-grid">
                  <label className="field full">
                    <span>Company name *</span>
                    <input
                      value={form.name}
                      disabled={!isAdmin}
                      onChange={(event) => update("name", event.target.value)}
                    />
                  </label>
                  <label className="field">
                    <span>Business type</span>
                    <select
                      value={form.company_type}
                      disabled={!isAdmin}
                      onChange={(event) =>
                        update("company_type", event.target.value as CompanyType)
                      }
                    >
                      {Object.entries(labels).map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="field">
                    <span>Status</span>
                    <select
                      value={form.status}
                      disabled={!isAdmin}
                      onChange={(event) =>
                        update(
                          "status",
                          event.target.value as "active" | "inactive",
                        )
                      }
                    >
                      <option value="active">Active</option>
                      <option value="inactive">Inactive</option>
                    </select>
                  </label>
                  <label className="field">
                    <span>UEN</span>
                    <input
                      value={form.uen ?? ""}
                      disabled={!isAdmin}
                      onChange={(event) => update("uen", event.target.value)}
                    />
                  </label>
                  <label className="field">
                    <span>Base currency</span>
                    <input
                      value={form.base_currency}
                      disabled={!isAdmin}
                      maxLength={3}
                      onChange={(event) =>
                        update("base_currency", event.target.value.toUpperCase())
                      }
                    />
                  </label>
                  <label className="field">
                    <span>Phone</span>
                    <input
                      value={form.phone ?? ""}
                      disabled={!isAdmin}
                      onChange={(event) => update("phone", event.target.value)}
                    />
                  </label>
                  <label className="field">
                    <span>Email</span>
                    <input
                      type="email"
                      value={form.email ?? ""}
                      disabled={!isAdmin}
                      onChange={(event) => update("email", event.target.value)}
                    />
                  </label>
                  <label className="field full">
                    <span>Address</span>
                    <textarea
                      rows={3}
                      value={form.address ?? ""}
                      disabled={!isAdmin}
                      onChange={(event) => update("address", event.target.value)}
                    />
                  </label>
                </div>
              </article>

              <article className="card">
                <h2 style={{ marginTop: 0 }}>Company Branding</h2>
                <p className="subtitle">
                  PNG, JPG/JPEG or WEBP. Maximum 5 MB. Files are stored privately.
                </p>
                {!selectedId ? (
                  <div className="notice error">
                    Save the company first before uploading its logo or chop.
                  </div>
                ) : null}
                <div className="asset-grid">
                  <div className="asset-card">
                    <strong>Company Logo</strong>
                    <div className="asset-preview">
                      {logoPreview ? (
                        <img
                          src={logoPreview}
                          alt={`${form.name || "Company"} logo`}
                          style={{ maxWidth: `${form.logo_width}px` }}
                        />
                      ) : (
                        <span>No logo uploaded</span>
                      )}
                    </div>
                    {isAdmin ? (
                      <div className="actions">
                        <label className="button secondary upload-label">
                          {uploading === "logo" ? "Uploading..." : "Upload Logo"}
                          <input
                            type="file"
                            accept="image/png,image/jpeg,image/webp"
                            disabled={!selectedId || uploading !== null || deleting}
                            onChange={(event) => {
                              const input = event.currentTarget;
                              const file = input.files?.[0] ?? null;
                              void uploadAsset("logo", file).finally(() => {
                                input.value = "";
                              });
                            }}
                          />
                        </label>
                        {form.logo_path ? (
                          <button
                            className="button secondary"
                            type="button"
                            disabled={uploading !== null || deleting}
                            onClick={() => void removeAsset("logo")}
                          >
                            Remove
                          </button>
                        ) : null}
                      </div>
                    ) : null}
                  </div>

                  <div className="asset-card">
                    <strong>Company Chop / Stamp</strong>
                    <div className="asset-preview chop-preview">
                      {chopPreview ? (
                        <img
                          src={chopPreview}
                          alt={`${form.name || "Company"} chop or stamp`}
                        />
                      ) : (
                        <span>No company chop uploaded</span>
                      )}
                    </div>
                    {isAdmin ? (
                      <div className="actions">
                        <label className="button secondary upload-label">
                          {uploading === "chop" ? "Uploading..." : "Upload Chop"}
                          <input
                            type="file"
                            accept="image/png,image/jpeg,image/webp"
                            disabled={!selectedId || uploading !== null || deleting}
                            onChange={(event) => {
                              const input = event.currentTarget;
                              const file = input.files?.[0] ?? null;
                              void uploadAsset("chop", file).finally(() => {
                                input.value = "";
                              });
                            }}
                          />
                        </label>
                        {form.company_chop_path ? (
                          <button
                            className="button secondary"
                            type="button"
                            disabled={uploading !== null || deleting}
                            onClick={() => void removeAsset("chop")}
                          >
                            Remove
                          </button>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                </div>
              </article>

              <article className="card">
                <h2 style={{ marginTop: 0 }}>GST &amp; Payment</h2>
                <div className="form-grid">
                  <label className="field">
                    <span>GST enabled</span>
                    <select
                      value={form.gst_enabled ? "yes" : "no"}
                      disabled={!isAdmin}
                      onChange={(event) =>
                        update("gst_enabled", event.target.value === "yes")
                      }
                    >
                      <option value="no">No</option>
                      <option value="yes">Yes</option>
                    </select>
                  </label>
                  <label className="field">
                    <span>GST rate (%)</span>
                    <input
                      type="number"
                      min="0"
                      max="100"
                      step="0.01"
                      value={form.gst_rate}
                      disabled={!isAdmin || !form.gst_enabled}
                      onChange={(event) =>
                        update("gst_rate", Number(event.target.value || 0))
                      }
                    />
                  </label>
                  <label className="field full">
                    <span>GST number</span>
                    <input
                      value={form.gst_no ?? ""}
                      disabled={!isAdmin}
                      onChange={(event) => update("gst_no", event.target.value)}
                    />
                  </label>
                  <label className="field">
                    <span>Bank name</span>
                    <input
                      value={form.bank_name ?? ""}
                      disabled={!isAdmin}
                      onChange={(event) => update("bank_name", event.target.value)}
                    />
                  </label>
                  <label className="field">
                    <span>Account name</span>
                    <input
                      value={form.bank_account_name ?? ""}
                      disabled={!isAdmin}
                      onChange={(event) =>
                        update("bank_account_name", event.target.value)
                      }
                    />
                  </label>
                  <label className="field full">
                    <span>Account number</span>
                    <input
                      value={form.bank_account_no ?? ""}
                      disabled={!isAdmin}
                      onChange={(event) =>
                        update("bank_account_no", event.target.value)
                      }
                    />
                  </label>
                  <label className="field full">
                    <span>PayNow / payment instructions</span>
                    <textarea
                      rows={3}
                      value={form.paynow_details ?? ""}
                      disabled={!isAdmin}
                      onChange={(event) =>
                        update("paynow_details", event.target.value)
                      }
                    />
                  </label>
                </div>
              </article>

              <article className="card">
                <h2 style={{ marginTop: 0 }}>
                  Language, Colour &amp; Numeric Size
                </h2>
                <div className="form-grid">
                  <label className="field">
                    <span>Default language</span>
<input value="English" readOnly />
                  </label>
                  <label className="field">
                    <span>Appearance</span>
                    <select
                      value={form.appearance_mode}
                      disabled={!isAdmin}
                      onChange={(event) =>
                        update(
                          "appearance_mode",
                          event.target.value as Appearance,
                        )
                      }
                    >
                      <option value="system">Device setting</option>
                      <option value="light">Light</option>
                      <option value="dark">Dark</option>
                    </select>
                  </label>
                  <label className="field">
                    <span>Primary colour</span>
                    <input
                      type="color"
                      value={form.primary_colour}
                      disabled={!isAdmin}
                      onChange={(event) =>
                        update("primary_colour", event.target.value)
                      }
                    />
                  </label>
                  <label className="field">
                    <span>Secondary colour</span>
                    <input
                      type="color"
                      value={form.secondary_colour}
                      disabled={!isAdmin}
                      onChange={(event) =>
                        update("secondary_colour", event.target.value)
                      }
                    />
                  </label>
                  <label className="field">
                    <span>Accent colour</span>
                    <input
                      type="color"
                      value={form.accent_colour}
                      disabled={!isAdmin}
                      onChange={(event) =>
                        update("accent_colour", event.target.value)
                      }
                    />
                  </label>
                  <label className="field">
                    <span>System font (10–30 px)</span>
                    <input
                      type="number"
                      min="10"
                      max="30"
                      value={form.system_font_size}
                      disabled={!isAdmin}
                      onChange={(event) =>
                        update(
                          "system_font_size",
                          Number(event.target.value || 16),
                        )
                      }
                    />
                  </label>
                  <label className="field">
                    <span>Table font (8–24 px)</span>
                    <input
                      type="number"
                      min="8"
                      max="24"
                      value={form.table_font_size}
                      disabled={!isAdmin}
                      onChange={(event) =>
                        update(
                          "table_font_size",
                          Number(event.target.value || 13),
                        )
                      }
                    />
                  </label>
                  <label className="field">
                    <span>Table row (24–80 px)</span>
                    <input
                      type="number"
                      min="24"
                      max="80"
                      value={form.table_row_height}
                      disabled={!isAdmin}
                      onChange={(event) =>
                        update(
                          "table_row_height",
                          Number(event.target.value || 42),
                        )
                      }
                    />
                  </label>
                  <label className="field">
                    <span>Document font (7–30 pt)</span>
                    <input
                      type="number"
                      min="7"
                      max="30"
                      value={form.document_font_size}
                      disabled={!isAdmin}
                      onChange={(event) =>
                        update(
                          "document_font_size",
                          Number(event.target.value || 12),
                        )
                      }
                    />
                  </label>
                  <label className="field">
                    <span>Logo width (50–400 px)</span>
                    <input
                      type="number"
                      min="50"
                      max="400"
                      value={form.logo_width}
                      disabled={!isAdmin}
                      onChange={(event) =>
                        update(
                          "logo_width",
                          Number(event.target.value || 180),
                        )
                      }
                    />
                  </label>
                  <label className="field">
                    <span>Screen zoom (50–200%)</span>
                    <input
                      type="number"
                      min="50"
                      max="200"
                      value={form.screen_zoom}
                      disabled={!isAdmin}
                      onChange={(event) =>
                        update(
                          "screen_zoom",
                          Number(event.target.value || 100),
                        )
                      }
                    />
                  </label>
                </div>
              </article>

              {isAdmin ? (
                <div className="actions company-footer-actions">
                  <button
                    className="button primary"
                    style={{ background: form.primary_colour }}
                    onClick={() => void saveCompany()}
                    disabled={saving || deleting || uploading !== null}
                  >
                    {saving ? "Saving..." : "Save Company"}
                  </button>
                  {selectedId ? (
                    <button
                      className="button danger-button"
                      type="button"
                      onClick={() => void deleteCompany()}
                      disabled={saving || deleting || uploading !== null}
                    >
                      {deleting ? "Deleting..." : "Delete Company"}
                    </button>
                  ) : null}
                </div>
              ) : (
                <div className="notice error">
                  Viewer mode: only an administrator can change company settings.
                </div>
              )}
            </section>
          </div>
        )}
      </main>

      <style jsx>{`
        .company-layout {
          grid-template-columns: 280px minmax(0, 1fr);
        }
        .company-list-button {
          justify-content: space-between;
          gap: 10px;
          text-align: left;
        }
        .company-list-name {
          min-width: 0;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .asset-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 16px;
          margin-top: 16px;
        }
        .asset-card {
          display: grid;
          gap: 12px;
          min-width: 0;
          padding: 16px;
          border: 1px solid #dbe3ef;
          border-radius: 14px;
          background: #f8fafc;
        }
        .asset-preview {
          min-height: 180px;
          display: flex;
          align-items: center;
          justify-content: center;
          overflow: hidden;
          padding: 14px;
          border: 1px dashed #94a3b8;
          border-radius: 12px;
          background: #ffffff;
          color: #64748b;
          text-align: center;
        }
        .asset-preview img {
          width: auto;
          max-width: 100%;
          max-height: 180px;
          object-fit: contain;
        }
        .chop-preview img {
          max-width: 220px;
          max-height: 180px;
        }
        .upload-label {
          position: relative;
          overflow: hidden;
        }
        .upload-label input {
          position: absolute;
          width: 1px;
          height: 1px;
          opacity: 0;
          pointer-events: none;
        }
        .company-footer-actions {
          justify-content: space-between;
          padding-bottom: 20px;
        }
        .danger-button {
          background: #b91c1c;
          color: white;
        }
        @media (max-width: 900px) {
          .company-layout,
          .asset-grid {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </div>
  );
}
